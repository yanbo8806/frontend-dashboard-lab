# 大屏应用

原生 ESM + Vite + ECharts + Three.js + MapLibre GL。此目录可独立 `npm ci`、`npm run dev`、`npm run build`；浏览器回归依赖同仓库的 `packages/img2code`，建议在仓库根运行 `npm run setup`。

- 首次读代码：[main.js](src/main.js) → [bootstrap](src/app/bootstrap.js) → [dashboard](src/app/dashboard.js)。
- 改业务数字：[dashboard.json](public/config/dashboard.json)，不要写进布局坐标。
- 改布局：[layout.js](src/layout.js)、[style.css](src/style.css)、[dashboard.css](src/dashboard.css)。
- 改某个面板：[components](src/components)。
- 数据配置/API/Excel：[config](src/config)。
- 地图、飞线与交通模拟：[gis](src/gis)。

启动后点右上角“数据配置”。默认图片立体场景，地图中的切换按钮或 `?map=gis` 使用真实地形 GIS。运行、保存优先级、默认超时和 API 契约见 [运行指南](../../docs/RUNNING.md)；课程见 [课程地图](../../docs/COURSE.md)。

生成目录 `dist`、`out`、`outputs` 不提交。不要双击构建后的 HTML；用 `npm start` 或静态服务器访问。历史截图评分不用于验收当前新内容。
