// `img2code selftest` - proves the measurement pipeline has teeth:
//  T1 identical images must PASS
//  T2 a panel shifted by 6px must FAIL under the very same thresholds
//  T3 two `shot` captures of an animated page must be byte-identical
//  T4 (with --ref) the same negative control on a real screenshot
//
// Without --ref a synthetic reference with the same frame layout is generated,
// so the selftest is self-contained.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readPng, writePng, emptyImage, ensureDir, writeJson, readJson, toHex } from '../lib/png.mjs';
import { measureReference } from './measure.mjs';
import { compareImages, shiftRegion, DEFAULT_THRESHOLDS } from './diff.mjs';
import { capture } from './shot.mjs';
import { startStaticServer } from '../lib/serve.mjs';

function fillRect(img, x, y, w, h, rgb) {
  for (let yy = y; yy < y + h; yy++) {
    if (yy < 0 || yy >= img.height) continue;
    for (let xx = x; xx < x + w; xx++) {
      if (xx < 0 || xx >= img.width) continue;
      const p = (yy * img.width + xx) * 4;
      img.data[p] = rgb[0]; img.data[p + 1] = rgb[1]; img.data[p + 2] = rgb[2]; img.data[p + 3] = 255;
    }
  }
}

/** Synthetic screenshot with the same skeleton as the reference dashboard. */
export function syntheticReference(W = 1871, H = 841) {
  const img = emptyImage(W, H);
  const BG = [4, 19, 45];
  const PANEL = [2, 33, 66];
  const FRAME = [0, 190, 240];
  const CYAN = [0, 229, 255];
  const WHITE = [232, 244, 255];
  const YELLOW = [255, 213, 74];
  const RED = [220, 42, 32];
  fillRect(img, 0, 0, W, H, BG);
  const frame = (x, y, w, h, color = FRAME) => {
    fillRect(img, x, y, w, h, PANEL);
    fillRect(img, x, y, w, 2, color);
    fillRect(img, x, y + h - 2, w, 2, color);
    fillRect(img, x, y, 2, h, color);
    fillRect(img, x + w - 2, y, 2, h, color);
  };
  // header band
  fillRect(img, 0, 0, W, 74, [2, 12, 32]);
  fillRect(img, 0, 72, W, 2, FRAME);
  fillRect(img, 578, 27, 11, 30, RED);
  fillRect(img, 1284, 27, 9, 30, RED);
  fillRect(img, 700, 26, 460, 22, WHITE);
  // columns
  const cols = [[16, 473], [473, 1399], [1399, 1857]];
  for (const [x0, x1] of cols) frame(x0, 74, x1 - x0 + 1, 832 - 74);
  frame(16, 74, 473 - 16, 335 - 74);
  frame(16, 346, 473 - 16, 597 - 346);
  frame(16, 606, 473 - 16, 832 - 606);
  frame(1399, 74, 1857 - 1399, 381 - 74);
  frame(1399, 381, 1857 - 1399, 606 - 381);
  frame(1399, 606, 1857 - 1399, 832 - 606);
  // KPI cards
  for (const [x0, x1] of [[504, 711], [726, 931], [945, 1146], [1161, 1366]]) frame(x0, 81, x1 - x0 + 1, 164 - 81, [0, 160, 220]);
  fillRect(img, 0, 832, W, 2, FRAME);
  // content: deterministic "charts" and "text" so a shift is detectable
  for (const [x0, x1, y0, y1] of [[40, 450, 100, 320], [40, 450, 380, 580], [40, 450, 630, 820], [1420, 1840, 100, 360], [1420, 1840, 400, 590], [1420, 1840, 630, 820]]) {
    for (let y = y0; y < y1; y += 24) fillRect(img, x0, y, x1 - x0, 1, [18, 70, 120]);
    for (let x = x0; x < x1; x += 12) fillRect(img, x, y0 + 40 + ((x * 7) % 60), 6, 6, CYAN);
    fillRect(img, x0 + 10, y0 + 6, 90, 10, WHITE);
    fillRect(img, x0 + 130, y0 + 6, 40, 10, YELLOW);
    fillRect(img, x0 + 10, y0 + 30, 120, 4, CYAN);
  }
  for (let i = 0; i < 4; i++) {
    const y = 96 + i * 18;
    fillRect(img, 482 + i * 2, y, 12, 12, CYAN);
    fillRect(img, 524 + i * 40, y + 3, 24, 8, WHITE);
  }
  return img;
}

function readRegionSpec(regionsPath) {
  if (!regionsPath) return [];
  const spec = readJson(regionsPath);
  return spec?.regions ?? spec ?? [];
}

