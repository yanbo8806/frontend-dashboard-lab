// `img2code measure` - detect canvas size, column frames, panels, KPI cards,
// header band, palette and border-glow profiles from a reference screenshot.
import {
  MASKS, makeMask, findHorizontalLines, findVerticalLines, medianColor, topColors, bboxOfMask, clusteredBlocks,
} from '../lib/detect.mjs';
import { readPng, sha256File, readJson, writeJson, toHex } from '../lib/png.mjs';

const VERTICAL_LINE_FRAC = 0.75;
const KPI_BAND = { y0: 78, y1: 170, x0: 480, x1: 1390 };

// 此检测器只适用于青色切角大屏。边框亮度不同，先找较暗横线，再检查两端斜角；
// 不能把相邻两条亮线直接当成面板上下边，否则会漏掉暗边并把分隔线误判成边框。
function panelEdges(img, band) {
  const x0 = band.x0 + 20, x1 = band.x1 - 20;
  const edge = (r, g, b) => r < 120 && g > 48 && b > 90 && b - r > 55;
  const candidates = findHorizontalLines(img, { x0, x1, y0: 55, y1: img.height - 2, frac: .85, pred: edge });
  const sample = (x, y) => {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return 0;
    const p = (y * img.width + x) * 4;
    return edge(img.data[p], img.data[p + 1], img.data[p + 2]) ? 1 : 0;
  };
  const score = (y, direction) => {
    let n = 0;
    for (let d = 2; d <= 6; d++) for (const x of [band.x0 + 8 - d, band.x1 - 8 + d]) {
      let hit = 0;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        hit = Math.max(hit, sample(x + dx, y + direction * d + dy));
      }
      n += hit;
    }
    return n;
  };
  const edges = [];
  for (const line of candidates) {
    if (line.thickness > 5) continue;
    let best = null;
    for (let y = line.start; y <= line.end; y++) {
      const down = score(y, 1), up = score(y, -1);
      const strength = Math.max(up, down);
      if (strength >= 7 && Math.abs(down - up) >= 3 && (!best || strength > best.strength)) {
        best = { y, type: down > up ? 'top' : 'bottom', strength };
      }
    }
    // 合成直角样例也可按竖边朝向识别，保持工具自检的覆盖范围。
    if (!best) {
      const y = Math.round((line.start + line.end) / 2);
      const side = direction => [band.x0, band.x1].reduce((sum, x) => sum + [3, 5, 7].reduce((s, d) =>
        s + Math.max(sample(x - 1, y + direction * d), sample(x, y + direction * d), sample(x + 1, y + direction * d)), 0), 0);
      const down = side(1), up = side(-1);
      if (Math.max(down, up) >= 5 && Math.abs(down - up) >= 4) best = { y, type: down > up ? 'top' : 'bottom', strength: Math.max(down, up) };
    }
    // 真正边框会延伸到切角两端；只在面板中央发光的横线不属于外框。
    if (best && sample(band.x0 + 12, best.y) && sample(band.x1 - 12, best.y)) edges.push(best);
  }
  return edges;
}

function profileRows(img, y, x0, x1, span = 6) {
  const out = [];
  for (let yy = Math.max(0, y - span); yy <= Math.min(img.height - 1, y + span); yy++) {
    let r = 0; let g = 0; let b = 0; let n = 0;
    for (let x = x0; x <= x1; x++) {
      const i = (yy * img.width + x) * 4;
      r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++;
    }
    out.push({ y: yy, dy: yy - y, rgb: [Math.round(r / n), Math.round(g / n), Math.round(b / n)], hex: toHex([r / n, g / n, b / n]) });
  }
  return out;
}

function profileCols(img, x, y0, y1, span = 6) {
  const out = [];
  for (let xx = Math.max(0, x - span); xx <= Math.min(img.width - 1, x + span); xx++) {
    let r = 0; let g = 0; let b = 0; let n = 0;
    for (let y = y0; y <= y1; y++) {
      const i = (y * img.width + xx) * 4;
      r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++;
    }
    out.push({ x: xx, dx: xx - x, rgb: [Math.round(r / n), Math.round(g / n), Math.round(b / n)], hex: toHex([r / n, g / n, b / n]) });
  }
  return out;
}

function detectKpiCards(img) {
  const lines = findVerticalLines(img, {
    x0: KPI_BAND.x0, x1: KPI_BAND.x1, y0: KPI_BAND.y0, y1: KPI_BAND.y1, frac: 0.6,
  });
  const edges = lines.filter((l) => l.thickness <= 3).map((l) => l.start).sort((a, b) => a - b);
  // Pair consecutive edges across a card interior (a wide gap). The ~15px gaps
  // between neighbouring cards and stray icon edges never qualify.
  const pairs = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    if (edges[i + 1] - edges[i] >= 120) pairs.push([edges[i], edges[i + 1]]);
  }
  const cards = [];
  for (const [x0, x1] of pairs) {
    const rows = findHorizontalLines(img, { x0: x0 + 8, x1: x1 - 8, y0: 70, y1: 175, frac: 0.5 });
    if (rows.length < 2) continue;
    const top = rows[0].start;
    const bottom = rows[rows.length - 1].end;
    if (bottom - top < 40) continue;
    cards.push({ x: x0, y: top, w: x1 - x0 + 1, h: bottom - top + 1, topLine: rows[0], bottomLine: rows[rows.length - 1] });
  }
  return cards;
}

