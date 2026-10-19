import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathIssues, textIssues } from '../scripts/check-release.mjs';
import { checkSkill } from '../scripts/check-skill.mjs';

test('发布检查拒绝私有文件、旧照片与生成目录', () => {
  for (const file of ['apps/dashboard/node_modules/a.js', '.tools/tool.exe', 'apps/dashboard/dist/index.html', '.env.local', 'local.keystore', 'sample.apk', 'apps/dashboard/public/media/qianling.jpg']) {
    assert.ok(pathIssues(file).length > 0, file);
  }
  for (const file of ['README.md', 'apps/dashboard/src/main.js', 'apps/dashboard/public/media/demo-1.svg', '.env.example']) assert.deepEqual(pathIssues(file), []);
});

test('内容扫描发现疑似凭据但不返回凭据内容', () => {
  const fakeToken = ['ghp', '_', 'a'.repeat(36)].join('');
  assert.deepEqual(textIssues(fakeToken), ['疑似 GitHub 凭据']);
  assert.ok(!JSON.stringify(textIssues(fakeToken)).includes(fakeToken));
  assert.deepEqual(textIssues('-----BEGIN ' + 'PRIVATE KEY-----'), ['私钥内容']);
  assert.deepEqual(textIssues('C:/' + 'Users/example/file.js'), ['本机用户/工作区绝对路径']);
  assert.deepEqual(textIssues('const token = getToken();'), []);
});

test('技能工具可独立分发，快照与开发源一致', () => {
  const result = checkSkill();
  assert.deepEqual(result.errors, []);
  assert.ok(result.checked >= 15);
});

test('默认图片全部是仓库内实际存在的教学资源', () => {
  const app = new URL('../apps/dashboard/', import.meta.url);
  const config = JSON.parse(fs.readFileSync(new URL('public/config/dashboard.json', app)));
  const rows = [...config.attractions, ...config.origins];
  assert.equal(rows.length, 10);
  for (const row of rows) {
    assert.match(row.image, /^media\/demo-[1-5]\.svg$/);
    const svg = fs.readFileSync(new URL('public/' + row.image, app), 'utf8');
    assert.ok(svg.startsWith('<svg'));
    assert.ok(!/<script|https?:/i.test(svg.replace('http://www.w3.org/2000/svg', '')));
  }
});
