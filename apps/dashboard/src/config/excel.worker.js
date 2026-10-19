import { importWorkbook, exportWorkbook } from './excel.js';
// 解压和工作簿解析放进独立 Worker；主线程可超时终止，界面持续响应。
self.onmessage = async ({ data }) => {
  try {
    const result = data.action === 'import' ? await importWorkbook(data.buffer, data.config) : await exportWorkbook(data.config);
    self.postMessage({ ok: true, result });
  } catch (error) { self.postMessage({ ok: false, message: error.message }); }
};
