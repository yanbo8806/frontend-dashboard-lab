# 01 · 从入口走到模块边界

目标：理解 ES Modules、命名导出、闭包、依赖方向与纯函数，不用框架也能拆分应用。

## 读代码

从 `apps/dashboard/src/main.js` 进入 `app/bootstrap.js#bootstrap`。它负责异步加载、配置与 API；然后看 `app/dashboard.js#createDashboard`，它拥有图表、地图和选择状态。最后看 `components/header.js#buildHeader`：组件只接数据和回调，没有读取存储。

`shared/selectors.js` 的排序函数复制数组，不修改原值；这是可以脱离浏览器测试的逻辑。`app/stage.js#stageTransform` 同样只输入数字、返回数值对象。

## 动手

先在 `tests/modules.test.mjs` 添加“客源地占比相同时保留原顺序”的用例。输入两个相同 value 的对象，断言输出 ID 顺序以及输入仍然不变。运行根目录 `npm test`，观察测试报告。

再在 `components/kpis.js` 找到指标 ID 查找逻辑：为什么不直接使用 `config.kpis[index]`？把默认配置里四个指标交换顺序，页面仍按 K1–K4 的布局显示。

## 验收与讨论

能解释三种文件的差异：入口装配、状态协调、展示组件。新增测试覆盖真实行为，不是检查源码里有没有某个字符串。不要为了“更模块化”给每一行代码建文件，也不要让组件反向导入 bootstrap。

下一课：[DOM、CSS 与 SVG](02-dom-css.md)。
