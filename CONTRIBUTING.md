# 如何贡献

建议一个 PR 只解决一个教学问题：新增行为测试、修正课程说明、改善一个模块。保持原生 JS 技术栈，不为小改动引入大型抽象。

本机：Node 22.21+，`npm run setup`，`npm test`，`npm run build`。涉及 UI/地图时还要运行对应浏览器专项。说明实际执行的命令与未验证项。

提交前：`npm run skill:check`、`npm run release:check`，审查 `git diff --cached`。不要提交个人图片、Token、环境文件、构建产物或日志。新增图片提供许可与来源；修改默认数字继续明确标注演示。

Skill 工具开发源在 `packages/img2code`，同步 `skills/screenshot-to-web/scripts/toolkit` 后验证。不把单次案例参数转成技能全局规则。许可证选择由仓库作者决定；不扩大第三方资源授权。
