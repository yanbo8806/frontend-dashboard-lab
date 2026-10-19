# 教学仓库协作约定

- 所有说明与核心流程注释使用简体中文。保留原生 JavaScript + Vite 技术栈。
- `apps/dashboard/src/app` 负责应用编排；`components` 只渲染并通过回调报告用户意图。
- `config` 负责数据契约、保存、API、表单和文件导入；`gis` 管理地图及图形资源。
- 展示坐标在 `layout.js`，默认业务数据在 `public/config/dashboard.json`，不要混写。
- 外部配置文本使用 `textContent`；只有内置可信 SVG 可以使用 HTML 字符串。
- 先补可测试的纯函数/回归用例，再实现；单元测试每进程 60 秒上限。
- 根目录 `npm run setup` 安装项目局部依赖，不要求全局安装。
- 修改后运行 `npm test`、`npm run build`；涉及交互时运行对应浏览器回归。
- 修改图像工具后同步 Skill 的 `scripts/toolkit`，运行 `npm run skill:check`。
- 不上传密钥、APK、用户导入文件、node_modules 或调试日志；发布前运行 `npm run release:check`。
- 保留素材署名。未经确认不扩大图片授权、不加入生产 API、不升级核心依赖。
- 未运行的测试必须标注未验证；不把构建通过等同于视觉或生产安全通过。
