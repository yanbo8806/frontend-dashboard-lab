// 同一组字段定义用于表单与 Excel 列，避免两套字段名逐渐漂移。
const field = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra });
export const TABLES = [
  { key: 'kpis', name: '指标', columns: [field('id', 'ID'), field('label', '名称'), field('value', '数值', 'number'), field('unit', '单位'), field('change', '同比变化(%)', 'number'), field('icon', '图标')] },
  { key: 'travel', name: '出游分析', columns: [field('name', '名称'), field('value', '占比(%)', 'number', { percent: true }), field('color', '颜色', 'color'), field('icon', '图标')] },
  { key: 'attractions', name: '景点', columns: [field('id', 'ID'), field('name', '名称'), field('district', '区域'), field('longitude', '经度', 'number'), field('latitude', '纬度', 'number'), field('rank', '排名', 'number'), field('heat', '热度', 'number'), field('image', '图片'), field('imagePosition', '图片位置'), field('imageSource', '图片来源'), field('imageCredit', '图片署名'), field('description', '简介'), field('coordinateNote', '坐标说明')] },
  { key: 'routes', name: '飞线', columns: [field('id', 'ID'), field('fromId', '起点ID'), field('toId', '终点ID'), field('value', '热度', 'number'), field('height', '弧高(米)', 'number'), field('color', '颜色', 'color'), field('enabled', '启用', 'boolean')] },
  { key: 'origins', name: '客源地', columns: [field('id', 'ID'), field('name', '名称'), field('value', '占比(%)', 'number', { percent: true }), field('image', '图片')] },
  { key: 'demographics.gender', name: '性别', columns: [field('name', '名称'), field('value', '占比(%)', 'number', { percent: true }), field('color', '颜色', 'color')] },
  { key: 'demographics.ages', name: '年龄', columns: [field('name', '名称'), field('value', '占比(%)', 'number', { percent: true })] },
];

export const SCALAR_GROUPS = [
  { name: '基础设置', fields: [
    field('meta.title', '大屏标题'), field('meta.subtitle', '统计期间'), field('meta.city', '城市名称'), field('meta.dataLabel', '数据口径标记'), field('meta.updatedAt', '数据更新时间'),
    field('labels.trend', '趋势面板标题'), field('labels.travel', '出游面板标题'), field('labels.routes', '线路面板标题'), field('labels.attractions', '景点面板标题'), field('labels.origins', '客源面板标题'), field('labels.demographics', '画像面板标题'),
    field('labels.travelCenter', '环图中心文字'), field('labels.gender', '性别标签'), field('labels.age', '年龄标签'), field('labels.heat', '热度标签'), field('labels.trendUnit', '趋势单位'), field('labels.map', '地图标题'), field('trend.yMax', '趋势轴上限（0 自动）', 'number'),
  ] },
  { name: '地图设置', fields: [
    field('map.center.0', '中心经度', 'number'), field('map.center.1', '中心纬度', 'number'), field('map.zoom', '默认缩放', 'number'), field('map.pitch', '俯仰角', 'number'), field('map.bearing', '方位角', 'number'), field('map.focusZoom', '景点聚焦缩放', 'number'),
    field('map.pointCrs', '景点坐标系', 'select', { values: ['WGS84', 'GCJ02', 'BD09'] }), field('map.boundaryCrs', '边界坐标系', 'select', { values: ['WGS84', 'GCJ02', 'BD09'] }),
    field('map.boundaryUrl', '行政区 GeoJSON'), field('map.boundaryAttribution', '边界来源署名'), field('map.extrusionHeight', '无 DEM 时区域厚度（米）', 'number'),
    field('map.hub.name', '汇聚点名称'), field('map.hub.longitude', '汇聚点经度', 'number'), field('map.hub.latitude', '汇聚点纬度', 'number'),
    field('map.animate', '动态飞线', 'boolean'), field('map.flightWidth', '飞线亮芯宽度（像素）', 'number'), field('map.showDistricts', '显示行政区名称', 'boolean'), field('map.showLabels', '显示景点名称', 'boolean'),
    field('map.tilesUrl', '影像 / 晕渲 XYZ URL（可留空）'), field('map.tilesAttribution', '底图来源署名'), field('map.terrainEnabled', '启用真实地形与晕渲', 'boolean'), field('map.terrainUrl', 'DEM XYZ URL（空用内置咸阳地形）'), field('map.terrainAttribution', '外部 DEM 来源署名'), field('map.terrainEncoding', '外部 DEM 编码', 'select', { values: ['mapbox', 'terrarium'] }), field('map.terrainExaggeration', '地形高度倍率', 'number'),
  ] },
  { name: 'API设置', fields: [
    field('dataSource.mode', '运行模式', 'select', { values: ['local', 'api'] }), field('dataSource.url', 'GET 接口 URL'), field('dataSource.responsePath', '响应对象路径（空为根）'),
    field('dataSource.refreshSeconds', '自动刷新秒数（0 关闭）', 'number'), field('dataSource.timeoutMs', '请求超时（毫秒）', 'number'),
  ] },
];
