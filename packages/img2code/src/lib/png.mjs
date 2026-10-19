// PNG read/write/crop helpers plus byte-level comparison utilities.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

/** Read a PNG into { width, height, data: Uint8Array(RGBA) }. */
export function readPng(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}

/** Write an { width, height, data } image as a PNG. */
export function writePng(file, img) {
  ensureDir(path.dirname(file));
  const png = new PNG({ width: img.width, height: img.height, colorType: 6 });
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  fs.writeFileSync(file, PNG.sync.write(png, { colorType: 6, inputHasAlpha: true }));
  return file;
}

export function emptyImage(width, height) {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

/** Integer crop, no resampling. Coordinates are clamped to the image. */
export function crop(img, x, y, w, h) {
  const x0 = Math.max(0, Math.min(img.width - 1, Math.round(x)));
  const y0 = Math.max(0, Math.min(img.height - 1, Math.round(y)));
  const w0 = Math.max(0, Math.min(img.width - x0, Math.round(w)));
  const h0 = Math.max(0, Math.min(img.height - y0, Math.round(h)));
  const out = emptyImage(w0, h0);
  for (let row = 0; row < h0; row++) {
    const src = ((y0 + row) * img.width + x0) * 4;
    out.data.set(img.data.subarray(src, src + w0 * 4), row * w0 * 4);
  }
  return out;
}

export function pixelAt(img, x, y) {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

/** Count pixels whose RGBA triple differs at all (exact comparison). */
export function countExactPixelDiffs(a, b) {
  if (a.width !== b.width || a.height !== b.height) return { comparable: false, diffs: -1 };
  let diffs = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] ||
        a.data[i + 2] !== b.data[i + 2] || a.data[i + 3] !== b.data[i + 3]) diffs++;
  }
  return { comparable: true, diffs };
}

export function sha256File(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return file;
}

export function toHex([r, g, b]) {
  const h = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}
