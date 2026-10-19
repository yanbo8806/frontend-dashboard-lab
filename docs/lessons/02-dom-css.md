# 02 · DOM、CSS、SVG 与固定舞台

目标：理解盒模型、绝对定位、父子坐标、图片裁切、文字安全与视口缩放。

## 读代码

`layout.js` 只保存几何；`components/panel.js#panelShell` 创建 panel 与独立边框；`shared/dom.js#box` 设置样式与文本。数据来自配置，装饰来自 `frame.js`、`headerChrome.js` 与 `titleRule.js`。

`stageTransform(width, height)` 使用 `min(width/1871, height/841)` 整体缩放和居中。面板位置不会因为浏览器缩小而重排。这适合固定运营大屏，不等同于普通网站的响应式布局。

客源图片、圆框、名次是独立 DOM。`object-fit: cover` 保持图像比例，`overflow: hidden` 和圆角裁切图片，名次放在裁切容器外，避免下沿被切掉。

## 动手

给 `components/kpis.js` 的负增长指标加一个可辨识样式，保留文字中的负号；不要只用红绿区分。修改配置一项 change 为 -2，确认文字、颜色和布局一致。

在编辑器标题里输入 `<img src=x onerror=alert(1)>`。观察它以文字显示，而不是执行。解释为什么 `textContent` 比把用户文本拼到 innerHTML 安全；仓库自带的静态 SVG 与外部输入是两种信任边界。

## 验收

构建后运行 `npm run test:header-origins --prefix apps/dashboard`。在 DevTools 切换 1871×841、1366×768、390×844，检查标题不重叠、圆框四角不露图。改图不是通过扩大验收误差来“修复”测试。

下一课：[数据驱动图表](03-charts.md)。