export function measureReference(imagePath, { tolerance = 2, expectPath = null, profile = 'dashboard' } = {}) {
  const img = readPng(imagePath);
  const W = img.width;
  const H = img.height;
  if (!['generic', 'dashboard'].includes(profile)) throw new Error('measure profile must be generic or dashboard');
  if (profile === 'generic') {
    // 通用图片只报告真实可观测信息；没有语义模型时不编造面板、标题或 KPI。
    const measure = { tool: 'img2code measure', profile,
      image: { path: imagePath, width: W, height: H, sha256: sha256File(imagePath) },
      canvas: { width: W, height: H }, panels: [],
      palette: { topColors: topColors(img, { x: 0, y: 0, w: W, h: H }, 12, 3) },
      anchors: { canvas: [W, H] },
      note: 'Generic measurement: inspect the image and define regions manually; dashboard geometry is not inferred.',
    };
    if (expectPath) {
      const expected = readJson(expectPath);
      measure.anchorChecks = Object.entries(expected).map(([name, wanted]) => ({ name, wanted,
        measured: measure.anchors[name] ?? null,
        ok: name === 'canvas' && Array.isArray(wanted) && wanted.length === 2 && wanted[0] === W && wanted[1] === H }));
      measure.anchorChecksPassed = measure.anchorChecks.every(c => c.ok);
    }
    return measure;
  }

  const verticals = findVerticalLines(img, { x0: 0, x1: W - 1, y0: 80, y1: Math.min(H - 10, 830), frac: VERTICAL_LINE_FRAC })
    .filter((l) => l.thickness <= 4);
  const frameXs = verticals.map((v) => (v.start + v.end) / 2).map((v) => Math.round(v));
  if (frameXs.length < 4) {
    throw new Error(`expected at least 4 column frame lines, found ${frameXs.length}: ${frameXs.join(',')}`);
  }
  const frames = {
    left: { x0: frameXs[0], x1: frameXs[1] },
    center: { x0: frameXs[1], x1: frameXs[2] },
    right: { x0: frameXs[2], x1: frameXs[3] },
  };

  const panels = [];
  for (const [column, band] of Object.entries(frames)) {
    const edges = panelEdges(img, band);
    for (let i = 0; i < edges.length; i++) {
      if (edges[i].type !== 'top') continue;
      const next = edges[i + 1];
      if (!next || next.type !== 'bottom') continue;
      const top = edges[i].y;
      const bottom = next.y;
      if (bottom - top < 60) continue;
      panels.push({
        id: `${column[0].toUpperCase()}${panels.filter((p) => p.column === column).length + 1}`,
        column,
        x: band.x0, y: top, w: band.x1 - band.x0 + 1, h: bottom - top + 1,
      });
    }
  }

  const kpiCards = detectKpiCards(img);
  for (const [i, card] of kpiCards.entries()) {
    panels.push({ id: `K${i + 1}`, column: 'kpi', kind: 'kpi', x: card.x, y: card.y, w: card.w, h: card.h });
  }

  const headerBottom = panels.find((p) => p.column === 'left')?.y ?? 74;
  const bottom = Math.max(...panels.map((p) => p.y + p.h - 1));

  // header band content
  const whiteMask = makeMask(img, MASKS.white, { x: 0, y: 0, w: W, h: headerBottom });
  const titleBbox = bboxOfMask(whiteMask, W, H, { x: 0, y: 0, w: W, h: headerBottom });
  const redMask = makeMask(img, MASKS.red, { x: 0, y: 0, w: W, h: headerBottom + 16 });
  const redClusters = clusteredBlocks(redMask, W, H, { block: 4, minPixels: 6 })
    .filter((c) => c.y < headerBottom + 16)
    .slice(0, 12)
    .map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h, pixels: c.pixels }));

  // palette
  const bgProbe = medianColor(img, { x: 2, y: 2, w: 10, h: 200 });
  const panelRects = panels.filter((p) => p.column === 'left');
  const panelFill = panelRects.length ? medianColor(img, {
    x: panelRects[0].x + 10, y: panelRects[0].y + 4, w: panelRects[0].w - 24, h: 6,
  }) : medianColor(img, { x: 20, y: 20, w: 6, h: 6 });
  const frameLine = findHorizontalLines(img, { x0: 24, x1: 400, y0: headerBottom - 4, y1: headerBottom + 4, frac: 0.9 })[0];
  const borderProfile = frameLine ? profileRows(img, frameLine.start, 60, 400, 7) : [];
  const borderCore = borderProfile.reduce((best, p) => (p.rgb[2] > (best?.rgb[2] ?? -1) ? p : best), null);
  const top = topColors(img, { x: 0, y: 0, w: W, h: H }, 12, 3);

  const measure = {
    tool: 'img2code measure',
    profile,
    image: { path: imagePath, width: W, height: H, sha256: sha256File(imagePath) },
    canvas: { width: W, height: H },
    frames,
    frameLines: verticals.map((v) => ({ x0: v.start, x1: v.end, y0: v.y0, y1: v.y1 })),
    header: {
      band: { x: 0, y: 0, w: W, h: headerBottom + 1 },
      bottomLine: headerBottom,
      titleBbox,
      redMarks: redClusters,
    },
    panels,
    kpiCards: kpiCards.map((c, i) => ({ id: `K${i + 1}`, x: c.x, y: c.y, w: c.w, h: c.h })),
    anchors: {
      canvas: [W, H],
      leftFrame: [frames.left.x0, frames.left.x1],
      rightFrame: [frames.right.x0, frames.right.x1],
      headerBandBottom: headerBottom,
      bottomLine: bottom,
    },
    palette: {
      pageBackground: { rgb: bgProbe, hex: toHex(bgProbe) },
      panelFill: { rgb: panelFill, hex: toHex(panelFill) },
      borderCore: borderCore ? { rgb: borderCore.rgb, hex: borderCore.hex, y: borderCore.y } : null,
      topColors: top.map((c) => ({ hex: toHex(c.rgb), share: c.share })),
    },
    borderProfile: borderProfile.map((p) => ({ dy: p.dy, hex: p.hex })),
    sideProfile: frameXs.length ? profileCols(img, frames.left.x0, 200, 320, 6).map((p) => ({ dx: p.dx, hex: p.hex })) : [],
  };

  if (expectPath) {
    const expect = readJson(expectPath);
    const checks = [];
    const cmp = (name, actual, wanted) => {
      const actualArr = Array.isArray(actual) ? actual : [actual];
      const wantedArr = Array.isArray(wanted) ? wanted : [wanted];
      const delta = actualArr.map((v, i) => +(v - wantedArr[i]).toFixed(1));
      const ok = delta.every((d) => Math.abs(d) <= tolerance);
      checks.push({ name, wanted: wantedArr, measured: actualArr, delta, tolerance, ok });
    };
    for (const [name, wanted] of Object.entries(expect)) {
      if (name === 'panelCountMin') {
        const ok = panels.length >= wanted;
        checks.push({ name, wanted, measured: panels.length, delta: [], tolerance, ok });
        continue;
      }
      const actual = name.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), measure.anchors);
      if (actual === undefined) {
        checks.push({ name, wanted, measured: null, delta: [], tolerance, ok: false, error: 'anchor not found' });
        continue;
      }
      cmp(name, actual, wanted);
    }
    measure.anchorChecks = checks;
    measure.anchorChecksPassed = checks.every((c) => c.ok);
  }

  return measure;
}

