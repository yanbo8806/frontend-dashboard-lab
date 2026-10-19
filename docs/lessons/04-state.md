# 04 · 配置、草稿与持久化

目标：区分部署默认值、当前有效配置、编辑草稿和 localStorage；理解校验、复制与合并。

## 读代码

入口是 `config/schema.js#validateConfig`、`mergeConfig`，再读 `store.js#readSavedConfig`、`saveConfig`。`config/panel.js#createConfigPanel` 打开时深拷贝配置；`bootstrap.js` 将保存成功的结果交给渲染器。

优先级：有效 localStorage 覆盖部署默认 JSON；API 更新内存；只有明确保存才写浏览器。修改默认文件后页面未变化，先核查本地配置，不要立即怀疑浏览器缓存。

## 动手

修改标题但直接关闭编辑器，确认丢弃后页面未变；再次修改并保存，刷新后应保留。然后载入默认配置、检查并保存，完成恢复。

在 `tests/store.test.mjs` 中阅读存储空间不足用例。尝试让模拟 storage 的 setItem 抛错，断言应用不能返回“已保存”。不能只靠弹出绿色提示来证明持久化成功。

在 `tests/config.test.mjs` 给新的输入边界补测试，例如重复景点 ID、飞线指向不存在的 ID、经纬度越界。测试异常文本包含具体字段。

## 验收

`npm test` 通过；页面编辑、取消、保存、刷新、恢复五种行为符合预期。数组合并是整组替换，不按位置偷偷合并。未知字段与原型污染字段拒绝，而不是静默吞掉。

下一课：[异步与 Worker](05-async.md)。
