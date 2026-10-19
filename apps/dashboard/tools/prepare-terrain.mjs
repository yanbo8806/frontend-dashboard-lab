// 只生成本地咸阳 DEM 与分层设色晕渲，不下载影像、不访问带密钥服务。
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { PNG } from '../../../packages/img2code/node_modules/pngjs/lib/png.js';
import { LOCAL_TERRAIN, decodeElevation, reliefColor, terrainShade } from '../src/gis/terrain.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'public/terrain/xianyang');
const cache=path.join(root,'out/terrain-upgrade/source-dem');
const source='https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
const [west,south,east,north]=LOCAL_TERRAIN.bounds;
const lonTile=(lon,z)=>(lon+180)/360*2**z;
const latTile=(lat,z)=>(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*2**z;
const tileLat=(y,z)=>Math.atan(Math.sinh(Math.PI*(1-2*y/2**z)))*180/Math.PI;
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
async function download(url) {
  let last;
  // 公共服务偶发断流时仅重试当前文件，单次 12 秒、至多 3 次；已缓存文件不重下。
  for(let attempt=0;attempt<3;attempt++) {
    try {
      const response=await fetch(url,{signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw new Error(`HTTP ${response.status}：${url}`);
      return Buffer.from(await response.arrayBuffer());
    } catch(error) {last=error;}
  }
  throw last;
}
const tiles=new Map(), requested=new Map(), outputs=[];
for(let z=0;z<=LOCAL_TERRAIN.maxzoom;z++) {
  const x0=Math.floor(lonTile(west,z)),x1=Math.floor(lonTile(east,z)),y0=Math.floor(latTile(north,z)),y1=Math.floor(latTile(south,z));
  for(let x=x0;x<=x1;x++) for(let y=y0;y<=y1;y++) outputs.push({z,x,y,key:`${z}/${x}/${y}`});
  // 周边一圈作为差分计算的边缘样本，消除瓦片接缝；不作为额外业务范围。
  for(let x=Math.max(0,x0-1);x<=Math.min(2**z-1,x1+1);x++) for(let y=Math.max(0,y0-1);y<=Math.min(2**z-1,y1+1);y++) requested.set(`${z}/${x}/${y}`,{z,x,y});
}
const attributionUrl='https://api.github.com/repos/tilezen/joerd/contents/docs/attribution.md';
await fs.mkdir(out,{recursive:true});
const attribution=JSON.parse((await download(attributionUrl)).toString());
await fs.writeFile(path.join(out,'ATTRIBUTION.md'),Buffer.from(attribution.content,'base64'));
const tasks=[...requested.entries()]; let next=0,completed=0; const records=[];
await Promise.all(Array.from({length:6},async()=>{
  while(next<tasks.length) {
    const [key]=tasks[next++],file=path.join(cache,`${key}.png`);
    let bytes;
    try {bytes=await fs.readFile(file);} catch(error) {if(error.code!=='ENOENT')throw error;}
    if(!bytes) {
      bytes=await download(`${source}/${key}.png`);
      if(bytes.length>1024*1024)throw new Error(`DEM ${key} 超过 1MB`);
      const png=PNG.sync.read(bytes);
      if(png.width!==256||png.height!==256)throw new Error(`DEM ${key} 尺寸不符`);
      await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);
    }
    const png=PNG.sync.read(bytes),heights=new Float32Array(256*256);
    for(let i=0;i<heights.length;i++)heights[i]=decodeElevation(png.data[i*4],png.data[i*4+1],png.data[i*4+2],'terrarium');
    tiles.set(key,{bytes,heights});records.push({key,url:`${source}/${key}.png`,bytes:bytes.length,sha256:hash(bytes)});
    completed++; if(completed%24===0||completed===tasks.length)console.log(`DEM ${completed}/${tasks.length}`);
  }
}));
let minimum=Infinity,maximum=-Infinity; const generated=[];
for(const {z,x,y,key} of outputs) {
  const {bytes,heights}=tiles.get(key);
  const sample=(px,py)=>{
    const tx=Math.max(0,Math.min(2**z-1,x+Math.floor(px/256))),ty=Math.max(0,Math.min(2**z-1,y+Math.floor(py/256)));
    const data=tiles.get(`${z}/${tx}/${ty}`)?.heights||heights;
    return data[((py%256+256)%256)*256+(px%256+256)%256];
  };
  const png=new PNG({width:256,height:256});
  for(let py=0;py<256;py++) {
    const latitude=tileLat(y+(py+.5)/256,z);
    const meters=40075016.68557849*Math.cos(latitude*Math.PI/180)/(256*2**z);
    for(let px=0;px<256;px++) {
      const h=heights[py*256+px];
      const fine=terrainShade((sample(px+1,py)-sample(px-1,py))/(2*meters),(sample(px,py+1)-sample(px,py-1))/(2*meters));
      const broad=terrainShade((sample(px+3,py)-sample(px-3,py))/(6*meters),(sample(px,py+3)-sample(px,py-3))/(6*meters));
      const color=reliefColor(h,.72*fine+.28*broad);const offset=(py*256+px)*4;
      color.forEach((value,index)=>png.data[offset+index]=value);png.data[offset+3]=255;
      if(z===LOCAL_TERRAIN.maxzoom){minimum=Math.min(minimum,h);maximum=Math.max(maximum,h);}
    }
  }
  const relief=PNG.sync.write(png);
  for(const [kind,buffer] of [['dem',bytes],['relief',relief]]) {
    const target=path.join(out,kind,`${key}.png`);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,buffer);
  }
  generated.push({key,demSha256:hash(bytes),reliefSha256:hash(relief),demBytes:bytes.length,reliefBytes:relief.length});
}
const manifest={id:LOCAL_TERRAIN.id,accessedAt:new Date().toISOString(),source:LOCAL_TERRAIN.source,attribution:LOCAL_TERRAIN.attribution,attributionDocument:'ATTRIBUTION.md',crs:'WGS84 / EPSG:3857 XYZ',encoding:'terrarium',tileSize:256,bounds:LOCAL_TERRAIN.bounds,minzoom:0,maxzoom:10,sampleSpacingMetersAt35N:125.2,elevationRangeMeters:[minimum,maximum],processing:{method:'真实 DEM 海拔分色 + 西北光照 + 1 与 3 像素多尺度坡面晕渲',slopeExaggeration:2.8,imagery:false,noise:false,originalElevationUnmodified:true,note:'当前瓦片采样间距约 125 米，不代表原始 DEM 精度；周边瓦片可超出城市边界。'},tiles:generated,sources:records.sort((a,b)=>a.key.localeCompare(b.key))};
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({tiles:generated.length,downloaded:records.length,bytes:generated.reduce((sum,item)=>sum+item.demBytes+item.reliefBytes,0),elevationRangeMeters:manifest.elevationRangeMeters,manifest:path.join(out,'manifest.json')}));
