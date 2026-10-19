// 当前业务版验证；不拿新地图和旧全国截图做失去意义的像素比较。
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const steps=[
  ['unit',['--test','--test-timeout=60000',...fs.readdirSync(path.join(root,'tests')).filter(name=>name.endsWith('.test.mjs')).map(name=>path.join('tests',name))]],
  ['build',[path.join('node_modules','vite','bin','vite.js'),'build']],
  ['image-map',[path.join('tools','verify-image-map.mjs')],180000],
  ['browser',[path.join('tools','verify-app.mjs')],180000],
  ['terrain',[path.join('tools','verify-terrain.mjs')],180000],
  ['header-origins',[path.join('tools','verify-header-origins.mjs')],180000],
  ['template',[path.join('tools','build-template.mjs')]],
];
const results=[];
for(const [name,args,timeout=60000] of steps){
  // 浏览器脚本包含多个独立场景，外层给 180 秒；单元和构建仍为 60 秒。
  const start=Date.now();const result=spawnSync(process.execPath,args,{cwd:root,windowsHide:true,timeout,encoding:'utf8',maxBuffer:4*1024*1024});
  const output=(result.stdout||'')+(result.stderr||'');process.stdout.write(output);
  results.push({name,passed:result.status===0,timeoutMs:timeout,ms:Date.now()-start,exitCode:result.status,error:result.error?.message});
  if(result.status!==0)break;
}
const passed=results.length===steps.length&&results.every(step=>step.passed);
fs.mkdirSync(path.join(root,'out/app'),{recursive:true});fs.writeFileSync(path.join(root,'out/app/full-verification.json'),JSON.stringify({passed,results},null,2));
process.exitCode=passed?0:1;
