// Similarity metrics: pixelmatch mismatch, MAE, SSIM, per-region statistics,
// residual clustering and heatmap rendering.
import pixelmatch from 'pixelmatch';
import { emptyImage } from './png.mjs';

/** Luma (Rec.601) as Float64Array, one value per pixel. */
export function toGray(img) {
  const n = img.width * img.height;
  const out = new Float64Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    out[i] = 0.299 * img.data[p] + 0.587 * img.data[p + 1] + 0.114 * img.data[p + 2];
  }
  return out;
}

/**
 * Copy of `img` where every pixel outside `include` (mask, 1 = keep) is taken
 * from `base`. Comparing two such copies isolates differences to `include`.
 */
export function isolate(base, img, include) {
  const out = { width: img.width, height: img.height, data: new Uint8Array(img.data) };
  for (let i = 0, p = 0; i < include.length; i++, p += 4) {
    if (include[i]) continue;
    out.data[p] = base.data[p];
    out.data[p + 1] = base.data[p + 1];
    out.data[p + 2] = base.data[p + 2];
    out.data[p + 3] = base.data[p + 3];
  }
  return out;
}

/**
 * pixelmatch between two images, returning the exact counted-mismatch mask.
 * AA pixels are excluded by pixelmatch itself (includeAA=false), so the mask
 * contains only "real" differences - the same pixels `pixelmatch` counts.
 */
export function mismatchMask(ref, act, { threshold = 0.15 } = {}) {
  const { width: w, height: h } = ref;
  const out = new Uint8Array(w * h * 4);
  const count = pixelmatch(ref.data, act.data, out, w, h, {
    threshold,
    includeAA: false,
    diffMask: true,
    diffColor: [255, 0, 255],
  });
  const mask = new Uint8Array(w * h);
  for (let i = 0, p = 3; i < mask.length; i++, p += 4) if (out[p] === 255) mask[i] = 1;
  return { count, mask };
}

/** Mean absolute error over RGB for masked pixels. */
export function maeOverMask(ref, act, mask = null) {
  let sum = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let n = 0;
  for (let i = 0, p = 0; i < (mask ? mask.length : ref.width * ref.height); i++, p += 4) {
    if (mask && !mask[i]) continue;
    const dr = Math.abs(ref.data[p] - act.data[p]);
    const dg = Math.abs(ref.data[p + 1] - act.data[p + 1]);
    const db = Math.abs(ref.data[p + 2] - act.data[p + 2]);
    sumR += dr; sumG += dg; sumB += db;
    sum += dr + dg + db;
    n++;
  }
  if (!n) return { pixels: 0, mae: 0, maeR: 0, maeG: 0, maeB: 0 };
  return {
    pixels: n,
    mae: +(sum / (3 * n)).toFixed(4),
    maeR: +(sumR / n).toFixed(4),
    maeG: +(sumG / n).toFixed(4),
    maeB: +(sumB / n).toFixed(4),
  };
}

function gaussianKernel(radius, sigma) {
  const k = new Float64Array(2 * radius + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  return k;
}

function blur(src, w, h, kernel) {
  const r = (kernel.length - 1) >> 1;
  const tmp = new Float64Array(w * h);
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) {
        const xx = Math.min(w - 1, Math.max(0, x + i));
        acc += src[y * w + xx] * kernel[i + r];
      }
      tmp[y * w + x] = acc;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) {
        const yy = Math.min(h - 1, Math.max(0, y + i));
        acc += tmp[yy * w + x] * kernel[i + r];
      }
      out[y * w + x] = acc;
    }
  }
  return out;
}

/** Per-pixel SSIM map (grayscale, 11x11 Gaussian window, K1=0.01, K2=0.03). */
export function ssimMap(grayA, grayB, w, h, { radius = 5, sigma = 1.5 } = {}) {
  const kernel = gaussianKernel(radius, sigma);
  const n = w * h;
  const aa = new Float64Array(n);
  const bb = new Float64Array(n);
  const ab = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    aa[i] = grayA[i] * grayA[i];
    bb[i] = grayB[i] * grayB[i];
    ab[i] = grayA[i] * grayB[i];
  }
  const muA = blur(grayA, w, h, kernel);
  const muB = blur(grayB, w, h, kernel);
  const eA2 = blur(aa, w, h, kernel);
  const eB2 = blur(bb, w, h, kernel);
  const eAB = blur(ab, w, h, kernel);
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  const map = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const ma = muA[i];
    const mb = muB[i];
    const va = Math.max(0, eA2[i] - ma * ma);
    const vb = Math.max(0, eB2[i] - mb * mb);
    const cov = eAB[i] - ma * mb;
    map[i] = ((2 * ma * mb + C1) * (2 * cov + C2)) /
      ((ma * ma + mb * mb + C1) * (va + vb + C2));
  }
  return map;
}

