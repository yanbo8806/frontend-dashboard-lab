import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stageTransform } from '../src/app/stage.js';
import { sceneKey, canReuseScene } from '../src/app/scene.js';
import { rankedAttractions, rankedOrigins, enabledRoutes, routePointName } from '../src/shared/selectors.js';

const config = JSON.parse(fs.readFileSync(new URL('../public/config/dashboard.json', import.meta.url), 'utf8'));

test('固定舞台按短边缩放，剩余空间居中，不裁切大屏', () => {
  assert.deepEqual(stageTransform(1871, 841), { scale: 1, left: 0, top: 0 });
  for (const [width, height] of [[1366, 768], [390, 844], [2560, 1440]]) {
    const value = stageTransform(width, height);
    assert.ok(value.scale > 0);
    assert.ok(1871 * value.scale <= width + 1e-9);
    assert.ok(841 * value.scale <= height + 1e-9);
    assert.ok(Math.abs(value.left * 2 + 1871 * value.scale - width) < 1e-9);
    assert.ok(Math.abs(value.top * 2 + 841 * value.scale - height) < 1e-9);
  }
});

test('舞台拒绝无效视口，避免生成 NaN 或 Infinity 样式', () => {
  for (const value of [0, -1, NaN, Infinity]) {
    assert.throws(() => stageTransform(value, 841), /视口/);
    assert.throws(() => stageTransform(1871, value), /视口/);
  }
});

test('更新统计数字不重建地图，修改场景配置才重建', () => {
  const currentKey = sceneKey(config);
  const statsOnly = structuredClone(config);
  statsOnly.kpis[0].value += 1;
  statsOnly.meta.updatedAt = '2026-10-20T12:00:00+08:00';
  statsOnly.meta.title = '课堂示例';
  assert.equal(sceneKey(statsOnly), currentKey);
  for (const change of [
    next => next.map.zoom++,
    next => next.attractions[0].name = '新景点名称',
    next => next.routes[0].value++,
    next => next.labels.map = '新地图标题',
    next => next.meta.city = '新城市',
  ]) {
    const next = structuredClone(config);
    change(next);
    assert.notEqual(sceneKey(next), currentKey);
  }
});

test('地图加载中允许复用，出错或尚未创建时不能复用', () => {
  assert.equal(canReuseScene('same', 'same', { state: 'loading' }), true);
  assert.equal(canReuseScene('same', 'same', { state: 'ready' }), true);
  assert.equal(canReuseScene('same', 'same', { state: 'error' }), false);
  assert.equal(canReuseScene('same', 'different', { state: 'ready' }), false);
  assert.equal(canReuseScene('same', 'same', undefined), false);
});

test('排序是派生数据，不改写传入配置；线路过滤禁用项', () => {
  const attractions = [{ id: 'b', rank: 2 }, { id: 'a', rank: 1 }];
  const origins = [{ id: 'a', value: 10 }, { id: 'b', value: 90 }];
  const routes = [{ id: 'a', value: 10, enabled: true }, { id: 'off', value: 100, enabled: false }, { id: 'b', value: 90, enabled: true }];
  const before = structuredClone({ attractions, origins, routes });
  assert.deepEqual(rankedAttractions(attractions).map(row => row.id), ['a', 'b']);
  assert.deepEqual(rankedOrigins(origins).map(row => row.id), ['b', 'a']);
  assert.deepEqual(enabledRoutes(routes).map(row => row.id), ['b', 'a']);
  assert.deepEqual({ attractions, origins, routes }, before);
  assert.deepEqual(rankedOrigins([]), []);
});

test('线路名称按 ID 关联，汇聚点与未知点有明确回退', () => {
  assert.equal(routePointName(config, 'hub'), config.map.hub.name);
  assert.equal(routePointName(config, config.attractions[0].id), config.attractions[0].name);
  assert.equal(routePointName(config, 'unknown'), 'unknown');
});
