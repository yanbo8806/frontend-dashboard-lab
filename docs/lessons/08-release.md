# 08 · 测试、Git 与发布

目标：理解单元测试、浏览器回归、构建、依赖安全、素材授权和部署不是同一件事。

## 读代码与配置

查看根 `package.json`、`apps/dashboard/tools/verify-current.mjs`、`.github/workflows/ci.yml`。单元测试验证纯逻辑；真实浏览器覆盖交互；build 验证模块可打包；发布检查只扫 Git 将提交的文件。

## 动手

1. 运行 `npm test`、`npm run build`、`npm run verify`，阅读真实输出，不复制旧报告结论。
2. 用 `git status --short` 和 `git diff --cached --stat` 检查提交范围。
3. 运行 `npm run release:check`，确认没有 node_modules、.env、密钥、APK、本机绝对路径和未确认图片。
4. 阅读 [发布指南](../PUBLISHING.md)，在 GitHub 页面授权，使用新仓库，不覆盖已有仓库。

## 验收

换一份干净检出也能安装和构建；原项目外的图片不再是测试依赖；CI 与本地运行同样的检查。只有得到远端提交回执才说上传完成；只有真实站点返回内容才说 Pages 已上线。

Pages 不运行 Node API。保留默认 local 模式，或使用已授权、配置 CORS 的 HTTPS API；不要把 Token 写进代码或 Actions 日志。

完成后记录还没验证的内容，例如其他 GPU、生产接口、原生 Excel 和地图合规。公开源码不自动授予所有第三方素材的再分发权限。
