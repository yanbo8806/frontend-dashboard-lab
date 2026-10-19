import {Group,Vector3,Color,CatmullRomCurve3,Mesh,SphereGeometry,RingGeometry,MeshBasicMaterial,DoubleSide,AdditiveBlending,NormalBlending} from 'three';
import {Line2} from 'three/addons/lines/Line2.js';
import {LineGeometry} from 'three/addons/lines/LineGeometry.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import {createElement,Route,Eye,EyeOff} from 'lucide';
import {ARTWORK} from './imageGeometry.js';
import {TRAFFIC_ROADS,TRAFFIC_LEVELS,TRAFFIC_UPDATE_MS,trafficSnapshot,trafficClock} from './trafficModel.js';
import './trafficLayer.css';

const node=(tag,cls,text='')=>{const element=document.createElement(tag);element.className=cls;element.textContent=text;return element;};
const icon=symbol=>createElement(symbol,{width:16,height:16,'stroke-width':1.6,'aria-hidden':'true'});
const colors=Object.fromEntries(Object.values(TRAFFIC_LEVELS).map(level=>[level.id,new Color(level.color)]));
const white=new Color('#ffffff');
const localPoint=([u,v])=>new Vector3((u-.5)*ARTWORK.width,(.5-v)*ARTWORK.height,8);
const samples=144;

