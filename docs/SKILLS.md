# Skill 安装与设计

本仓库发布的技能名称为 `screenshot-to-web`，目录名与 frontmatter name 一致。内容包括 `SKILL.md`、`agents/openai.yaml`、按需参考资料和可独立运行的 `scripts/toolkit`。

## 在本机安装

把 `skills/screenshot-to-web` 整个目录复制到你的 Codex 个人技能目录，例如 `.codex/skills/screenshot-to-web`，或当前 Codex 配置的技能目录。已有同名技能时先比较/备份，不直接覆盖。安装后在工具目录运行：

```sh
cd <技能目录>/screenshot-to-web/scripts/toolkit
npm ci
node bin/img2code.mjs --help
node bin/img2code.mjs selftest --work-dir out/selftest
```

需要 Node 20+；运行整个教学仓库用 Node 22.21+。截图使用系统 Chrome/Edge 或本目录安装的 Playwright Chromium。开始新的 Codex 会话，确认技能已被识别后调用：

```text
使用 $screenshot-to-web，按参考截图实现真实 DOM/CSS 页面，并给出同尺寸截图、局部对比和剩余差异。
```

本说明依据当前本地 Skill 文件与可执行工具。2026-10-20 查询 [OpenAI 官方 Skills 文档](https://developers.openai.com/codex/skills/) 返回 HTTP 403，未在线核验其他 Codex 版本的目录发现行为；以你的客户端显示的技能设置为准。

## 学习它的组织方式

| 文件 | 为什么存在 |
| --- | --- |
| SKILL.md | 触发范围、核心方法、边界与资料路由 |
| agents/openai.yaml | 显示名称、简短介绍、默认调用提示 |
| references/toolkit.md | 安装、命令、默认超时、分区与指标 |
| references/diagnostics.md | 字体、重复文字、坐标、评分器等具体诊断 |
| references/dashboard-case.md | 历史案例，不把单张图的坐标当全局规范 |
| scripts/toolkit | 不依赖当前仓库路径的本地执行工具 |

`packages/img2code` 是开发源，Skill 的 toolkit 是可分发快照。保留快照是为了允许用户只安装技能；根目录 `npm run skill:check` 检查内容一致，避免两个版本悄悄分叉。工具示例本身生成合成图，不需要私有原截图。

## 维护原则

描述要准确、简短，不让所有前端任务都触发；参考图优先，技能不擅自改技术栈和视觉构图。实用工具负责测量，模型负责理解，不声称 PNG 比较可以自动判断可编辑性。

根据 skill-creator 原则，本次仅修正可移植性、名称/目录一致性和历史证据边界，没有把本案例数字写成通用要求。修改脚本后运行测试；`quick_validate.py` 仅证明元数据结构合法，不能证明技能在所有任务中表现正确。
