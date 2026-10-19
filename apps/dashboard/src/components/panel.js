import { PANELS } from '../layout.js';
import { icons } from '../icons.js';
import { frameSVG } from '../frame.js';
import { titleRuleSVG } from '../titleRule.js';
import { box } from '../shared/dom.js';

// 面板只提供装饰壳与标题，不读取应用状态。
export function panelShell(stage,key,label,icon){
  const rect=PANELS[key],node=box(stage,'section',{...rect,cls:'panel'});node.dataset.region=key;
  box(node,'div',{w:rect.w,h:rect.h,cls:'panel-frame',html:frameSVG(rect.w,rect.h,'panel')});
  box(node,'div',{x:23,y:11,w:35,h:34,cls:'panel-icon',html:icons[icon]});
  box(node,'h2',{x:77,y:12,w:340,h:28,cls:'panel-title',text:label});
  box(node,'div',{w:rect.w,h:rect.h,cls:'panel-rule',html:titleRuleSVG(rect,{x0:rect.x+22,x1:rect.x+335,x2:rect.x+362,x3:rect.x+427,y0:rect.y+47,y1:rect.y+27},key)});
  return node;
}
