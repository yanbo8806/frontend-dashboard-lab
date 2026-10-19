import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateConfig, mergeConfig, parseConfigJson, isSafeUrl, getPath, setPath } from '../src/config/schema.js';
import { TABLES, SCALAR_GROUPS } from '../src/config/fields.js';
const defaults = JSON.parse(fs.readFileSync(new URL('../public/config/dashboard.json', import.meta.url), 'utf8'));
test('默认咸阳配置：五个景点、五条有效飞线、占比一致', () => {
  const config = validateConfig(defaults);
  assert.equal(config.attractions.length, 5);
  assert.equal(config.routes.length, 5);
  assert.notEqual(config, defaults);
});
test('局部配置可更新；数字 0 不被误作缺失值', () => {
  assert.equal(mergeConfig(defaults, { map: { pitch: 0 } }).map.pitch, 0);
  assert.equal(mergeConfig(defaults, { meta: { title: '新标题' } }).meta.title, '新标题');
  assert.equal(defaults.meta.title, '咸阳文旅运行态势');
});
test('拒绝越界、空白和非数值坐标', () => {
  for (const latitude of [91, '', null, NaN, Infinity]) {
    const config = structuredClone(defaults); config.attractions[0].latitude = latitude;
    assert.throws(() => validateConfig(config), /latitude/);
  }
});
test('拒绝重复 ID、断开的飞线和错误趋势长度', () => {
  const config = structuredClone(defaults); config.attractions[1].id = 'qianling';
  assert.throws(() => validateConfig(config), /重复/);
  assert.throws(() => mergeConfig(defaults, { routes: [{ ...defaults.routes[0], toId: 'missing' }] }), /不存在/);
  assert.throws(() => mergeConfig(defaults, { trend: { categories: ['one'] } }), /数量/);
});
test('占比合计校验，图例与图表不能背离', () => {
  const config = structuredClone(defaults); config.travel[0].value = 1;
  assert.throws(() => validateConfig(config), /占比合计/);
});
test('所有输入拒绝原型污染和脚本 URL', () => {
  assert.throws(() => parseConfigJson('{"__proto__":{"polluted":true}}', defaults), /禁止/);
  assert.throws(() => parseConfigJson('{"map":{"evil":1}}', defaults), /未知/);
  assert.equal({}.polluted, undefined);
  for (const value of ['javascript:alert(1)', 'data:text/html,x', '//evil.test/a', 'https://u:pw@host.test', 'data:image/svg+xml,<svg/>', 'https:\\evil.test']) assert.equal(isSafeUrl(value, { allowImage: true }), false, value);
  assert.equal(isSafeUrl('media/test.jpg'), true);
  assert.equal(isSafeUrl('https://example.test/{z}/{x}/{y}.png'), true);
});
test('路径仅按自身字段读取，禁止表达式', () => {
  assert.equal(getPath({ data: { value: 7 } }, 'data.value'), 7);
  assert.throws(() => getPath({}, 'constructor.prototype'), /路径/);
  assert.throws(() => setPath({}, 'unknown', 2), /未知/);
});
test('空景点、空客源地可表达缺失数据，不伪造默认记录', () => {
  const config = mergeConfig(defaults, { attractions: [], routes: [], origins: [] });
  assert.equal(config.attractions.length, 0);
});

test('地形展示字段有界，外部 DEM 必须署名，旧配置只补缺失值', () => {
  assert.throws(() => mergeConfig(defaults,{map:{flightWidth:0}}), /flightWidth/);
  assert.throws(() => mergeConfig(defaults,{map:{terrainUrl:'https://example.test/{z}/{x}/{y}.png'}}), /terrainAttribution/);
  const saved=structuredClone(defaults);
  delete saved.map.terrainEnabled;delete saved.map.terrainAttribution;delete saved.map.flightWidth;
  saved.meta.title='用户业务标题';saved.map.center=[108.7,34.5];
  const normalized=validateConfig(saved);
  assert.equal(normalized.meta.title,'用户业务标题');
  assert.deepEqual(normalized.map.center,[108.7,34.5]);
  assert.equal(normalized.map.terrainEnabled,true);
  assert.equal(normalized.map.flightWidth,3.2);
  assert.equal(saved.map.terrainEnabled,undefined);
  assert.equal(mergeConfig(defaults,{map:{terrainEnabled:false}}).map.terrainEnabled,false);
});
test('每个业务配置字段都有表单和 Excel 覆盖，防止漏配字段',()=>{
  const covered=new Set(['version',...SCALAR_GROUPS.flatMap(group=>group.fields.map(field=>field.key)),'trend.categories','trend.series']);
  for(const table of TABLES){covered.add(table.key);const rows=getPath(defaults,table.key);for(const row of rows)assert.deepEqual(new Set(Object.keys(row)),new Set(table.columns.map(field=>field.key)));}
  function visit(value,path){if(covered.has(path))return;if(value&&typeof value==='object'){Object.entries(value).forEach(([key,item])=>visit(item,path?path+'.'+key:key));}else assert.fail('未覆盖的配置字段：'+path);}
  visit(defaults,'');
});
