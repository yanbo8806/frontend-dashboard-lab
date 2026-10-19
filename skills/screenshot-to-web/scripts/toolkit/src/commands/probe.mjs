// `img2code probe` - deterministic structural decomposition of a region.
//
// 视觉理解之后的局部量测，不替代图片语义识别。对指定矩形输出：
//   * connected components of a named colour mask (bbox, size, pixel count,
//     mean colour) — i.e. "what elements are here and how big are they";
//   * per-row and per-column ink spans, so polylines, diagonals and thickness
//     ramps are visible as numbers rather than adjectives;
//   * the dominant colours in the region, so fills and gradients can be
//     reproduced instead of approximated.
//
// The output is JSON, so a later stage (or an agent) can diff it against the
// render's own probe and see exactly which element drifted.
import { readPng, writeJson, ensureDir } from '../lib/png.mjs';
import { MASKS, makeMask, meanColor, topColors } from '../lib/detect.mjs';
import path from 'node:path';
import { parseRegion } from './inspect.mjs';

/** Connected components (4-neighbour) of a binary mask, with bboxes. */
function components(img, mask, { minPixels = 12 } = {}) {
  const { width: w, height: h } = img;
  const seen = new Uint8Array(w * h);
  const out = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i] || seen[i]) continue;
      const stack = [i];
      seen[i] = 1;
      let n = 0, x0 = x, x1 = x, y0 = y, y1 = y;
      let sr = 0, sg = 0, sb = 0;
      while (stack.length) {
        const cur = stack.pop();
        const cy = (cur / w) | 0;
        const cx = cur - cy * w;
        n++;
        if (cx < x0) x0 = cx;
        if (cx > x1) x1 = cx;
        if (cy < y0) y0 = cy;
        if (cy > y1) y1 = cy;
        const p = cur * 4;
        sr += img.data[p]; sg += img.data[p + 1]; sb += img.data[p + 2];
        const nb = [cur - 1, cur + 1, cur - w, cur + w];
        for (const q of nb) {
          if (q < 0 || q >= w * h || seen[q] || !mask[q]) continue;
          // guard against row wrap-around
          const qy = (q / w) | 0;
          if (Math.abs(qy - cy) > 1) continue;
          if (Math.abs((q - qy * w) - cx) > 1) continue;
          seen[q] = 1;
          stack.push(q);
        }
      }
      if (n < minPixels) continue;
      out.push({
        x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, pixels: n,
        mean: [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)],
      });
    }
  }
  out.sort((a, b) => b.pixels - a.pixels);
  return out;
}

/** Per-row ink span for a mask: [y, x0, x1, count]. */
function rowSpans(img, mask, region, step = 1) {
  const { width: w } = img;
  const rows = [];
  for (let y = region.y; y < region.y + region.h; y += step) {
    let x0 = -1, x1 = -1, n = 0;
    for (let x = region.x; x < region.x + region.w; x++) {
      if (!mask[y * w + x]) continue;
      if (x0 < 0) x0 = x;
      x1 = x;
      n++;
    }
    if (n) rows.push([y, x0, x1, n]);
  }
  return rows;
}

/** Per-column ink span for a mask: [x, y0, y1, count]. */
function colSpans(img, mask, region, step = 1) {
  const { width: w } = img;
  const cols = [];
  for (let x = region.x; x < region.x + region.w; x += step) {
    let y0 = -1, y1 = -1, n = 0;
    for (let y = region.y; y < region.y + region.h; y++) {
      if (!mask[y * w + x]) continue;
      if (y0 < 0) y0 = y;
      y1 = y;
      n++;
    }
    if (n) cols.push([x, y0, y1, n]);
  }
  return cols;
}

export function runProbe(args, { out = console.log } = {}) {
  const refPath = args.positional[0];
  if (!refPath) throw new Error('probe: need a reference image (img2code probe <ref.png> --region x,y,w,h)');
  const img = readPng(refPath);

  const region = parseRegion(args.flags.region, img);

  const maskName = String(args.flags.mask ?? 'bright');
  const pred = MASKS[maskName];
  if (!pred) throw new Error(`probe: unknown --mask "${maskName}" (have: ${Object.keys(MASKS).join(', ')})`);

  const mask = makeMask(img, pred, region);
  const minPixels = Number(args.flags.minPixels ?? 12);
  const step = Number(args.flags.step ?? 1);
  if (!Number.isInteger(step) || step < 1) throw new Error('probe: step must be a positive integer');
  if (!Number.isInteger(minPixels) || minPixels < 1) throw new Error('probe: min-pixels must be a positive integer');
  const comps = components(img, mask, { minPixels });
  const colors = topColors(img, region, Number(args.flags.colors ?? 12));

  const report = {
    tool: 'img2code probe',
    image: path.resolve(refPath),
    imageSize: { width: img.width, height: img.height },
    region,
    mask: maskName,
    components: comps,
    dominantColors: colors,
    rows: rowSpans(img, mask, region, step),
    cols: colSpans(img, mask, region, step),
  };

  const outPath = args.flags.out;
  if (outPath) {
    ensureDir(path.dirname(path.resolve(outPath)));
    writeJson(outPath, report);
  }

  if (!args.flags.quiet) {
    out(`probe ${path.basename(refPath)} region ${region.x},${region.y} ${region.w}x${region.h} mask=${maskName}`);
    out(`components: ${comps.length}`);
    for (const c of comps.slice(0, Number(args.flags.top ?? 12))) {
      out(`  ${String(c.w).padStart(4)}x${String(c.h).padEnd(4)} @ ${c.x},${c.y}  px=${String(c.pixels).padStart(6)}  mean=rgb(${c.mean.join(',')})`);
    }
    out('dominant colours:');
    for (const c of colors.slice(0, 8)) out(`  ${String(c.count).padStart(7)} px  rgb(${c.rgb.join(',')})`);
    if (outPath) out(`json: ${outPath}`);
  }
  return { code: 0, report };
}
