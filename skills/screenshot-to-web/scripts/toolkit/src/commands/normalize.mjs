// 将 JPEG/WebP 解码为原尺寸 PNG；保留源文件哈希，绝不把格式转换说成字节相同。
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from './shot.mjs';
import { readPng, writePng, writeJson, sha256File, ensureDir } from '../lib/png.mjs';

export async function runNormalize(args, { out = console.log } = {}) {
  const source = args.positional[0];
  if (!source) throw new Error('normalize requires an input image');
  const target = args.flags.out ?? 'reference/ref.png';
  if (!/.png$/i.test(target)) throw new Error('normalize output must end in .png');
  if (path.resolve(source) === path.resolve(target)) throw new Error('source and output must be different files');
  const ext = path.extname(source).toLowerCase();
  let width, height;
  if (ext === '.png') {
    const image = readPng(source);
    ({ width, height } = image);
    writePng(target, image);
  } else {
    const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[ext];
    if (!mime) throw new Error('supported inputs: PNG, JPEG, WebP');
    const dataUrl = `data:${mime};base64,${fs.readFileSync(source).toString('base64')}`;
    const { browser } = await launchBrowser();
    try {
      const page = await browser.newPage();
      const result = await page.evaluate(async url => {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        if (canvas.width * canvas.height > 32000000) throw new Error('image exceeds 32 megapixels');
        canvas.getContext('2d').drawImage(image, 0, 0);
        return { width: canvas.width, height: canvas.height, png: canvas.toDataURL('image/png').split(',')[1] };
      }, dataUrl);
      ({ width, height } = result);
      ensureDir(path.dirname(target));
      fs.writeFileSync(target, Buffer.from(result.png, 'base64'));
    } finally { await browser.close(); }
  }
  const report = { source, sourceSha256: sha256File(source), output: target, outputSha256: sha256File(target),
    canvas: { width, height }, resized: false, note: 'Decoded pixels; source bytes and colour encoding may differ.' };
  if (args.flags.json) writeJson(args.flags.json, report);
  out(`normalized: ${source} -> ${target}, ${width}x${height}, no resizing`);
  return { code: 0, report };
}
