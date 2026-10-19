import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {ARTWORK,resolvePresentation,artworkPoint,fitArtwork,limitView} from '../src/gis/imageGeometry.js';

test('默认采用图片立体展示，仅明确的 gis 参数恢复旧版',()=>{
  for(const value of [null,undefined,'','image','unknown'])assert.equal(resolvePresentation(value),'image');
  assert.equal(resolvePresentation('gis'),'gis');
});

test('两张部署素材匹配迁移前记录的原图哈希，不依赖仓库外的文件',()=>{
  const hashes = {
    [ARTWORK.foreground]:'24b7514826b5d2715a5ab8a63dd5eb1dd2ffd00dc4dec4282fea19b48a072ea5',
    [ARTWORK.background]:'15b10a0e10d88a037354b2329f055fb8870f54f6581b6e0e1988ee6382353a79',
  };
  for(const [target,expected] of Object.entries(hashes)){
    const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    assert.equal(hash(new URL('../public/'+target,import.meta.url)),expected);
  }
});

test('完整地图按比例容纳在场景内，标题与底部控件有留白',()=>{
  for(const [width,height] of [[903,646],[640,480],[390,500]]){
    const fit=fitArtwork(width,height);
    assert.ok(fit.width<=width-48);assert.ok(fit.height<=height-80);
    assert.ok(Math.abs(fit.width/fit.height-ARTWORK.width/ARTWORK.height)<1e-10);
    assert.ok(fit.top>=40);assert.ok(fit.top+fit.height<=height-32);
  }
});

test('景点按 ID 联动；改名不漂移，修改坐标会更新示意落点',()=>{
  const point={id:'qianling',name:'乾陵',longitude:108.2115,latitude:34.5751};
  const anchor=artworkPoint(point,'WGS84');
  assert.deepEqual(artworkPoint({...point,name:'乾陵新名称'},'WGS84'),anchor);
  assert.notDeepEqual(artworkPoint({...point,longitude:108.31},'WGS84'),anchor);
  for(const value of anchor)assert.ok(Number.isFinite(value)&&value>0&&value<1);
  const custom=artworkPoint({id:'new',longitude:108.56,latitude:34.51},'WGS84');
  assert.ok(custom.every(value=>Number.isFinite(value)&&value>=.08&&value<=.92));
});

test('视角限制缩放和平移，异常输入不会污染渲染矩阵',()=>{
  assert.deepEqual(limitView({zoom:10,x:99,y:-99}),{zoom:1.8,x:3.4,y:-2.5});
  assert.deepEqual(limitView({zoom:0,x:0,y:0}),{zoom:.8,x:0,y:0});
  assert.deepEqual(limitView({zoom:NaN,x:Infinity,y:undefined}),{zoom:1,x:0,y:0});
});
