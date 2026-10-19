// 局部视觉复核：裁切只是诊断产物，不能当作网页背景绕过代码实现。
import path from 'node:path';
import { readPng, crop, emptyImage, writePng, writeJson } from '../lib/png.mjs';
import { mismatchMask, maeOverMask } from '../lib/metrics.mjs';

export function parseRegion(value, image) {
  const tokens = String(value ?? `0,0,${image.width},${image.height}`).split(',');
  if (tokens.some(token => token.trim() === '')) throw new Error('region cannot contain empty coordinates');
  const parts = tokens.map(Number);
  if (parts.length !== 4 || !parts.every(Number.isInteger)) throw new Error('region must contain four integers: x,y,w,h');
  const [x, y, w, h] = parts;
  if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > image.width || y + h > image.height) {
    throw new Error(`region ${parts.join(',')} is outside ${image.width}x${image.height}`);
  }
  return { x, y, w, h };
}

function enlarge(img, scale) {
  const out = emptyImage(img.width * scale, img.height * scale);
  // 最近邻放大保留原始像素边界，避免诊断图片被插值模糊。
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
    const src = (Math.floor(y / scale) * img.width + Math.floor(x / scale)) * 4;
    out.data.set(img.data.subarray(src, src + 4), (y * out.width + x) * 4);
  }
  return out;
}

export function runInspect(args, { out = console.log } = {}) {
  const [refFile, actualFile] = args.positional;
  if (!refFile || !actualFile) throw new Error('inspect requires <reference.png> <actual.png>');
  const ref = readPng(refFile), actual = readPng(actualFile);
  if (ref.width !== actual.width || ref.height !== actual.height) throw new Error('inspect requires equal image dimensions');
  const rect = parseRegion(args.flags.region, ref);
  const scale = Number(args.flags.scale ?? 2);
  if (!Number.isInteger(scale) || scale < 1 || scale > 8) throw new Error('scale must be an integer from 1 to 8');
  if (rect.w * rect.h * scale * scale > 32000000) throw new Error('enlarged crop exceeds 32 megapixels; use a smaller region or scale');
  const a = crop(ref, rect.x, rect.y, rect.w, rect.h);
  const b = crop(actual, rect.x, rect.y, rect.w, rect.h);
  const overlay = emptyImage(rect.w, rect.h), delta = emptyImage(rect.w, rect.h);
  for (let i = 0; i < a.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      overlay.data[i + c] = Math.round((a.data[i + c] + b.data[i + c]) / 2);
      delta.data[i + c] = Math.min(255, Math.abs(a.data[i + c] - b.data[i + c]) * 3);
    }
    overlay.data[i + 3] = delta.data[i + 3] = 255;
  }
  const dir = args.flags.outDir ?? 'out/detail';
  const files = {};
  for (const [name, img] of Object.entries({ reference: a, actual: b, overlay, difference: delta })) {
    files[name] = writePng(path.join(dir, `${name}.png`), enlarge(img, scale));
  }
  const mismatch = mismatchMask(a, b).count;
  const report = { tool: 'img2code inspect', reference: refFile, actual: actualFile, region: rect, scale,
    mismatchPct: +(mismatch * 100 / (rect.w * rect.h)).toFixed(4), mae: maeOverMask(a, b).mae, files };
  writeJson(path.join(dir, 'inspect.json'), report);
  out(`inspect: ${rect.x},${rect.y} ${rect.w}x${rect.h} @${scale}x; mismatch ${report.mismatchPct}%; MAE ${report.mae}`);
  out(`images: ${Object.values(files).join(', ')}`);
  return { code: 0, report };
}
