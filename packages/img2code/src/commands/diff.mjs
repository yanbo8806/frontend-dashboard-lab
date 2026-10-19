// `img2code diff` - pixel comparison of a render against a reference with
// global/code/texture metrics, structural (layout) checks, residual clusters,
// a heatmap image and a machine-readable report.
import path from 'node:path';
import {
  readPng, writePng, crop, sha256File, readJson, writeJson, ensureDir, emptyImage,
} from '../lib/png.mjs';
import {
  mismatchMask, maeOverMask, toGray, ssimMap, meanOverMask, classMap, maskFromClass, renderHeatmap, classifyCluster,
} from '../lib/metrics.mjs';
import { clusteredBlocks } from '../lib/detect.mjs';
import { measureReference } from './measure.mjs';
import { parseRegion } from './inspect.mjs';

export const DEFAULT_THRESHOLDS = {
  pixelmatchThreshold: 0.15,
  maxMismatchPct: 8,
  maxMae: 10,
  minSsim: 0.93,
  codeMaxMismatchPct: 6,
  codeMaxMae: 10,
  codeMinSsim: 0.92,
  structureTolerancePx: 2,
};

function rectOf(region) {
  return { x: region.x, y: region.y, w: region.w, h: region.h };
}

/** Shift a rectangle of pixels inside an image (used for negative controls). */
export function shiftRegion(img, rect, dx, dy) {
  const out = { width: img.width, height: img.height, data: new Uint8Array(img.data) };
  const copy = crop(img, rect.x, rect.y, rect.w, rect.h);
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const tx = rect.x + x + dx;
      const ty = rect.y + y + dy;
      if (tx < 0 || ty < 0 || tx >= img.width || ty >= img.height) continue;
      const sp = (y * copy.width + x) * 4;
      const dp = (ty * img.width + tx) * 4;
      out.data[dp] = copy.data[sp];
      out.data[dp + 1] = copy.data[sp + 1];
      out.data[dp + 2] = copy.data[sp + 2];
      out.data[dp + 3] = copy.data[sp + 3];
    }
  }
  return out;
}

export function sideBySide(ref, act, gap = 8, background = [6, 8, 14]) {
  const out = emptyImage(ref.width * 2 + gap, ref.height);
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = background[0]; out.data[i + 1] = background[1]; out.data[i + 2] = background[2]; out.data[i + 3] = 255;
  }
  const place = (img, ox) => {
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const sp = (y * img.width + x) * 4;
        const dp = (y * out.width + (x + ox)) * 4;
        out.data.set(img.data.subarray(sp, sp + 4), dp);
      }
    }
  };
  place(ref, 0);
  place(act, ref.width + gap);
  return out;
}

