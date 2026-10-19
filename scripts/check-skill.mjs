import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeEntries = ['bin', 'src', 'viewer.html', 'package.json', 'package-lock.json'];

function filesBelow(directory, relative = '') {
  const target = path.join(directory, relative);
  if (fs.statSync(target).isFile()) return [relative];
  return fs.readdirSync(target).sort().flatMap(name => filesBelow(directory, path.join(relative, name)));
}

/** 同一工具两种分发方式：开发包与可独立安装的技能快照必须逐字节一致。 */
export function checkSkill(directory = root) {
  const skill = path.join(directory, 'skills/screenshot-to-web');
  const source = path.join(directory, 'packages/img2code');
  const snapshot = path.join(skill, 'scripts/toolkit');
  const errors = [];
  const entry = fs.readFileSync(path.join(skill, 'SKILL.md'), 'utf8').replaceAll('\r\n', '\n');
  const metadata = /^---\n([\s\S]*?)\n---/.exec(entry)?.[1] || '';
  if (!/^name: screenshot-to-web$/m.test(metadata)) errors.push('技能 name 必须与目录 screenshot-to-web 一致');
  if (!/^description: .+/m.test(metadata)) errors.push('技能需要明确的触发描述');
  for (const match of entry.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    if (/^https?:/.test(match[1])) continue;
    const target = path.resolve(skill, match[1].split('#')[0]);
    if (!target.startsWith(skill + path.sep) || !fs.existsSync(target)) errors.push('缺少或越界的技能参考：' + match[1]);
  }
  const metadataFile = path.join(skill, 'agents/openai.yaml');
  if (!fs.existsSync(metadataFile)) errors.push('缺少技能界面元数据');
  let checked = 0;
  for (const top of runtimeEntries) {
    const sources = filesBelow(source, top);
    const snapshots = filesBelow(snapshot, top);
    if (JSON.stringify(sources) !== JSON.stringify(snapshots)) errors.push('工具文件清单不同：' + top);
    for (const relative of sources) {
      const destination = path.join(snapshot, relative);
      if (!fs.existsSync(destination) || !fs.readFileSync(path.join(source, relative)).equals(fs.readFileSync(destination))) {
        errors.push('Skill 工具快照漂移：' + relative);
      }
      checked++;
    }
  }
  return { passed: errors.length === 0, checked, errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkSkill();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.passed ? 0 : 1;
}
