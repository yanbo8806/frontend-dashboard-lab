import { KPI_CARDS } from '../layout.js';
import { icons } from '../icons.js';
import { frameSVG } from '../frame.js';
import { box, fmt } from '../shared/dom.js';

// 固定指标几何与可变业务数字分离，按 ID 匹配而不是依赖数组位置。
export function buildKpis(stage,config){
  for(const rect of KPI_CARDS){
    const item=config.kpis.find(row=>row.id===rect.id),node=box(stage,'div',{...rect,cls:'kpi'});node.dataset.region=rect.id;
    box(node,'div',{w:rect.w,h:rect.h,cls:'kpi-frame',html:frameSVG(rect.w,rect.h,'kpi')});
    box(node,'div',{x:17,y:23,w:38,h:38,cls:'kpi-icon',html:icons[item.icon]||icons.pin});
    box(node,'div',{x:68,y:12,w:rect.w-72,h:21,cls:'kpi-label',text:item.label});
    const value=box(node,'div',{x:68,y:33,w:rect.w-72,h:34,cls:'kpi-value',text:fmt(item.value)});
    value.title=fmt(item.value)+item.unit;
    if(fmt(item.value).length>7)value.style.fontSize=Math.max(14,30*7/fmt(item.value).length)+'px';
    const unit=document.createElement('span');unit.className='unit distance';unit.textContent=item.unit;value.append(unit);
    box(node,'div',{x:69,y:66,w:rect.w-74,h:13,cls:'kpi-change '+(item.change>=0?'positive':'negative'),text:'同比 '+(item.change>0?'+':'')+fmt(item.change)+'%'});
  }
}
