// 地形专项验收：真实瓦片、图层、落点、错误边界、旧配置与冻结输出均检查。
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {PNG} from '../../../packages/img2code/node_modules/pngjs/lib/png.js';
import {launchBrowser} from '../../../packages/img2code/src/commands/shot.mjs';
import {startServer} from './server.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'out/terrain-upgrade');
const defaults=JSON.parse(await fs.readFile(path.join(root,'public/config/dashboard.json'),'utf8'));
await fs.mkdir(out,{recursive:true});
const server=await startServer({port:0}),url='http://127.0.0.1:'+server.address().port;
const {browser,channel}=await launchBrowser();
const checks=[],scenarios=[],unexpected=[];let failure;
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
async function open(name,{mapPatch={},saved,broken=false}={}){
  const context=await browser.newContext({viewport:{width:1871,height:841},deviceScaleFactor:1,reducedMotion:'reduce',locale:'zh-CN',timezoneId:'Asia/Shanghai'});
  const page=await context.newPage();page.setDefaultTimeout(15000);
  const record={name,errors:[],requestFailures:[],httpErrors:[],external:[],demRequests:0,reliefRequests:0};scenarios.push(record);
  await page.addInitScript(savedConfig=>{window.__img2codeFrozen=true;if(savedConfig)localStorage.setItem('xianyang-dashboard.config.v1',JSON.stringify(savedConfig));},saved);
  page.on('pageerror',error=>record.errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')record.errors.push(message.text());});
  page.on('requestfailed',request=>record.requestFailures.push({url:request.url(),error:request.failure()?.errorText}));
  page.on('response',response=>{if(response.status()>=400)record.httpErrors.push({url:response.url(),status:response.status()});});
  page.on('request',request=>{const target=request.url();if(target.includes('/dem/'))record.demRequests++;if(target.includes('/relief/'))record.reliefRequests++;if(target.startsWith('http')&&!target.startsWith(url+'/'))record.external.push(target);});
  await page.route('**/config/dashboard.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({...defaults,map:{...defaults.map,...mapPatch}})}));
  if(broken)await page.route('**/terrain/xianyang/dem/**',route=>route.fulfill({status:503,contentType:'text/plain',body:'deliberate terrain failure'}));
  await page.goto(url+'/?map=gis',{waitUntil:'networkidle'});
  if(!broken){
    await page.waitForFunction(()=>window.__dashboard?.mapStats?.state==='ready'&&window.__dashboard.inspectMap().tilesLoaded&&!window.__dashboard.inspectMap().moving);
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode()));});
    await page.waitForTimeout(350);
  }
  return {page,context,record};
}
async function finish({context,record},expectedFailure=false){
  if(!expectedFailure){assert.deepEqual(record.errors,[],record.name+' 浏览器错误');assert.deepEqual(record.requestFailures,[],record.name+' 请求失败');assert.deepEqual(record.httpErrors,[],record.name+' HTTP 错误');}
  assert.deepEqual(record.external,[],record.name+' 不应访问外部资源');
  await context.close();
}
async function check(name,run){await run();checks.push(name);console.log('PASS '+name);}
function texture(buffer,rect){
  const png=PNG.sync.read(buffer);let sum=0,square=0,gradient=0,count=0;
  const gray=(x,y)=>{const i=(y*png.width+x)*4;return png.data[i]*.2126+png.data[i+1]*.7152+png.data[i+2]*.0722;};
  for(let y=rect.y;y<rect.y+rect.h;y++)for(let x=rect.x;x<rect.x+rect.w;x++){const value=gray(x,y);sum+=value;square+=value*value;gradient+=Math.abs(value-gray(x+1,y));count++;}
  return {mean:sum/count,deviation:Math.sqrt(square/count-(sum/count)**2),meanHorizontalGradient:gradient/count};
}
try{
  const current=await open('default');
  const {page,record}=current;
  await check('默认本地 DEM 与晕渲真实加载，非等高挤出面，无外部请求',async()=>{
    const stats=await page.evaluate(()=>window.__dashboard.mapStats),inspection=await page.evaluate(()=>window.__dashboard.inspectMap());record.stats=stats;record.inspection=inspection;
    assert.equal(stats.terrain.state,'ready');assert.ok(record.demRequests>0);assert.ok(record.reliefRequests>0);
    assert.equal(inspection.terrain.source,'terrain');assert.equal(inspection.layers.some(layer=>layer.type==='fill-extrusion'),false);
    assert.ok(inspection.layers.some(layer=>layer.type==='hillshade'));assert.equal(stats.outerRings,1);assert.equal(stats.outerSegments,1337);
    assert.equal(stats.flightStyle.coreWidth,3.2);assert.equal(stats.flightStyle.layers,4);assert.equal(stats.flightStyle.units,'screen-pixels');
    for(const point of stats.terrain.samples){assert.ok(point.elevation>300);const route=defaults.routes.find(route=>route.toId===point.id);const flight=stats.flightElevations.find(flight=>flight.id===route.id);assert.ok(Math.abs(flight.end-point.elevation-35)<.01);}
    assert.match(await page.locator('.map-attribution').textContent(),/USGS/);
  });
  await page.screenshot({path:path.join(out,'after.png')});
  const first=await page.locator('.gis-map').screenshot({path:path.join(out,'after-map.png')});
  record.mapSha256=hash(first);record.dashboardSha256=hash(await fs.readFile(path.join(out,'after.png')));
  await check('截图冻结后飞线时钟保持为零，静态重复截图一致',async()=>{
    assert.equal(await page.evaluate(()=>window.__dashboard.mapStats.elapsed),0);
    const second=await page.locator('.gis-map').screenshot({path:path.join(out,'after-map-repeat.png')});
    record.repeatMapSha256=hash(second);assert.equal(hash(first),hash(second));
  });
  await check('全景包括完整行政区与景点，复位恢复配置视角',async()=>{
    await page.getByRole('button',{name:'全景',exact:true}).click();await page.waitForFunction(()=>window.__dashboard.inspectMap().tilesLoaded&&!window.__dashboard.inspectMap().moving);
    await page.waitForLoadState('networkidle');
    const bounds=await page.locator('.gis-map').boundingBox();
    for(const marker of await page.locator('.poi-marker[data-poi],.district-label').all()){const box=await marker.boundingBox();assert.ok(box.x>=bounds.x&&box.y>=bounds.y&&box.x+box.width<=bounds.x+bounds.width&&box.y+box.height<=bounds.y+bounds.height,'全景标记不可裁切');}
    await page.screenshot({path:path.join(out,'overview.png')});
    await page.getByRole('button',{name:'复位',exact:true}).click();await page.waitForLoadState('networkidle');
    assert.ok(Math.abs((await page.evaluate(()=>window.__dashboard.view().zoom))-defaults.map.zoom)<.02);
  });
  await finish(current);
  await check('旧浏览器配置保留业务内容、视角与显式值，仅补新增地形字段',async()=>{
    const saved=structuredClone(defaults);saved.meta.title='保留用户标题';saved.map.center=[108.51,34.43];saved.map.zoom=9.2;saved.map.terrainExaggeration=1.2;
    delete saved.map.terrainEnabled;delete saved.map.flightWidth;delete saved.map.terrainAttribution;
    const legacy=await open('legacy',{saved});const value=await legacy.page.evaluate(()=>window.__dashboard.config);
    assert.equal(value.meta.title,'保留用户标题');assert.deepEqual(value.map.center,saved.map.center);assert.equal(value.map.zoom,9.2);assert.equal(value.map.terrainExaggeration,1.2);
    assert.equal(value.map.terrainEnabled,true);assert.equal(value.map.flightWidth,3.2);
    assert.deepEqual(await legacy.page.evaluate(()=>JSON.parse(localStorage.getItem('xianyang-dashboard.config.v1'))),saved);
    const image=await legacy.page.screenshot({path:path.join(out,'matched-view.png')});
    // 在相同视角现场生成关闭地形的负对照，不依赖原机器留下的 before.png。
    await finish(legacy);
    const controlConfig={...saved,map:{...saved.map,terrainEnabled:false}};
    const control=await open('texture-control',{saved:controlConfig});
    assert.equal((await control.page.evaluate(()=>window.__dashboard.mapStats)).terrain.state,'disabled');
    const before=await control.page.screenshot({path:path.join(out,'before.png')});
    const rect={x:820,y:240,w:165,h:90};
    legacy.record.matchedTexture={rect,before:texture(before,rect),after:texture(image,rect)};
    assert.ok(legacy.record.matchedTexture.after.meanHorizontalGradient>legacy.record.matchedTexture.before.meanHorizontalGradient*2,'山地局部纹理梯度须明显高于纯色行政面');
    await finish(control);
  });
  await check('显式关闭地形时不取 DEM，不伪称真实高程就绪',async()=>{
    const disabled=await open('disabled',{mapPatch:{terrainEnabled:false}});
    const stats=await disabled.page.evaluate(()=>window.__dashboard.mapStats);assert.equal(stats.terrain.state,'disabled');assert.equal(disabled.record.demRequests,0);assert.equal(disabled.record.reliefRequests,0);
    assert.ok((await disabled.page.evaluate(()=>window.__dashboard.inspectMap().layers)).some(layer=>layer.type==='fill-extrusion'));
    await disabled.page.screenshot({path:path.join(out,'terrain-disabled.png')});await finish(disabled);
  });
  await check('DEM 503 显式报错，不能把行政区已绘制伪报为地形成功',async()=>{
    const broken=await open('dem-failure',{broken:true});
    await broken.page.waitForFunction(()=>window.__dashboard?.mapStats?.state==='error');
    assert.equal(await broken.page.locator('.gis-map').getAttribute('data-ready'),'false');
    assert.match(await broken.page.locator('.map-status.error').textContent(),/失败/);
    assert.ok(broken.record.httpErrors.length>0);assert.ok(broken.record.httpErrors.every(item=>item.status===503&&item.url.includes('/dem/')));
    assert.equal(await broken.page.evaluate(()=>window.__dashboard.mapStats.terrain.state),'error');
    await broken.page.screenshot({path:path.join(out,'dem-failure.png')});await finish(broken,true);
  });
}catch(error){failure=error;unexpected.push(error.stack);console.error(error.stack);}
finally{await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({passed:!failure,channel,checks,scenarios,unexpected},null,2));await browser.close();await new Promise(resolve=>server.close(resolve));}
if(failure)process.exitCode=1;
