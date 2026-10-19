# 模块与数据流

模块化不是把每个函数单独放文件。这里按“谁拥有状态、谁处理副作用、谁只负责展示”分边界，保留清晰的直接函数调用，不引入事件总线或全局框架。

```text
main.js
  └─ app/bootstrap.js       获取默认值、选择本地配置、连接编辑器与轮询
       ├─ config/          校验 / 草稿 / localStorage / API / Worker
       └─ app/dashboard.js 渲染资源、当前选中景点、地图生命周期
            ├─ components/  页面组件：配置输入 + 事件回调
            ├─ charts.js    ECharts 实例与 option
            └─ gis/         图片/GIS 切换、WebGL、飞线与模拟路况
```

## 状态由谁负责

| 状态 | 所有者 | 更新与释放 |
| --- | --- | --- |
| 当前有效配置、默认配置 | `app/bootstrap.js#bootstrap` | API/保存成功后交给 `apply` |
| 尚未保存的草稿 | `config/panel.js#createConfigPanel` | 打开时深拷贝；总校验成功才 `onApply` |
| Token | `bootstrap` 闭包 | 仅当前页面内存；不暴露给调试对象 |
| 定时器、进行中的请求 | `config/api.js#createApiPoller` | stop 清定时器、abort 请求、递增 generation |
| 图表/地图实例、selectedId | `app/dashboard.js#createDashboard` | 重绘 dispose 图表，按 sceneKey 复用地图 |
| 地图切换的过期加载 | `gis/presentation.js#createMapPresentation` | epoch 拦截旧加载，dispose 释放资源 |

## 两条更新链

用户编辑：`打开面板 → 暂停轮询 → 修改草稿 → validateConfig → saveConfig → render → 关闭面板并恢复轮询`。保存失败会留在面板显示错误，不冒充成功。

API：`fetchApiPatch → 路径提取 → mergeConfig → validateConfig → apply → render`。对象按字段合并，数组整组替换；不自动写 localStorage。

`app/scene.js#sceneKey` 只包含 map、attractions、routes、地图标题和城市。数字/更新时间变化复用加载中的地图；地图错误、景点或相机配置变化则重建。纯函数测试和浏览器“保存复用场景”用例共同验证这个约定。

## 组件边界

`buildHeader(stage, config, {onConfigure, onRefresh})` 不读取 localStorage，不创建轮询；`buildAttractions(stage, config, onSelect)` 只报告景点 ID。应用层把卡片、线路与地图的 ID 关联起来。

`shared/selectors.js` 是无 DOM 的派生数据函数，先复制再排序；`shared/dom.js#box` 用 `textContent` 处理业务文本，`html` 仅用于仓库内静态 SVG。

图表组件返回 ECharts 实例，应用层负责 dispose。固定舞台内部几何不随浏览器尺寸变化，窗口 resize 只整体缩放和通知地图；这不是普通内容网站的响应式策略。

## 为什么不直接换框架

本教材重点是浏览器基础、模块职责与真实数据流。迁移 React/Vue 可以作为扩展作业，但不是本次整理的一部分。地图/图表等有生命周期的对象，即使使用框架也仍然要显式清理。
