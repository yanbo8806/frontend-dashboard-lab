const pointKey = point => point.slice(0,2).map(value => value.toFixed(8)).join(',');
const area = ring => ring.slice(1).reduce((sum,point,index) => sum + ring[index][0]*point[1] - point[0]*ring[index][1], 0)/2;
const orient = (ring, positive) => (area(ring)>0)===positive ? ring : [...ring].reverse();
function contains(ring, [x,y]) {
  let inside = false;
  for (let i=0,j=ring.length-1; i<ring.length; j=i++) {
    const a=ring[i], b=ring[j];
    if ((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside;
}

/** 对同一套拓扑行政区消除公共边，再拼接闭环。只让城市外轮廓发光，不描粗每个县。 */
export function buildRegionOutline(boundary) {
  const edges = new Map();
  for (const feature of boundary.features) {
    const polygons = feature.geometry.type==='Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    for (const polygon of polygons) for (const ring of polygon) {
      for (let i=1; i<ring.length; i++) {
        const a=pointKey(ring[i-1]), b=pointKey(ring[i]);
        if (a===b) continue;
        const key = a<b ? `${a}|${b}` : `${b}|${a}`;
        if (edges.has(key)) edges.get(key).count++;
        else edges.set(key,{a,b,start:ring[i-1],end:ring[i],count:1});
      }
    }
  }
  const outer = [...edges.values()].filter(edge => edge.count===1);
  const adjacency = new Map();
  outer.forEach((edge,index) => {
    for (const key of [edge.a,edge.b]) {
      if (!adjacency.has(key)) adjacency.set(key,[]);
      adjacency.get(key).push(index);
    }
  });
  const visited = new Set(), rings = [];
  for (let index=0; index<outer.length; index++) {
    if (visited.has(index)) continue;
    const first=outer[index], ring=[first.start,first.end];
    let cursor=first.b; visited.add(index);
    while (cursor!==first.a) {
      const nextIndex=adjacency.get(cursor)?.find(value=>!visited.has(value));
      if (nextIndex===undefined) throw new Error('行政区外轮廓未闭合，请提供公共边吻合的 GeoJSON');
      const next=outer[nextIndex]; visited.add(nextIndex);
      const forward=next.a===cursor;
      ring.push(forward?next.end:next.start); cursor=forward?next.b:next.a;
    }
    if (ring.length>=4) rings.push(ring);
  }
  // 通过包含深度区分陆地、孔洞和孔洞中的离岛，区外遮罩保留所有层级。
  const nested=rings.map((ring,index) => ({ring,index,parents:rings.flatMap((other,i) => i!==index&&Math.abs(area(other))>Math.abs(area(ring))&&contains(other,ring[0])?[i]:[])}));
  const world=[[-180,-85],[180,-85],[180,85],[-180,85],[-180,-85]];
  const maskPolygons=[[world,...nested.filter(item=>item.parents.length===0).map(item=>orient(item.ring,false))]];
  for (const item of nested.filter(item=>item.parents.length%2===1)) {
    const children=nested.filter(child=>child.parents.length===item.parents.length+1&&child.parents.includes(item.index));
    maskPolygons.push([orient(item.ring,true),...children.map(child=>orient(child.ring,false))]);
  }
  return {
    segments:outer.length,
    outline:{type:'FeatureCollection',features:rings.map(coordinates=>({type:'Feature',properties:{},geometry:{type:'LineString',coordinates}}))},
    mask:{type:'Feature',properties:{},geometry:{type:'MultiPolygon',coordinates:maskPolygons}},
  };
}
