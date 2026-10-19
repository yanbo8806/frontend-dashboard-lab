# 安全边界

本仓库是本地前端教学演示，不宣称可直接投入生产。没有业务登录、服务端权限控制、数据库或生产 API。

- API Token 仅在页面内存，不写入 localStorage、URL、JSON、Excel 或 Git。
- 文本使用 textContent；内置 SVG 模板与外部文本分离。
- 配置拒绝原型污染、未知字段、危险 URL、异常坐标与无效引用。
- API 默认 10 秒超时、4MB 响应；取消后的旧请求不能回写。
- Excel 在 Worker 解析，有大小与 30 秒超时限制；不执行输入公式。
- 演示 Node 服务只绑定本机，API 只读；静态路径限制在 dist。

既有依赖包含安全公告，原始调查记录保留在 [依赖记录](apps/dashboard/SECURITY-NOTES.md)。本轮未未经确认升级 ECharts / MapLibre / ExcelJS 等核心依赖，不能把应用侧规避等同于修复上游漏洞。

2026-10-20 重新执行官方 npm 只读审计：4 个受影响依赖项，3 moderate、1 critical，涉及 echarts、maplibre-gl、exceljs、uuid。完整审计没有通过；这些计数按 npm 依赖项统计，不等同于四个独立漏洞根因。

可执行只读审计：`npm audit --prefix apps/dashboard --omit=dev --registry=https://registry.npmjs.org`。不要直接运行 `npm audit fix --force`；先审查影响，再在获得授权后升级并回归。

公开问题报告不要附真实 Token、业务数据、未脱敏日志或可用于攻击线上系统的细节。发布前检查 Git 索引，浏览器测试不替代生产安全审计与素材许可核查。
