import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(file => file.endsWith('.md'));
const failures = [];
let checked = 0;
for (const file of new Set(files)) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  for (const match of source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const link = match[1];
    if (/^(https?:|#)/.test(link)) continue;
    const target = path.resolve(root, path.dirname(file), decodeURIComponent(link.split('#')[0]));
    if (!target.startsWith(root + path.sep) || !fs.existsSync(target)) failures.push({ file, link });
    checked++;
  }
}
console.log(JSON.stringify({ passed: failures.length === 0, checked, failures }, null, 2));
process.exitCode = failures.length ? 1 : 0;