export function meanOverMask(values, mask = null) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    if (mask && !mask[i]) continue;
    sum += values[i];
    n++;
  }
  return { mean: n ? +(sum / n).toFixed(5) : 0, count: n };
}

/**
 * Class map for a region spec: 0 = unclassified, 1 = code-drawn, 2 = texture.
 * Texture (bitmap crops: map, photos) wins over code where they overlap.
 */
export function classMap(w, h, regions) {
  const map = new Uint8Array(w * h);
  const paint = (rect, code) => {
    const x0 = Math.max(0, rect.x);
    const y0 = Math.max(0, rect.y);
    const x1 = Math.min(w, rect.x + rect.w);
    const y1 = Math.min(h, rect.y + rect.h);
    for (let y = y0; y < y1; y++) {
      map.fill(code, y * w + x0, y * w + x1);
    }
  };
  for (const r of regions) if (r.kind === 'code') paint(r, 1);
  for (const r of regions) if (r.kind === 'texture') paint(r, 2);
  return map;
}

export function maskFromClass(classmap, value) {
  const mask = new Uint8Array(classmap.length);
  for (let i = 0; i < classmap.length; i++) mask[i] = classmap[i] === value ? 1 : 0;
  return mask;
}

/** Darkened reference with mismatching pixels highlighted, plus cluster boxes. */
export function renderHeatmap(ref, mismatch, clusters = []) {
  const out = emptyImage(ref.width, ref.height);
  for (let i = 0, p = 0; i < ref.width * ref.height; i++, p += 4) {
    const dim = mismatch[i] ? 1 : 0.32;
    if (mismatch[i]) {
      out.data[p] = Math.min(255, ref.data[p] * 0.25 + 210);
      out.data[p + 1] = Math.min(255, ref.data[p + 1] * 0.25 + 20);
      out.data[p + 2] = Math.min(255, ref.data[p + 2] * 0.25 + 120);
    } else {
      out.data[p] = ref.data[p] * dim;
      out.data[p + 1] = ref.data[p + 1] * dim;
      out.data[p + 2] = ref.data[p + 2] * dim;
    }
    out.data[p + 3] = 255;
  }
  const rect = (x0, y0, x1, y1, color) => {
    for (let x = x0; x <= x1; x++) {
      for (const y of [y0, y1]) {
        if (x < 0 || y < 0 || x >= out.width || y >= out.height) continue;
        const p = (y * out.width + x) * 4;
        out.data[p] = color[0]; out.data[p + 1] = color[1]; out.data[p + 2] = color[2]; out.data[p + 3] = 255;
      }
    }
    for (let y = y0; y <= y1; y++) {
      for (const x of [x0, x1]) {
        if (x < 0 || y < 0 || x >= out.width || y >= out.height) continue;
        const p = (y * out.width + x) * 4;
        out.data[p] = color[0]; out.data[p + 1] = color[1]; out.data[p + 2] = color[2]; out.data[p + 3] = 255;
      }
    }
  };
  for (const c of clusters) rect(c.x, c.y, c.x + c.w - 1, c.y + c.h - 1, [255, 214, 74]);
  return out;
}

/** Best-effort human label for a residual cluster, from its colour content. */
export function classifyCluster(ref, act, cluster) {
  let rRef = 0; let gRef = 0; let bRef = 0;
  let rAct = 0; let gAct = 0; let bAct = 0;
  let n = 0;
  let thin = 0;
  const { x, y, w, h } = cluster;
  for (let yy = y; yy < y + h; yy++) {
    let rowDiff = 0;
    for (let xx = x; xx < x + w; xx++) {
      const p = (yy * ref.width + xx) * 4;
      const d = Math.abs(ref.data[p] - act.data[p]) + Math.abs(ref.data[p + 1] - act.data[p + 1]) +
        Math.abs(ref.data[p + 2] - act.data[p + 2]);
      if (d > 36) rowDiff++;
      rRef += ref.data[p]; gRef += ref.data[p + 1]; bRef += ref.data[p + 2];
      rAct += act.data[p]; gAct += act.data[p + 1]; bAct += act.data[p + 2];
      n++;
    }
    if (rowDiff > 0 && rowDiff < w * 0.25) thin++;
  }
  if (!n) return 'empty';
  const refC = [rRef / n, gRef / n, bRef / n];
  const actC = [rAct / n, gAct / n, bAct / n];
  const luma = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const isBright = luma(refC) > 150 || luma(actC) > 150;
  const cyanish = (c) => c[2] > c[0] + 30 && c[1] > c[0];
  if (thin / h > 0.5 && isBright) return 'thin bright strokes (text glyphs / hairlines / glow edges)';
  if (cyanish(refC) || cyanish(actC)) return 'cyan line / glow mismatch';
  if (isBright) return 'bright element mismatch';
  if (luma(refC) < 60 && luma(actC) < 60) return 'dark fill / gradient mismatch';
  return 'colour / shape mismatch';
}
