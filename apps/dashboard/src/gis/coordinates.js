// MapLibre 使用 WGS84 Web Mercator。国内公开数据的 GCJ02/BD09 在入口统一转换。
const PI = Math.PI, A = 6378245, EE = 0.006693421622965943;
const outsideChina = (lon, lat) => lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;
function delta(lon, lat) {
  const x = lon - 105, y = lat - 35;
  let dy = -100 + 2*x + 3*y + .2*y*y + .1*x*y + .2*Math.sqrt(Math.abs(x));
  dy += (20*Math.sin(6*x*PI) + 20*Math.sin(2*x*PI))*2/3;
  dy += (20*Math.sin(y*PI) + 40*Math.sin(y*PI/3))*2/3;
  dy += (160*Math.sin(y*PI/12) + 320*Math.sin(y*PI/30))*2/3;
  let dx = 300 + x + 2*y + .1*x*x + .1*x*y + .1*Math.sqrt(Math.abs(x));
  dx += (20*Math.sin(6*x*PI) + 20*Math.sin(2*x*PI))*2/3;
  dx += (20*Math.sin(x*PI) + 40*Math.sin(x*PI/3))*2/3;
  dx += (150*Math.sin(x*PI/12) + 300*Math.sin(x*PI/30))*2/3;
  const rad = lat/180*PI, magic = 1 - EE*Math.sin(rad)**2, sqrt = Math.sqrt(magic);
  return [dx*180/(A/sqrt*Math.cos(rad)*PI), dy*180/((A*(1-EE))/(magic*sqrt)*PI)];
}
export function wgsToGcj([lon,lat]) {
  if (outsideChina(lon,lat)) return [lon,lat];
  const [dx,dy]=delta(lon,lat); return [lon+dx,lat+dy];
}
export function toWgs84(pair, crs = 'WGS84') {
  let [lon,lat] = pair;
  if (crs === 'BD09') {
    const x = lon-.0065, y = lat-.006;
    const z = Math.sqrt(x*x+y*y)-.00002*Math.sin(y*PI*3000/180);
    const theta = Math.atan2(y,x)-.000003*Math.cos(x*PI*3000/180);
    lon=z*Math.cos(theta); lat=z*Math.sin(theta);
  }
  if (crs === 'WGS84' || outsideChina(lon,lat)) return [lon,lat];
  // 迭代逆变换，避免一次相减的残余偏差；此计算不提高原始点位测量精度。
  let guess = [lon,lat];
  for (let i=0;i<6;i++) { const projected = wgsToGcj(guess); guess = [guess[0]-(projected[0]-lon), guess[1]-(projected[1]-lat)]; }
  return guess;
}

export function prepareBoundary(input, crs) {
  if (input?.type !== 'FeatureCollection' || !Array.isArray(input.features) || input.features.length > 300) throw new Error('边界必须为至多 300 个要素的 GeoJSON FeatureCollection');
  let count=0;
  const convert = coords => {
    if (!Array.isArray(coords)) throw new Error('GeoJSON 坐标格式错误');
    if (typeof coords[0] === 'number') {
      if (++count > 200000 || coords.length < 2 || !coords.slice(0,2).every(Number.isFinite) || Math.abs(coords[0])>180 || Math.abs(coords[1])>85) throw new Error('GeoJSON 坐标越界或超过 20 万点');
      return toWgs84(coords,crs);
    }
    return coords.map(convert);
  };
  return { type:'FeatureCollection', features:input.features.map((feature,index)=> {
    if (!['Polygon','MultiPolygon'].includes(feature.geometry?.type)) throw new Error('行政区边界仅支持 Polygon / MultiPolygon');
    return {type:'Feature',id:index,properties:{name:String(feature.properties?.name || `区域 ${index+1}`),adcode:String(feature.properties?.adcode||index),center:feature.properties?.centroid||feature.properties?.center,index},geometry:{type:feature.geometry.type,coordinates:convert(feature.geometry.coordinates)}};
  }) };
}

export function routeEndpoints(config, route) {
  const find = id => id==='hub' ? config.map.hub : config.attractions.find(item=>item.id===id);
  return [find(route.fromId),find(route.toId)].map(point => toWgs84([point.longitude,point.latitude],config.map.pointCrs));
}

export function arcCoordinate(start,end,t,height,base=0) {
  // 两端高程分别采样；弧高叠加在地形端点的连线上，而不是等高行政区顶面。
  const floor=Array.isArray(base)?base[0]+(base[1]-base[0])*t:base;
  return [start[0]+(end[0]-start[0])*t,start[1]+(end[1]-start[1])*t,floor+Math.sin(Math.PI*t)*height];
}
