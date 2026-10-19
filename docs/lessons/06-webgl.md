# 06 · 地图、坐标与资源生命周期

目标：理解图形实例、异步加载、坐标系统、动画暂停与资源复用。GIS 可作为选修。

## 读代码

从 `gis/presentation.js#createMapPresentation` 看两种模式的动态加载，再看 `app/scene.js#sceneKey`。图片场景由前景地图、背景、光点和标签构成，是艺术示意，不是两张图自动重建真实 DEM。

真实 GIS 使用 `coordinates.js` 做 WGS84 / GCJ02 / BD09 入口转换；MapLibre 管相机和地形，Three.js 绘制飞线。`terrain.js` 解码 DEM，彩色晕渲图不是高程文件。

## 动手

平移或缩放地图后只改一个 KPI 并保存：相机不应复位，WebGL 场景继续复用。随后改景点名称或地图设置，解释为何 sceneKey 必须变化。

来回切换图片和 GIS 模式，检查隐藏模式没有继续创建画布。观察 `presentation.js` 的 epoch 与 dispose：它们和上一课请求 generation 的问题有什么共同点？

`trafficModel.js` 的路况是可重现模拟。修改速度边界后必须同步文字和颜色，并扩展 `tests/traffic.test.mjs`；不要把模拟时钟标成真实采集时间。

## 验收

运行图片地图、GIS 和地形专项。缩放、拖动、暂停、景点联动可用；减少动画设置有效；加载失败显示错误。UI 不会把图片示意视角写回真实经纬度。WebGL/GPU 环境需要实际运行，不能只用构建成功代替。

下一课：[Skill 与视觉验证](07-skills.md)。