export function createTrafficLayer({container,overlay,parent,width,height,onChange}){
  const group=new Group();group.name='simulated-highways';parent.add(group);
  const abort=new AbortController(),roads=[],lineMaterials=[],point=new Vector3(),previous=new Vector3();
  let enabled=true,selectedId=null,snapshot=trafficSnapshot(0),lastElapsed=0,lastDynamic=null;
  const stats={enabled:true,source:'simulation',roads:TRAFFIC_ROADS.length,tick:0,elapsed:0,selectedId:null,animated:false};
  const listen=(element,handler)=>element.addEventListener('click',event=>{event.stopPropagation();handler();},{signal:abort.signal});

  const labels=node('div','traffic-map-labels');overlay.append(labels);
  const panel=node('section','traffic-panel');panel.setAttribute('aria-label','高速模拟路况');container.append(panel);
  const header=node('div','traffic-header'),title=node('h3','traffic-title','高速路况');title.prepend(icon(Route));
  const source=node('span','traffic-source','模拟'),toggle=node('button','traffic-toggle');
  toggle.type='button';toggle.setAttribute('aria-label','交通路况');toggle.setAttribute('aria-pressed','true');toggle.title='显示 / 隐藏模拟路况';toggle.append(icon(Eye));
  header.append(title,source,toggle);panel.append(header);
  const subline=node('div','traffic-subline'),live=node('span','traffic-live','5 秒刷新'),clock=node('time','traffic-clock','T+00:00');subline.append(live,clock);panel.append(subline);
  const content=node('div','traffic-content');panel.append(content);
  const summary=node('div','traffic-summary');
  const speedMetric=node('div','traffic-metric'),speedValue=node('strong',''),speedUnit=node('small','','km/h');
  speedMetric.append(node('span','','路网均速'),speedValue,speedUnit);
  const jamMetric=node('div','traffic-metric'),jamValue=node('strong','traffic-jam-value'),jamUnit=node('small','','km');
  jamMetric.append(node('span','','拥堵里程'),jamValue,jamUnit);summary.append(speedMetric,jamMetric);content.append(summary);
  const list=node('div','traffic-roads');list.setAttribute('role','group');list.setAttribute('aria-label','选择高速高亮');content.append(list);
  const footer=node('div','traffic-footer');content.append(footer);
  const legend=node('div','traffic-legend');
  for(const level of Object.values(TRAFFIC_LEVELS)){const item=node('span','',level.label),dot=node('i','');dot.style.background=level.color;item.prepend(dot);legend.append(item);}
  const note=node('span','traffic-note','示意路网');legend.append(note);content.append(legend);

  function select(id){
    selectedId=selectedId===id?null:id;stats.selectedId=selectedId;
    for(const road of roads){const selected=road.definition.id===selectedId;road.button.setAttribute('aria-pressed',String(selected));road.label.setAttribute('aria-pressed',String(selected));}
    updateFooter();onChange();
  }
  listen(toggle,()=>{
    enabled=!enabled;stats.enabled=enabled;group.visible=enabled;labels.hidden=!enabled;content.hidden=!enabled;
    panel.classList.toggle('is-disabled',!enabled);toggle.setAttribute('aria-pressed',String(enabled));toggle.replaceChildren(icon(enabled?Eye:EyeOff));
    updateLive();onChange();
  });
  function updateLive(){live.textContent=!enabled?'路况图层已隐藏':lastDynamic?'5 秒刷新':'模拟已暂停';panel.dataset.running=String(enabled&&lastDynamic===true);}
  function updateFooter(){
    const current=snapshot.roads.find(road=>road.id===selectedId);
    footer.textContent=current?current.section+' · 预计延误 '+current.delayMinutes+' 分钟':'最慢路段车速 · 点击高亮线路';
  }
  function line(geometry,linewidth,opacity,color='#ffffff',vertexColors=true,glow=true){
    const material=new LineMaterial({linewidth,opacity,color,vertexColors,transparent:true,depthTest:false,depthWrite:false,blending:glow?AdditiveBlending:NormalBlending,worldUnits:false});
    material.resolution.set(width,height);lineMaterials.push(material);
    const mesh=new Line2(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=3;group.add(mesh);return {mesh,material,opacity};
  }
  const orbGeometry=new SphereGeometry(1.45,8,6);
  function orb(radius,opacity){
    const material=new MeshBasicMaterial({color:'#ffffff',transparent:true,opacity,depthTest:false,depthWrite:false,blending:AdditiveBlending});
    const mesh=new Mesh(orbGeometry,material);mesh.scale.setScalar(radius);mesh.renderOrder=7;group.add(mesh);return mesh;
  }
  for(const [index,definition] of TRAFFIC_ROADS.entries()){
    // 道路贴在同一原画平面，跟随已有相机、缩放、悬浮和视差，不新增画布。
    const curve=new CatmullRomCurve3(definition.points.map(localPoint),false,'centripetal');
    const geometry=new LineGeometry();geometry.setPositions(curve.getSpacedPoints(samples).flatMap(value=>value.toArray()));
    // 用像素定宽的细线融入地形：无粗描边，光晕只作微弱衬光，选中也不加粗。
    const lines=[line(geometry,3.2,.055),line(geometry,1.05,.66,'#ffffff',true,false)];
    const trailGeometry=new LineGeometry();trailGeometry.setPositions(Array(21).fill(0));
    const trail=line(trailGeometry,.7,.45,'#d2e5df',false);trail.mesh.renderOrder=6;
    const vehicles=Array.from({length:4},(_,vehicle)=>({progress:(vehicle+.4)/4,mesh:orb(vehicle===0?1.1:.75,.62)}));
    const halo=orb(2.2,.055);
    const pulses=Array.from({length:1},()=>{
      const mesh=new Mesh(new RingGeometry(6.5,7.3,48),new MeshBasicMaterial({color:TRAFFIC_LEVELS.congested.color,transparent:true,opacity:.4,depthTest:false,depthWrite:false,blending:AdditiveBlending,side:DoubleSide}));
      mesh.renderOrder=6;group.add(mesh);return mesh;
    });
    const beacon=orb(1.3,.72);
    const label=node('button','traffic-road-label');label.type='button';label.dataset.trafficLabel=definition.id;label.setAttribute('aria-label','高亮'+definition.code+definition.name);label.setAttribute('aria-pressed','false');
    label.append(node('i',''),node('span','',definition.code));labels.append(label);listen(label,()=>select(definition.id));
    const button=node('button','traffic-road');button.type='button';button.dataset.trafficRoad=definition.id;button.setAttribute('aria-label','高亮'+definition.code+definition.name);button.setAttribute('aria-pressed','false');
    const code=node('span','traffic-road-code',definition.code),copy=node('span','traffic-road-copy'),name=node('strong','',definition.name),state=node('span','traffic-road-state');
    const heading=node('span','traffic-road-heading');heading.append(name,state);copy.append(heading);
    const track=node('span','traffic-road-track');track.setAttribute('aria-hidden','true');const bars=definition.speeds.map(()=>{const bar=node('i','');track.append(bar);return bar;});copy.append(track);
    const speed=node('span','traffic-road-speed'),value=node('strong','');speed.append(value,node('small','','km/h'));button.append(code,copy,speed);list.append(button);listen(button,()=>select(definition.id));
    roads.push({definition,index,curve,length:curve.getLength(),geometry,lines,trail,trailGeometry,vehicles,halo,pulses,beacon,label,button,state,value,bars,labelPosition:curve.getPointAt([.12,.2,.34,.34][index])});
  }
  function applySnapshot(){
    speedValue.textContent=String(snapshot.averageSpeed);jamValue.textContent=snapshot.congestedKm.toFixed(1);clock.textContent=trafficClock(snapshot.updatedSeconds);
    for(const [index,road] of roads.entries()){
      const reading=snapshot.roads[index];road.reading=reading;
      road.value.textContent=String(reading.speed);road.state.textContent=reading.level.label;
      for(const element of [road.label,road.button]){element.dataset.level=reading.level.id;element.style.setProperty('--road-color',reading.level.color);element.title=reading.code+' '+reading.name+' · '+reading.section+' · '+reading.level.label+' '+reading.speed+' km/h（模拟）';}
      road.bars.forEach((bar,i)=>bar.style.background=reading.segments[i].level.color);
      const vertexColors=[];
      for(let i=0;i<=samples;i++){const level=reading.segments[Math.min(reading.segments.length-1,Math.floor(i/samples*reading.segments.length))].level;const color=colors[level.id];vertexColors.push(color.r,color.g,color.b);}
      if(!road.geometry.attributes.instanceColorStart)road.geometry.setColors(vertexColors);
      else {
        const {instanceColorStart:start,instanceColorEnd:end}=road.geometry.attributes;
        for(let i=0;i<samples;i++){start.setXYZ(i,...vertexColors.slice(i*3,i*3+3));end.setXYZ(i,...vertexColors.slice(i*3+3,i*3+6));}
        start.data.needsUpdate=true;
      }
      road.beacon.position.copy(road.curve.getPointAt(reading.hotspotProgress));road.beacon.material.color.copy(colors[reading.level.id]);
      road.pulses.forEach(pulse=>{pulse.position.copy(road.beacon.position);pulse.material.color.copy(colors[reading.level.id]);});
    }
    updateFooter();
  }
  applySnapshot();

  return {
    stats,
    resize(w,h){width=w;height=h;lineMaterials.forEach(material=>material.resolution.set(w,h));},
    update(elapsed,dynamic){
      const delta=Math.max(0,Math.min(50,elapsed-lastElapsed));lastElapsed=elapsed;stats.elapsed=elapsed;stats.animated=enabled&&dynamic;
      if(lastDynamic!==dynamic){lastDynamic=dynamic;updateLive();}
      const nextTick=Math.floor(elapsed/TRAFFIC_UPDATE_MS);
      if(nextTick!==snapshot.tick){snapshot=trafficSnapshot(elapsed);stats.tick=snapshot.tick;applySnapshot();}
      if(!enabled)return;
      for(const road of roads){
        const reading=road.reading,emphasis=!selectedId||selectedId===road.definition.id?1:.18;
        road.lines.forEach(({material,opacity})=>material.opacity=opacity*emphasis);road.trail.material.opacity=.45*emphasis;road.label.style.opacity=String(emphasis===1?1:.38);
        for(const vehicle of road.vehicles){
          const segment=reading.segments[Math.min(reading.segments.length-1,Math.floor(vehicle.progress*reading.segments.length))];
          vehicle.progress=(vehicle.progress+delta/1000*(segment.speed/90)*58/road.length)%1;
          road.curve.getPointAt(vehicle.progress,vehicle.mesh.position);vehicle.mesh.material.opacity=.62*emphasis;
          vehicle.mesh.material.color.copy(colors[segment.level.id]).lerp(white,.42);
        }
        const head=road.vehicles[0];road.halo.position.copy(head.mesh.position);road.halo.material.opacity=.055*emphasis;road.halo.material.color.copy(head.mesh.material.color);
        // 原位更新拖尾缓冲，避免每帧创建几何体或 GPU 缓冲。
        const {instanceStart:start,instanceEnd:end}=road.trailGeometry.attributes;
        for(let i=0;i<7;i++){
          road.curve.getPointAt(Math.max(0,head.progress-(6-i)*.0018),point);
          if(i>0){start.setXYZ(i-1,previous.x,previous.y,previous.z);end.setXYZ(i-1,point.x,point.y,point.z);}
          previous.copy(point);
        }
        start.data.needsUpdate=true;
        const alert=reading.level.id==='congested';road.beacon.visible=alert;road.beacon.material.opacity=(.52+.2*Math.sin(elapsed/650))*emphasis;
        road.pulses.forEach((pulse,index)=>{
          pulse.visible=alert;const phase=(elapsed/2800+index*.5+.12)%1;
          pulse.scale.set(1+phase*1.9,(1+phase*1.9)*.58,1);pulse.material.opacity=(1-phase)*.4*emphasis;
        });
      }
    },
    project(camera){
      if(!enabled)return;
      // 路牌只做屏幕避让，路线保持原画锚点，不遮挡景点与地图工具。
      const root=container.getBoundingClientRect(),scale=root.width/width;
      const obstacles=[panel,...overlay.querySelectorAll('.image-poi:not([hidden]) span')].map(element=>{const box=element.getBoundingClientRect();return {left:(box.left-root.left)/scale,top:(box.top-root.top)/scale,right:(box.right-root.left)/scale,bottom:(box.bottom-root.top)/scale};});
      const collides=box=>obstacles.some(other=>box.left<other.right+5&&box.right>other.left-5&&box.top<other.bottom+5&&box.bottom>other.top-5);
      for(const road of roads){
        point.copy(road.labelPosition);group.localToWorld(point).project(camera);const x=(point.x+1)*width/2,y=(1-point.y)*height/2;
        road.label.hidden=false;const half=road.label.offsetWidth/2,h=road.label.offsetHeight;let placed=false;
        for(const [dx,dy] of [[0,-17],[0,18],[-45,0],[45,0],[0,-38],[0,38]]){
          const box={left:x+dx-half,right:x+dx+half,top:y+dy-h/2,bottom:y+dy+h/2};
          if(box.left<15||box.right>width-15||box.top<85||box.bottom>height-62||collides(box))continue;
          road.label.style.left=x+dx+'px';road.label.style.top=y+dy+'px';obstacles.push(box);placed=true;break;
        }
        road.label.hidden=!placed;
      }
    },
    inspect(){return {...stats,snapshot,vehicles:roads.map(road=>({id:road.definition.id,progress:road.vehicles.map(vehicle=>vehicle.progress)})),alerts:roads.filter(road=>road.beacon.visible).map(road=>road.definition.id)};},
    dispose(){abort.abort();panel.remove();labels.remove();},
  };
}
