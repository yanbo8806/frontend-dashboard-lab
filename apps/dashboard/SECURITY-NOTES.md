# 安全审计记录（2026-10-18）

本轮运行了 npm audit --omit=dev --registry=https://registry.npmjs.org --json。配置的 npm 镜像不提供审计接口，因此只读查询切换到 npm 官方接口，没有修改全局 registry。审计仍未通过，不适合据此宣称可直接生产发布。

| 依赖 | 公告 | 本项目实际调用与处置 |
| --- | --- | --- |
| ECharts 5.6.0（既有核心依赖） | GHSA-fgmj-fm8m-jvvx，中等，Lines 系列默认 HTML tooltip XSS | 项目只注册 Line/Pie/Bar，不注册 Lines；所有 tooltip 使用 renderMode: richText。未擅自升级到 6.1.0，需确认后回归视觉与图表。 |
| MapLibre GL 5.24.0 | GHSA-jrc7-96c5-q579，严重，HTML attribution sanitize 绕过 | 禁用 attributionControl，不传任何用户 HTML 到 MapLibre；署名在 src/gis/map.js 使用 textContent。恶意署名浏览器回归不生成 details 节点、不执行事件。建议确认后升级至 >=6.4.1 并回归相机/自定义层。 |
| ExcelJS 4.4.0 → uuid 8.x | GHSA-w5hq-g745-h8pq，中等，v3/v5/v6 接收外部缓冲区时缺少边界检查 | ExcelJS 在 cf-rule-ext-xform 中只用 v4() 且不传缓冲区；输入不传入这些 uuid API。升级/覆盖依赖仍需兼容性验证，不用不相关的大版本降级解决审计提示。 |

fflate 未被应用使用，已从 package.json 和 lockfile 中取消依赖，不作为本轮打包内容。未执行 npm audit fix --force，没有变更既有 ECharts 核心版本。

## 应用层防护

- 配置、JSON、API、Excel 统一校验，禁止未知字段与 __proto__/constructor/prototype。数组整组替换，不按不稳定位置合并。
- 所有外部名称、标题、简介、署名都用 textContent；innerHTML 仅用于本项目内置 SVG 装饰。
- URL 只允许 http(s)/相对路径；禁止协议相对地址、凭据 URL、脚本、SVG/HTML data URL。图片上传只接受 PNG/JPEG/WebP 并重采样。
- Token 只在会话内存；不存储、不导出、不记录。接口响应不得重写 dataSource。
- API 响应最多 4MB、默认 10 秒；停止时取消在途请求，并用 generation 拦截过期回写。
- Excel 先校验 ZIP 元数据大小，再在 Worker 解析；30 秒超时后终止 Worker。模板不生成宏，不执行输入公式。
- 演示 HTTP 服务只监听 127.0.0.1，只读 GET API；静态路径限制于 dist，拒绝目录穿越。

这些措施降低本应用已有触发面的风险，不等于修复所有上游包问题。若开放给不可信用户导入或正式对外发布，请先确认升级安全修复版本，并完成额外的依赖、鉴权、CORS 与发布安全检查。
