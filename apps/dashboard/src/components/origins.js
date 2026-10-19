import { ORIGIN_ROW } from '../layout.js';
import { originImageRect } from '../originPhotos.js';
import { box,empty,fmt,image } from '../shared/dom.js';
import { rankedOrigins } from '../shared/selectors.js';
import { panelShell } from './panel.js';

// 名次根据当前占比生成，不把数字烧进图片；排序不会修改原配置。
export function buildOrigins(stage,config){
  const node=panelShell(stage,'R2',config.labels.origins,'people');
  const rows=rankedOrigins(config.origins).slice(0,5);
  if(!rows.length){empty(node,'暂无客源地数据');return;}
  box(node,'div',{x:22,y:186,w:415,h:2,cls:'origin-divider'});
  box(node,'div',{x:22,y:201,w:415,h:1,cls:'origin-divider'});
  rows.forEach((row,index)=>{
    const item=box(node,'div',{x:ORIGIN_ROW.x+index*ORIGIN_ROW.step,w:ORIGIN_ROW.w,h:198,cls:'origin-item'});
    const description=`第 ${index+1} 名 · ${row.name} · 客源占比 ${fmt(row.value)}%`;item.title=description;item.dataset.origin=row.id;
    item.setAttribute('role','group');item.setAttribute('aria-label',description);
    box(item,'div',{x:19,y:55,w:46,h:19,cls:'origin-badge '+(index?'cyan':'gold'),text:'TOP'+(index+1)});
    box(item,'div',{y:80,w:84,h:19,cls:'origin-name',text:row.name});
    const frame=box(item,'div',{...ORIGIN_ROW.photo,cls:'origin-circle'});
    image(frame,row.image,row.name,{...originImageRect(ORIGIN_ROW.photo.w),cls:'origin-img'});
    // 编号是圆形裁切容器外的独立 DOM，跨在照片下沿，不再被照片遮罩截掉。
    const rank=box(item,'span',{...ORIGIN_ROW.rank,cls:'origin-number',text:String(index+1)});rank.title=description;
  });
}
