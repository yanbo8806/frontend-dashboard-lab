import { parseConfigJson, validateConfig } from '../config/schema.js';
import { readSavedConfig, saveConfig } from '../config/store.js';
import { createApiPoller } from '../config/api.js';
import { createConfigPanel } from '../config/panel.js';
import { createDashboard } from './dashboard.js';
import { fitStage } from './stage.js';

/** 默认文件 → 有效本地配置 → 内存中的 API 更新；只有用户保存才写 localStorage。 */
export async function bootstrap(stage) {
  let config, defaults, dashboard, panel, poller, token = '';
  const resize = () => dashboard?.resize();
  const dispose = () => { poller?.stop(); dashboard?.dispose(); };
  try {
    const response = await fetch('config/dashboard.json', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('默认配置 HTTP ' + response.status);
    defaults = parseConfigJson(await response.text());
    let saved;
    try { saved = readSavedConfig(localStorage, defaults); }
    catch (error) { saved = { config: defaults, warning: '本浏览器不允许本地存储：' + error.message }; }
    config = saved.config;
    dashboard = createDashboard(stage, {
      onConfigure: () => panel.open(),
      onRefresh() {
        if (config.dataSource.mode === 'api') poller.refresh();
        else dashboard.updateStatus({ state: 'local', message: '当前为本地配置；请在“导入 / API”中启用接口模式' });
      },
    });
    const apply = next => { config = next; dashboard.render(config); };
    poller = createApiPoller({
      getConfig: () => config, getToken: () => token, apply,
      onStatus: value => dashboard.updateStatus(value),
    });
    panel = createConfigPanel({
      getConfig: () => config, getDefaults: () => defaults,
      getToken: () => token, setToken: value => { token = value; },
      getMapView: () => dashboard.view(),
      onPause: () => poller.stop(), onResume: () => poller.start(),
      onApply(next) {
        // 先校验、再持久化；磁盘配额等失败不能冒充保存成功。
        const value = validateConfig(next);
        const message = saveConfig(localStorage, value);
        poller.stop();
        dashboard.updateStatus({ state: 'local', message });
        apply(value);
        return message;
      },
    });
    // 只暴露教学调试所需的配置和地图指标，不暴露 token 或写入接口。
    window.__dashboard = {
      get config() { return config; },
      get mapStats() { return dashboard.mapStats; },
      select: id => dashboard.select(id),
      view: () => dashboard.view(),
      inspectMap: () => dashboard.inspectMap(),
    };
    apply(config);
    if (saved.warning) dashboard.updateStatus({ state: 'error', message: saved.warning });
    poller.start();
    window.addEventListener('resize', resize);
    window.addEventListener('pagehide', dispose);
  } catch (error) {
    dispose();
    const message = document.createElement('div');
    message.className = 'boot-error';
    message.textContent = '页面初始化失败：' + error.message;
    stage.replaceChildren(message);
    fitStage(stage);
  }
}
