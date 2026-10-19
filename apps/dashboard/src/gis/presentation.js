import {createImageMap} from './imageMap.js';
import {resolvePresentation} from './imageGeometry.js';

export function createMapPresentation(container,config,{onSelect}={}){
  let mode=resolvePresentation(new URL(location.href).searchParams.get('map'));
  let current,disposed=false,epoch=0,selectedId=null;
  const layers=new Map();
  const modes=document.createElement('div');modes.className='map-mode-switch';modes.setAttribute('role','group');modes.setAttribute('aria-label','地图显示方式');
  for(const [id,label] of [['image','立体场景'],['gis','GIS 地图']]){
    const layer=document.createElement('div');layer.className='map-presentation-layer';layer.dataset.mode=id;layer.hidden=true;container.append(layer);layers.set(id,layer);
    const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.mode=id;button.addEventListener('click',()=>{if(id!==mode)void activate(id,true);});modes.append(button);
  }
  container.append(modes);
  const loading={engine:'loading',state:'loading',frames:0};
  async function activate(next,updateUrl=false){
    const ticket=++epoch;mode=next;current?.dispose();current=null;container.dataset.presentation=mode;container.dataset.ready='false';
    for(const [id,layer] of layers){layer.hidden=id!==mode;layer.dataset.ready='false';layer.replaceChildren();}
    modes.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));
    if(updateUrl){const url=new URL(location.href);if(mode==='image')url.searchParams.delete('map');else url.searchParams.set('map','gis');history.replaceState(null,'',url);}
    const host=layers.get(mode);
    try{
      // 旧 GIS 源码与素材完整保留；隐藏时不下载瓦片、不占用第二个 WebGL 上下文。
      const create=mode==='gis'?(await import('./map.js')).createTourismMap:createImageMap;
      if(disposed||ticket!==epoch)return;
      current=create(host,config,{onSelect});
      if(selectedId)current.select(selectedId,{fly:false});
    }catch(error){
      if(disposed||ticket!==epoch)return;
      const status=document.createElement('div');status.className='map-status error';status.textContent='地图加载失败：'+error.message;status.setAttribute('role','alert');host.append(status);
      current={stats:{engine:mode,state:'error'},dispose(){}};
    }
  }
  const observer=new MutationObserver(()=>{container.dataset.ready=String(layers.get(mode).dataset.ready==='true');});
  for(const layer of layers.values())observer.observe(layer,{attributes:true,attributeFilter:['data-ready']});
  void activate(mode);
  return {
    get stats(){return current?.stats||loading;},
    select(id,options){selectedId=id;current?.select?.(id,options);},
    view(){return mode==='gis'?current?.view?.()||null:null;},
    inspect(){return {mode,...current?.inspect?.()};},
    resize(){current?.resize?.();},
    dispose(){disposed=true;epoch++;observer.disconnect();current?.dispose();},
  };
}
