import { WALL_TILES } from '../layout.js';
import { box,button,empty,image } from '../shared/dom.js';
import { rankedAttractions } from '../shared/selectors.js';
import { panelShell } from './panel.js';

// 景点卡片与地图通过 ID 联动；图片、徽章、标题分别渲染。
export function buildAttractions(stage,config,onSelect){
  const node=panelShell(stage,'R1',config.labels.attractions,'flame');
  const rows=rankedAttractions(config.attractions);
  if(!rows.length){empty(node,'暂无景点，请在数据配置中添加');return;}
  rows.slice(0,5).forEach((point,index)=>{
    const rect=WALL_TILES[index],tile=button(node,'',()=>onSelect(point.id),{...rect,cls:'wall-tile scenic-tile'});tile.dataset.attraction=point.id;tile.setAttribute('aria-label','查看'+point.name);
    image(tile,point.image,point.name,{w:rect.w,h:rect.h,cls:'wall-img'},point.imagePosition);
    box(tile,'div',{w:54,h:25,cls:'wall-badge '+(index?'cyan':'gold'),text:'TOP'+point.rank});
    const caption=box(tile,'div',{x:0,y:rect.h-61,w:rect.w,h:61,cls:'scenic-caption'});
    const name=document.createElement('strong');name.textContent=point.name;
    const district=document.createElement('span');district.textContent=point.district;caption.append(name,district);
  });
  if(rows.length>5)box(node,'span',{x:305,y:19,w:136,h:20,cls:'more-pois',text:'共 '+rows.length+' 处 · 地图可查看'});
}
