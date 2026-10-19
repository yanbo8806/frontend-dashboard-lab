# 03 · 把数据变成图表

目标：理解映射、图表 option、类别轴、百分比、图例与实例生命周期。

## 读代码

`charts.js#buildTrendChart` 将 categories 交给横轴，将 series 映射成折线。`buildDonutChart` 和 `buildGenderRing` 使用同一行数据生成名称、数值和颜色。`components/chartPanels.js` 只安排图表与文字位置，并返回实例。

`app/dashboard.js#render` 重建面板前统一 `chart.dispose()`，否则反复保存会积累 Canvas 和事件监听。数据 tooltip 使用 richText，业务文本不进入 HTML tooltip。

## 动手

在数据配置的“图表与客源”增加一条趋势系列“目标值”，为每个日期提供一个非负数。先故意少填一个值，观察校验定位；补齐后保存。检查图例、线条和 tooltip 名称是否一致。

修改出游分类占比使总和成为 99，验证拒绝；再修正到 100。解释四舍五入容差与任意错误占比之间的区别。

## 验收

运行 `npm test` 和 `npm run build`。连续保存五次，检查图表数量没有增加；修改数据时线条和图例一起更新。更改图形形状必须同时说明数据语义，不能仅为了像参考图就画与数据不符的角度。

下一课：[配置与状态](04-state.md)。
