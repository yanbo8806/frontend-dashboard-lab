// 配置、API、Excel 共用这份校验：先校验整份候选配置，再原子替换当前数据。
export const MAX_CONFIG_BYTES = 4 * 1024 * 1024;
export const SAFE_ICONS = ['users', 'province', 'pin', 'app', 'car', 'train', 'plane', 'people', 'trend', 'flame'];
const dangerousKeys = new Set(['__proto__', 'prototype', 'constructor']);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const textRule = (max = 120, empty = false) => ({ type: 'string', max, empty });
const numberRule = (min = 0, max = 1e12) => ({ type: 'number', min, max });
const choice = (...values) => ({ type: 'choice', values });
const optional = (rule, value) => ({ ...rule, default: value });
const list = (item, min = 0, max = 100) => ({ type: 'array', item, min, max });
const color = { type: 'color' }, url = { type: 'url' }, image = { type: 'image' }, bool = { type: 'boolean' };
const id = { type: 'id' }, longitude = numberRule(-180, 180), latitude = numberRule(-85, 85);
const share = { name: textRule(24), value: numberRule(0, 100), color };
export const CONFIG_SCHEMA = {
  version: choice(1),
  meta: { title: textRule(42), subtitle: textRule(100, true), city: textRule(24), dataLabel: textRule(50), updatedAt: textRule(40) },
  labels: Object.fromEntries(['trend', 'travel', 'routes', 'attractions', 'origins', 'demographics', 'travelCenter', 'gender', 'age', 'heat', 'trendUnit', 'map'].map(key => [key, textRule(30)])),
  kpis: list({ id, label: textRule(20), value: numberRule(-1e12), unit: textRule(8, true), change: numberRule(-1e6, 1e6), icon: choice(...SAFE_ICONS) }, 4, 4),
  trend: { categories: list(textRule(30), 1, 120), yMax: numberRule(), series: list({ name: textRule(24), color, values: list(numberRule(), 1, 120) }, 1, 4) },
  travel: list({ ...share, icon: choice(...SAFE_ICONS) }, 1, 6),
  attractions: list({ id, name: textRule(32), district: textRule(40), longitude, latitude, rank: numberRule(1, 10000), heat: numberRule(0, 100), image, imagePosition: { type: 'position' }, imageSource: url, imageCredit: textRule(300, true), description: textRule(600, true), coordinateNote: textRule(300, true) }, 0, 100),
  routes: list({ id, fromId: id, toId: id, value: numberRule(0, 100), height: numberRule(0, 100000), color, enabled: bool }, 0, 200),
  origins: list({ id, name: textRule(24), value: numberRule(0, 100), image }, 0, 50),
  demographics: { gender: list(share, 2, 2), ages: list({ name: textRule(20), value: numberRule(0, 100) }, 1, 12) },
  map: { center: list(numberRule(-180, 180), 2, 2), zoom: numberRule(2, 18), pitch: numberRule(0, 75), bearing: numberRule(-180, 180), focusZoom: numberRule(2, 18), boundaryUrl: url, boundaryCrs: choice('WGS84', 'GCJ02', 'BD09'), pointCrs: choice('WGS84', 'GCJ02', 'BD09'), boundaryAttribution: textRule(160), extrusionHeight: numberRule(0, 20000), animate: bool, showDistricts: bool, showLabels: bool, tilesUrl: url, tilesAttribution: textRule(200, true), terrainUrl: url, terrainEncoding: choice('mapbox', 'terrarium'), terrainExaggeration: numberRule(0, 10), terrainEnabled: optional(bool,true), terrainAttribution: optional(textRule(200,true),''), flightWidth: optional(numberRule(1,10),3.2), hub: { name: textRule(24), longitude, latitude } },
  dataSource: { mode: choice('local', 'api'), url, responsePath: textRule(100, true), refreshSeconds: numberRule(0, 86400), timeoutMs: numberRule(100, 60000) },
};

export class ConfigError extends Error {
  constructor(issues) { super(issues.join('\n')); this.name = 'ConfigError'; this.issues = issues; }
}