export function compareImages(referenceFile, actualFile, {
  regions = [],
  thresholds = {},
  structureTolerancePx,
  topResiduals = 12,
  blockSize = 12,
  minClusterPixels = 24,
  detectStructure = false,
} = {}) {
  structureTolerancePx ??= thresholds.structureTolerancePx ?? DEFAULT_THRESHOLDS.structureTolerancePx;
  const th = { ...DEFAULT_THRESHOLDS, ...thresholds, structureTolerancePx };
  for (const key of Object.keys(DEFAULT_THRESHOLDS)) {
    if (!Number.isFinite(th[key]) || th[key] < 0) throw new Error(`invalid threshold ${key}: ${th[key]}`);
  }
  if (th.pixelmatchThreshold > 1 || th.minSsim > 1 || th.codeMinSsim > 1) throw new Error('pixelmatch and SSIM thresholds must be in [0,1]');
  const ref = readPng(referenceFile);
  const act = readPng(actualFile);
  if (ref.width !== act.width || ref.height !== act.height) {
    throw new Error(`size mismatch: reference ${ref.width}x${ref.height} vs actual ${act.width}x${act.height}`);
  }
  const W = ref.width;
  const H = ref.height;
  for (const region of regions) {
    parseRegion([region.x, region.y, region.w, region.h].join(','), ref);
    if (!['code', 'texture'].includes(region.kind)) throw new Error(`region ${region.name} must have kind code or texture`);
  }
  const { mask: mismatchFull, count: mismatchCount } = mismatchMask(ref, act, { threshold: th.pixelmatchThreshold });

  const grayRef = toGray(ref);
  const grayAct = toGray(act);
  const ssim = ssimMap(grayRef, grayAct, W, H);

  const globalStats = {
    pixels: W * H,
    mismatch: mismatchCount,
    mismatchPct: +((100 * mismatchCount) / (W * H)).toFixed(4),
    ...maeOverMask(ref, act, null),
    ssim: meanOverMask(ssim, null).mean,
  };

  const hasRegions = Array.isArray(regions) && regions.length > 0;
  const cmap = hasRegions ? classMap(W, H, regions) : null;
  const codeMask = hasRegions ? maskFromClass(cmap, 1) : new Uint8Array(W * H).fill(1);
  const textureMask = hasRegions ? maskFromClass(cmap, 2) : new Uint8Array(W * H);

  const isolateTo = (mask) => {
    const a = { width: W, height: H, data: new Uint8Array(ref.data) };
    const b = { width: W, height: H, data: new Uint8Array(act.data) };
    for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
      if (mask[i]) continue;
      a.data[p] = ref.data[p]; a.data[p + 1] = ref.data[p + 1]; a.data[p + 2] = ref.data[p + 2]; a.data[p + 3] = ref.data[p + 3];
      b.data[p] = ref.data[p]; b.data[p + 1] = ref.data[p + 1]; b.data[p + 2] = ref.data[p + 2]; b.data[p + 3] = ref.data[p + 3];
    }
    return [a, b];
  };

  const statsForMask = (mask) => {
    const count = mask.reduce((acc, v) => acc + v, 0);
    if (!count) return { pixels: 0, mismatch: 0, mismatchPct: 0, mae: 0, ssim: null };
    const [a, b] = isolateTo(mask);
    const { count: m } = mismatchMask(a, b, { threshold: th.pixelmatchThreshold });
    const mae = maeOverMask(ref, act, mask);
    const s = meanOverMask(ssim, mask).mean;
    return {
      pixels: count,
      mismatch: m,
      mismatchPct: +((100 * m) / count).toFixed(4),
      mae: mae.mae,
      maeR: mae.maeR,
      maeG: mae.maeG,
      maeB: mae.maeB,
      ssim: s,
    };
  };

  const codeStats = hasRegions ? statsForMask(codeMask) : null;
  const textureStats = hasRegions && textureMask.some((v) => v) ? statsForMask(textureMask) : null;

  const regionStats = [];
  for (const region of regions) {
    const rect = rectOf(region);
    const r = crop(ref, rect.x, rect.y, rect.w, rect.h);
    const a = crop(act, rect.x, rect.y, rect.w, rect.h);
    const { count: m } = mismatchMask(r, a, { threshold: th.pixelmatchThreshold });
    const mae = maeOverMask(r, a, null);
    const rr = [];
    const aa = [];
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        rr.push(ssim[y * W + x]);
        aa.push(1);
      }
    }
    const ssimMean = rr.length ? +(rr.reduce((s, v) => s + v, 0) / rr.length).toFixed(5) : null;
    regionStats.push({
      name: region.name ?? `region-${regionStats.length + 1}`,
      kind: region.kind ?? 'code',
      rect,
      pixels: rect.w * rect.h,
      mismatch: m,
      mismatchPct: +((100 * m) / (rect.w * rect.h)).toFixed(4),
      mae: mae.mae,
      ssim: ssimMean,
      note: region.note ?? null,
    });
  }

  // residual clusters (only where a real mismatch was counted)
  const clusterMask = hasRegions ? Uint8Array.from(mismatchFull, (v, i) => (v && codeMask[i] ? 1 : 0)) : mismatchFull;
  const clusters = clusteredBlocks(clusterMask, W, H, { block: blockSize, minPixels: minClusterPixels })
    .slice(0, topResiduals)
    .map((c) => ({
      ...c,
      shareOfCanvas: +(c.pixels / (W * H)).toFixed(5),
      shareOfCode: codeStats?.pixels ? +(c.pixels / codeStats.pixels).toFixed(5) : null,
      classification: classifyCluster(ref, act, c),
      meanAbsDiff: (() => {
        const m = maeOverMask(ref, act, (() => {
          const mask = new Uint8Array(W * H);
          for (let y = c.y; y < c.y + c.h; y++) for (let x = c.x; x < c.x + c.w; x++) mask[y * W + x] = 1;
          return mask;
        })());
        return m.mae;
      })(),
    }));

  // structural check: panel/frame rectangles must sit within tolerance
  let structure = { checked: false, requested: !!detectStructure, reason: 'Not requested; pixel metrics do not prove DOM or semantic structure.' };
  if (detectStructure) {
    try {
      const refMeasure = measureReference(referenceFile);
      const actMeasure = measureReference(actualFile);
      const refById = new Map(refMeasure.panels.map((p) => [p.id, p]));
      const actualIds = new Set(actMeasure.panels.map(p => p.id));
      const missing = [...refById.keys()].filter(id => !actualIds.has(id));
      const extra = [...actualIds].filter(id => !refById.has(id));
      const rows = [];
      for (const p of actMeasure.panels) {
        const r = refById.get(p.id);
        if (!r) continue;
        const delta = { x: p.x - r.x, y: p.y - r.y, w: p.w - r.w, h: p.h - r.h };
        rows.push({
          id: p.id, ref: { x: r.x, y: r.y, w: r.w, h: r.h }, actual: { x: p.x, y: p.y, w: p.w, h: p.h },
          delta, ok: Object.values(delta).every((d) => Math.abs(d) <= structureTolerancePx),
        });
      }
      const maxDelta = rows.reduce((max, r) => Math.max(max, ...Object.values(r.delta).map(Math.abs)), 0);
      structure = {
        checked: true,
        requested: true,
        missing, extra,
        tolerancePx: structureTolerancePx,
        panelsCompared: rows.length,
        refPanels: refMeasure.panels.length,
        actualPanels: actMeasure.panels.length,
        refFrames: refMeasure.frames,
        actualFrames: actMeasure.frames,
        maxDelta,
        ok: rows.length > 0 && missing.length === 0 && extra.length === 0 && rows.every((r) => r.ok),
        rows,
      };
    } catch (e) {
      structure = { checked: false, requested: true, ok: false, error: String(e.message), tolerancePx: structureTolerancePx };
    }
  }

  const failures = [];
  if (globalStats.mismatchPct > th.maxMismatchPct) failures.push(`global mismatch ${globalStats.mismatchPct}% > ${th.maxMismatchPct}%`);
  if (globalStats.mae > th.maxMae) failures.push(`global MAE ${globalStats.mae} > ${th.maxMae}`);
  if (globalStats.ssim < th.minSsim) failures.push(`global SSIM ${globalStats.ssim} < ${th.minSsim}`);
  if (codeStats) {
    if (codeStats.mismatchPct > th.codeMaxMismatchPct) failures.push(`code mismatch ${codeStats.mismatchPct}% > ${th.codeMaxMismatchPct}%`);
    if (codeStats.mae > th.codeMaxMae) failures.push(`code MAE ${codeStats.mae} > ${th.codeMaxMae}`);
    if (codeStats.ssim < th.codeMinSsim) failures.push(`code SSIM ${codeStats.ssim} < ${th.codeMinSsim}`);
  }
  if (structure.requested && !structure.ok) {
    failures.push(structure.error ? `structure check error: ${structure.error}`
      : structure.missing?.length || structure.extra?.length
        ? `structure panel set differs: missing ${structure.missing.join(',') || 'none'}; extra ${structure.extra.join(',') || 'none'}`
        : `structure max delta ${structure.maxDelta}px > ${structureTolerancePx}px`);
  }

  return {
    tool: 'img2code diff',
    reference: { path: referenceFile, sha256: sha256File(referenceFile) },
    actual: { path: actualFile, sha256: sha256File(actualFile) },
    canvas: { width: W, height: H },
    thresholds: th,
    global: globalStats,
    code: codeStats,
    texture: textureStats,
    regions: regionStats,
    structure,
    residuals: clusters,
    verdict: { ok: failures.length === 0, failures },
    heatmap: null,
  };
}

