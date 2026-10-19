import { parseConfigJson, validateConfig, MAX_CONFIG_BYTES } from './schema.js';
export const STORAGE_KEY = 'xianyang-dashboard.config.v1';
export const PREVIOUS_KEY = 'xianyang-dashboard.previous.v1';

export function readSavedConfig(storage, fallback) {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    return { config: text ? parseConfigJson(text) : validateConfig(fallback), warning: '' };
  } catch (error) { return { config: validateConfig(fallback), warning: `本地配置无法读取：${error.message}。已使用默认配置，原记录未删除。` }; }
}

export function saveConfig(storage, config) {
  const validated = validateConfig(config);
  const text = JSON.stringify(validated);
  if (new TextEncoder().encode(text).length > MAX_CONFIG_BYTES) throw new Error('配置超过 4MB，请使用图片 URL 或压缩图片');
  const previous = storage.getItem(STORAGE_KEY);
  // 写入失败不能宣称已保存；不主动删除用户的旧记录。
  storage.setItem(STORAGE_KEY, text);
  if (previous) { try { storage.setItem(PREVIOUS_KEY, previous); } catch { return '配置已保存，但空间不足，未保存上一版副本'; } }
  return '配置已保存到本浏览器';
}
