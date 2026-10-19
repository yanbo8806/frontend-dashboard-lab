# 07 · AI Skill 与可复核的视觉流程

目标：把项目经验提炼成可复用方法，区分 AI 理解、代码实现和工具测量。

## 读材料

先看 [Skill 安装与设计](../SKILLS.md)，再读 `skills/screenshot-to-web/SKILL.md`。frontmatter 决定触发范围，主体描述核心流程，references 按需提供细节，scripts 提供确定性工具。

此 Skill 把“从截图还原可编辑网页”限制得很具体，不应该在无参考图的自由设计任务中强行套用。本案例的 1871×841、青色边框与固定坐标也不是普遍规范。

## 动手

在根目录运行 `npm run test:toolkit`。打开 `out/toolkit-selftest`，观察相同图正对照、位移 6px 负对照和两次冻结截图。解释为什么不能通过放宽阈值把负对照变成通过。

构建大屏后运行 `npm run shot --prefix apps/dashboard`，得到 `out/shot.png`。先改一处标题或边距，再另存截图，用 `packages/img2code/viewer.html` 选择前后两图比较。比较过程保持相同视口、字体和冻结方式。

## 验收

给出前后图片、命令、实际量化结果与剩余差异。不能把 `100%-mismatch` 叫准确率，不能把 report 命令成功当视觉达标，也不能把整页截图贴回页面充当可编辑实现。

如果改动 toolkit，同时维护 Skill 快照，并运行 `npm run skill:check`。把案例特有数字放在案例文档中，不添加不必要的全局约束。

下一课：[测试与发布](08-release.md)。
