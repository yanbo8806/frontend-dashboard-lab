import {toWgs84} from './coordinates.js';

export const ARTWORK = Object.freeze({
  width:1448,height:1086,
  foreground:'media/xianyang-scene-map.png',
  background:'media/xianyang-scene-background.png',
});

// 这些是原画上的示意锚点，不是地理配准；保留业务 ID 与坐标修改的联动。
const anchors={
  hub:{uv:[.565,.695],geo:[108.749,34.386]},
  qianling:{uv:[.31,.446],geo:[108.2115,34.5751]},
  yuanjia:{uv:[.483,.562],geo:[108.5358,34.6067]},
  mawei:{uv:[.36,.777],geo:[108.4268,34.3518]},
  tongyi:{uv:[.638,.814],geo:[108.7054,34.3244]},
  silkroad:{uv:[.736,.78],geo:[108.6878,34.2325]},
};
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export const resolvePresentation=value=>value==='gis'?'gis':'image';

export function artworkPoint(point,crs='WGS84'){
  const [longitude,latitude]=toWgs84([point.longitude,point.latitude],crs);
  const anchor=anchors[point.id]||anchors.hub;
  return [
    clamp(anchor.uv[0]+(longitude-anchor.geo[0])*.48,.08,.92),
    clamp(anchor.uv[1]-(latitude-anchor.geo[1])*.42,.08,.92),
  ];
}

export function fitArtwork(width,height){
  const scale=Math.min((width-48)/ARTWORK.width,(height-98)/ARTWORK.height);
  return {width:ARTWORK.width*scale,height:ARTWORK.height*scale,scale,top:(height-ARTWORK.height*scale)/2+7};
}

export function limitView(view){
  const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
  return {zoom:clamp(finite(view.zoom,1),.8,1.8),x:clamp(finite(view.x,0),-3.4,3.4),y:clamp(finite(view.y,0),-2.5,2.5)};
}
