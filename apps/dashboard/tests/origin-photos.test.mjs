import test from 'node:test';
import assert from 'node:assert/strict';
import { originImageRect } from '../src/originPhotos.js';

test('干净教学插图和上传照片与圆框等大，CSS 负责 cover',()=>{
  for(const diameter of [24,78,100])assert.deepEqual(originImageRect(diameter),{x:0,y:0,w:diameter,h:diameter});
});

test('无效直径被拒绝，避免生成异常布局',()=>{
  for(const diameter of [0,-1,NaN,Infinity])assert.throws(()=>originImageRect(diameter),/直径/);
});
