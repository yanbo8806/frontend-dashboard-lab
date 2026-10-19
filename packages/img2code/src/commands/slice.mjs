// `img2code slice` - cut named rectangles out of a reference screenshot with no
// resampling, then verify every written asset is pixel-identical to its source
// rectangle (crop verification: 0 differing pixels).
import fs from 'node:fs';
import path from 'node:path';
import {
  readPng, writePng, crop, countExactPixelDiffs, sha256File, readJson, writeJson, toHex, ensureDir,
} from '../lib/png.mjs';
import { meanColor, medianColor } from '../lib/detect.mjs';
import { parseRegion } from './inspect.mjs';

export function runSlice(args, { out = console.log } = {}) {
  const specPath = args.flags.spec;
  if (!specPath) throw new Error('slice requires --spec <assets.json>');
  const spec = readJson(specPath);
  const sourcePath = args.flags.source ?? args.positional[0] ?? (spec.source ? path.resolve(path.dirname(specPath), spec.source) : null);
  if (!sourcePath) throw new Error('slice requires a source image (spec.source or first positional argument)');
  const outDir = args.flags.outDir ?? 'assets';
  const manifestPath = args.flags.manifest ?? path.join(outDir, 'manifest.json');
  const source = readPng(sourcePath);
  const sourceSha = sha256File(sourcePath);
  ensureDir(outDir);

  const assets = [];
  // 先校验整个清单，避免后面的坏坐标让本次裁切只写出一半文件。
  if (!Array.isArray(spec.assets) || !spec.assets.length) throw new Error('assets spec must contain a non-empty assets array');
  const names = new Set();
  for (const entry of spec.assets) {
    if (typeof entry.name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(entry.name)) throw new Error('asset name must be a simple file stem');
    if (names.has(entry.name)) throw new Error(`duplicate asset name: ${entry.name}`);
    names.add(entry.name);
    if (![entry.x, entry.y, entry.w, entry.h].every(Number.isInteger)) throw new Error(`asset ${entry.name} requires integer x/y/w/h`);
    parseRegion([entry.x, entry.y, entry.w, entry.h].join(','), source);
  }
  let failures = 0;
  for (const entry of spec.assets) {
    if (!entry.name) throw new Error('every asset needs a name');
    const rect = { x: entry.x, y: entry.y, w: entry.w, h: entry.h };
    if ([rect.x, rect.y, rect.w, rect.h].some((v) => typeof v !== 'number')) {
      throw new Error(`asset ${entry.name} needs numeric x/y/w/h`);
    }
    const cut = crop(source, rect.x, rect.y, rect.w, rect.h);
    const target = path.join(outDir, `${entry.name}.png`);
    writePng(target, cut);
    // Re-read from disk and compare with a fresh crop of the reference.
    const reread = readPng(target);
    const verify = countExactPixelDiffs(cut, reread);
    const rect2 = { x: entry.x, y: entry.y, w: entry.w, h: entry.h };
    const recut = crop(readPng(sourcePath), rect2.x, rect2.y, rect2.w, rect2.h);
    const identity = countExactPixelDiffs(reread, recut);
    const ok = verify.comparable && verify.diffs === 0 && identity.comparable && identity.diffs === 0;
    if (!ok) failures++;
    assets.push({
      name: entry.name,
      role: entry.role ?? 'page',
      group: entry.group ?? 'misc',
      label: entry.label ?? null,
      rect,
      file: path.relative(process.cwd(), target).replace(/\\/g, '/'),
      width: cut.width,
      height: cut.height,
      meanColor: toHex(meanColor(cut, { x: 0, y: 0, w: cut.width, h: cut.height })),
      medianColor: toHex(medianColor(cut, { x: 0, y: 0, w: cut.width, h: cut.height })),
      bytes: fs.statSync(target).size,
      sha256: sha256File(target),
      identicalToReference: ok,
      pixelDiffs: ok ? 0 : { vsWritten: verify.diffs, vsSourceRect: identity.diffs },
    });
  }

  const manifest = {
    tool: 'img2code slice',
    source: { path: sourcePath, sha256: sourceSha, width: source.width, height: source.height },
    outDir: path.relative(process.cwd(), outDir).replace(/\\/g, '/'),
    count: assets.length,
    groups: [...new Set(assets.map((a) => a.group))],
    allIdentical: failures === 0,
    assets,
  };
  writeJson(manifestPath, manifest);
  out(`sliced ${assets.length} assets into ${manifest.outDir} (groups: ${manifest.groups.join(', ')})`);
  out(`pixel-identity vs reference rect: ${manifest.allIdentical ? 'PASS (0 differing pixels in every asset)' : `FAIL (${failures} asset(s) differ)`}`);
  out(`manifest: ${manifestPath}`);
  return { code: failures === 0 ? 0 : 1, manifest };
}
