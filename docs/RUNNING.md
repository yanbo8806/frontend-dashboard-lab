# 运行、配置与故障排查

## 安装与启动

仓库根目录 `npm run setup`，然后 `npm run dev`。Node 22.21+；当前锁定依赖支持该基线。默认 Vite 端口 5199，`strictPort: true`：端口占用会报错，不会悄悄换号。可运行 `npm run dev --prefix apps/dashboard -- --port 5201`。

生产预览：`npm run build` 后 `npm start`。演示服务默认只绑定 `127.0.0.1:5199`，实现见 `apps/dashboard/tools/server.mjs#startServer`。另一个窗口仍占端口时，在原窗口 Ctrl+C；不要随意结束其他 node 进程。

## 默认配置与保存顺序

`app/bootstrap.js#bootstrap` 先请求 `config/dashboard.json`，10 秒超时；随后 `config/store.js#readSavedConfig` 优先读取有效的 `xianyang-dashboard.config.v1`。本地 JSON 损坏时回退默认值，原记录保留。

修改服务器 JSON 不会覆盖已有浏览器配置。在“数据配置 → 导入 / API → 载入默认配置”检查后保存。API 结果只在内存，保存按钮才持久化。Token 只存当前闭包，不进入 URL、配置、Excel 或 localStorage。

## 演示 API

Vite 和 `npm start` 提供只读 `GET /api/dashboard`。编辑器可点“填入本机演示 API”，模式选 api，测试预览后保存。返回 `{"data":{...业务配置...}}`，不包含 dataSource，不能远程改接口地址。

真实接口必须满足 CORS；Bearer Token 需要服务端允许 Authorization 头。这里只消费接口，不代理绕过跨域，也没有数据库、登录系统或服务端保存功能。

| 边界 | 默认/上限 | 源码入口 |
| --- | --- | --- |
| 默认配置请求 | 10000ms | `app/bootstrap.js#bootstrap` |
| API 请求（含响应体） | 默认 10000ms，配置范围 100–60000ms | `config/api.js#fetchApiPatch`、`config/schema.js#validateConfig` |
| 轮询 | 默认 60s；0 不自动轮询；非零最少 5s | `config/api.js#createApiPoller` |
| JSON 响应 | 最大 4MB | `config/schema.js#MAX_CONFIG_BYTES` |
| Excel 文件 | 5MB；解压声明 32MB；600 个内部文件 | `config/excel.js#checkXlsxArchive` |
| Excel Worker | 30s 超时终止 | `config/panel.js#runWorker` |
| 单元测试 | 每测试进程 60s；verify 的单元步骤也为 60s | `package.json`、`tools/verify-current.mjs` |
| 单个浏览器回归脚本 | verify 外层 180s，各页面等待仍有上限 | `tools/verify-current.mjs` |

轮询不是 setInterval；前一次请求结束后才安排下一次。编辑器打开就 stop，abort 在途请求，generation 防止迟到响应回写。长操作“没有新日志”不等于无限等待，要看具体阶段上限。

## Excel 与图片

Excel 只接受约定模板的 `.xlsx`，不接受任意业务表自动猜列。缺表保留，存在的数组表整组替换；只读取公式缓存，不执行公式。`npm run template` 生成模板并回读断言配置一致。课程侧重 Worker 和数据转换，不宣称已做原生 Excel/WPS 排版验证。

本地上传允许 PNG/JPEG/WebP 并压缩；部署内置的 SVG 插图是受控文件，不意味着允许任意 SVG data URL 输入。替换照片必须有相应使用授权。

## 浏览器回归

先 build，再运行 `npm run test:browser`。完整 `npm run verify` 包含图片地图、GIS 交互、地形、页头客源地、模板回读、图像工具和 Skill。测试各自启动随机本机端口，不占开发用 5199。

`packages/img2code/src/commands/shot.mjs#launchBrowser` 依次尝试 Chrome、Edge、Playwright Chromium。无可用浏览器时，在该包运行 `npx playwright install chromium`。Linux CI 还需要浏览器系统依赖。截图跨系统字体/GPU 可能不同，因此不能把另一台机器的像素分数当作本次验证结果。

## 常见问题

- 白屏：看 DevTools Console 和 Network，确认默认 JSON 返回 200 且通过校验；检查 WebGL2。
- 数据改了没变化：检查当前 localStorage 优先级；不要直接删除所有浏览器数据。
- Pages 上 API 404：Pages 没有 Node 服务，使用默认 local 模式或自行授权的 HTTPS API。
- `npm ci` 出错：先看 Node 版本、锁文件与网络；不要直接删锁文件或 `audit fix --force`。
- 地图地形慢：运行资源都在本地，首屏需处理 DEM/WebGL；不要反复刷新启动多个实例。
