import { box,empty,fmt } from '../shared/dom.js';
import { enabledRoutes,routePointName } from '../shared/selectors.js';
import { panelShell } from './panel.js';

// 列表是配置的派生视图，点击只上报景点 ID。
export function buildRoutes(stage,config,onSelect){
  const node=panelShell(stage,'L3',config.labels.routes,'trend');
  const rows=enabledRoutes(config.routes);
  if(!rows.length){empty(node,'暂无线路数据');return;}
  const list=box(node,'div',{x:20,y:61,w:420,h:155,cls:'routes-list'});
  const pointName=id=>routePointName(config,id);
  rows.forEach((row,index)=>{
    const item=document.createElement('button');item.type='button';item.className='route-row';item.dataset.route=row.id;
    const rank=document.createElement('span');rank.className='route-rank';rank.textContent=String(index+1).padStart(2,'0');
    const text=document.createElement('span');text.className='route-destination';text.textContent=pointName(row.fromId)+' → '+pointName(row.toId);text.title=text.textContent;
    const bar=document.createElement('span');bar.className='route-heat';const fill=document.createElement('i');fill.style.width=row.value+'%';fill.style.background=row.color;bar.append(fill);
    const value=document.createElement('span');value.className='route-score';value.textContent=fmt(row.value);
    item.append(rank,text,bar,value);item.addEventListener('click',()=>onSelect(row.toId==='hub'?row.fromId:row.toId));list.append(item);
  });
}
