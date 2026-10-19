import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { prepareBoundary, arcCoordinate } from '../src/gis/coordinates.js';
import { buildRegionOutline } from '../src/gis/outline.js';
import { decodeElevation, resolveTerrain, reliefColor, terrainShade } from '../src/gis/terrain.js';
import { addLandscapeLayers } from '../src/gis/terrainLayers.js';

const square = (x, y) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[x,y],[x+1,y],[x+1,y+1],[x,y+1],[x,y]]] } });
const collection = features => ({ type: 'FeatureCollection', features });

test('外边界消除相邻行政区的公共边，不将内部边界重复加亮', () => {
  const input = collection([square(0,0), square(1,0)]);
  const saved = structuredClone(input);
  const { outline, mask, segments } = buildRegionOutline(input);
  assert.deepEqual(input, saved);
  assert.equal(outline.features.length, 1);
  assert.equal(segments, 6);
  assert.equal(mask.geometry.coordinates[0].length, 2);
  for (const feature of outline.features) {
    const ring = feature.geometry.coordinates;
    assert.deepEqual(ring[0], ring.at(-1));
    for (let i=1; i<ring.length; i++) assert.ok(!(ring[i][0]===1 && ring[i-1][0]===1), '不能包含公共竖边');
  }
});

test('外边界保留离岛和孔洞，区外遮罩不把孔洞当成陆地', () => {
  const region = square(0,0);
  region.geometry.coordinates[0] = [[0,0],[4,0],[4,4],[0,4],[0,0]];
  region.geometry.coordinates.push([[1,1],[1,2],[2,2],[2,1],[1,1]]);
  const result = buildRegionOutline(collection([region, square(6,0)]));
  assert.equal(result.outline.features.length, 3);
  assert.equal(result.mask.geometry.coordinates.length, 2);
  assert.equal(result.mask.geometry.coordinates[0].length, 3);
});

test('咸阳 14 区真实数据可以拼接成闭合外轮廓', () => {
  const data = JSON.parse(fs.readFileSync(new URL('../public/geo/xianyang.geojson', import.meta.url), 'utf8'));
  const { outline, segments } = buildRegionOutline(prepareBoundary(data, 'GCJ02'));
  assert.equal(segments, 1337);
  assert.ok(outline.features.length > 0 && outline.features.length < 14);
  outline.features.forEach(({ geometry }) => assert.deepEqual(geometry.coordinates[0], geometry.coordinates.at(-1)));
});

test('DEM 按真实编码解码，支持负高程与小数', () => {
  assert.equal(decodeElevation(128,1,128,'terrarium'), 1.5);
  assert.equal(decodeElevation(127,255,0,'terrarium'), -1);
  assert.equal(decodeElevation(1,134,160,'mapbox'), 0);
  assert.throws(() => decodeElevation(0,0,0,'quantized-mesh'), /编码/);
});

test('内置 DEM 只用于咸阳边界，显式关闭和外部地址不会被覆盖', () => {
  const config = { boundaryUrl: 'geo/xianyang.geojson', terrainUrl: '', terrainEnabled: true, terrainEncoding: 'mapbox', terrainAttribution: '', terrainExaggeration: 1.2 };
  const preset = resolveTerrain(config);
  assert.equal(preset.encoding, 'terrarium');
  assert.equal(preset.maxzoom, 10);
  assert.ok(preset.tiles[0].startsWith('terrain/xianyang/dem/'));
  assert.ok(preset.attribution.includes('USGS'));
  assert.equal(resolveTerrain({...config, terrainEnabled:false}), null);
  assert.equal(resolveTerrain({...config, boundaryUrl:'geo/other.geojson'}), null);
  const external = resolveTerrain({...config, terrainUrl:'https://example.test/{z}/{x}/{y}.png', terrainAttribution:'自有 DEM'});
  assert.equal(external.encoding, 'mapbox');
  assert.equal(external.reliefTiles, undefined);
  assert.equal(external.attribution, '自有 DEM');
});

test('山脊明暗由 DEM 坡度计算，迎光坡比背光坡亮，无随机纹理', () => {
  const lit = terrainShade(.6,.4);
  const shadow = terrainShade(-.6,-.4);
  assert.ok(lit > shadow + .25);
  assert.deepEqual(reliefColor(900,lit), reliefColor(900,lit));
  assert.ok(reliefColor(900,lit).every((value,index) => value > reliefColor(900,shadow)[index]));
});

test('飞线两端分别贴合地形高程，避免整条线悬在行政区展示高度', () => {
  assert.deepEqual(arcCoordinate([108,34],[109,35],0,3000,[400,1200]), [108,34,400]);
  const end = arcCoordinate([108,34],[109,35],1,3000,[400,1200]);
  assert.ok(Math.abs(end[2]-1200)<1e-9);
  assert.equal(arcCoordinate([108,34],[109,35],.5,3000,[400,1200])[2], 3800);
});

test('地形材质、晕渲与外轮廓按正确次序渲染，DEM 模式不盖等高挤出面', () => {
  const config={boundaryUrl:'geo/xianyang.geojson',terrainUrl:'',terrainEnabled:true,terrainExaggeration:1.8,extrusionHeight:900,tilesUrl:''};
  const layers=[],sources={},map={addSource:(id,value)=>sources[id]=value,addLayer:layer=>layers.push(layer),setTerrain:value=>map.terrain=value};
  const stats=addLandscapeLayers(map,config,collection([square(0,0),square(1,0)]),resolveTerrain(config));
  assert.equal(sources.terrain.type,'raster-dem');assert.equal(sources.terrain.encoding,'terrarium');
  assert.equal(map.terrain.exaggeration,1.8);
  assert.equal(layers.some(layer=>layer.type==='fill-extrusion'),false);
  const ids=layers.map(layer=>layer.id);
  assert.ok(ids.indexOf('terrain-relief')<ids.indexOf('terrain-hillshade'));
  assert.ok(ids.indexOf('terrain-hillshade')<ids.indexOf('region-exterior'));
  assert.ok(ids.indexOf('districts-outline')<ids.indexOf('region-aura'));
  assert.ok(ids.indexOf('region-aura')<ids.indexOf('region-core'));
  assert.equal(stats.outerSegments,6);
});
