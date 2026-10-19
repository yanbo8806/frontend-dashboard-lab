# 05 · fetch、取消、轮询与 Worker

目标：理解 Promise、AbortController、串行定时器、竞态与主线程边界。

## 读代码

`config/api.js#fetchApiPatch` 给请求和响应体设置超时，限制 JSON 体积，验证响应路径，finally 清定时器。`createApiPoller` 在上一轮结束后才安排下一次，不使用可能重叠的 setInterval。

stop 不仅 abort，还递增 generation。即使自定义 fetcher 没有遵守 abort，迟到结果也会被 epoch 检查拦住。编辑器打开即暂停自动同步，避免 API 把正在编辑的内容改掉。

## 动手

先读 `tests/api.test.mjs` 的迟到响应用例，为 HTTP 503 增加断言：错误应可见，当前有效配置不变。模拟网络请求不要访问真实生产 API。

页面中开启本机演示 API，然后打开配置面板，观察自动同步停止；关闭后恢复。令 URL 指向不存在的路径，验证保留上次数据。

选修：下载 Excel 模板，修改一个百分比再导入。读 `excel.worker.js` 的消息入口和 `panel.js#runWorker` 的 30 秒终止逻辑，解释解析放到 Worker 的原因。

## 验收

单元测试证明超时、取消、错误路径、旧响应不能覆盖；浏览器 GIS E2E 验证真实 API 预览、Token 不持久化与 Worker 导入。默认 API 10 秒、轮询 60 秒是配置值，测试外层 180 秒是另一层边界，不要混为一谈。

下一课：[WebGL 与生命周期](06-webgl.md)。