async function determinismPage(workDir) {
  const dir = path.join(workDir, 'detpage');
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><style>
  @keyframes slide { from { transform: translateX(0); } to { transform: translateX(120px); } }
  #cssbox { position:absolute; left:20px; top:20px; width:40px; height:40px; background:#00e5ff; animation: slide 3s linear infinite; }
  body { margin:0; background:#001028; }
  </style></head><body>
  <div id="cssbox"></div>
  <canvas id="cv" width="300" height="200" style="position:absolute;left:0;top:120px"></canvas>
  <script>
  const ctx = document.getElementById('cv').getContext('2d');
  let t = 0;
  function draw() {
    ctx.fillStyle = '#001028'; ctx.fillRect(0, 0, 300, 200);
    ctx.fillStyle = '#ffd54a'; ctx.fillRect(10 + (t % 100), 20, 30, 30);
  }
  function loop() { t += 1; draw(); if (!window.__img2codeFrozen) requestAnimationFrame(loop); }
  loop();
  window.__rafTicks = () => t;
  </script></body></html>`);
  return startStaticServer(dir);
}

export async function runSelftest(args, { out = console.log } = {}) {
  const workDir = path.resolve(args.flags.workDir ?? path.join(os.tmpdir(), 'img2code-selftest'));
  ensureDir(workDir);
  const thresholds = args.flags.config ? readJson(args.flags.config) : {};
  const regions = readRegionSpec(args.flags.regions);
  const tests = [];
  const art = (name) => path.join(workDir, name);

  // ---- synthetic (or real) base image -------------------------------
  let basePath = args.flags.ref ?? null;
  let baseLabel = 'real reference';
  if (basePath) {
    basePath = path.resolve(basePath);
    if (!fs.existsSync(basePath)) throw new Error(`--ref not found: ${basePath}`);
  } else {
    basePath = art('synthetic-ref.png');
    writePng(basePath, syntheticReference());
    baseLabel = 'synthetic reference';
  }
  out(`selftest base: ${baseLabel} (${basePath})`);

  // ---- resolve the negative-control target --------------------------
  let targetRect = null;
  let targetLabel = null;
  if (args.flags.targetRect) {
    const [x, y, w, h] = String(args.flags.targetRect).split(',').map(Number);
    targetRect = { x, y, w, h };
    targetLabel = `rect ${args.flags.targetRect}`;
  } else {
    const wantId = args.flags.target ?? 'K4';
    try {
      const m = measureReference(basePath);
      const named = regions.find((r) => r.name === wantId);
      const panel = m.panels.find((p) => p.id === wantId);
      if (named) {
        targetRect = { x: named.x, y: named.y, w: named.w, h: named.h };
        targetLabel = `region ${wantId}`;
      } else if (panel) {
        targetRect = { x: panel.x, y: panel.y, w: panel.w, h: panel.h };
        targetLabel = `panel ${wantId}`;
      }
    } catch { /* fall through to first region */ }
    if (!targetRect && regions.length) {
      const r = regions[0];
      targetRect = { x: r.x, y: r.y, w: r.w, h: r.h };
      targetLabel = `region ${r.name ?? 0}`;
    }
  }
  if (!targetRect) throw new Error('could not resolve a negative-control target rectangle');

  const dx = Number(args.flags.dx ?? 6);
  const dy = Number(args.flags.dy ?? 0);

  // T1 - identical images pass
  const t1 = compareImages(basePath, basePath, { regions, thresholds, detectStructure: true });
  tests.push({
    name: 'T1 identical images PASS',
    ok: t1.verdict.ok && t1.global.mismatch === 0 && t1.global.mae === 0,
    detail: `mismatch ${t1.global.mismatchPct}% MAE ${t1.global.mae} SSIM ${t1.global.ssim} structureOk=${t1.structure.ok}`,
  });

  // T2 - 6px shift must FAIL
  const base = readPng(basePath);
  const shifted = shiftRegion(base, targetRect, dx, dy);
  const shiftedPath = art('shifted.png');
  writePng(shiftedPath, shifted);
  const t2 = compareImages(basePath, shiftedPath, { regions, thresholds, detectStructure: true });
  tests.push({
    name: `T2 ${targetLabel} shifted by ${dx},${dy}px must FAIL`,
    ok: !t2.verdict.ok,
    detail: t2.verdict.ok
      ? 'diff wrongly reported PASS'
      : `FAIL as expected: global ${t2.global.mismatchPct}% / code ${t2.code ? `${t2.code.mismatchPct}%` : 'n/a'} / structure maxΔ ${t2.structure.maxDelta ?? 'n/a'}px :: ${t2.verdict.failures.join('; ')}`,
  });

  // T3 - shot determinism on an animated page
  const server = await determinismPage(workDir);
  try {
    const shotA = await capture({ url: `${server.url}index.html`, width: 320, height: 320, settleMs: 200 });
    const shotB = await capture({ url: `${server.url}index.html`, width: 320, height: 320, settleMs: 200 });
    const same = shotA.buffer.equals(shotB.buffer);
    fs.writeFileSync(art('det-a.png'), shotA.buffer);
    fs.writeFileSync(art('det-b.png'), shotB.buffer);
    tests.push({
      name: 'T3 shot determinism (2 runs byte-identical)',
      ok: same,
      detail: `${shotA.buffer.length} bytes vs ${shotB.buffer.length} bytes, channel=${shotA.channel}`,
    });
  } finally {
    await server.close();
  }

  const passed = tests.every((t) => t.ok);
  const report = {
    tool: 'img2code selftest',
    base: basePath,
    target: { label: targetLabel, rect: targetRect, dx, dy },
    thresholds: { ...DEFAULT_THRESHOLDS, ...thresholds },
    tests,
    passed,
    workDir,
  };
  writeJson(art('selftest.json'), report);
  out('');
  for (const t of tests) out(`${t.ok ? 'PASS' : 'FAIL'}  ${t.name}\n      ${t.detail}`);
  out('');
  out(`selftest: ${passed ? 'PASS' : 'FAIL'}  (artifacts in ${workDir})`);
  return { code: passed ? 0 : 1, report };
}
