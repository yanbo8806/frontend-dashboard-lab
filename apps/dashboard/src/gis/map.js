import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createFlightLayer } from './flightLayer.js';
import { prepareBoundary, toWgs84 } from './coordinates.js';
import { resolveTerrain } from './terrain.js';
import { addLandscapeLayers } from './terrainLayers.js';

export function createTourismMap(container, config, { onSelect } = {}) {
  let map,disposed=false,selectedId=null,animated=config.map.animate,initialized=false,regionBounds;
  const terrain=resolveTerrain(config.map);
  const markers=[], abort=new AbortController();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const stats={engine:'MapLibre GL + Three.js',state:'loading',lines:0,attractions:config.attractions.length,districts:0,frames:0,elapsed:0,terrain:{enabled:Boolean(terrain),source:terrain?.id|| (terrain?'external':null),state:terrain?'loading':'disabled',exaggeration:terrain?.exaggeration||0,sampleUnits:'display-meters-after-exaggeration',samples:[]},outerSegments:0,outerRings:0,flightWidth:config.map.flightWidth||3.2};
  const canvas=document.createElement('div'); canvas.className='gis-canvas';container.append(canvas);
  const heading=document.createElement('div');heading.className='map-heading';
  const title=document.createElement('strong');title.textContent=config.labels.map;
  const caption=document.createElement('span');caption.textContent=`${config.meta.city} · ${terrain?'DEM 地形':'行政区'} · 3D GIS`;heading.append(title,caption);container.append(heading);
  const status=document.createElement('div');status.className='map-status';status.textContent='正在加载本地行政区…';status.setAttribute('role','status');container.append(status);
  const tools=document.createElement('div');tools.className='map-tools';container.append(tools);
  const button=(label,action)=>{const node=document.createElement('button');node.type='button';node.textContent=label;node.addEventListener('click',action);tools.append(node);return node;};
  const duration=()=>reduced.matches?0:700;
  const camera={center:toWgs84(config.map.center,config.map.pointCrs),zoom:config.map.zoom,pitch:config.map.pitch,bearing:config.map.bearing};
  const api={
    stats,
    select(id,{fly=true}={}) {
      selectedId=id;
      markers.forEach(item=>{item.element.classList.toggle('selected',item.id===id);});
      const point=config.attractions.find(item=>item.id===id);
      if(point&&map&&fly) map.easeTo({center:toWgs84([point.longitude,point.latitude],config.map.pointCrs),zoom:config.map.focusZoom,pitch:config.map.pitch,duration:duration(),padding:{top:40,bottom:100,left:0,right:0}});
      map?.triggerRepaint();
    },
    reset() {map?.easeTo({...camera,padding:{top:0,bottom:0,left:0,right:0},duration:duration()});},
    view(){if(!map)return null; const center=map.getCenter();return{center:[center.lng,center.lat],zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing()};},
    inspect(){return map?{view:api.view(),moving:map.isMoving(),tilesLoaded:map.areTilesLoaded(),layers:map.getStyle().layers.map(layer=>({id:layer.id,type:layer.type})),terrain:map.getTerrain(),canvas:{width:map.getCanvas().width,height:map.getCanvas().height}}:null;},
    resize(){map?.resize();},
    dispose(){disposed=true;abort.abort();clearTimeout(terrainTimer);markers.forEach(item=>item.marker.remove());map?.remove();window.removeEventListener('img2code:freeze',freeze);document.removeEventListener('visibilitychange',visibility);},
  };
  button('全景',()=>{if(!map||!regionBounds)return;map.fitBounds(regionBounds,{padding:{top:85,bottom:75,left:55,right:55},pitch:config.map.pitch,bearing:config.map.bearing,maxZoom:11,duration:duration()});});
  button('复位',api.reset);
  const mode=button('2D',()=>{if(!map)return;const flat=map.getPitch()<10;map.easeTo({pitch:flat?config.map.pitch:0,bearing:flat?config.map.bearing:0,duration:duration()});mode.textContent=flat?'2D':'3D';});
  const animateButton=button(animated?'暂停飞线':'播放飞线',()=>{animated=!animated;animateButton.textContent=animated?'暂停飞线':'播放飞线';map?.triggerRepaint();});
  const help=document.createElement('div');help.className='map-help';help.textContent='拖动平移 · 滚轮缩放 · 右键旋转 · 点击景点查看';container.append(help);
  const coordinate=document.createElement('div');coordinate.className='map-coordinate';container.append(coordinate);
  let terrainTimer;
  let frozen=Boolean(window.__img2codeFrozen);
  function freeze(){frozen=true;}
  function visibility(){if(!document.hidden)map?.triggerRepaint();}
  window.addEventListener('img2code:freeze',freeze);document.addEventListener('visibilitychange',visibility);
  const reportError=message=>{if(disposed)return;stats.state='error';status.textContent=message;status.classList.add('error');container.dataset.ready='false';};
  try {
    map=new maplibregl.Map({container:canvas,style:{version:8,transition:{duration:0,delay:0},sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#001a31'}}]},...camera,minZoom:2,maxZoom:18,maxPitch:75,fadeDuration:0,attributionControl:false,canvasContextAttributes:{antialias:true},renderWorldCopies:false});
    map.addControl(new maplibregl.NavigationControl({showCompass:true,visualizePitch:true}),'top-right');
    map.addControl(new maplibregl.ScaleControl({maxWidth:100,unit:'metric'}),'bottom-left');
    map.on('mousemove',event=>{coordinate.textContent=`${event.lngLat.lng.toFixed(4)}°E  ${event.lngLat.lat.toFixed(4)}°N · WGS84`;});
    map.on('move',()=>{mode.textContent=map.getPitch()<10?'3D':'2D';});
    map.on('error',event=>{if(['terrain','relief'].includes(event.sourceId))stats.terrain.state='error';reportError(`地图资源加载失败：${event.error?.message||'请检查地址和网络'}`);});
    map.on('render',()=>{
      if(!initialized||stats.state==='error')return;
      const sourceIds=['districts','region-outline','region-exterior',...(terrain?['terrain']:[]),...(terrain?.reliefTiles&&!config.map.tilesUrl?['relief']:[]),...(config.map.tilesUrl?['basemap']:[])];
      if(!sourceIds.every(id=>map.isSourceLoaded(id))||!map.areTilesLoaded())return;
      if(terrain&&stats.terrain.state!=='ready'){
        stats.terrain.samples=config.attractions.map(point=>({id:point.id,elevation:map.queryTerrainElevation(toWgs84([point.longitude,point.latitude],config.map.pointCrs))}));
        stats.terrain.state='ready';clearTimeout(terrainTimer);
      }
      stats.state='ready';container.dataset.ready='true';
      status.textContent=`${terrain?'真实 DEM · ':''}${config.attractions.length} 景点 · ${stats.lines} 条飞线`;
    });
    map.getCanvas().addEventListener('webglcontextlost',()=>reportError('WebGL 上下文已丢失，请刷新页面或检查浏览器硬件加速'));
    const styleLoaded=new Promise(resolve=>map.once('load',resolve));
    async function initialize(){
      const timer=setTimeout(()=>abort.abort(new Error('行政区加载超过 15 秒')),15000);
      let boundary;
      try {
        const response=await fetch(config.map.boundaryUrl,{signal:abort.signal});
        if(!response.ok)throw new Error(`行政区 HTTP ${response.status}`);
        const text=await response.text();
        if(text.length>8*1024*1024)throw new Error('行政区文件超过 8MB');
        boundary=prepareBoundary(JSON.parse(text),config.map.boundaryCrs);
      } finally {clearTimeout(timer);}
      await styleLoaded;if(disposed)return;
      regionBounds=new maplibregl.LngLatBounds();
      const extend=coords=>{if(typeof coords[0]==='number')regionBounds.extend(coords);else coords.forEach(extend);};
      boundary.features.forEach(feature=>extend(feature.geometry.coordinates));
      config.attractions.forEach(point=>regionBounds.extend(toWgs84([point.longitude,point.latitude],config.map.pointCrs)));
      Object.assign(stats,addLandscapeLayers(map,config.map,boundary,terrain));
      map.setLight({anchor:'viewport',color:'#b3efff',intensity:.5,position:[1.5,160,45]});
      map.addLayer(createFlightLayer(config,{getSelectedId:()=>selectedId,isAnimated:()=>animated&&!frozen&&!reduced.matches,stats,terrainEnabled:Boolean(terrain)}));
      const addMarker=(id,coords,element,offset=[0,0])=>{const marker=new maplibregl.Marker({element,anchor:'bottom',offset}).setLngLat(coords).addTo(map);markers.push({id,element,marker});};
      if(config.map.showDistricts)boundary.features.forEach(feature=>{
        const center=feature.properties.center;if(!Array.isArray(center))return;
        const element=document.createElement('span');element.className='district-label';element.textContent=feature.properties.name;
        addMarker(`district-${feature.id}`,toWgs84(center,config.map.boundaryCrs),element);
      });
      for(const point of config.attractions){
        const element=document.createElement('button');element.type='button';element.className='poi-marker';element.dataset.poi=point.id;element.setAttribute('aria-label',`定位${point.name}`);
        const dot=document.createElement('i');const text=document.createElement('span');text.textContent=point.name;
        if(!config.map.showLabels)text.className='visually-hidden';
        element.append(text,dot);element.addEventListener('click',()=>onSelect?.(point.id));
        // bottom 锚点需补半个圆点高度，让 DOM 圆心与地形上的 Three.js 落点重合。
        addMarker(point.id,toWgs84([point.longitude,point.latitude],config.map.pointCrs),element,[0,6.5]);
      }
      const hub=document.createElement('div');hub.className='poi-marker hub-marker';const hubName=document.createElement('span');hubName.textContent=config.map.hub.name;const dot=document.createElement('i');hub.append(hubName,dot);
      addMarker('hub',toWgs84([config.map.hub.longitude,config.map.hub.latitude],config.map.pointCrs),hub,[0,8.5]);
      const attribution=document.createElement('div');attribution.className='map-attribution';attribution.textContent=[config.map.boundaryAttribution,config.map.tilesAttribution,terrain?.attribution].filter(Boolean).join(' · ');container.append(attribution);
      stats.districts=boundary.features.length;stats.state='initialized';initialized=true;
      status.textContent=terrain?'正在加载真实高程与山脊晕渲…':'正在绘制行政区与飞线…';
      if(terrain)terrainTimer=setTimeout(()=>{if(stats.terrain.state!=='ready'){stats.terrain.state='error';reportError('地形资源加载超过 15 秒，请检查 DEM 地址；当前不能视为地形就绪');}},15000);
      map.triggerRepaint();
    }
    initialize().catch(error=>{if(!disposed)reportError(error.message);});
  }catch(error){reportError(`3D 地图不可用：${error.message}。需要支持 WebGL2 的浏览器。`);}
  return api;
}