export function runDiff(args, { out = console.log } = {}) {
  const [referenceFile, actualFile] = args.positional;
  if (!referenceFile || !actualFile) throw new Error('diff requires <reference.png> <actual.png>');
  const regionSpec = args.flags.regions ? readJson(args.flags.regions) : null;
  const regions = regionSpec?.regions ?? regionSpec ?? [];
  const thresholds = args.flags.config ? readJson(args.flags.config) : {};
  const structureMode = args.flags.structure ?? 'none';
  if (!['none', 'dashboard'].includes(structureMode)) throw new Error('--structure must be none or dashboard');
  for (const [flag, key] of [
    ['threshold', 'pixelmatchThreshold'], ['maxMismatch', 'maxMismatchPct'], ['maxMae', 'maxMae'],
    ['minSsim', 'minSsim'], ['codeMaxMismatch', 'codeMaxMismatchPct'], ['codeMaxMae', 'codeMaxMae'],
    ['codeMinSsim', 'codeMinSsim'], ['structureTolerance', 'structureTolerancePx'],
  ]) {
    if (args.flags[flag] !== undefined) thresholds[key] = Number(args.flags[flag]);
  }
  const outDir = args.flags.outDir ?? '.';
  ensureDir(outDir);

  const report = compareImages(referenceFile, actualFile, {
    regions,
    thresholds,
    structureTolerancePx: thresholds.structureTolerancePx ?? DEFAULT_THRESHOLDS.structureTolerancePx,
    topResiduals: Number(args.flags.top ?? 12),
    detectStructure: structureMode === 'dashboard',
  });

  const ref = readPng(referenceFile);
  const act = readPng(actualFile);
  const { mask: mismatch } = mismatchMask(readPng(referenceFile), act, { threshold: report.thresholds.pixelmatchThreshold });
  const heatmapPath = path.join(outDir, args.flags.heatmap ?? 'diff-heatmap.png');
  writePng(heatmapPath, renderHeatmap(ref, mismatch, report.residuals));
  const sbsPath = path.join(outDir, args.flags.sideBySide ?? 'diff-side-by-side.png');
  writePng(sbsPath, sideBySide(ref, act));
  report.heatmap = heatmapPath;
  report.sideBySide = sbsPath;
  report.generatedAt = new Date().toISOString();

  const jsonPath = args.flags.json ?? path.join(outDir, 'diff-report.json');
  writeJson(jsonPath, report);

  out(`reference: ${referenceFile}`);
  out(`actual:    ${actualFile}`);
  out(`global : mismatch ${report.global.mismatchPct}% | MAE ${report.global.mae} | SSIM ${report.global.ssim}`);
  if (report.code) out(`code   : mismatch ${report.code.mismatchPct}% | MAE ${report.code.mae} | SSIM ${report.code.ssim}  (${report.code.pixels} px)`);
  if (report.texture) out(`texture: mismatch ${report.texture.mismatchPct}% | MAE ${report.texture.mae} | SSIM ${report.texture.ssim}  (${report.texture.pixels} px)`);
  if (report.structure.checked) {
    out(`structure: ${report.structure.panelsCompared} panels compared, max delta ${report.structure.maxDelta}px (tolerance ${report.structure.tolerancePx}px) -> ${report.structure.ok ? 'OK' : 'MISALIGNED'}`);
  } else if (report.structure.error) {
    out(`structure: not checkable (${report.structure.error})`);
  }
  out(`worst regions:`);
  for (const r of [...report.regions].sort((a, b) => b.mismatchPct - a.mismatchPct).slice(0, 6)) {
    out(`  ${r.name.padEnd(16)} ${String(r.mismatchPct).padStart(7)}%  MAE ${String(r.mae).padStart(6)}  SSIM ${r.ssim}`);
  }
  out(`top residual clusters:`);
  for (const c of report.residuals.slice(0, 8)) {
    out(`  ${String(c.pixels).padStart(6)} px @ ${c.x},${c.y} ${c.w}x${c.h}  ${c.classification}`);
  }
  out(`heatmap: ${heatmapPath}`);
  out(`report:  ${jsonPath}`);
  out(`verdict: ${report.verdict.ok ? 'PASS' : `FAIL (${report.verdict.failures.join('; ')})`}`);
  return { code: report.verdict.ok ? 0 : 1, report };
}
