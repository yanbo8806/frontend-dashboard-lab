# 本地工具与命令

将 SKILL_DIR 替换成当前 SKILL.md 所在目录；CLI 是 scripts/toolkit/bin/img2code.mjs。使用系统可用的 Node.js 20+。

## 依赖

在 scripts/toolkit 中运行 npm ci（Windows 可用 npm.cmd ci）。只安装本目录锁定的三个依赖，不全局安装。已有 Chrome/Edge 可直接渲染，无需下载浏览器；没有可用浏览器时报告实际缺项，再按任务授权安装项目局部浏览器。命令默认按当前目录解释输出路径。

## 初始化图片与测量

~~~text
node SKILL_DIR/scripts/toolkit/bin/img2code.mjs normalize input.jpg --out reference/ref.png --json reference/source.json
node SKILL_DIR/scripts/toolkit/bin/img2code.mjs measure reference/ref.png --profile generic --out reference/measure.json
node SKILL_DIR/scripts/toolkit/bin/img2code.mjs probe reference/ref.png --region 40,80,400,240 --mask white --out out/probe.json
~~~

normalize 保留像素尺寸，分别记录源/输出哈希；JPEG 转 PNG 后哈希不会相同。PNG 格式的参考可直接使用。

generic 只测尺寸与配色，不做语义识别。dashboard 检测器仅适用于本项目同类青色切角三栏大屏，内部存在固定 KPI 搜索范围；不能对任意网页调用它并称为通用测量。probe 提供连通域和逐行/列墨迹范围，颜色掩码只是线索。

## 裁切素材

~~~json
{
  "assets": [
    { "name": "photo-1", "role": "page", "group": "photo", "x": 40, "y": 120, "w": 320, "h": 200 }
  ]
}
~~~

~~~text
node SKILL_DIR/scripts/toolkit/bin/img2code.mjs slice reference/ref.png --spec reference/assets.json --out-dir assets --manifest assets/manifest.json
~~~

坐标必须是图片范围内的整数；源图位置优先显式位置参数，其次 spec.source（相对 spec 文件）。manifest 记录哈希、角色和裁切恒等性。裁切与源图一致，不等于“页面缩放与叠加后仍一致”。qa-reference 素材仅用于诊断。

## 渲染与比对

按项目自己的命令构建，失败就停止，不能使用过期 dist。

~~~text
node SKILL_DIR/scripts/toolkit/bin/img2code.mjs shot --serve-dir dist --width 1440 --height 900 --out out/current/shot.png --repeat 2 --json out/current/shot.json
node SKILL_DIR/scripts/toolkit/bin/img2code.mjs diff reference/ref.png out/current/shot.png --regions reference/regions.json --config reference/thresholds.json --out-dir out/current
node SKILL_DIR/scripts/toolkit/bin/img2code.mjs inspect reference/ref.png out/current/shot.png --region 40,80,400,240 --scale 2 --out-dir out/current/detail
node SKILL_DIR/scripts/toolkit/bin/img2code.mjs report out/current/diff-report.json --out-dir out/current
~~~

将宽高改成实际参考尺寸。开发服务可用 --url http://127.0.0.1:PORT；--ready CSS_SELECTOR 等待具体元素。页面导航超时默认 30000ms，资源等待另有同长度上限，networkidle 最多 5000ms，稳定等待默认 300ms；这些是阶段上限，不是整个命令的总上限。后台调用应由外层设置合理的总超时（项目验证单步骤 60s）。系统浏览器启动失败会继续尝试下个可用渠道。

冻结模式固定 Date/Math.random、暂停 CSS 动画，并调用页面冻结钩子；不承诺能冻结任意自定义脚本、外部动态数据或所有定时器。--repeat 2 的哈希一致才证明本次输出稳定。--no-freeze 用于实时效果。shot 汇总每次运行的 console/page/request 错误。

## 分区与阈值

~~~json
{
  "regions": [
    { "name": "viewport", "kind": "code", "x": 0, "y": 0, "w": 1440, "h": 900 },
    { "name": "approved-photo", "kind": "texture", "x": 40, "y": 120, "w": 320, "h": 200 }
  ]
}
~~~

texture 在重叠区优先排除代码计分，但仍计入全局。区域应在迭代前确认；重要文字不要跟照片一起任意排除。当前分区是矩形，复杂遮罩应明确其限制。

默认阈值：pixelmatch 0.15（忽略部分抗锯齿）；全局 mismatch ≤8%、MAE ≤10、SSIM ≥0.93；代码区 ≤6%、≤10、≥0.92。它们是工具默认值，不是所有图片都承诺达到的标准。有既有验收阈值就沿用。全局指标只有在尺寸、区域、参数与渲染环境一致时才可比较。

默认不运行结构检测，报告会写未检查。仅同类大屏使用 --structure dashboard；请求的结构检查失败或缺少面板会导致失败，不能静默跳过。

退出码：0 表示当前命令成功，diff 为达标；1 为指标/检查未通过；2 为参数、资源或执行错误。report 只是报告生成，退出 0 不代表视觉通过。

## 交互复核

直接打开 scripts/toolkit/viewer.html，选择本地参考图与网页截图；支持并排、叠加、滑杆、差异、闪烁、平移缩放与像素 RGB 读取。也可用 serve 启动合适的公共父目录，通过 ?ref=相对图片路径&actual=相对截图路径 载入。

首次验证工具或修改评分器时，可对受支持大屏运行 selftest --ref ... --target K4 --regions ... --config ... --work-dir out/selftest；相同图通过、位移负对照失败、冻结截图一致三项必须成立。selftest 的默认合成图是大屏专用样例，不代表任意网页的检测能力。
