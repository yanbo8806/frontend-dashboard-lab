// `img2code shot` - deterministic, freeze-frame screenshot of a page.
// Animations are disabled, fonts/images awaited, viewport pinned, so two runs
// produce byte-identical PNGs. `--no-freeze` keeps animations running (used to
// prove that the live map layer actually animates).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from '../lib/serve.mjs';
import { sha256Bytes, ensureDir, writeJson } from '../lib/png.mjs';

const CHANNELS = ['chrome', 'msedge', null];

const FREEZE_SCRIPT = () => {
  // Runs inside the page before any other script.
  window.__img2codeFrozen = true;
  // 固定测试时钟和伪随机源；业务自定义的 Canvas 动画仍通过 freeze 钩子停止。
  const RealDate = Date;
  const epoch = 1792252800000;
  function FixedDate(...args) {
    if (!new.target) return new RealDate(epoch).toString();
    return Reflect.construct(RealDate, args.length ? args : [epoch], new.target);
  }
  Object.setPrototypeOf(FixedDate, RealDate);
  FixedDate.prototype = RealDate.prototype;
  FixedDate.now = () => epoch;
  window.Date = FixedDate;
  let seed = 123456789;
  Math.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const installStyles = () => {
    if (document.getElementById('img2code-freeze-style')) return;
    const style = document.createElement('style');
    style.id = 'img2code-freeze-style';
    style.textContent = '*,*::before,*::after{animation-delay:0s!important;animation-play-state:paused!important;transition:none!important;caret-color:transparent!important}';
    (document.head || document.documentElement)?.append(style);
  };
  const freeze = () => {
    installStyles();
    try {
      document.getAnimations().forEach((a) => { a.pause(); a.currentTime = 0; });
    } catch { /* older engines */ }
    window.dispatchEvent(new Event('img2code:freeze'));
    window.__img2codeFreeze?.();
  };
  document.addEventListener('DOMContentLoaded', freeze);
  window.addEventListener('load', freeze);
  setTimeout(freeze, 0);
  setTimeout(freeze, 60);
};

export async function launchBrowser({ channel = undefined, headless = true } = {}) {
  const args = [
    '--force-color-profile=srgb',
    '--force-device-scale-factor=1',
    '--hide-scrollbars',
    '--no-sandbox',
    '--disable-lcd-text',
    '--disable-features=CalculateNativeWinOcclusion',
  ];
  const attempts = channel === undefined ? CHANNELS : [channel];
  let lastError = null;
  for (const ch of attempts) {
    try {
      const browser = await chromium.launch({ headless, channel: ch ?? undefined, args });
      return { browser, channel: ch ?? 'bundled' };
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`no usable Chromium channel (tried: ${attempts.map((c) => c ?? 'bundled').join(', ')}): ${lastError}`);
}

/** Capture one PNG. Returns { buffer, consoleErrors, pageErrors, channel, url, stats }. */
export async function capture({
  url, width = 1871, height = 841, channel = undefined, settleMs = 300, timeoutMs = 30000,
  freeze = true, initScript = FREEZE_SCRIPT, readySelector = null,
} = {}) {
  const { browser, channel: used } = await launchBrowser({ channel });
  const consoleErrors = [];
  const pageErrors = [];
  try {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      reducedMotion: freeze ? 'reduce' : 'no-preference',
      colorScheme: 'dark',
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });
    if (freeze) await context.addInitScript(initScript);
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    const requestFailures = [];
    page.on('requestfailed', (request) => requestFailures.push(`${request.url()}: ${request.failure()?.errorText ?? 'failed'}`));
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => pageErrors.push(String(e && e.stack ? e.stack : e)));
    await page.goto(url, { waitUntil: 'load', timeout: timeoutMs });
    if (readySelector) await page.waitForSelector(readySelector, { state: 'visible', timeout: timeoutMs });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await page.evaluate(async ({ shouldFreeze, limit }) => {
      let timer;
      try {
        await Promise.race([
          Promise.all([document.fonts?.ready, ...[...document.images].map(i => i.decode?.())]),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Timed out waiting for fonts/images')), limit); }),
        ]);
      } finally { clearTimeout(timer); }
      if (!shouldFreeze) return;
      document.getAnimations?.().forEach((a) => { try { a.pause(); a.currentTime = 0; } catch { /* noop */ } });
      window.__img2codeFreeze?.();
      window.dispatchEvent(new Event('img2code:freeze'));
    }, { shouldFreeze: freeze, limit: timeoutMs });
    await page.waitForTimeout(settleMs);
    const buffer = await page.screenshot({
      type: 'png',
      animations: freeze ? 'disabled' : 'allow',
      caret: 'hide',
      clip: { x: 0, y: 0, width, height },
    });
    const stats = await page.evaluate(() => {
      const el = document.getElementById('stage') || document.body;
      const r = el.getBoundingClientRect();
      return {
        stage: { width: Math.round(r.width), height: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) },
        images: [...document.images].map(i => ({ src: i.getAttribute('src'), width: i.naturalWidth, height: i.naturalHeight, loaded: i.complete && i.naturalWidth > 0 })),
        fonts: [...document.fonts].map(f => ({ family: f.family, status: f.status })),
        scroll: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
        liveMapStats: window.__liveMapStats
          ? { ...window.__liveMapStats, frames: typeof window.__liveMapStats.frames === 'function' ? window.__liveMapStats.frames() : undefined }
          : null,
        frozen: !!window.__img2codeFrozen,
        version: window.__img2codeVersion ?? null,
      };
    });
    return { buffer, consoleErrors, pageErrors, requestFailures, channel: used, url, stats };
  } finally {
    await browser.close();
  }
}

