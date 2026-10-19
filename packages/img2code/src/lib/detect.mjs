// Geometry / colour detection primitives used by `measure` and `diff`.
// Everything works on { width, height, data: Uint8Array(RGBA) } images.

/** Named pixel predicates. Colours were derived from the reference screenshots. */
export const MASKS = {
  // Bright cyan used for panel frames, chart lines and glowing borders.
  cyanBright: (r, g, b) => b > 150 && g > 110 && r < 130 && b - r > 70,
  // Any cyan-ish pixel including dimmer glow.
  cyanAny: (r, g, b) => b > 90 && g > 60 && b - r > 40,
  white: (r, g, b) => r > 200 && g > 210 && b > 220,
  red: (r, g, b) => r > 150 && g < 110 && b < 110,
  bright: (r, g, b) => (r + g + b) / 3 > 90,
  lit: (r, g, b) => (r + g + b) / 3 > 30,
};

export function makeMask(img, pred, region = null) {
  const { width: w, height: h, data } = img;
  const mask = new Uint8Array(w * h);
  const x0 = region ? Math.max(0, region.x) : 0;
  const y0 = region ? Math.max(0, region.y) : 0;
  const x1 = region ? Math.min(w - 1, region.x + region.w - 1) : w - 1;
  const y1 = region ? Math.min(h - 1, region.y + region.h - 1) : h - 1;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * w + x) * 4;
      if (pred(data[i], data[i + 1], data[i + 2])) mask[y * w + x] = 1;
    }
  }
  return mask;
}

/** Longest consecutive run of 1s inside [x0, x1] on one row. */
export function longestRunInRow(mask, w, y, x0, x1) {
  let best = { start: -1, end: -1, len: 0 };
  let start = -1;
  for (let x = x0; x <= x1; x++) {
    if (mask[y * w + x]) {
      if (start < 0) start = x;
    } else if (start >= 0) {
      if (x - start > best.len) best = { start, end: x - 1, len: x - start };
      start = -1;
    }
  }
  if (start >= 0 && x1 - start + 1 > best.len) best = { start, end: x1, len: x1 - start + 1 };
  return best;
}

export function longestRunInColumn(mask, w, x, y0, y1) {
  let best = { start: -1, end: -1, len: 0 };
  let start = -1;
  for (let y = y0; y <= y1; y++) {
    if (mask[y * w + x]) {
      if (start < 0) start = y;
    } else if (start >= 0) {
      if (y - start > best.len) best = { start, end: y - 1, len: y - start };
      start = -1;
    }
  }
  if (start >= 0 && y1 - start + 1 > best.len) best = { start, end: y1, len: y1 - start + 1 };
  return best;
}

