import test from 'node:test';
import assert from 'node:assert/strict';
import {TRAFFIC_ROADS,TRAFFIC_UPDATE_MS,trafficLevel,trafficSnapshot,trafficClock} from '../src/gis/trafficModel.js';

test('高速路网为独立模拟数据，四条线路和原画坐标完整且不重复',()=>{
  assert.equal(TRAFFIC_ROADS.length,4);
  assert.equal(new Set(TRAFFIC_ROADS.map(road=>road.id)).size,4);
  assert.deepEqual(TRAFFIC_ROADS.map(road=>road.code),['G30','G70','G69','G6522']);
  for(const road of TRAFFIC_ROADS){
    assert.ok(road.points.length>=6);
    assert.equal(road.speeds.length,6);
    assert.ok(road.lengthKm>0);
    for(const point of road.points)assert.ok(point.length===2&&point.every(value=>Number.isFinite(value)&&value>0&&value<1));
  }
});

test('车速阈值有明确边界，颜色和文字表达同一状态',()=>{
  assert.equal(trafficLevel(39).id,'congested');
  assert.equal(trafficLevel(40).id,'slow');
  assert.equal(trafficLevel(69).id,'slow');
  assert.equal(trafficLevel(70).id,'free');
  assert.equal(trafficLevel(0).label,'拥堵');
  assert.equal(new Set([20,50,90].map(speed=>trafficLevel(speed).color)).size,3);
});

test('每五秒生成一帧可重现的路况，冻结时不依赖系统时钟或随机数',()=>{
  assert.equal(TRAFFIC_UPDATE_MS,5000);
  assert.deepEqual(trafficSnapshot(0),trafficSnapshot(TRAFFIC_UPDATE_MS-1));
  assert.deepEqual(trafficSnapshot(10000),trafficSnapshot(10000));
  assert.notDeepEqual(trafficSnapshot(0),trafficSnapshot(TRAFFIC_UPDATE_MS));
  assert.equal(trafficSnapshot(9999).tick,1);
  assert.equal(trafficSnapshot(10000).tick,2);
  for(const elapsed of [-1,NaN,Infinity,undefined])assert.deepEqual(trafficSnapshot(elapsed),trafficSnapshot(0));
});

test('初始画面包含畅通、缓行、拥堵，汇总与分段里程一致',()=>{
  const snapshot=trafficSnapshot(0);
  assert.equal(snapshot.source,'simulation');
  assert.deepEqual(new Set(snapshot.roads.map(road=>road.level.id)),new Set(['congested','slow','free']));
  const total=snapshot.roads.reduce((sum,road)=>sum+road.congestedKm,0);
  assert.ok(Math.abs(snapshot.congestedKm-total)<.15);
  for(const road of snapshot.roads){
    assert.equal(road.speed,Math.min(...road.segments.map(segment=>segment.speed)));
    assert.equal(road.level.id,trafficLevel(road.speed).id);
    assert.ok(road.hotspotProgress>0&&road.hotspotProgress<1);
    assert.ok(road.averageSpeed>=road.speed);
    assert.ok(road.delayMinutes>=0);
    assert.equal(road.segments[0].from,0);
    assert.equal(road.segments.at(-1).to,1);
    for(let i=1;i<road.segments.length;i++)assert.equal(road.segments[i].from,road.segments[i-1].to);
  }
});

test('连续模拟一小时数值有界、不会修改基础线路，至少一条高速会切换状态',()=>{
  const original=structuredClone(TRAFFIC_ROADS),states=new Map();
  for(let elapsed=0;elapsed<=3600000;elapsed+=TRAFFIC_UPDATE_MS){
    const snapshot=trafficSnapshot(elapsed);
    assert.ok(snapshot.averageSpeed>=12&&snapshot.averageSpeed<=115);
    for(const road of snapshot.roads){
      for(const segment of road.segments)assert.ok(segment.speed>=12&&segment.speed<=115);
      assert.ok(road.congestedKm>=0&&road.congestedKm<=road.lengthKm);
      if(!states.has(road.id))states.set(road.id,new Set());
      states.get(road.id).add(road.level.id);
    }
  }
  assert.deepEqual(TRAFFIC_ROADS,original);
  assert.ok([...states.values()].some(values=>values.size>1));
});

test('模拟时钟明确表示运行时长，不伪造真实采集时间',()=>{
  assert.equal(trafficClock(0),'T+00:00');
  assert.equal(trafficClock(65),'T+01:05');
  assert.equal(trafficClock(3605),'T+60:05');
});