/** 路径只允许本地相对地址和 http(s)，不接受脚本、凭据、协议相对地址。 */
export function isSafeUrl(value, { allowImage = false } = {}) {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f\\]/.test(value)) return false;
  if (!value) return true;
  if (allowImage && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return value.length <= 900000;
  if (value.startsWith('//') || value.startsWith('#')) return false;
  try {
    const parsed = new URL(value, 'https://dashboard.invalid/');
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch { return false; }
}

function check(value, schema, path, issues) {
  const fail = message => issues.push(`${path || '配置'}：${message}`);
  if (value===undefined && Object.hasOwn(schema,'default')) return;
  if (!schema.type) {
    if (!plain(value)) return fail('必须是对象');
    for (const key of Object.keys(value)) if (dangerousKeys.has(key) || !Object.hasOwn(schema, key)) issues.push(`${path ? path + '.' : ''}${key}：未知或禁止字段`);
    for (const [key, rule] of Object.entries(schema)) check(value[key], rule, path ? `${path}.${key}` : key, issues);
    return;
  }
  switch (schema.type) {
    case 'array':
      if (!Array.isArray(value)) return fail('必须是数组');
      if (value.length < schema.min || value.length > schema.max) fail(`数量必须在 ${schema.min}–${schema.max} 之间`);
      value.slice(0, schema.max + 1).forEach((item, i) => check(item, schema.item, `${path}[${i}]`, issues));
      break;
    case 'string': if (typeof value !== 'string' || (!schema.empty && !value.trim()) || value.length > schema.max) fail(`必须为${schema.empty ? '可留空的' : '非空'}文本，最多 ${schema.max} 字`); break;
    case 'number': if (typeof value !== 'number' || !Number.isFinite(value) || value < schema.min || value > schema.max) fail(`必须为 ${schema.min}–${schema.max} 范围内的数字，不能留空`); break;
    case 'boolean': if (typeof value !== 'boolean') fail('必须为 true 或 false'); break;
    case 'choice': if (!schema.values.includes(value)) fail(`仅支持 ${schema.values.join(' / ')}`); break;
    case 'id': if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value) || dangerousKeys.has(value)) fail('ID 仅限字母、数字、下划线、短横线，最长 64 字'); break;
    case 'color': if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) fail('颜色格式为 #RRGGBB'); break;
    case 'url': if (!isSafeUrl(value) || value.length > 3000) fail('必须为相对路径或 http(s) URL，不可包含空格、凭据或脚本'); break;
    case 'image': if (!isSafeUrl(value, { allowImage: true })) fail('图片仅支持 http(s)、相对路径或不超过约 660KB 的 PNG/JPEG/WebP 内嵌数据'); break;
    case 'position': if (typeof value !== 'string' || !/^(?:100|[0-9]{1,2})% (?:100|[0-9]{1,2})%$/.test(value)) fail('图片位置格式为 50% 50%，两值均为 0–100'); break;
  }
}

