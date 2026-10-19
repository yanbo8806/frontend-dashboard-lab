/** 仅场景相关字段影响复用；统计值、时间戳、页头变化不重建 WebGL。 */
export function sceneKey(config) {
  return JSON.stringify([config.map, config.attractions, config.routes, config.labels.map, config.meta.city]);
}

export function canReuseScene(previousKey, nextKey, stats) {
  return Boolean(stats && previousKey === nextKey && stats.state !== 'error');
}
