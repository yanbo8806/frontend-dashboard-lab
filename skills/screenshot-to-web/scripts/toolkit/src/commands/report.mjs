// `img2code report` - turn a diff report JSON into human-facing Markdown + HTML.
import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson, ensureDir } from '../lib/png.mjs';

function pct(v) {
  return v === null || v === undefined ? 'n/a' : `${v}`;
}

export function renderMarkdown(report, { title = 'img2code fidelity report' } = {}) {
  const lines = [];
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`- generated: ${report.generatedAt ?? 'n/a'}`);
  lines.push(`- reference: \`${report.reference.path}\` (sha256 ${report.reference.sha256.slice(0, 16)}…)`);
  lines.push(`- actual: \`${report.actual.path}\` (sha256 ${report.actual.sha256.slice(0, 16)}…)`);
  lines.push(`- canvas: ${report.canvas.width}×${report.canvas.height}`);
  lines.push(`- pixelmatch threshold: ${report.thresholds.pixelmatchThreshold} (includeAA=false)`);
  lines.push('');
  lines.push(`## Verdict: ${report.verdict.ok ? 'PASS' : 'FAIL'}`);
  lines.push('');
  if (!report.verdict.ok) for (const f of report.verdict.failures) lines.push(`- ❌ ${f}`);
  lines.push('');
  lines.push('| scope | pixels | mismatch | mismatch % | MAE | SSIM | thresholds |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  const row = (name, s, rules) => {
    if (!s) return;
    lines.push(`| ${name} | ${s.pixels} | ${s.mismatch} | ${pct(s.mismatchPct)} | ${pct(s.mae)} | ${pct(s.ssim)} | ${rules} |`);
  };
  row('global', report.global, `≤${report.thresholds.maxMismatchPct}% / MAE ≤${report.thresholds.maxMae} / SSIM ≥${report.thresholds.minSsim}`);
  row('code-drawn', report.code, `≤${report.thresholds.codeMaxMismatchPct}% / MAE ≤${report.thresholds.codeMaxMae} / SSIM ≥${report.thresholds.codeMinSsim}`);
  row('texture (bitmap crops)', report.texture, 'informational');
  lines.push('');
  if (report.structure?.checked) {
    lines.push(`## Structure (panel alignment)`);
    lines.push('');
    lines.push(`- panels compared: ${report.structure.panelsCompared} (reference ${report.structure.refPanels}, render ${report.structure.actualPanels})`);
    lines.push(`- max |delta|: ${report.structure.maxDelta}px (tolerance ${report.structure.tolerancePx}px) → ${report.structure.ok ? 'OK' : 'MISALIGNED'}`);
    lines.push('');
    lines.push('| panel | ref x,y,w,h | render x,y,w,h | Δx | Δy | Δw | Δh | ok |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const r of report.structure.rows ?? []) {
      lines.push(`| ${r.id} | ${r.ref.x},${r.ref.y},${r.ref.w},${r.ref.h} | ${r.actual.x},${r.actual.y},${r.actual.w},${r.actual.h} | ${r.delta.x} | ${r.delta.y} | ${r.delta.w} | ${r.delta.h} | ${r.ok ? '✅' : '❌'} |`);
    }
    lines.push('');
  }
  if (report.regions?.length) {
    lines.push('## Regions (worst first)');
    lines.push('');
    lines.push('| region | kind | rect | mismatch % | MAE | SSIM |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const r of [...report.regions].sort((a, b) => b.mismatchPct - a.mismatchPct)) {
      lines.push(`| ${r.name} | ${r.kind} | ${r.rect.x},${r.rect.y},${r.rect.w},${r.rect.h} | ${r.mismatchPct} | ${r.mae} | ${r.ssim} |`);
    }
    lines.push('');
  }
  lines.push('## Residual difference clusters');
  lines.push('');
  lines.push('| # | bbox | pixels | % of code | mean absolute difference | classification |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  (report.residuals ?? []).forEach((c, i) => {
    lines.push(`| ${i + 1} | ${c.x},${c.y} ${c.w}×${c.h} | ${c.pixels} | ${c.shareOfCode == null ? 'n/a' : (c.shareOfCode * 100).toFixed(3)} | ${c.meanAbsDiff} | ${c.classification} |`);
  });
  lines.push('');
  if (report.heatmap) lines.push(`Heatmap: \`${path.basename(report.heatmap)}\` · side by side: \`${path.basename(report.sideBySide ?? '')}\``);
  lines.push('');
  return lines.join('\n');
}

