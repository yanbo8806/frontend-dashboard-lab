import { MAP_RECT } from '../layout.js';
import { frameDefsSVG } from '../frame.js';
import { box } from '../shared/dom.js';
import { buildHeader } from '../components/header.js';
import { buildKpis } from '../components/kpis.js';
import { buildTrend, buildTravel, buildDemographics } from '../components/chartPanels.js';
import { buildRoutes } from '../components/routes.js';
import { buildAttractions } from '../components/attractions.js';
import { buildOrigins } from '../components/origins.js';
import { buildPoiDetail } from '../components/poiDetail.js';
import { createMapPresentation } from '../gis/presentation.js';
import { fitStage } from './stage.js';
import { sceneKey, canReuseScene } from './scene.js';

/** 页面协调器只拥有渲染资源和选择状态，数据加载与持久化由 bootstrap 负责。 */
export function createDashboard(stage, { onConfigure, onRefresh }) {
  let config, map, statusNode, detailsNode, selectedId = null;
  let mapConfigKey = '', charts = [];
  let dataStatus = { state: 'local', message: '本地配置' };

  function updateStatus(value) {
    dataStatus = value;
    if (!statusNode) return;
    statusNode.textContent = value.message;
    statusNode.dataset.state = value.state;
    statusNode.title = value.message;
  }

  function closeSelection() {
    detailsNode?.remove();
    detailsNode = null;
    selectedId = null;
    map?.select(null, { fly: false });
    stage.querySelectorAll('[data-attraction]').forEach(node => node.classList.remove('selected'));
  }

  function select(id, fly = true) {
    const point = config.attractions.find(item => item.id === id);
    if (!point) return;
    selectedId = id;
    map?.select(id, { fly });
    stage.querySelectorAll('[data-attraction]').forEach(node => {
      node.classList.toggle('selected', node.dataset.attraction === id);
    });
    detailsNode?.remove();
    detailsNode = buildPoiDetail(stage, point, config.labels.heat, closeSelection);
  }

  function render(nextConfig) {
    config = nextConfig;
    document.title = config.meta.title;
    const nextKey = sceneKey(config);
    // 复用已有 DOM + WebGL 实例，防止统计轮询打断正在加载的地图。
    const retainedMap = canReuseScene(mapConfigKey, nextKey, map?.stats)
      ? stage.querySelector('.gis-map') : null;
    if (!retainedMap) map?.dispose();
    charts.forEach(chart => chart.dispose());
    charts = [];
    detailsNode = null;
    stage.replaceChildren();
    stage.insertAdjacentHTML('afterbegin', frameDefsSVG());
    statusNode = buildHeader(stage, config, { onConfigure, onRefresh });
    updateStatus(dataStatus);
    buildKpis(stage, config);
    if (retainedMap) stage.append(retainedMap);
    else {
      const container = box(stage, 'div', { ...MAP_RECT, cls: 'gis-map' });
      map = createMapPresentation(container, config, { onSelect: id => select(id) });
      mapConfigKey = nextKey;
    }
    charts.push(buildTrend(stage, config), buildTravel(stage, config));
    buildRoutes(stage, config, id => select(id));
    buildAttractions(stage, config, id => select(id));
    buildOrigins(stage, config);
    charts.push(...buildDemographics(stage, config));
    fitStage(stage);
    if (selectedId && config.attractions.some(point => point.id === selectedId)) select(selectedId, false);
    else selectedId = null;
  }

  return {
    render, select, updateStatus,
    get mapStats() { return map?.stats; },
    view: () => map?.view(),
    inspectMap: () => map?.inspect(),
    resize() { fitStage(stage); map?.resize(); },
    dispose() { map?.dispose(); charts.forEach(chart => chart.dispose()); charts = []; },
  };
}
