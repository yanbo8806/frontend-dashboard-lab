import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkSkill } from './check-skill.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const textExtensions = new Set(['.js', '.mjs', '.json', '.md', '.css', '.html', '.yml', '.yaml', '.svg', '.txt']);

export function pathIssues(file) {
  const normalized = file.replaceAll('\\', '/');
  const issues = [];
  if (/(^|\/)(node_modules|dist|out|outputs|\.tools|\.git)(\/|$)/.test(normalized)) issues.push('构建、依赖或本地工具产物');
  if (/(^|\/)\.env(?:\.|$)/.test(normalized) && !normalized.endsWith('.env.example')) issues.push('环境文件');
  if (/\.(apk|aab|keystore|jks|pem|key|p12|zip|log)$/i.test(normalized)) issues.push('不应发布的私有或生成文件类型');
  if (/\/media\/(qianling|tongyi|yuanjia|mawei|silkroad)\.jpg$/.test(normalized) || /\/media\/origin-[1-5]\.png$/.test(normalized)) issues.push('原项目授权未确认的照片');
  return issues;
}

export function textIssues(text) {
  const issues = [];
  // 只报告规则名，不把匹配到的凭据写入终端或报告。
  const githubToken = new RegExp(['gh', '[pousr]', '_', '[A-Za-z0-9]{30,}'].join(''));
  const fineGrainedToken = new RegExp(['github', '_pat_', '[A-Za-z0-9_]{30,}'].join(''));
  if (githubToken.test(text) || fineGrainedToken.test(text)) issues.push('疑似 GitHub 凭据');
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) issues.push('私钥内容');
  if (/[A-Za-z]:[\\/](?:Users[\\/]|a1[\\/])/i.test(text)) issues.push('本机用户/工作区绝对路径');
  return issues;
}

export function checkRelease(directory = root) {
  // Git 索引 + 未跟踪且未忽略的文件就是本次发布候选；不遍历原工作区。
  const listing = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: directory, encoding: 'utf8' });
  const files = [...new Set(listing.split('\0').filter(Boolean))];
  const failures = [];
  let bytes = 0;
  for (const file of files) {
    const target = path.resolve(directory, file);
    if (!target.startsWith(directory + path.sep)) { failures.push({ file, issues: ['路径越界'] }); continue; }
    const stat = fs.lstatSync(target);
    const issues = pathIssues(file);
    if (stat.isSymbolicLink()) issues.push('发布集合不能依赖本机符号链接');
    if (!stat.isFile()) {
      if (issues.length) failures.push({ file, issues });
      continue;
    }
    bytes += stat.size;
    if (stat.size > 50 * 1024 * 1024) issues.push('单文件大于 50MB，请单独规划资源分发');
    if (textExtensions.has(path.extname(file))) issues.push(...textIssues(fs.readFileSync(target, 'utf8')));
    if (issues.length) failures.push({ file, issues });
  }
  const skill = checkSkill(directory);
  if (!skill.passed) failures.push({ file: 'skills/screenshot-to-web', issues: skill.errors });
  return { passed: files.length > 0 && failures.length === 0, files: files.length, bytes, failures,
    note: '自动扫描不是完整密钥审计或版权审核；公开上传前仍需确认地图再分发权限。' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkRelease();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.passed ? 0 : 1;
}
