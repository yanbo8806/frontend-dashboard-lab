import {Scene,PerspectiveCamera,WebGLRenderer,Group,PlaneGeometry,Mesh,MeshBasicMaterial,Texture,SRGBColorSpace,NoToneMapping,Vector3,Color,CubicBezierCurve3,SphereGeometry,RingGeometry,DoubleSide,AdditiveBlending} from 'three';
import {Line2} from 'three/addons/lines/Line2.js';
import {LineGeometry} from 'three/addons/lines/LineGeometry.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import {createElement,ZoomIn,ZoomOut,RotateCcw,Pause,Play,Maximize,MousePointer2} from 'lucide';
import {ARTWORK,artworkPoint,fitArtwork,limitView} from './imageGeometry.js';
import {createTrafficLayer} from './trafficLayer.js';
import './imageMap.css';

const node=(tag,cls,text='')=>{const element=document.createElement(tag);element.className=cls;element.textContent=text;return element;};
const icon=value=>createElement(value,{width:18,height:18,'stroke-width':1.6,'aria-hidden':'true'});

export function createImageMap(container,config,{onSelect}={}){
  let renderer,camera,background,art,traffic,disposed=false,ready=false,frame=0,lastTime=0,selectedId=null;
  let width=container.clientWidth||903,height=container.clientHeight||646,animated=config.map.animate,frozen=Boolean(window.__img2codeFrozen),parallax=true;
  let elapsed=0,entrance=0,drag=null,moved=false,zoom=1,offsetX=0,offsetY=0;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),abort=new AbortController(),textures=[],markers=[],flights=[],rings=[];
  const target={zoom:1,x:0,y:0},pointer={x:0,y:0},rotation={x:0,y:0};
  const scene=new Scene(),group=new Group();scene.add(group);
  const stats={engine:'Three.js image layers',presentation:'image',state:'loading',frames:0,elapsed:0,lines:0,attractions:config.attractions.length,districts:0,coordinateMode:'artwork-illustration',terrain:{enabled:false,state:'not-applicable'},assets:{},parallax:true};
  container.classList.add('image-map');container.dataset.ready='false';container.dataset.animated='false';
  const surface=node('div','image-map-surface');surface.tabIndex=0;surface.setAttribute('role','group');surface.setAttribute('aria-label',config.meta.city+'立体地图，支持缩放和平移');container.append(surface);
  const poster=node('img','image-map-poster');poster.alt=config.meta.city+'立体地图';poster.src=ARTWORK.foreground;poster.draggable=false;surface.append(poster);
  const heading=node('div','map-heading');heading.append(node('strong','',config.labels.map),node('span','',config.meta.city+'文旅'));container.append(heading);
  const status=node('div','map-status image-map-status','正在加载地图场景…');status.setAttribute('role','status');container.append(status);
  const attribution=node('div','map-attribution image-map-attribution','艺术地图 · 点位示意');container.append(attribution);
  const overlay=node('div','image-map-labels');surface.append(overlay);
  const toolbar=node('div','image-map-tools');toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','地图工具');container.append(toolbar);
  const listen=(element,type,handler,options={})=>element.addEventListener(type,handler,{...options,signal:abort.signal});
  function tool(label,symbol,action){
    const button=node('button','image-map-tool');button.type='button';button.setAttribute('aria-label',label);button.dataset.tooltip=label;button.append(icon(symbol));listen(button,'click',action);toolbar.append(button);return button;
  }
  function setTarget(next){Object.assign(target,limitView({...target,...next}));schedule();}
  function reset(){pointer.x=pointer.y=0;setTarget({zoom:1,x:0,y:0});}
  tool('全景',Maximize,reset);
  const minus=tool('缩小地图',ZoomOut,()=>setTarget({zoom:target.zoom-.12}));
  const zoomLabel=node('output','image-map-zoom','100%');zoomLabel.setAttribute('aria-label','地图缩放比例');toolbar.append(zoomLabel);
  const plus=tool('放大地图',ZoomIn,()=>setTarget({zoom:target.zoom+.12}));
  tool('复位',RotateCcw,reset);
  const tiltButton=tool('视差',MousePointer2,()=>{parallax=!parallax;stats.parallax=parallax;tiltButton.setAttribute('aria-pressed',String(parallax));schedule();});tiltButton.setAttribute('aria-pressed','true');
  const playButton=tool(animated?'暂停动画':'播放动画',animated?Pause:Play,()=>{
    animated=!animated;const label=animated?'暂停动画':'播放动画';playButton.setAttribute('aria-label',label);playButton.dataset.tooltip=label;playButton.replaceChildren(icon(animated?Pause:Play));playButton.setAttribute('aria-pressed',String(animated));schedule();
  });playButton.setAttribute('aria-pressed',String(animated));
  const dynamic=()=>animated&&!frozen&&!reduced.matches;
  const materials=(color,opacity=1)=>new MeshBasicMaterial({color,opacity,transparent:true,depthTest:false,depthWrite:false,blending:AdditiveBlending,side:DoubleSide,toneMapped:false});
  function reportError(message){if(disposed)return;stats.state='error';ready=false;container.dataset.ready='false';status.textContent=message;status.classList.add('error');poster.hidden=false;cancelAnimationFrame(frame);frame=0;}
  function localPoint(point){const [u,v]=artworkPoint(point,config.map.pointCrs);return new Vector3((u-.5)*ARTWORK.width,(.5-v)*ARTWORK.height,5);}
  const points=new Map([['hub',{...config.map.hub,id:'hub'}],...config.attractions.map(point=>[point.id,point])]);
  function buildMarkers(){
    for(const [id,point] of points){
      const hub=id==='hub',element=node(hub?'div':'button','poi-marker image-poi'+(hub?' image-hub':''));element.classList.toggle('selected',selectedId===id);
      if(!hub){element.type='button';element.dataset.poi=id;element.setAttribute('aria-label','定位'+point.name);listen(element,'click',event=>{event.stopPropagation();if(!moved)onSelect?.(id);});}
      const label=node('span','',point.name);if(!hub&&!config.map.showLabels)label.className='visually-hidden';element.append(label,node('i',''));overlay.append(element);
      const position=localPoint(point);markers.push({id,element,label,position});
      const ring=new Mesh(new RingGeometry(hub?14:8,hub?16:10,48),materials(hub?'#ffe5a0':'#b7f6ff',.62));ring.position.copy(position);ring.scale.y=.46;ring.renderOrder=6;group.add(ring);
      const pulse=new Mesh(new RingGeometry(hub?19:12,hub?20:13,48),materials(hub?'#ffe5a0':'#7ceaff',.2));pulse.position.copy(position);pulse.renderOrder=5;group.add(pulse);rings.push({ring,pulse,hub});
    }
  }
  function buildFlights(){
    const colorWhite=new Color('#ffffff');
    for(const [index,route] of config.routes.filter(route=>route.enabled).entries()){
      const start=localPoint(points.get(route.fromId)),end=localPoint(points.get(route.toId));
      const lift=Math.min(96,Math.max(16,route.height/100));
      const c1=start.clone().lerp(end,.33);c1.y+=lift;c1.z+=34;
      const c2=start.clone().lerp(end,.66);c2.y+=lift;c2.z+=34;
      const curve=new CubicBezierCurve3(start,c1,c2,end),geometry=new LineGeometry();geometry.setPositions(curve.getPoints(64).flatMap(point=>point.toArray()));
      const lines=[];
      // 原画已有静态飞线，新增色带保持纤细；用当前配置驱动光点和选中高亮。
      for(const [linewidth,opacity] of [[Math.min(8,config.map.flightWidth*1.7),.1],[Math.min(1.3,config.map.flightWidth*.32),.55]]){
        const material=new LineMaterial({color:route.color,linewidth,worldUnits:false,transparent:true,opacity,depthTest:false,depthWrite:false,blending:AdditiveBlending});material.resolution.set(width,height);
        const line=new Line2(geometry,material);line.frustumCulled=false;line.renderOrder=4;group.add(line);lines.push({line,opacity});
      }
      const light=new Mesh(new SphereGeometry(3.2,12,8),materials(new Color(route.color).lerp(colorWhite,.7)));light.renderOrder=7;group.add(light);
      flights.push({route,index,curve,lines,light});
    }
    stats.lines=flights.length;
  }
  function texture(image){const value=new Texture(image);value.colorSpace=SRGBColorSpace;value.needsUpdate=true;value.anisotropy=renderer.capabilities.getMaxAnisotropy();textures.push(value);return value;}
  async function loadImage(url){
    const image=new Image();image.decoding='async';
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>finish(new Error('图片加载超过 15 秒')),15000);
      const cancelled=()=>finish(new Error('场景已关闭'));
      function finish(error){clearTimeout(timer);abort.signal.removeEventListener('abort',cancelled);image.onload=image.onerror=null;error?reject(error):resolve();}
      image.onload=()=>finish();image.onerror=()=>finish(new Error('图片加载失败：'+url));abort.signal.addEventListener('abort',cancelled,{once:true});image.src=url;
    });
    stats.assets[url]={width:image.naturalWidth,height:image.naturalHeight};return image;
  }
  function resize(){
    width=container.clientWidth||903;height=container.clientHeight||646;
    const fit=fitArtwork(width,height);Object.assign(poster.style,{width:fit.width+'px',height:fit.height+'px',left:(width-fit.width)/2+'px',top:fit.top+'px'});
    if(!renderer)return;
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setSize(width,height);
    camera.aspect=width/height;camera.position.z=height/(2*Math.tan(camera.fov*Math.PI/360));camera.updateProjectionMatrix();
    const depth=1+220/camera.position.z,bgWidth=Math.max(width,height*ARTWORK.width/ARTWORK.height)*depth*1.1;
    if(background)background.scale.set(bgWidth,bgWidth*ARTWORK.height/ARTWORK.width,1);
    flights.forEach(({lines})=>lines.forEach(({line})=>line.material.resolution.set(width,height)));traffic?.resize(width,height);schedule();
  }
  function schedule(){if(!disposed&&ready&&!document.hidden&&!frame)frame=requestAnimationFrame(render);}
  function render(now){
    frame=0;if(disposed||!ready||document.hidden)return;
    const delta=lastTime?Math.min(50,now-lastTime):16;lastTime=now;
    if(dynamic())elapsed+=delta;
    const smooth=frozen||reduced.matches?1:1-Math.exp(-delta/85);
    zoom+=(target.zoom-zoom)*smooth;offsetX+=(target.x*52-offsetX)*smooth;offsetY+=(target.y*52-offsetY)*smooth;
    const allowTilt=parallax&&!frozen&&!reduced.matches;
    rotation.x+=((allowTilt?pointer.y*.037:0)-rotation.x)*smooth;rotation.y+=((allowTilt?pointer.x*.055:0)-rotation.y)*smooth;
    entrance=frozen||reduced.matches?1:Math.min(1,entrance+delta/680);
    const fit=fitArtwork(width,height),distance=camera.position.z,base=fit.scale*(distance-46)/distance;
    const float=Math.sin(elapsed/2100)*3;
    group.scale.setScalar(base*zoom);group.rotation.set(rotation.x,rotation.y,-rotation.y*.06);
    group.position.set(offsetX+rotation.y*120,-7+offsetY+float-(1-entrance)*18,46);
    if(background)background.position.set(-rotation.y*60,-rotation.x*42,-220);
    if(art)art.material.opacity=Math.min(1,entrance*1.8+.22);
    const selected=selectedId;
    for(const {route,index,curve,lines,light} of flights){
      const emphasis=!selected||route.fromId===selected||route.toId===selected?1:.12;
      light.position.copy(curve.getPoint((.17+index*.16+elapsed/6500)%1));light.material.opacity=emphasis;lines.forEach(({line,opacity})=>line.material.opacity=opacity*emphasis);
    }
    rings.forEach(({pulse},index)=>{const phase=(elapsed/2600+index*.16)%1;pulse.scale.set(1+phase*.85,(1+phase*.85)*.46,1);pulse.material.opacity=(1-phase)*.28;});
    traffic?.update(elapsed,dynamic());
    group.updateMatrixWorld(true);camera.updateMatrixWorld();
    for(const {id,element,label,position} of markers){
      const projected=group.localToWorld(position.clone()).project(camera);const x=(projected.x+1)*width/2,y=(1-projected.y)*height/2;
      element.style.left=x+'px';element.style.top=y+'px';element.hidden=x<15||x>width-15||y<85||y>height-55;
      // 只平移文字以避开画布边缘，圆点继续锁定原画坐标；固定宽度防止边缘挤字。
      const half=label.offsetWidth/2,offset=id==='tongyi'?-18:id==='silkroad'?10:0;
      label.style.transform='translateX('+Math.max(12-x+half,Math.min(width-12-x-half,offset))+'px)';
    }
    traffic?.project(camera);
    zoomLabel.value=Math.round(zoom*100)+'%';minus.disabled=target.zoom<=.8;plus.disabled=target.zoom>=1.8;
    container.dataset.animated=String(dynamic());renderer.render(scene,camera);stats.frames++;stats.elapsed=elapsed;
    const settling=Math.abs(target.zoom-zoom)>.0001||Math.abs(target.x*52-offsetX)>.01||Math.abs(target.y*52-offsetY)>.01||Math.abs((allowTilt?pointer.y*.037:0)-rotation.x)>.0001||Math.abs((allowTilt?pointer.x*.055:0)-rotation.y)>.0001||entrance<1;
    if(dynamic()||settling)schedule();
  }
  function freeze(){frozen=true;entrance=1;schedule();}
  listen(window,'img2code:freeze',freeze);listen(reduced,'change',()=>{lastTime=0;schedule();});
  listen(document,'visibilitychange',()=>{lastTime=0;if(document.hidden){cancelAnimationFrame(frame);frame=0;}else schedule();});
  listen(surface,'pointermove',event=>{
    const rect=surface.getBoundingClientRect();
    if(drag){const dx=(event.clientX-drag.x)*width/rect.width,dy=(event.clientY-drag.y)*height/rect.height;moved||=Math.hypot(dx,dy)>4;setTarget({x:drag.originX+dx/52,y:drag.originY-dy/52});}
    else if(event.pointerType!=='touch'){pointer.x=Math.max(-1,Math.min(1,(event.clientX-rect.left)/rect.width*2-1));pointer.y=Math.max(-1,Math.min(1,(event.clientY-rect.top)/rect.height*2-1));schedule();}
  });
  listen(surface,'pointerdown',event=>{
    moved=false;if(event.button!==0||event.target.closest('button'))return;drag={x:event.clientX,y:event.clientY,originX:target.x,originY:target.y};surface.setPointerCapture(event.pointerId);surface.classList.add('dragging');
  });
  const endDrag=()=>{drag=null;surface.classList.remove('dragging');};listen(surface,'pointerup',endDrag);listen(surface,'pointercancel',endDrag);listen(surface,'lostpointercapture',endDrag);
  listen(surface,'pointerleave',()=>{if(!drag){pointer.x=pointer.y=0;schedule();}});
  listen(surface,'wheel',event=>{event.preventDefault();setTarget({zoom:target.zoom-Math.sign(event.deltaY)*.07});},{passive:false});
  listen(surface,'dblclick',event=>{if(!event.target.closest('button'))reset();});
  listen(surface,'keydown',event=>{
    if(event.target!==surface)return;
    const actions={ArrowLeft:()=>setTarget({x:target.x-.35}),ArrowRight:()=>setTarget({x:target.x+.35}),ArrowUp:()=>setTarget({y:target.y+.35}),ArrowDown:()=>setTarget({y:target.y-.35}),'+':()=>setTarget({zoom:target.zoom+.12}),'=':()=>setTarget({zoom:target.zoom+.12}),'-':()=>setTarget({zoom:target.zoom-.12}),Home:reset};
    if(actions[event.key]){event.preventDefault();actions[event.key]();}
  });
  async function initialize(){
    try{
      renderer=new WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});renderer.outputColorSpace=SRGBColorSpace;renderer.toneMapping=NoToneMapping;renderer.setClearColor('#04182a',0);
      renderer.domElement.className='image-map-canvas';renderer.domElement.setAttribute('aria-hidden','true');surface.prepend(renderer.domElement);
      listen(renderer.domElement,'webglcontextlost',event=>{event.preventDefault();reportError('图形上下文已丢失，请刷新页面恢复立体场景');});
      camera=new PerspectiveCamera(32,width/height,1,6000);resize();
      const [foregroundImage,backgroundImage]=await Promise.all([loadImage(ARTWORK.foreground),loadImage(ARTWORK.background)]);if(disposed)return;
      const mapTexture=texture(foregroundImage),backgroundTexture=texture(backgroundImage);
      background=new Mesh(new PlaneGeometry(1,1),new MeshBasicMaterial({map:backgroundTexture,color:'#7899b3',toneMapped:false}));background.renderOrder=0;scene.add(background);
      const geometry=new PlaneGeometry(ARTWORK.width,ARTWORK.height);
      const shadow=new Mesh(geometry,new MeshBasicMaterial({map:mapTexture,color:'#000000',transparent:true,opacity:.56,depthWrite:false,toneMapped:false}));shadow.position.set(8,-38,-72);shadow.scale.setScalar(1.035);shadow.renderOrder=1;group.add(shadow);
      art=new Mesh(geometry,new MeshBasicMaterial({map:mapTexture,transparent:true,depthWrite:false,toneMapped:false}));art.renderOrder=2;group.add(art);
      buildFlights();buildMarkers();traffic=createTrafficLayer({container,overlay,parent:group,width,height,onChange:schedule});stats.traffic=traffic.stats;
      resize();ready=true;stats.state='ready';container.dataset.ready='true';poster.hidden=true;
      status.textContent=config.attractions.length+' 处景点 · '+stats.lines+' 条客流线路';schedule();
    }catch(error){if(!disposed)reportError('立体场景不可用：'+error.message);}
  }
  resize();void initialize();
  return {
    stats,resize,reset,
    select(id,{fly=true}={}){
      selectedId=id;markers.forEach(marker=>marker.element.classList.toggle('selected',marker.id===id));
      const point=points.get(id);
      if(point&&fly){const position=localPoint(point),fit=fitArtwork(width,height),scale=fit.scale*1.2;setTarget({zoom:1.2,x:-position.x*scale/52,y:-position.y*scale/52+.8});}
      schedule();
    },
    view(){return null;},
    inspect(){return {moving:Boolean(drag)||entrance<1||Boolean(frame&&!dynamic())||Math.abs(target.zoom-zoom)>.001||Math.abs(target.x*52-offsetX)>.1||Math.abs(target.y*52-offsetY)>.1,tilesLoaded:ready,view:{zoom,pan:[offsetX,offsetY],tilt:[rotation.x,rotation.y]},canvas:renderer?{width:renderer.domElement.width,height:renderer.domElement.height}:null,layers:['background-artwork','map-shadow','transparent-map-artwork','simulated-highways','data-flights','poi-labels'],assets:stats.assets,terrain:null,traffic:traffic?.inspect()};},
    dispose(){
      disposed=true;ready=false;abort.abort();cancelAnimationFrame(frame);traffic?.dispose();
      const geometries=new Set(),materials=new Set();scene.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material)materials.add(object.material);});
      geometries.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());textures.forEach(value=>value.dispose());renderer?.dispose();renderer?.forceContextLoss();
    },
  };
}
