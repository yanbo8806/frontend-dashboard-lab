// 内置数据与生成工具共用范围/编码，避免把晕渲彩色图误当成高程图。
export const LOCAL_TERRAIN = Object.freeze({
  id:'xianyang-terrain-tiles-v1',
  tiles:['terrain/xianyang/dem/{z}/{x}/{y}.png'],
  reliefTiles:['terrain/xianyang/relief/{z}/{x}/{y}.png'],
  bounds:[107.4,34.05,109.4,35.7],
  minzoom:0,maxzoom:10,tileSize:256,encoding:'terrarium',
  attribution:'地形：Mapzen Terrain Tiles · USGS SRTM / GMTED2010',
  source:'https://registry.opendata.aws/terrain-tiles/',
});

export function resolveTerrain(config) {
  if (config.terrainEnabled===false) return null;
  if (config.terrainUrl) return {tiles:[config.terrainUrl],tileSize:256,encoding:config.terrainEncoding,maxzoom:14,attribution:config.terrainAttribution||'',exaggeration:config.terrainExaggeration};
  const path=config.boundaryUrl.startsWith('./')?config.boundaryUrl.slice(2):config.boundaryUrl;
  const localBoundary=path.split('?')[0];
  return localBoundary==='geo/xianyang.geojson' ? {...LOCAL_TERRAIN,exaggeration:config.terrainExaggeration} : null;
}

export function decodeElevation(red,green,blue,encoding) {
  if (encoding==='terrarium') return red*256+green+blue/256-32768;
  if (encoding==='mapbox') return (red*65536+green*256+blue)*.1-10000;
  throw new Error(`不支持的 DEM 编码：${encoding}`);
}

/** 坡向采用东/南坐标；光线从西北照入，以真实高程梯度形成山脊阴影。 */
export function terrainShade(eastSlope,southSlope) {
  const scale=2.8, nx=-eastSlope*scale, ny=-southSlope*scale;
  const dot=(nx*-.58+ny*-.58+.574)/Math.hypot(nx,ny,1);
  return Math.max(.13,Math.min(1,dot));
}

const RAMP=[[0,[13,87,82]],[400,[20,111,95]],[750,[37,132,108]],[1150,[94,151,117]],[1700,[149,167,127]],[2400,[187,191,151]],[3500,[219,228,217]]];
/** 海拔分色 + 多尺度坡面明暗；不添加噪声、不伪造卫星影像。 */
export function reliefColor(height,shade) {
  const upper=RAMP.findIndex(([level])=>level>height);
  const low=RAMP[Math.max(0,upper<0?RAMP.length-1:upper-1)], high=RAMP[upper<0?RAMP.length-1:upper];
  const t=high[0]===low[0]?0:Math.max(0,Math.min(1,(height-low[0])/(high[0]-low[0])));
  const brightness=.24+shade*1.22;
  return low[1].map((value,index)=>Math.max(0,Math.min(255,Math.round((value+(high[1][index]-value)*t)*brightness))));
}
