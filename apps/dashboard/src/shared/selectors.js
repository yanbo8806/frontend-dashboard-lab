// 派生数据使用副本排序；不把界面排序写回用户配置。
export const rankedAttractions = rows => [...rows].sort((a, b) => a.rank - b.rank);
export const rankedOrigins = rows => [...rows].sort((a, b) => b.value - a.value);
export const enabledRoutes = rows => rows.filter(row => row.enabled).sort((a, b) => b.value - a.value);
export const routePointName = (config, id) => id === 'hub'
  ? config.map.hub.name
  : config.attractions.find(point => point.id === id)?.name || id;
