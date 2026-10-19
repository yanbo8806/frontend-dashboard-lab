// 独立演示路网：坐标是原画 UV 示意，不是导航路网；不接入或冒充真实交通数据。
export const TRAFFIC_UPDATE_MS=5000;
export const TRAFFIC_LEVELS=Object.freeze({
  free:Object.freeze({id:'free',label:'畅通',color:'#78bcae'}),
  slow:Object.freeze({id:'slow',label:'缓行',color:'#d2b184'}),
  congested:Object.freeze({id:'congested',label:'拥堵',color:'#d9878f'}),
});

export const TRAFFIC_ROADS=[
  {id:'g30',code:'G30',name:'连霍高速',section:'兴平 → 咸阳',direction:'东行',lengthKm:46,
    points:[[.25,.84],[.325,.85],[.39,.825],[.46,.79],[.53,.77],[.605,.742],[.68,.725],[.75,.693],[.82,.675],[.86,.665]],
    speeds:[91,73,53,28,24,58]},
  {id:'g70',code:'G70',name:'福银高速',section:'乾县 → 礼泉',direction:'东南行',lengthKm:78,
    points:[[.18,.275],[.24,.325],[.275,.389],[.315,.44],[.378,.493],[.424,.562],[.47,.628],[.506,.7],[.555,.755],[.64,.785]],
    speeds:[89,71,57,48,58,81]},
  {id:'g69',code:'G69',name:'银百高速',section:'淳化 → 咸阳',direction:'南行',lengthKm:63,
    points:[[.46,.225],[.474,.28],[.486,.354],[.48,.434],[.486,.495],[.535,.567],[.555,.637],[.57,.704],[.615,.793]],
    speeds:[86,93,100,97,92,89]},
  {id:'g6522',code:'G6522',name:'延西高速',section:'三原 → 西安',direction:'南行',lengthKm:55,
    points:[[.665,.13],[.698,.188],[.664,.267],[.64,.345],[.624,.432],[.636,.515],[.644,.583],[.672,.656],[.715,.71],[.768,.744]],
    speeds:[93,90,88,82,94,100]},
];

export function trafficLevel(speed){return speed<40?TRAFFIC_LEVELS.congested:speed<70?TRAFFIC_LEVELS.slow:TRAFFIC_LEVELS.free;}
const tenth=value=>Math.round(value*10)/10;

export function trafficSnapshot(elapsed=0){
  // 只用动画有效时间推进，暂停、后台、减少动画和截图冻结共享同一时钟。
  const tick=Math.floor((Number.isFinite(elapsed)?Math.max(0,elapsed):0)/TRAFFIC_UPDATE_MS);
  const roads=TRAFFIC_ROADS.map((road,roadIndex)=>{
    const segments=road.speeds.map((base,index)=>{
      const phase=roadIndex*1.13+index*.71;
      const fluctuation=Math.sin(tick*.78+phase)*9+Math.sin(tick*.31+index)*3;
      const speed=Math.max(12,Math.min(115,Math.round(base+fluctuation)));
      return {from:index/road.speeds.length,to:(index+1)/road.speeds.length,speed,level:trafficLevel(speed)};
    });
    const bottleneck=segments.reduce((worst,segment)=>segment.speed<worst.speed?segment:worst);
    const segmentKm=road.lengthKm/segments.length;
    return {id:road.id,code:road.code,name:road.name,section:road.section,direction:road.direction,lengthKm:road.lengthKm,segments,
      speed:bottleneck.speed,level:bottleneck.level,hotspotProgress:(bottleneck.from+bottleneck.to)/2,
      averageSpeed:Math.round(segments.reduce((sum,segment)=>sum+segment.speed,0)/segments.length),
      congestedKm:tenth(segments.filter(segment=>segment.level.id==='congested').length*segmentKm),
      delayMinutes:Math.round(Math.max(0,segments.reduce((sum,segment)=>sum+segmentKm/segment.speed*60,0)-road.lengthKm/100*60)),
    };
  });
  return {source:'simulation',tick,updatedSeconds:tick*TRAFFIC_UPDATE_MS/1000,roads,
    congestedKm:tenth(roads.reduce((sum,road)=>sum+road.congestedKm,0)),
    averageSpeed:Math.round(roads.reduce((sum,road)=>sum+road.averageSpeed,0)/roads.length),
    congestedRoads:roads.filter(road=>road.level.id==='congested').length,
  };
}

export function trafficClock(seconds){
  return 'T+'+String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(Math.floor(seconds%60)).padStart(2,'0');
}