export function renderHtml(report, markdown, { title = 'img2code fidelity report' } = {}) {
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const table = (rows, headers) => `<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
  const rowsRegions = [...(report.regions ?? [])].sort((a, b) => b.mismatchPct - a.mismatchPct)
    .map((r) => `<tr><td>${esc(r.name)}</td><td>${r.kind}</td><td>${r.rect.x},${r.rect.y},${r.rect.w},${r.rect.h}</td><td>${r.mismatchPct}</td><td>${r.mae}</td><td>${r.ssim}</td></tr>`).join('');
  const rowsClusters = (report.residuals ?? [])
    .map((c, i) => `<tr><td>${i + 1}</td><td>${c.x},${c.y} ${c.w}×${c.h}</td><td>${c.pixels}</td><td>${c.shareOfCode == null ? 'n/a' : (c.shareOfCode * 100).toFixed(3)}</td><td>${c.meanAbsDiff}</td><td>${esc(c.classification)}</td></tr>`).join('');
  const rowsStructure = (report.structure?.rows ?? [])
    .map((r) => `<tr><td>${r.id}</td><td>${r.ref.x},${r.ref.y},${r.ref.w},${r.ref.h}</td><td>${r.actual.x},${r.actual.y},${r.actual.w},${r.actual.h}</td><td>${r.delta.x}</td><td>${r.delta.y}</td><td>${r.delta.w}</td><td>${r.delta.h}</td><td>${r.ok ? '✅' : '❌'}</td></tr>`).join('');
  const heat = report.heatmap ? path.basename(report.heatmap) : null;
  const sbs = report.sideBySide ? path.basename(report.sideBySide) : null;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
body{background:#070b12;color:#dbe9ff;font:13px/1.5 "Segoe UI","Microsoft YaHei",sans-serif;margin:0;padding:24px}
h1{font-size:20px;margin:0 0 12px;color:#8fd8ff}h2{font-size:15px;margin:22px 0 8px;color:#ffd54a}
table{border-collapse:collapse;margin:8px 0 16px;font-size:12px}th,td{border:1px solid #1d3350;padding:3px 8px;text-align:left}
th{background:#0d1420;color:#9fc4ff}.pass{color:#4ee08a}.fail{color:#ff6b6b}
img{max-width:100%;border:1px solid #1d3350;margin:6px 0}
code{background:#0d1420;padding:1px 4px;border-radius:3px}
</style></head><body>
<h1>${esc(title)}</h1>
<p><span class="${report.verdict.ok ? 'pass' : 'fail'}">${report.verdict.ok ? 'PASS' : 'FAIL'}</span>
 · canvas ${report.canvas.width}×${report.canvas.height}
 · global mismatch ${report.global.mismatchPct}% · MAE ${report.global.mae} · SSIM ${report.global.ssim}
 ${report.code ? `· code mismatch ${report.code.mismatchPct}% · MAE ${report.code.mae} · SSIM ${report.code.ssim}` : ''}</p>
${report.verdict.failures.length ? `<ul>${report.verdict.failures.map((f) => `<li class="fail">${esc(f)}</li>`).join('')}</ul>` : ''}
<h2>Structure</h2>
${report.structure?.checked ? table(rowsStructure, ['panel', 'ref', 'render', 'Δx', 'Δy', 'Δw', 'Δh', 'ok']) : '<p>not checked</p>'}
<h2>Regions</h2>
${table(rowsRegions, ['region', 'kind', 'rect', 'mismatch %', 'MAE', 'SSIM'])}
<h2>Residual clusters</h2>
${table(rowsClusters, ['#', 'bbox', 'pixels', '% of code', 'mean |Δ|', 'classification'])}
<h2>Artifacts</h2>
${heat ? `<p>heatmap <code>${esc(heat)}</code></p><img src="${esc(heat)}" alt="heatmap">` : ''}
${sbs ? `<p>side by side (left reference / right render) <code>${esc(sbs)}</code></p><img src="${esc(sbs)}" alt="side by side">` : ''}
<details><summary>raw markdown</summary><pre>${esc(markdown.slice(0, 6000))}</pre></details>
</body></html>`;
}

export function runReport(args, { out = console.log } = {}) {
  const reportPath = args.positional[0] ?? args.flags.json;
  if (!reportPath) throw new Error('report requires a diff report JSON path');
  const report = readJson(reportPath);
  const md = renderMarkdown(report, { title: args.flags.title ?? 'img2code fidelity report' });
  const outDir = args.flags.outDir ?? path.dirname(path.resolve(reportPath));
  ensureDir(outDir);
  const mdPath = path.join(outDir, 'fidelity-report.md');
  const htmlPath = path.join(outDir, 'fidelity-report.html');
  fs.writeFileSync(mdPath, md, 'utf8');
  fs.writeFileSync(htmlPath, renderHtml(report, md, { title: args.flags.title ?? 'img2code fidelity report' }), 'utf8');
  writeJson(path.join(outDir, 'fidelity-report.json'), report);
  out(`markdown: ${mdPath}`);
  out(`html:     ${htmlPath}`);
  out(`verdict:  ${report.verdict.ok ? 'PASS' : `FAIL (${report.verdict.failures.join('; ')})`}`);
  // Reporting is not a gate: the diff command owns the pass/fail exit code.
  return { code: 0, passed: report.verdict.ok, markdownPath: mdPath, htmlPath };
}
