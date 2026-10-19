import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { toWgs84,wgsToGcj,prepareBoundary,arcCoordinate } from '../src/gis/coordinates.js';
test('坐标系变换往返误差小于 1e-7 度，境外不偏移',()=>{
  const point=[108.7054,34.3244],actual=toWgs84(wgsToGcj(point),'GCJ02');
  point.forEach((value,i)=>assert.ok(Math.abs(value-actual[i])<1e-7));
  assert.deepEqual(toWgs84([-74,40.7],'GCJ02'),[-74,40.7]);
});
test('真实边界包含咸阳 14 个行政区，坐标经转换且不修改原文',()=>{
  const geo=JSON.parse(fs.readFileSync(new URL('../public/geo/xianyang.geojson',import.meta.url),'utf8'));
  const result=prepareBoundary(geo,'GCJ02');
  assert.equal(result.features.length,14);
  assert.ok(result.features.some(feature=>feature.properties.name==='乾县'));
  assert.notDeepEqual(result.features[0].geometry.coordinates,geo.features[0].geometry.coordinates);
});
test('飞线有真实三维弧高，起终点精确落在给定坐标',()=>{
  const start=[108.7,34.3],end=[108.2,34.6];
  assert.deepEqual(arcCoordinate(start,end,0,5000,100),[...start,100]);
  assert.ok(Math.abs(arcCoordinate(start,end,1,5000,100)[2]-100)<1e-9);
  assert.equal(arcCoordinate(start,end,.5,5000,100)[2],5100);
});
