// 隔离浏览器上下文检查地图视角，不触碰用户浏览器配置。
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchBrowser} from '../../../packages/img2code/src/commands/shot.mjs';
import {startServer} from './server.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'out/terrain-upgrade');
const defaults=JSON.parse(await fs.readFile(path.join(root,'public/config/dashboard.json'),'utf8'));
const server=await startServer({port:0});const {browser}=await launchBrowser();
const variants=[
  {name:'balanced-region',center:[108.51,34.62],zoom:8.4,pitch:48,bearing:-15},
  {name:'balanced-closer',center:[108.51,34.64],zoom:8.5,pitch:48,bearing:-15},
  {name:'balanced-detail',center:[108.51,34.58],zoom:8.65,pitch:48,bearing:-15},
];
try{
  for(const variant of variants){
    const context=await browser.newContext({viewport:{width:1871,height:841},locale:'zh-CN',reducedMotion:'reduce'});
    const page=await context.newPage();page.setDefaultTimeout(15000);
    await page.addInitScript(()=>window.__img2codeFrozen=true);
    await page.route('**/config/dashboard.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({...defaults,map:{...defaults.map,...Object.fromEntries(Object.entries(variant).filter(([key])=>key!=='name'))}})}));
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});
    await page.waitForFunction(()=>window.__dashboard?.mapStats?.state==='ready');
    await page.screenshot({path:path.join(out,variant.name+'.png')});
    console.log(JSON.stringify({variant,stats:await page.evaluate(()=>window.__dashboard.mapStats)}));
    await context.close();
  }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
