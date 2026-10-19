// 使用生产构建做真实浏览器交互验证，每个等待有明确上限；失败保留截图。
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {launchBrowser} from '../../../packages/img2code/src/commands/shot.mjs';
import {startServer} from './server.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'out/app');
await fs.mkdir(out,{recursive:true});
const server=await startServer({port:0}),port=server.address().port;
const {browser,channel}=await launchBrowser();
const context=await browser.newContext({viewport:{width:1871,height:841},locale:'zh-CN',timezoneId:'Asia/Shanghai'});
const page=await context.newPage();page.setDefaultTimeout(15000);
const errors=[],requests=[],checks=[],cancelledTiles=[],httpErrors=[];
let activeCheck='初始化';
const cameraChecks=new Set(['2D/3D 与拖动平移可用','景点照片与地图聚焦联动','缩放舞台下地图仍然响应鼠标平移']);
page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
page.on('requestfailed',request=>{
  const url=request.url(),reason=request.failure()?.errorText;
  // MapLibre TileManager#_removeTile:774 会主动 abort 离屏且未完成的瓦片。
  // 仅相机用例内、本机地形 PNG 的 ERR_ABORTED 进入单独账本，结尾逐个重新验证 HTTP/PNG。
  if(reason==='net::ERR_ABORTED'&&cameraChecks.has(activeCheck)&&url.startsWith('http://127.0.0.1:'+port+'/terrain/xianyang/')&&url.endsWith('.png'))cancelledTiles.push({check:activeCheck,url,reason});
  else requests.push({check:activeCheck,url,reason});
});
page.on('response',response=>{if(response.status()>=400)httpErrors.push({url:response.url(),status:response.status()});});
async function settleMap(){
  await page.waitForFunction(()=>window.__dashboard?.mapStats?.state==='ready'&&window.__dashboard.inspectMap().tilesLoaded&&!window.__dashboard.inspectMap().moving);
  await page.waitForLoadState('networkidle');
}
async function check(name,run){
  activeCheck=name;
  // 每个场景等瓦片和相机资源稳定；任何 HTTP 错误、真实加载失败仍使整套回归失败。
  await settleMap();await run();await settleMap();
  checks.push(name);console.log('PASS '+name);
}
let failed;
try{
  await page.goto('http://127.0.0.1:'+port+'/?map=gis',{waitUntil:'networkidle'});
  await check('真实 3D GIS 已加载，5 景点、5 飞线、14 行政区',async()=>{
    await page.waitForFunction(()=>window.__dashboard?.mapStats?.state==='ready');
    const stats=await page.evaluate(()=>window.__dashboard.mapStats);assert.equal(stats.lines,5);assert.equal(stats.attractions,5);assert.equal(stats.districts,14);assert.ok(stats.frames>0);
    assert.equal(stats.terrain.state,'ready');assert.equal(stats.outerRings,1);assert.equal(stats.outerSegments,1337);
    assert.equal(stats.flightStyle.units,'screen-pixels');assert.equal(stats.flightStyle.layers,4);
    assert.ok(stats.terrain.samples.every(point=>Number.isFinite(point.elevation)&&point.elevation>300));
    await page.waitForFunction(()=>[...document.querySelectorAll('.wall-img')].every(image=>image.complete&&image.naturalWidth>0));
    const bounds=await page.locator('.gis-map').boundingBox();
    for(const marker of await page.locator('.poi-marker[data-poi]').all()){const box=await marker.boundingBox();assert.ok(box.x>=bounds.x&&box.x+box.width<=bounds.x+bounds.width&&box.y>=bounds.y&&box.y+box.height<bounds.y+bounds.height-45,'景点必须完整显示');}
  });
  await page.screenshot({path:path.join(out,'dashboard.png')});
  await check('动态箭头确实移动，暂停后停止推进',async()=>{
    const start=await page.evaluate(()=>window.__dashboard.mapStats.elapsed);await page.waitForFunction(value=>window.__dashboard.mapStats.elapsed>value+100,start);
    await page.getByRole('button',{name:'暂停飞线',exact:true}).click();const frozen=await page.evaluate(()=>window.__dashboard.mapStats.elapsed);await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.__dashboard.mapStats.elapsed),frozen);
  });
  await check('2D/3D 与拖动平移可用',async()=>{
    await page.getByRole('button',{name:'2D',exact:true}).click();await page.waitForFunction(()=>window.__dashboard.view().pitch<1);
    await page.getByRole('button',{name:'3D',exact:true}).click();await page.waitForFunction(()=>window.__dashboard.view().pitch>40);
    const before=await page.evaluate(()=>window.__dashboard.view().center);await page.mouse.move(900,600);await page.mouse.down();await page.mouse.move(950,620,{steps:10});await page.mouse.up();
    const after=await page.evaluate(()=>window.__dashboard.view().center);assert.notDeepEqual(after,before);
    await page.getByRole('button',{name:'复位',exact:true}).click();
  });
  await check('景点照片与地图聚焦联动',async()=>{
    await page.getByRole('button',{name:'查看乾陵',exact:true}).click();await page.waitForFunction(()=>window.__dashboard.view().zoom>10.4);
    assert.equal(await page.locator('.detail-title').textContent(),'乾陵');assert.equal(await page.locator('.poi-marker.selected').count(),1);
    await page.screenshot({path:path.join(out,'selected.png')});
  });
  await check('表单编辑、保存、刷新持久化',async()=>{
    await page.getByRole('button',{name:'数据配置',exact:true}).click();await page.locator('[data-field="meta.title"]').fill('咸阳配置验证');
    await page.getByRole('button',{name:'保存并应用',exact:true}).click();await page.waitForFunction(()=>document.querySelector('h1')?.textContent==='咸阳配置验证');
    await settleMap();await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('h1').textContent(),'咸阳配置验证');
  });
  await check('无效坐标显示具体字段，拒绝应用',async()=>{
    await page.getByRole('button',{name:'数据配置',exact:true}).click();await page.getByRole('button',{name:'景点与图片',exact:true}).click();await page.locator('[data-field="latitude"]').first().fill('999');
    await page.getByRole('button',{name:'保存并应用',exact:true}).click();assert.match(await page.locator('.config-message').textContent(),/latitude/);
    await page.locator('[data-field="latitude"]').first().fill('34.5751');
  });
  await check('上传图片、景点改名和飞线名称同步',async()=>{
    await page.locator('.attraction-editor').first().locator('[data-field="name"]').fill('乾陵测试');
    await page.locator('input[aria-label="上传乾陵图片"]').setInputFiles(path.join(root,'public/media/xianyang-scene-map.png'));
    await page.waitForFunction(()=>document.querySelector('.config-message')?.textContent.includes('图片已压缩'));
    await page.getByRole('button',{name:'保存并应用',exact:true}).click();
    await page.waitForFunction(()=>window.__dashboard.config.attractions[0].image.startsWith('data:image/'));
    assert.match(await page.locator('.routes-list').textContent(),/乾陵测试/);
  });
  await check('Excel Worker 导出与导入完整运行',async()=>{
    await page.getByRole('button',{name:'数据配置',exact:true}).click();await page.getByRole('button',{name:'导入 / API',exact:true}).click();
    const pending=page.waitForEvent('download');await page.getByRole('button',{name:'下载 Excel 模板',exact:true}).click();const download=await pending;const file=path.join(out,'roundtrip.xlsx');await download.saveAs(file);
    await page.locator('#config-import').setInputFiles(file);await page.waitForFunction(()=>document.querySelector('.config-message')?.textContent.includes('导入校验通过'));
    await page.screenshot({path:path.join(out,'config-import.png')});
    page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'载入默认配置',exact:true}).click();
    await page.getByRole('button',{name:'保存并应用',exact:true}).click();await page.waitForFunction(()=>window.__dashboard.config.meta.title==='咸阳文旅运行态势');
  });
  await check('演示 API 拉取、预览、应用与状态更新',async()=>{
    await page.getByRole('button',{name:'数据配置',exact:true}).click();await page.getByRole('button',{name:'导入 / API',exact:true}).click();
    await page.getByRole('button',{name:'填入本机演示 API',exact:true}).click();await page.getByRole('button',{name:'测试接口并预览',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.config-message')?.textContent.includes('API 校验通过'));
    await page.getByRole('button',{name:'保存并应用',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.data-status')?.textContent.includes('API 已同步'));
    assert.equal(await page.locator('.data-badge').textContent(),'演示 API 数据');
  });
  await check('API 错误保留现有数据，JSON 文本不会执行 HTML，Token 不持久化',async()=>{
    await page.getByRole('button',{name:'数据配置',exact:true}).click();await page.getByRole('button',{name:'导入 / API',exact:true}).click();
    await page.locator('[data-field="api.token"]').fill('test-token-never-persist');
    await page.locator('[data-field="dataSource.url"]').fill('api/bad-data');
    await page.route('**/api/bad-data',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({data:{trend:{categories:['wrong']}}})}));
    await page.getByRole('button',{name:'测试接口并预览',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.config-message')?.textContent.includes('数量必须'));
    assert.equal(await page.locator('h1').textContent(),'咸阳文旅运行态势');
    await page.locator('[data-field="dataSource.url"]').fill('api/dashboard');await page.locator('[data-field="dataSource.mode"]').selectOption('local');
    await page.getByRole('button',{name:'完整 JSON',exact:true}).click();
    const input=page.getByRole('textbox',{name:'完整配置 JSON',exact:true});const draft=JSON.parse(await input.inputValue());
    draft.meta.title='<img onerror=alert(1)>';draft.map.boundaryAttribution='<details open onload=1 ontoggle=alert(1)>';
    await input.fill(JSON.stringify(draft));await page.getByRole('button',{name:'保存并应用',exact:true}).click();await page.waitForFunction(()=>window.__dashboard?.mapStats.state==='ready');
    assert.equal(await page.locator('h1 img').count(),0);assert.equal(await page.locator('.map-attribution details').count(),0);
    assert.equal(await page.evaluate(()=>JSON.stringify(localStorage).includes('test-token-never-persist')),false);
  });
  await check('配置侧栏在窄屏可用，不溢出窗口',async()=>{
    await page.setViewportSize({width:480,height:850});await page.getByRole('button',{name:'数据配置',exact:true}).click();
    const bounds=await page.locator('.config-dialog').boundingBox();assert.ok(bounds.width<=480);assert.ok(bounds.height<=850);
    await page.waitForTimeout(300);await page.screenshot({path:path.join(out,'config-mobile.png')});
  });
  await check('缩放舞台下地图仍然响应鼠标平移',async()=>{
    await page.getByRole('button',{name:'关闭',exact:true}).click();await page.setViewportSize({width:1366,height:768});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const bounds=await page.locator('.gis-map').boundingBox(),before=await page.evaluate(()=>window.__dashboard.view().center);
    // 固定在空白地图表面拖动，不让新增的 POI 标签截获按下事件。
    const x=bounds.x+bounds.width*.18,y=bounds.y+bounds.height*.25;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+40,y+25,{steps:10});await page.mouse.up();
    assert.notDeepEqual(await page.evaluate(()=>window.__dashboard.view().center),before);
  });
  for(const tile of cancelledTiles){const response=await fetch(tile.url,{signal:AbortSignal.timeout(5000)});const bytes=Buffer.from(await response.arrayBuffer());tile.recheck={status:response.status,png:bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a'};assert.equal(tile.recheck.status,200);assert.equal(tile.recheck.png,true);}
  assert.deepEqual(errors,[],'浏览器错误');assert.deepEqual(requests,[],'请求错误');assert.deepEqual(httpErrors,[],'HTTP 错误');
}catch(error){failed=error;console.error(error.stack);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
finally{await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({passed:!failed,channel,checks,errors,requests,httpErrors,cancelledTiles,failure:failed?.message},null,2));await browser.close();await new Promise(resolve=>server.close(resolve));}
if(failed)process.exitCode=1;
