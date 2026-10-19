# 验证记录 · 2026-10-20

本记录区分实际执行的验证与等待外部条件的步骤。不将旧项目报告当作教学版结果。

## 已执行

- Node.js 22.21.1，Windows，本机 Chrome，`npm run setup` 独立目录安装成功。
- 54 项应用单元测试通过，覆盖配置、API、Excel、存储、地形、图片地图、模拟交通以及新增模块边界。
- 4 项仓库测试通过，覆盖发布过滤、凭据检测、Skill 快照一致性和默认素材存在性。
- `npm run build` 通过，生成生产文件；没有依赖上层原项目的 node_modules。
- 图片场景 13 项、GIS 交互 12 项、地形 6 项、页头/客源地 9 项真实浏览器检查通过。
- Excel 模板生成并回读配置一致通过；不等于原生 Excel/WPS 排版已验收。
- 图像工具 T1 相同图通过，T2 位移 6px 正确失败，T3 两次冻结截图逐字节一致。
- 开发工具与独立 Skill 两个 viewer 的合成示例和四种对照模式均实际运行通过。
- `skill-creator/scripts/quick_validate.py` 验证技能元数据有效；工具快照逐字节一致检查通过。
- GitHub Actions 两份 YAML 本地解析通过；不是 GitHub 远端执行结果。
- 完整 `npm run verify` 在主目录与 Git 索引导出的全新目录分别执行成功，退出码均为 0。干净目录从官方 npm 源重新安装，不含原开发目录的依赖或旧截图。
- 发布检查通过：299 个候选文件，约 22.8MB；46 个本地 Markdown 链接全部有效；`git diff --cached --check` 无空白错误。

## 修复的迁移问题

- 原入口文件混合渲染、API 和保存，拆为 app / components / shared，并补纯函数测试。
- 原图片测试引用仓库外用户原图，改成校验事先记录的 SHA256。
- 地形测试读取旧 `out/terrain-upgrade/before.png`，干净运行失败；现由同视角关闭地形现场生成负对照，原纹理梯度断言保持不变。
- 浏览器工具的旧同级相对路径改成仓库内 `packages/img2code` 路径。
- Skill viewer 的示例不再依赖旧项目截图，改为本地合成且新增真实浏览器检查。
- 第三方未确认照片未带入；教学版使用 5 张自绘 SVG 供 10 个展示位置使用。

## 结果位置

完整测试生成 `apps/dashboard/out/app/full-verification.json`；专项结果分别在 `out/image-map`、`out/app`、`out/terrain-upgrade`、`out/header-origins-fix`（相对应用目录）。工具结果在仓库根 `out/toolkit-selftest` 与 `out/viewer`。

生成文件不提交 Git。README 使用的 `docs/images/dashboard.png` 来自本次图片场景 1871×841 实测截图。

## 尚未通过 / 尚未验证

- npm 官方审计仍有 4 个依赖项公告（3 moderate、1 critical），未升级核心依赖，不宣称安全审计通过。
- GitHub 用户登录、远端建仓、push 与 Actions 尚需真实回执；Pages 尚未部署。
- 用户地图公开再分发权限、最终代码许可证由作者确认。
- 生产 API、第三方带密钥地图、其他操作系统/GPU 与原生 Excel/WPS 尚未验证。
- OpenAI Skills 官方在线文档返回 403，仅记录本地验证与使用说明。