export function groupRuns(values, gap = 2) {
  const out = [];
  let cur = null;
  for (const v of values) {
    if (cur && v - cur.end <= gap) {
      cur.end = v;
      cur.count++;
    } else {
      if (cur) out.push(cur);
      cur = { start: v, end: v, count: 1 };
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Rows holding a horizontal line: at least `frac` of the columns in [x0, x1]
 * are mask pixels (`mode: 'count'`, tolerant of small AA gaps) or form one
 * unbroken run (`mode: 'run'`). Returns merged groups with measured extents.
 */
export function findHorizontalLines(img, { x0, x1, y0, y1, frac = 0.85, pred = MASKS.cyanBright, mode = 'count' }) {
  const mask = makeMask(img, pred, { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  const span = x1 - x0 + 1;
  const rows = [];
  const extents = new Map();
  for (let y = y0; y <= y1; y++) {
    let count = 0;
    for (let x = x0; x <= x1; x++) if (mask[y * img.width + x]) count++;
    const run = longestRunInRow(mask, img.width, y, x0, x1);
    const value = mode === 'run' ? run.len : count;
    if (value >= Math.ceil(frac * span)) {
      rows.push(y);
      extents.set(y, [run.start, run.end, +(count / span).toFixed(3), run.len]);
    }
  }
  return groupRuns(rows).map((g) => {
    let sx = Infinity;
    let ex = -Infinity;
    let best = 0;
    let bestRun = 0;
    for (let y = g.start; y <= g.end; y++) {
      const e = extents.get(y);
      if (e) {
        sx = Math.min(sx, e[0]); ex = Math.max(ex, e[1]);
        best = Math.max(best, e[2]); bestRun = Math.max(bestRun, e[3]);
      }
    }
    return { start: g.start, end: g.end, x0: sx, x1: ex, thickness: g.end - g.start + 1, coverage: best, runLength: bestRun };
  });
}

/**
 * Columns holding a vertical line: at least `frac` of the rows in [y0, y1] are
 * mask pixels (`mode: 'count'`) or form one unbroken run (`mode: 'run'`).
 */
export function findVerticalLines(img, { x0, x1, y0, y1, frac = 0.85, pred = MASKS.cyanBright, mode = 'count' }) {
  const mask = makeMask(img, pred, { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  const span = y1 - y0 + 1;
  const cols = [];
  const extents = new Map();
  for (let x = x0; x <= x1; x++) {
    let count = 0;
    for (let y = y0; y <= y1; y++) if (mask[y * img.width + x]) count++;
    const run = longestRunInColumn(mask, img.width, x, y0, y1);
    const value = mode === 'run' ? run.len : count;
    if (value >= Math.ceil(frac * span)) {
      cols.push(x);
      extents.set(x, [run.start, run.end, +(count / span).toFixed(3), run.len]);
    }
  }
  return groupRuns(cols).map((g) => {
    let sy = Infinity;
    let ey = -Infinity;
    let best = 0;
    let bestRun = 0;
    for (let x = g.start; x <= g.end; x++) {
      const e = extents.get(x);
      if (e) {
        sy = Math.min(sy, e[0]); ey = Math.max(ey, e[1]);
        best = Math.max(best, e[2]); bestRun = Math.max(bestRun, e[3]);
      }
    }
    return { start: g.start, end: g.end, y0: sy, y1: ey, thickness: g.end - g.start + 1, coverage: best, runLength: bestRun };
  });
}

export function medianColor(img, rect) {
  const { x, y, w, h } = rect;
  const rs = [];
  const gs = [];
  const bs = [];
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (xx < 0 || yy < 0 || xx >= img.width || yy >= img.height) continue;
      const i = (yy * img.width + xx) * 4;
      rs.push(img.data[i]); gs.push(img.data[i + 1]); bs.push(img.data[i + 2]);
    }
  }
  const med = (arr) => {
    if (!arr.length) return 0;
    arr.sort((a, b) => a - b);
    return arr[arr.length >> 1];
  };
  return [med(rs), med(gs), med(bs)];
}

export function meanColor(img, rect) {
  let r = 0; let g = 0; let b = 0; let n = 0;
  for (let yy = rect.y; yy < rect.y + rect.h; yy++) {
    for (let xx = rect.x; xx < rect.x + rect.w; xx++) {
      if (xx < 0 || yy < 0 || xx >= img.width || yy >= img.height) continue;
      const i = (yy * img.width + xx) * 4;
      r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++;
    }
  }
  if (!n) return [0, 0, 0];
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

/** Most frequent quantised colours inside a rect, with share of pixels. */
export function topColors(img, rect, limit = 10, step = 1) {
  const counts = new Map();
  let total = 0;
  for (let yy = rect.y; yy < rect.y + rect.h; yy++) {
    for (let xx = rect.x; xx < rect.x + rect.w; xx += step) {
      if (xx < 0 || yy < 0 || xx >= img.width || yy >= img.height) continue;
      const i = (yy * img.width + xx) * 4;
      const key = (img.data[i] >> 2 << 12) | (img.data[i + 1] >> 2 << 6) | (img.data[i + 2] >> 2);
      let e = counts.get(key);
      if (!e) { e = { n: 0, r: 0, g: 0, b: 0 }; counts.set(key, e); }
      e.n++; e.r += img.data[i]; e.g += img.data[i + 1]; e.b += img.data[i + 2];
      total++;
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, limit)
    .map((e) => ({ rgb: [Math.round(e.r / e.n), Math.round(e.g / e.n), Math.round(e.b / e.n)], count: e.n, share: +(e.n / total).toFixed(4) }));
}

/** Bounding box of set pixels inside a region, or null. */
export function bboxOfMask(mask, w, h, region = null) {
  const x0 = region ? Math.max(0, region.x) : 0;
  const y0 = region ? Math.max(0, region.y) : 0;
  const x1 = region ? Math.min(w - 1, region.x + region.w - 1) : w - 1;
  const y1 = region ? Math.min(h - 1, region.y + region.h - 1) : h - 1;
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity; let count = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (mask[y * w + x]) {
        count++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!count) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, count };
}

/**
 * Connected clusters of a binary mask, coarsened on a block grid so that dense
 * UI areas merge into one region instead of thousands of tiny blobs.
 * Returns clusters sorted by pixel count: { x, y, w, h, pixels, share }.
 */
export function clusteredBlocks(binary, w, h, { block = 16, minPixels = 40 } = {}) {
  const bw = Math.ceil(w / block);
  const bh = Math.ceil(h / block);
  const counts = new Int32Array(bw * bh);
  for (let y = 0; y < h; y++) {
    const by = (y / block) | 0;
    for (let x = 0; x < w; x++) {
      if (binary[y * w + x]) counts[by * bw + ((x / block) | 0)]++;
    }
  }
  const active = new Uint8Array(bw * bh);
  for (let i = 0; i < counts.length; i++) if (counts[i] >= minPixels) active[i] = 1;

  const seen = new Uint8Array(bw * bh);
  const clusters = [];
  const stack = [];
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const idx = by * bw + bx;
      if (!active[idx] || seen[idx]) continue;
      stack.length = 0;
      stack.push(idx);
      seen[idx] = 1;
      let minBx = bx; let maxBx = bx; let minBy = by; let maxBy = by; let pixels = 0;
      while (stack.length) {
        const cur = stack.pop();
        const cy = (cur / bw) | 0;
        const cx = cur - cy * bw;
        pixels += counts[cur];
        if (cx < minBx) minBx = cx;
        if (cx > maxBx) maxBx = cx;
        if (cy < minBy) minBy = cy;
        if (cy > maxBy) maxBy = cy;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
            const ni = ny * bw + nx;
            if (active[ni] && !seen[ni]) { seen[ni] = 1; stack.push(ni); }
          }
        }
      }
      clusters.push({
        x: minBx * block,
        y: minBy * block,
        w: Math.min(w, (maxBx + 1) * block) - minBx * block,
        h: Math.min(h, (maxBy + 1) * block) - minBy * block,
        pixels,
      });
    }
  }
  const total = w * h;
  return clusters
    .sort((a, b) => b.pixels - a.pixels)
    .map((c) => ({ ...c, share: +(c.pixels / total).toFixed(5) }));
}
