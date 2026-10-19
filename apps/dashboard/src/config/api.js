import { ConfigError, MAX_CONFIG_BYTES, getPath, isSafeUrl, isSafePath, mergeConfig } from './schema.js';

/** 超时覆盖响应头与响应体；失败不修改配置，取消后禁止过期响应回写。 */
export async function fetchApiPatch(settings, { token = '', signal, fetcher = fetch } = {}) {
  if (!settings.url || !isSafeUrl(settings.url) || !isSafePath(settings.responsePath)) throw new ConfigError(['API 地址或响应路径不合法']);
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error(`接口超过 ${settings.timeoutMs}ms 未完成`)), settings.timeoutMs);
  try {
    const headers = { Accept: 'application/json' };
    // Token 仅保留在当前内存，绝不进入 URL、localStorage 或导出的配置。
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetcher(settings.url, { method: 'GET', headers, credentials: 'omit', cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`接口返回 HTTP ${response.status}`);
    if (Number(response.headers.get('content-length')) > MAX_CONFIG_BYTES) throw new Error('接口响应超过 4MB');
    const reader = response.body?.getReader();
    let text = '';
    if (reader) {
      const decoder = new TextDecoder(); let bytes = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_CONFIG_BYTES) { await reader.cancel(); throw new Error('接口响应超过 4MB'); }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
    } else {
      text = await response.text();
      if (new TextEncoder().encode(text).length > MAX_CONFIG_BYTES) throw new Error('接口响应超过 4MB');
    }
    controller.signal.throwIfAborted();
    let payload;
    try { payload = JSON.parse(text); } catch { throw new Error('接口未返回有效 JSON；请检查 URL 是否落到了 HTML 页面'); }
    const patch = getPath(payload, settings.responsePath);
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error(`响应路径 ${settings.responsePath || '(根对象)'} 不是配置对象`);
    if (Object.keys(patch).length === 0) throw new Error('接口配置对象为空');
    if (Object.hasOwn(patch, 'dataSource')) throw new Error('远程数据不得修改 dataSource，请在本地配置接口设置');
    return patch;
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason instanceof Error ? controller.signal.reason : new Error('接口请求已取消');
    if (error instanceof TypeError) throw new Error('接口连接失败：检查网络、HTTPS 和服务端 CORS；当前数据已保留');
    throw error;
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}

/** 采用串行定时器：前一次请求结束后再安排下一次，不产生重叠轮询。 */
export function createApiPoller({ getConfig, getToken, apply, onStatus, fetcher }) {
  let timer, active, generation = 0, stopped = true;
  async function tick(epoch) {
    if (stopped || epoch !== generation) return;
    active = new AbortController();
    const settings = structuredClone(getConfig().dataSource);
    onStatus({ state: 'loading', message: '正在同步 API…' });
    try {
      const patch = await fetchApiPatch(settings, { token: getToken(), signal: active.signal, fetcher });
      if (stopped || epoch !== generation) return;
      const config = mergeConfig(getConfig(), patch);
      apply(config);
      onStatus({ state: 'success', message: `API 已同步 · ${new Date().toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}` });
    } catch (error) {
      if (!stopped && epoch === generation) onStatus({ state: 'error', message: `${error.message}；保留上次有效数据` });
    } finally {
      if (!stopped && epoch === generation && settings.refreshSeconds > 0) timer = setTimeout(() => tick(epoch), settings.refreshSeconds * 1000);
    }
  }
  return {
    start() { this.stop(); if (getConfig().dataSource.mode !== 'api') return; stopped = false; void tick(generation); },
    stop() { stopped = true; generation++; clearTimeout(timer); active?.abort(); },
    refresh() { this.start(); },
  };
}
