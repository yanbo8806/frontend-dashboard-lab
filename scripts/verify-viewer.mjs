import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { launchBrowser } from '../packages/img2code/src/commands/shot.mjs';
import { startStaticServer } from '../packages/img2code/src/lib/serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'out/viewer');
const server = await startStaticServer(root);
const { browser, channel } = await launchBrowser();
const checks = [], errors = [];
try {
  await fs.mkdir(out, { recursive: true });
  for (const relative of ['packages/img2code', 'skills/screenshot-to-web/scripts/toolkit']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => errors.push('请求失败：' + request.url()));
    await page.goto(server.url + relative + '/viewer.html?example=1');
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('640×360'));
    const status = await page.locator('#status').textContent();
    assert.match(status, /RGB MAE (?!0\.00)/);
    assert.equal(await page.locator('#empty').isVisible(), false);
    const hashes = [];
    for (const mode of ['side', 'overlay', 'wipe', 'diff']) {
      await page.locator(`button[data-mode="${mode}"]`).click();
      assert.equal(await page.locator(`button[data-mode="${mode}"]`).getAttribute('aria-pressed'), 'true');
      const screenshot = await page.locator('#canvas').screenshot();
      hashes.push(createHash('sha256').update(screenshot).digest('hex'));
    }
    assert.equal(new Set(hashes).size, 4, '四种比较模式必须有真实不同的画布输出');
    await page.screenshot({ path: path.join(out, relative.startsWith('packages') ? 'package.png' : 'skill.png') });
    checks.push({ relative, status, modes: 4 });
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('PASS 开发工具和独立 Skill 的合成示例、四种比较模式，无旧项目依赖');
} finally {
  await fs.writeFile(path.join(out, 'verification.json'), JSON.stringify({ passed: checks.length === 2 && errors.length === 0, channel, checks, errors }, null, 2));
  await browser.close();
  await server.close();
}