export function validateConfig(input) {
  const issues = [];
  check(input, CONFIG_SCHEMA, '', issues);
  if (issues.length) throw new ConfigError(issues.slice(0, 40));
  const unique = (rows, field, path) => {
    const seen = new Set();
    rows.forEach((row, i) => { if (seen.has(row[field])) issues.push(`${path}[${i}].${field}：重复的 ${row[field]}`); seen.add(row[field]); });
  };
  ['kpis', 'attractions', 'routes', 'origins'].forEach(key => unique(input[key], 'id', key));
  unique(input.attractions, 'rank', 'attractions');
  unique(input.trend.series, 'name', 'trend.series');
  for (const key of ['K1', 'K2', 'K3', 'K4']) if (!input.kpis.some(item => item.id === key)) issues.push(`kpis：缺少 ${key}`);
  if (input.attractions.some(item => item.id === 'hub')) issues.push('attractions：hub 是汇聚点保留 ID');
  if (input.attractions.some(item => !Number.isInteger(item.rank))) issues.push('attractions.rank：排名必须为整数');
  const pointIds = new Set(['hub', ...input.attractions.map(item => item.id)]);
  input.routes.forEach((route, i) => {
    for (const key of ['fromId', 'toId']) if (!pointIds.has(route[key])) issues.push(`routes[${i}].${key}：景点 ID ${route[key]} 不存在`);
    if (route.fromId === route.toId) issues.push(`routes[${i}]：起终点不能相同`);
  });
  input.trend.series.forEach((series, i) => {
    if (series.values.length !== input.trend.categories.length) issues.push(`trend.series[${i}].values：数量必须与时间标签一致`);
    if (input.trend.yMax > 0 && series.values.some(value => value > input.trend.yMax)) issues.push('trend.yMax：不得小于数据最大值，填 0 自动计算');
  });
  [['travel', input.travel], ['demographics.gender', input.demographics.gender], ['demographics.ages', input.demographics.ages]].forEach(([path, rows]) => {
    const sum = rows.reduce((total, row) => total + row.value, 0);
    if (Math.abs(sum - 100) > 0.15) issues.push(`${path}：占比合计为 ${Number(sum.toFixed(3))}%，须为 100%（允许 0.15 个百分点舍入差）`);
    unique(rows, 'name', path);
  });
  if (input.origins.reduce((sum, row) => sum + row.value, 0) > 100.15) issues.push('origins：客源地占比之和不得超过 100%');
  if (Math.abs(input.map.center[1]) > 85) issues.push('map.center[1]：地图纬度必须在 -85–85 之间');
  if (!input.map.boundaryUrl) issues.push('map.boundaryUrl：行政区 GeoJSON 地址不能为空');
  if (input.map.tilesUrl && !input.map.tilesAttribution.trim()) issues.push('map.tilesAttribution：启用在线底图时必须填写来源署名');
  if (input.map.terrainUrl && input.map.terrainEnabled!==false && !input.map.terrainAttribution?.trim()) issues.push('map.terrainAttribution：启用外部高程时必须填写来源署名');
  if (input.dataSource.mode === 'api' && !input.dataSource.url) issues.push('dataSource.url：API 模式必须设置接口地址');
  if (input.dataSource.refreshSeconds > 0 && input.dataSource.refreshSeconds < 5) issues.push('dataSource.refreshSeconds：填 0 停止轮询，或至少 5 秒');
  if (!isSafePath(input.dataSource.responsePath)) issues.push('dataSource.responsePath：只能使用点分隔的字段路径，不支持表达式');
  if (!Number.isFinite(Date.parse(input.meta.updatedAt))) issues.push('meta.updatedAt：必须为有效 ISO 日期时间');
  if (issues.length) throw new ConfigError(issues);
  const normalized=structuredClone(input);
  // 新增可选展示字段只补缺失值，不覆盖用户已保存的地址、视角、数据或显式关闭。
  for (const [key,rule] of Object.entries(CONFIG_SCHEMA.map)) if (normalized.map[key]===undefined && Object.hasOwn(rule,'default')) normalized.map[key]=rule.default;
  return normalized;
}

export function isSafePath(path) {
  return typeof path === 'string' && (path === '' || path.split('.').every(key => /^[A-Za-z0-9_-]+$/.test(key) && !dangerousKeys.has(key)));
}

export function getPath(object, path) {
  if (!isSafePath(path)) throw new ConfigError(['字段路径不合法']);
  if (!path) return object;
  return path.split('.').reduce((value, key) => value != null && Object.hasOwn(value, key) ? value[key] : undefined, object);
}

export function setPath(object, path, value) {
  if (!path || !isSafePath(path)) throw new ConfigError(['字段路径不合法']);
  const keys = path.split('.');
  const key = keys.pop();
  const parent = keys.reduce((node, part) => node?.[part], object);
  if (!parent || !Object.hasOwn(parent, key)) throw new ConfigError([`${path}：未知字段`]);
  parent[key] = value;
}

/** 接口允许局部更新；数组整组替换，缺失字段沿用，未知字段仍由总校验拒绝。 */
export function mergeConfig(base, patch) {
  if (!plain(patch)) throw new ConfigError(['返回数据必须为配置对象']);
  const merge = (target, source) => {
    for (const [key, value] of Object.entries(source)) {
      if (dangerousKeys.has(key)) throw new ConfigError([`${key}：禁止字段`]);
      if (plain(value) && plain(target[key])) merge(target[key], value);
      else target[key] = structuredClone(value);
    }
    return target;
  };
  return validateConfig(merge(structuredClone(base), patch));
}

export function parseConfigJson(text, base) {
  if (new TextEncoder().encode(text).length > MAX_CONFIG_BYTES) throw new ConfigError(['配置超过 4MB，请压缩图片或改用图片 URL']);
  let value;
  try { value = JSON.parse(text); } catch (error) { throw new ConfigError([`JSON 格式错误：${error.message}`]); }
  return base ? mergeConfig(base, value) : validateConfig(value);
}