export async function runShot(args, { out = console.log } = {}) {
  const outFile = args.flags.out ?? 'shot.png';
  const width = Number(args.flags.width ?? 1871);
  const height = Number(args.flags.height ?? 841);
  const repeat = Number(args.flags.repeat ?? 1);
  const query = args.flags.query ?? '';
  const settleMs = Number(args.flags.settle ?? 300);
  const timeoutMs = Number(args.flags.timeout ?? 30000);
  const channel = args.flags.channel ?? undefined;
  const freeze = !args.flags.noFreeze;
  const readySelector = args.flags.ready ?? null;
  for (const [key, value, min] of [['width', width, 1], ['height', height, 1], ['repeat', repeat, 1], ['settle', settleMs, 0], ['timeout', timeoutMs, 1]]) {
    if (!Number.isInteger(value) || value < min) throw new Error(`${key} must be an integer >= ${min}`);
  }
  if (repeat > 20 || width * height > 32000000) throw new Error('shot limit: repeat <= 20 and canvas <= 32 megapixels');
  if (!/.png$/i.test(outFile)) throw new Error('--out must end in .png');

  let url = args.flags.url ?? null;
  let server = null;
  if (!url) {
    const serveDir = args.flags.serveDir;
    if (!serveDir) throw new Error('shot requires --url <url> or --serve-dir <dir>');
    server = await startStaticServer(serveDir);
    const rel = args.flags.path ?? 'index.html';
    url = server.url + rel.replace(/^\//, '') + query;
  }

  try {
    ensureDir(path.dirname(path.resolve(outFile)));
    const runs = [];
    let firstStats = null;
    for (let i = 0; i < Math.max(1, repeat); i++) {
      const shot = await capture({ url, width, height, channel, settleMs, timeoutMs, freeze, readySelector });
      const file = repeat > 1 ? outFile.replace(/\.png$/i, `.run${i + 1}.png`) : outFile;
      fs.writeFileSync(file, shot.buffer);
      runs.push({
        run: i + 1, file, sha256: sha256Bytes(shot.buffer), bytes: shot.buffer.length,
        consoleErrors: shot.consoleErrors, pageErrors: shot.pageErrors, channel: shot.channel,
        requestFailures: shot.requestFailures,
      });
      if (!firstStats) firstStats = shot.stats;
      if (i === 0) fs.writeFileSync(outFile, shot.buffer);
    }
    const deterministic = runs.length > 1 ? runs.every((r) => r.sha256 === runs[0].sha256) : null;
    const report = {
      tool: 'img2code shot',
      url,
      viewport: { width, height, deviceScaleFactor: 1 },
      freeze,
      channel: runs[0].channel,
      runs,
      deterministic,
      consoleErrors: runs.flatMap(r => r.consoleErrors),
      pageErrors: runs.flatMap(r => r.pageErrors),
      requestFailures: runs.flatMap(r => r.requestFailures),
      page: firstStats,
      output: outFile,
    };
    if (args.flags.json) writeJson(args.flags.json, report);
    out(`shot: ${outFile}  ${width}x${height}  channel=${runs[0].channel}  freeze=${freeze}  sha256=${runs[0].sha256.slice(0, 16)}…`);
    out(`console errors: ${runs[0].consoleErrors.length}  page errors: ${runs[0].pageErrors.length}`);
    for (const e of runs[0].consoleErrors.slice(0, 10)) out(`  [console] ${e}`);
    for (const e of runs[0].pageErrors.slice(0, 5)) out(`  [pageerror] ${e.split('\n')[0]}`);
    if (firstStats?.stage) out(`stage: ${firstStats.stage.width}x${firstStats.stage.height} @${firstStats.stage.x},${firstStats.stage.y}`);
    if (firstStats?.liveMapStats) out(`liveMapStats: ${JSON.stringify(firstStats.liveMapStats)}`);
    if (deterministic !== null) out(`determinism over ${runs.length} runs: ${deterministic ? 'PASS (byte-identical)' : 'FAIL (runs differ)'}`);
    const failed = report.consoleErrors.length > 0 || report.pageErrors.length > 0 || report.requestFailures.length > 0 || deterministic === false;
    return { code: failed ? 1 : 0, report };
  } finally {
    if (server) await server.close();
  }
}
