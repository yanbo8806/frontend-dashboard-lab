# GitHub 授权与发布

本地准备不会自动创建远程仓库或公开站点。请先确认公开/私有、仓库名称和用户提供地图的再分发权限。推荐仓库名 `frontend-dashboard-lab`；不要覆盖已有同名仓库。

## 发布前

```sh
npm test
npm run build
npm run verify
npm run release:check
git status --short
```

该目录应为独立 Git 仓库，只提交 `apps`、`packages`、`skills`、`docs`、`scripts`、`tests` 与项目配置；不要从上层目录执行 `git add .`。`.gitignore` 不保护已经跟踪的文件，必须核查 Git 索引。

`release:check` 扫描 Git 候选文件，报告命中的规则但不输出疑似凭据。它不能确认图片版权，也不能覆盖所有密钥形式。阅读 [素材声明](ASSETS.md) 和 [安全边界](../SECURITY.md)。

## 安全登录

使用官方 GitHub CLI：

```sh
gh auth login --hostname github.com --git-protocol https --web --scopes workflow
```

终端会显示一次性代码，打开 [GitHub 设备授权](https://github.com/login/device)，在 GitHub 页面输入代码并批准。代码会过期；过期时重新运行命令。包含 Actions 工作流需要 workflow 权限。不要在聊天里发送密码、PAT、恢复码或长期 Token。

登录后 `gh auth status` 查看身份和存储状态，不运行 `gh auth token` 打印凭据。GitHub CLI 优先系统凭据库；若提示回退明文文件，应暂停并检查存储设置。

## 提交与创建仓库

先确认 Git 作者身份。若全局配置是占位值，使用你的 GitHub 用户名和 GitHub 提供的 noreply 邮箱为本仓库设置身份，不更改全局配置。

```sh
git add README.md AGENTS.md CONTRIBUTING.md SECURITY.md package.json .gitignore .gitattributes .editorconfig .nvmrc .github apps packages skills docs scripts tests
git diff --cached --stat
git diff --cached --check
git commit -m "整理模块化前端教学项目与截图还原 Skill"
```

仓库名、可见性与素材授权确认后，在此目录使用 `gh repo create` 的 `--source=.`、`--remote=origin`、`--push` 和已确认的 `--public` 或 `--private`。先检查账户下是否有同名仓库；不复用未知远端，不强推。

推送时可以在当前 Git 命令上临时使用 GitHub CLI 的 credential helper，不必修改全局 Git 凭据配置。上传后验证远端 main 的提交 SHA 与本地 HEAD 一致，并查看 GitHub Actions 的实际结果。

## 可选 Pages

确认许可后，在 GitHub Settings → Pages 选择 GitHub Actions，然后手动运行“手动部署 GitHub Pages”。工作流不会因普通 push 自动公开站点。

Vite `base: './'` 支持仓库子路径；资源使用相对地址。Pages 不提供 Node 演示 API，默认 local 模式可工作。工作流文件通过本地语法检查，不代表远端已部署，需以 Actions 和真实站点验证为准。
