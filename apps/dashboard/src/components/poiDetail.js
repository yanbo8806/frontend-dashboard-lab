import { box,button,fmt,image } from '../shared/dom.js';

// 详情组件不保存选择状态；关闭、地图聚焦由应用层协调。
export function buildPoiDetail(stage,point,heatLabel,onClose){
  const detailsNode=box(stage,'section',{x:507,y:704,w:558,h:108,cls:'poi-detail'});detailsNode.setAttribute('aria-label','景点详情');
  const imgWrap=box(detailsNode,'div',{x:0,y:0,w:136,h:108,cls:'detail-image'});image(imgWrap,point.image,point.name,{w:136,h:108},point.imagePosition);
  box(detailsNode,'h3',{x:151,y:12,w:331,h:25,cls:'detail-title',text:point.name});
  box(detailsNode,'span',{x:427,y:19,w:85,h:18,cls:'detail-heat',text:heatLabel+' '+fmt(point.heat)});
  box(detailsNode,'p',{x:151,y:41,w:383,h:34,cls:'detail-description',text:point.description});
  const source=box(detailsNode,'a',{x:151,y:81,w:260,h:16,cls:'image-source',text:'图片来源 · '+point.district});
  if(point.imageSource){source.href=point.imageSource;source.target='_blank';source.rel='noopener noreferrer';}source.title=point.imageCredit+' '+point.coordinateNote;
  button(detailsNode,'×',onClose,{x:524,y:7,w:25,h:25,cls:'detail-close'});
  return detailsNode;
}
