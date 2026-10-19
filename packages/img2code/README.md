# img2code：本地视觉验证工具

Node.js 20+，`npm ci` 安装 pngjs、pixelmatch、Playwright。不是自动网页生成器，不包含模型 API，也不需要上传图片。

```sh
node bin/img2code.mjs --help
node bin/img2code.mjs selftest --work-dir out/selftest
node bin/img2code.mjs measure input.png --profile generic --out out/measure.json
node bin/img2code.mjs shot --url http://127.0.0.1:5199 --width 1871 --height 841 --out out/current.png
node bin/img2code.mjs diff reference.png out/current.png --out-dir out/diff
node bin/img2code.mjs inspect reference.png out/current.png --region 40,80,400,240 --out-dir out/detail
node bin/img2code.mjs report out/diff/diff-report.json --out-dir out/diff
```

`viewer.html` 可直接选择两张本地图片对照，也接受 `?ref=路径&actual=路径`。内置示例使用本工具生成的合成图片，不依赖仓库外的旧大屏。

| 命令 | 能力与边界 |
| --- | --- |
| normalize | 转 PNG，保留尺寸，记录源和输出哈希 |
| measure / probe | 配色、几何线索；generic 不是语义识别 |
| slice | 按整数矩形裁切，记录哈希和恒等性 |
| shot | 固定视口、等待资源、冻结钩子、重复截图与浏览器错误记录 |
| diff / inspect | 像素差异、MAE、SSIM、分区报告与局部叠加 |
| report | 生成报告，退出 0 不代表视觉达标 |
| selftest | 相同图通过、位移负对照失败、冻结截图一致 |

`--profile dashboard` / `--structure dashboard` 是特定青色三栏大屏检测器，不适用于任意网页。默认阈值是工具默认值，不是质量承诺；不为通过而修改阈值。`mismatch` 不是“还原准确率”。

工具默认导航 30 秒、资源等待另有 30 秒、networkidle 最多 5 秒、settle 300ms；并非整条命令 30 秒。失败退出码 1，参数/运行错误通常为 2。

工具维护源是本目录；可安装 Skill 中的 `scripts/toolkit` 是发行快照。改动后保持两者运行时文件一致，根目录 `npm run skill:check` 检查漂移。完整说明见 [Skill 工具参考](../../skills/screenshot-to-web/references/toolkit.md)。
