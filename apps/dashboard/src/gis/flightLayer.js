import { Camera, Scene, WebGLRenderer, Matrix4, Vector3, Mesh, ConeGeometry, SphereGeometry, MeshBasicMaterial, RingGeometry, DoubleSide, AdditiveBlending, NormalBlending, Color } from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { MercatorCoordinate } from 'maplibre-gl';
import { arcCoordinate, routeEndpoints, toWgs84 } from './coordinates.js';

export function createFlightLayer(config, { getSelectedId, isAnimated, stats, terrainEnabled=false }) {
  let renderer, scene, camera, map;
  const origin = MercatorCoordinate.fromLngLat(toWgs84(config.map.center,config.map.pointCrs));
  const meter = origin.meterInMercatorCoordinateUnits();
  const localMatrix = new Matrix4().makeTranslation(origin.x,origin.y,origin.z).scale(new Vector3(meter,meter,meter));
  const vector = coords => {
    const point = MercatorCoordinate.fromLngLat(coords,coords[2]||0);
    return new Vector3((point.x-origin.x)/meter,(point.y-origin.y)/meter,point.z/meter);
  };
  const flights = [], rings=[];
  let elapsed = 0, lastTime = performance.now(), elevationDirty=true;
  const width=config.map.flightWidth||3.2;
  const elevation=coords=>terrainEnabled?(map.queryTerrainElevation(coords)||0):config.map.extrusionHeight;
  const terrainChanged=event=>{if(!event.sourceId||event.sourceId==='terrain')elevationDirty=true;};
  const material=(color,opacity=1)=>new MeshBasicMaterial({color,transparent:true,opacity,depthTest:false,depthWrite:false,blending:AdditiveBlending});
  const direction=new Vector3(0,1,0);
  function updateElevation(){
    // DEM 异步加载与缩放补瓦片后重采样，避免飞线先落海平面、加载后仍穿进山体。
    for(const flight of flights){
      const [start,end]=flight.endpoints;
      const base=[elevation(start)+35,elevation(end)+35];
      if(flight.geometry.attributes.instanceStart&&base.every((value,index)=>Math.abs(value-flight.base[index])<.01))continue;
      flight.base=base;
      const positions=Array.from({length:129},(_,i)=>flight.at(i/128).toArray()).flat();
      if(!flight.geometry.attributes.instanceStart)flight.geometry.setPositions(positions);
      else {
        // 复用已上传的交错缓冲区，瓦片更新时不反复创建 GPU 几何内存。
        const buffer=flight.geometry.attributes.instanceStart.data;
        for(let i=0;i<128;i++)for(let axis=0;axis<3;axis++){buffer.array[i*6+axis]=positions[i*3+axis];buffer.array[i*6+3+axis]=positions[(i+1)*3+axis];}
        buffer.needsUpdate=true;
      }
    }
    rings.forEach(item=>item.center=vector([...item.coords,elevation(item.coords)+32]));
    stats.flightElevations=flights.map(item=>({id:item.route.id,start:item.base[0],end:item.base[1]}));
    elevationDirty=false;
  }
  return {
    id:'tourism-flights',type:'custom',renderingMode:'3d',
    onAdd(instance,gl) {
      map=instance; scene=new Scene(); camera=new Camera();
      renderer=new WebGLRenderer({canvas:map.getCanvas(),context:gl,antialias:true});
      renderer.autoClear=false;
      map.on('sourcedata',terrainChanged);map.on('terrain',terrainChanged);
      // 采用局部米坐标再整体投影，避免直接用 0.x 经度投影产生浮点抖动。
      for (const [index,route] of config.routes.filter(item=>item.enabled).entries()) {
        const endpoints=routeEndpoints(config,route),geometry=new LineGeometry();
        const flight={route,index,endpoints,base:[0,0],geometry,lines:[]};
        flight.at=t=>vector(arcCoordinate(...endpoints,t,route.height,flight.base));
        const bright=new Color(route.color).lerp(new Color('#ffffff'),.78);
        // Line2 用屏幕像素而非米制管径；外发光、色带、白亮芯在任意缩放下保持层次。
        for(const [scale,opacity,color,order] of [[5.2,.1,route.color,0],[2.8,.2,route.color,1],[1,.9,route.color,2],[.45,1,bright,3]]){
          const lineMaterial=new LineMaterial({color,linewidth:width*scale,worldUnits:false,transparent:true,opacity,depthTest:false,depthWrite:false,blending:order<2?AdditiveBlending:NormalBlending});
          if(order<2)lineMaterial.fragmentShader=lineMaterial.fragmentShader.replace('gl_FragColor = vec4( diffuseColor.rgb, alpha );',`
            float distanceToLine = length(vec2(vUv.x, max(0.0, abs(vUv.y) - 1.0)));
            alpha *= exp(-3.0 * distanceToLine * distanceToLine) * (1.0 - smoothstep(0.65, 1.0, distanceToLine));
            gl_FragColor = vec4(diffuseColor.rgb, alpha);
          `);
          const line=new Line2(geometry,lineMaterial);
          line.frustumCulled=false;line.renderOrder=order;scene.add(line);flight.lines.push({line,opacity});
        }
        flight.arrow=new Mesh(new ConeGeometry(1,3,3),material(bright));
        flight.light=new Mesh(new SphereGeometry(.55,10,8),material('#ffffff'));
        flight.arrow.renderOrder=6;flight.light.renderOrder=7;
        scene.add(flight.arrow,flight.light);flights.push(flight);
      }
      for (const point of [config.map.hub,...config.attractions]) {
        const coords=toWgs84([point.longitude,point.latitude],config.map.pointCrs);
        const ring=new Mesh(new RingGeometry(.66,1,64),material('#55eaff',.7));
        const pulse=new Mesh(new RingGeometry(.84,1,64),material('#55eaff',.3));
        ring.material.side=DoubleSide;pulse.material.side=DoubleSide;ring.renderOrder=4;pulse.renderOrder=4;
        scene.add(ring,pulse);rings.push({coords,ring,pulse,hub:point===config.map.hub,center:new Vector3()});
      }
      stats.lines=flights.length;
      stats.flightStyle={units:'screen-pixels',coreWidth:width,haloWidth:width*5.2,layers:4};
      updateElevation();
    },
    render(gl,options) {
      const now=performance.now();
      if(isAnimated()) elapsed+=Math.min(100,now-lastTime);
      lastTime=now;
      stats.frames++; stats.elapsed=elapsed;
      if(elevationDirty)updateElevation();
      const metersPerPixel=40075016.68557849*Math.cos(map.getCenter().lat*Math.PI/180)/(512*2**map.getZoom());
      flights.forEach(({route,index,at,arrow,light,lines})=> {
        const t=(.14+index*.13+elapsed/6500)%1;
        arrow.position.copy(at(t)); light.position.copy(at(Math.max(0,t-.025)));
        arrow.quaternion.setFromUnitVectors(direction,at(Math.min(1,t+.003)).sub(at(Math.max(0,t-.003))).normalize());
        arrow.scale.setScalar(metersPerPixel*3.7);light.scale.setScalar(metersPerPixel*3.1);
        const selected=getSelectedId();
        const focus=!selected||route.toId===selected||route.fromId===selected?1:.18;
        lines.forEach(({line,opacity})=>line.material.opacity=opacity*focus);
        arrow.material.opacity=focus;light.material.opacity=focus;
      });
      rings.forEach(({ring,pulse,center,hub},index)=>{
        const radius=metersPerPixel*(hub?19:8),phase=(elapsed/2300+index*.17)%1;
        ring.position.copy(center);pulse.position.copy(center);ring.scale.setScalar(radius);pulse.scale.setScalar(radius*(1+phase*.9));pulse.material.opacity=(1-phase)*.32;
      });
      // 5.24 的 ProjectionData 实际字段为 mainMatrix，不能照旧注释使用 projectionMatrix。
      camera.projectionMatrix.fromArray(options.defaultProjectionData.mainMatrix).multiply(localMatrix);
      renderer.resetState();renderer.setViewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);renderer.render(scene,camera);renderer.resetState();
      if(isAnimated()&&!document.hidden) map.triggerRepaint();
    },
    onRemove() {
      map?.off('sourcedata',terrainChanged);map?.off('terrain',terrainChanged);
      const geometries=new Set();scene?.traverse(object=>{if(object.geometry)geometries.add(object.geometry);object.material?.dispose();});geometries.forEach(geometry=>geometry.dispose());
      renderer?.dispose();
    },
  };
}