export function runMeasure(args, { out = console.log } = {}) {
  const imagePath = args.positional[0];
  if (!imagePath) throw new Error('measure requires a reference image path');
  const tolerance = args.flags.tolerance !== undefined ? Number(args.flags.tolerance) : 2;
  const expectPath = args.flags.expect ?? null;
  const measure = measureReference(imagePath, { tolerance, expectPath, profile: args.flags.profile ?? 'generic' });
  if (args.flags.out) writeJson(args.flags.out, measure);
  if (!args.flags.quiet) {
    out(`canvas: ${measure.canvas.width}x${measure.canvas.height}`);
    if (measure.frames) out(`frames: left ${measure.frames.left.x0}..${measure.frames.left.x1} | center ${measure.frames.center.x0}..${measure.frames.center.x1} | right ${measure.frames.right.x0}..${measure.frames.right.x1}`);
    out(`panels (${measure.panels.length}):`);
    for (const p of measure.panels) out(`  ${p.id.padEnd(4)} ${String(p.x).padStart(4)},${String(p.y).padStart(3)} ${String(p.w).padStart(4)}x${String(p.h).padStart(3)}  ${p.column}`);
    if (measure.palette.pageBackground) out(`palette: bg ${measure.palette.pageBackground.hex}  panel ${measure.palette.panelFill.hex}  border ${measure.palette.borderCore?.hex ?? 'n/a'}`);
    if (measure.note) out(measure.note);
    out(`anchors: ${JSON.stringify(measure.anchors)}`);
    if (measure.anchorChecks) {
      for (const c of measure.anchorChecks) {
        out(`  [${c.ok ? 'PASS' : 'FAIL'}] ${c.name} wanted=${JSON.stringify(c.wanted)} measured=${JSON.stringify(c.measured)}`);
      }
      out(`anchor checks: ${measure.anchorChecksPassed ? 'PASS' : 'FAIL'}`);
    }
    if (args.flags.out) out(`report: ${args.flags.out}`);
  }
  const failed = measure.anchorChecksPassed === false;
  return { code: failed ? 1 : 0, measure };
}
