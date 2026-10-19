// 图片场景专项：实际画布像素、鼠标/触屏、业务联动、冻结及旧 GIS 回切。
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {PNG} from '../../../packages/img2code/node_modules/pngjs/lib/png.js';
import {launchBrowser} from '../../../packages/img2code/src/commands/shot.mjs';
import {startServer} from './server.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'out/image-map');
await fs.mkdir(out,{recursive:true});
const server=await startServer({port:0}),url='http://127.0.0.1:'+server.address().port;
const {browser,channel}=await launchBrowser();
const checks=[],scenarios=[],measurements=[],contexts=[];let failure;
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
const defaults=JSON.parse(await fs.readFile(path.join(root,'public/config/dashboard.json'),'utf8'));

async function open(name,{reducedMotion='no-preference',frozen=false,saved,patch,viewport={width:1871,height:841},broken,webgl=false}={}){
  const context=await browser.newContext({viewport,reducedMotion,locale:'zh-CN',timezoneId:'Asia/Shanghai',hasTouch:true});contexts.push(context);
  await context.addInitScript(({frozen,saved,webgl})=>{
    window.__img2codeFrozen=frozen;if(saved)localStorage.setItem('xianyang-dashboard.config.v1',JSON.stringify(saved));
    if(webgl){const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...options){return kind.startsWith('webgl')?null:original.call(this,kind,...options);};}
  },{frozen,saved,webgl});
  const page=await context.newPage();page.setDefaultTimeout(12000);
  const record={name,errors:[],httpErrors:[],requestFailures:[],external:[],terrainRequests:0,maplibreRequests:0};scenarios.push(record);
  page.on('pageerror',error=>record.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')record.errors.push(message.text());});
  page.on('requestfailed',request=>record.requestFailures.push({url:request.url(),reason:request.failure()?.errorText}));
  page.on('response',response=>{if(response.status()>=400)record.httpErrors.push({url:response.url(),status:response.status()});});
  page.on('request',request=>{const target=request.url();if(target.includes('/terrain/'))record.terrainRequests++;if(target.includes('/maplibre-'))record.maplibreRequests++;if(target.startsWith('http')&&!target.startsWith(url+'/'))record.external.push(target);});
  if(patch)await page.route('**/config/dashboard.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(patch)}));
  if(broken)await page.route('**/media/xianyang-scene-'+broken+'.png',route=>route.fulfill({status:503,contentType:'text/plain',body:'deliberate artwork failure'}));
  await page.goto(url,{waitUntil:'networkidle'});
  if(!broken&&!webgl)await ready(page);
  return {context,page,record};
}
async function ready(page){
  await page.waitForFunction(()=>window.__dashboard?.mapStats?.state==='ready'&&window.__dashboard.mapStats.frames>0&&!window.__dashboard.inspectMap().moving);
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode()));});
  await page.waitForLoadState('networkidle');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
async function check(name,run){await run();checks.push(name);console.log('PASS '+name);}
async function finish({context,record},expectedError=false){
  if(!expectedError){assert.deepEqual(record.errors,[],record.name+' 浏览器错误');assert.deepEqual(record.httpErrors,[],record.name+' HTTP 错误');assert.deepEqual(record.requestFailures,[],record.name+' 请求失败');}
  assert.deepEqual(record.external,[],record.name+' 意外外部请求');await context.close();
}
function pixelMetrics(buffer){
  const png=PNG.sync.read(buffer);let count=0,sum=0,square=0,bright=0;
  for(let y=Math.floor(png.height*.1);y<png.height*.88;y+=2)for(let x=Math.floor(png.width*.09);x<png.width*.91;x+=2){
    const i=(y*png.width+x)*4,value=png.data[i]*.2126+png.data[i+1]*.7152+png.data[i+2]*.0722;sum+=value;square+=value**2;count++;if(png.data[i+1]>110&&png.data[i+2]>150)bright++;
  }
  return {width:png.width,height:png.height,mean:sum/count,deviation:Math.sqrt(square/count-(sum/count)**2),brightFraction:bright/count};
}
async function verifyBounds(page){
  const result=await page.evaluate(()=>{
    const map=document.querySelector('.gis-map').getBoundingClientRect(),scale=map.width/903;
    const rect=node=>{const box=node.getBoundingClientRect();return {x:(box.x-map.x)/scale,y:(box.y-map.y)/scale,w:box.width/scale,h:box.height/scale};};
    const nodes=[...document.querySelectorAll('.image-poi:not([hidden]) span,.map-mode-switch,.image-map-tools,.image-map .map-heading')];
    return {rects:nodes.map(node=>({name:node.textContent||node.getAttribute('aria-label'),...rect(node)})),visible:document.querySelectorAll('.image-poi[data-poi]:not([hidden])').length,canvas:rect(document.querySelector('.image-map-canvas')),scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth};
  });
  assert.equal(result.visible,5);assert.equal(result.scrollWidth,result.viewport);
  for(const box of result.rects)assert.ok(box.x>=0&&box.y>=0&&box.x+box.w<=903&&box.y+box.h<=646,'地图元素越界：'+box.name);
  for(let i=0;i<result.rects.length;i++)for(let j=i+1;j<result.rects.length;j++){
    const a=result.rects[i],b=result.rects[j];assert.ok(Math.min(a.x+a.w,b.x+b.w)<=Math.max(a.x,b.x)||Math.min(a.y+a.h,b.y+b.h)<=Math.max(a.y,b.y),'地图标签或控件重叠：'+a.name+' / '+b.name);
  }
  measurements.push(result);
}
try{
  const current=await open('interactive'),{page,record}=current;
  await check('默认图片版加载两张原图，旧 GIS 不请求瓦片、不创建画布',async()=>{
    const stats=await page.evaluate(()=>window.__dashboard.mapStats);
    assert.equal(stats.presentation,'image');assert.equal(stats.lines,5);assert.equal(stats.attractions,5);assert.equal(stats.coordinateMode,'artwork-illustration');
    assert.equal(Object.keys(stats.assets).length,2);for(const value of Object.values(stats.assets))assert.deepEqual(value,{width:1448,height:1086});
    assert.equal(record.terrainRequests,0);assert.equal(record.maplibreRequests,0);assert.equal(await page.locator('.maplibregl-canvas').count(),0);assert.equal(await page.locator('[data-mode=gis].map-presentation-layer').isHidden(),true);
    assert.equal(await page.evaluate(()=>window.__dashboard.view()),null);await verifyBounds(page);
    const bytes=await page.locator('.image-map-canvas').screenshot({path:path.join(out,'canvas.png')}),metrics=pixelMetrics(bytes);record.canvasMetrics=metrics;
    assert.ok(metrics.deviation>24);assert.ok(metrics.brightFraction>.025);assert.ok(metrics.mean>20);
  });
  await check('动画真实改变画布像素，暂停后时间与画面保持稳定',async()=>{
    const start=await page.evaluate(()=>window.__dashboard.mapStats.elapsed),first=await page.locator('.image-map-canvas').screenshot();
    await page.waitForFunction(value=>window.__dashboard.mapStats.elapsed>value+180,start);const next=await page.locator('.image-map-canvas').screenshot();assert.notEqual(hash(first),hash(next));
    await page.getByRole('button',{name:'暂停动画',exact:true}).click();await page.waitForTimeout(180);const elapsed=await page.evaluate(()=>window.__dashboard.mapStats.elapsed);
    const still=await page.locator('.image-map-canvas').screenshot();await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>window.__dashboard.mapStats.elapsed),elapsed);assert.equal(hash(still),hash(await page.locator('.image-map-canvas').screenshot()));
  });
  await check('前景与背景随鼠标产生有限视差，关闭视差后恢复正面',async()=>{
    // 指针落在可操作的地图表面，不落在新增的右上角路况按钮上。
    const rect=await page.locator('.image-map-surface').boundingBox();await page.mouse.move(rect.x+rect.width*.83,rect.y+rect.height*.67);
    await page.waitForFunction(()=>Math.abs(window.__dashboard.inspectMap().view.tilt[1])>.02);const bytes=await page.locator('.image-map-canvas').screenshot({path:path.join(out,'parallax.png')});
    await page.getByRole('button',{name:'视差',exact:true}).click();await page.waitForFunction(()=>Math.abs(window.__dashboard.inspectMap().view.tilt[1])<.001);
    assert.notEqual(hash(bytes),hash(await page.locator('.image-map-canvas').screenshot()));
  });
  await check('工具缩放、滚轮、拖动与复位生效，并限制画面范围',async()=>{
    await page.getByRole('button',{name:'放大地图',exact:true}).click();await page.waitForFunction(()=>window.__dashboard.inspectMap().view.zoom>1.1);
    const rect=await page.locator('.image-map-surface').boundingBox();await page.mouse.move(rect.x+rect.width*.17,rect.y+rect.height*.23);await page.mouse.wheel(0,-120);
    await page.waitForFunction(()=>window.__dashboard.inspectMap().view.zoom>1.17);
    await page.mouse.down();await page.mouse.move(rect.x+rect.width*.17+50,rect.y+rect.height*.23+25,{steps:8});await page.mouse.up();
    await page.waitForFunction(()=>Math.abs(window.__dashboard.inspectMap().view.pan[0])>25);
    await page.getByRole('button',{name:'复位',exact:true}).click();await ready(page);assert.ok(Math.abs((await page.evaluate(()=>window.__dashboard.inspectMap().view.zoom))-1)<.001);
  });
  await check('照片、线路和地图标记均可打开同一景点，选择后飞线联动',async()=>{
    await page.getByRole('button',{name:'查看乾陵',exact:true}).click();await page.waitForFunction(()=>window.__dashboard.inspectMap().view.zoom>1.19);
    assert.equal(await page.locator('.detail-title').textContent(),'乾陵');assert.equal(await page.locator('.image-poi.selected').getAttribute('data-poi'),'qianling');await ready(page);
    const mapBounds=await page.locator('.gis-map').boundingBox();
    for(const label of await page.locator('.image-poi:not([hidden]) span').all()){
      const rect=await label.boundingBox();assert.ok(rect.x>=mapBounds.x&&rect.x+rect.width<=mapBounds.x+mapBounds.width);assert.ok(rect.height<=30,'默认景点名聚焦后仍保持一行');
    }
    await page.screenshot({path:path.join(out,'selected.png')});
    await page.locator('.detail-close').click();await page.getByRole('button',{name:'全景',exact:true}).click();await ready(page);
    await page.getByRole('button',{name:'定位袁家村',exact:true}).click();assert.equal(await page.locator('.detail-title').textContent(),'袁家村');await page.locator('.detail-close').click();
    await page.locator('[data-route=r-mawei]').click();assert.equal(await page.locator('.detail-title').textContent(),'马嵬驿');await page.locator('.detail-close').click();await page.getByRole('button',{name:'全景',exact:true}).click();await ready(page);
  });
  await check('图片视角不写入 GIS 坐标；业务保存后仍是图片版',async()=>{
    await page.evaluate(()=>{window.__mapBeforeSave=window.__dashboard.mapStats;});
    await page.getByRole('button',{name:'数据配置',exact:true}).click();await page.getByRole('button',{name:'地图与飞线',exact:true}).click();
    await page.getByRole('button',{name:'使用当前地图视角',exact:true}).click();assert.match(await page.locator('.config-message').textContent(),/没有 GIS 经纬度视角/);
    await page.getByRole('button',{name:'基础与指标',exact:true}).click();await page.locator('[data-field="meta.title"]').fill('咸阳地图保存验证');await page.getByRole('button',{name:'保存并应用',exact:true}).click();await ready(page);
    assert.equal(await page.evaluate(()=>window.__mapBeforeSave===window.__dashboard.mapStats),true,'非地图字段保存不能重建场景');
    assert.deepEqual(await page.evaluate(()=>window.__dashboard.config.map),defaults.map);assert.equal(await page.evaluate(()=>window.__dashboard.inspectMap().mode),'image');
    await page.reload({waitUntil:'networkidle'});await ready(page);assert.equal(await page.evaluate(()=>window.__dashboard.inspectMap().mode),'image');
  });
  await check('旧 GIS 完整可回切，隐藏版无后台画布，刷新保留显式选择',async()=>{
    await page.getByRole('button',{name:'GIS 地图',exact:true}).click();await ready(page);
    assert.equal(await page.evaluate(()=>window.__dashboard.inspectMap().mode),'gis');assert.equal(await page.locator('.image-map-canvas').count(),0);assert.equal(await page.locator('.maplibregl-canvas').count(),1);
    const stats=await page.evaluate(()=>window.__dashboard.mapStats);assert.equal(stats.terrain.state,'ready');assert.equal(stats.districts,14);assert.equal(stats.lines,5);
    assert.ok(record.terrainRequests>0);assert.ok(new URL(page.url()).searchParams.get('map')==='gis');await page.screenshot({path:path.join(out,'retained-gis.png')});
    await page.reload({waitUntil:'networkidle'});await ready(page);assert.equal(await page.evaluate(()=>window.__dashboard.inspectMap().mode),'gis');
    await page.getByRole('button',{name:'立体场景',exact:true}).click();await ready(page);assert.equal(await page.locator('.maplibregl-canvas').count(),0);assert.equal(await page.locator('.image-map-canvas').count(),1);assert.equal(new URL(page.url()).searchParams.has('map'),false);
  });
  await finish(current);

  const still=await open('frozen',{frozen:true,reducedMotion:'reduce'});
  await check('截图冻结零动画，1871 / 1366 / 390 视口无空白、裁切或标注重叠',async()=>{
    for(const viewport of [{width:1871,height:841},{width:1366,height:768},{width:390,height:844}]){
      await still.page.setViewportSize(viewport);await ready(still.page);await verifyBounds(still.page);
      assert.equal(await still.page.evaluate(()=>window.__dashboard.mapStats.elapsed),0);
      await still.page.screenshot({path:path.join(out,'after-'+viewport.width+'.png')});
      const bytes=await still.page.locator('.gis-map').screenshot({path:path.join(out,'map-'+viewport.width+'.png')});const metrics=pixelMetrics(bytes);measurements.push({viewport,pixels:metrics});assert.ok(metrics.deviation>22);assert.ok(metrics.brightFraction>.02);
      const repeated=await still.page.locator('.gis-map').screenshot({path:path.join(out,'map-'+viewport.width+'-repeat.png')});assert.equal(hash(bytes),hash(repeated));
    }
  });
  await check('手机等比舞台的触屏点击与拖动仍可操作',async()=>{
    await still.page.getByRole('button',{name:'定位乾陵',exact:true}).tap();assert.equal(await still.page.locator('.detail-title').textContent(),'乾陵');
    await still.page.locator('.detail-close').tap();await still.page.getByRole('button',{name:'全景',exact:true}).tap();await ready(still.page);
    const bounds=await still.page.locator('.image-map-surface').boundingBox(),before=await still.page.evaluate(()=>window.__dashboard.inspectMap().view.pan);
    const cdp=await still.context.newCDPSession(still.page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:bounds.x+20,y:bounds.y+30}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:bounds.x+40,y:bounds.y+45}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await ready(still.page);assert.notDeepEqual(await still.page.evaluate(()=>window.__dashboard.inspectMap().view.pan),before);await cdp.detach();
  });
  await check('键盘操作和缩放上下限可用，复位恢复全图',async()=>{
    await still.page.setViewportSize({width:1871,height:841});await ready(still.page);
    const surface=still.page.locator('.image-map-surface');await surface.focus();await surface.press('Home');await surface.press('ArrowRight');await ready(still.page);
    assert.ok((await still.page.evaluate(()=>window.__dashboard.inspectMap().view.pan[0]))>10);
    for(let i=0;i<10;i++)await surface.press('+');await ready(still.page);assert.equal(await still.page.evaluate(()=>window.__dashboard.inspectMap().view.zoom),1.8);assert.equal(await still.page.getByRole('button',{name:'放大地图',exact:true}).isDisabled(),true);
    for(let i=0;i<12;i++)await surface.press('-');await ready(still.page);assert.equal(await still.page.evaluate(()=>window.__dashboard.inspectMap().view.zoom),.8);assert.equal(await still.page.getByRole('button',{name:'缩小地图',exact:true}).isDisabled(),true);
    await surface.press('Home');await ready(still.page);assert.equal(await still.page.evaluate(()=>window.__dashboard.inspectMap().view.zoom),1);await verifyBounds(still.page);
  });
  await finish(still);

  await check('系统减少动画设置停止自动运动，仍可主动缩放',async()=>{
    const reduced=await open('reduced-motion',{reducedMotion:'reduce'});
    assert.equal(await reduced.page.evaluate(()=>window.__dashboard.mapStats.elapsed),0);await reduced.page.getByRole('button',{name:'放大地图',exact:true}).click();await ready(reduced.page);
    assert.ok((await reduced.page.evaluate(()=>window.__dashboard.inspectMap().view.zoom))>1.1);assert.equal(await reduced.page.evaluate(()=>window.__dashboard.mapStats.elapsed),0);await finish(reduced);
  });
  await check('空景点、关闭标签、关闭线路和危险名称不伪造数据或执行 HTML',async()=>{
    const empty=structuredClone(defaults);empty.attractions=[];empty.routes=[];const session=await open('empty',{patch:empty,frozen:true});
    assert.equal(await session.page.locator('.image-poi[data-poi]').count(),0);assert.equal(await session.page.evaluate(()=>window.__dashboard.mapStats.lines),0);await finish(session);
    const patch=structuredClone(defaults);patch.attractions[0].name='<img onerror=alert(1)>';patch.map.showLabels=false;patch.routes.forEach(route=>route.enabled=false);
    const hidden=await open('hidden-labels',{patch,frozen:true});assert.equal(await hidden.page.locator('.image-poi[data-poi] .visually-hidden').count(),5);assert.equal(await hidden.page.locator('.image-poi img').count(),0);assert.equal(await hidden.page.evaluate(()=>window.__dashboard.mapStats.lines),0);await finish(hidden);
  });
  await check('图片加载失败和 WebGL 不可用明确报错，不能伪报就绪',async()=>{
    for(const options of [{broken:'background'},{webgl:true}]){
      const session=await open(options.webgl?'webgl-error':'asset-error',options);await session.page.waitForFunction(()=>window.__dashboard?.mapStats?.state==='error');
      assert.equal(await session.page.locator('.gis-map').getAttribute('data-ready'),'false');assert.match(await session.page.locator('.map-status.error').textContent(),/不可用/);
      await session.page.screenshot({path:path.join(out,session.record.name+'.png')});
      if(options.broken){assert.ok(session.record.httpErrors.length>0);assert.ok(session.record.httpErrors.every(error=>error.status===503&&error.url.includes('scene-background.png')));}
      await finish(session,true);
    }
  });
}catch(error){failure=error;console.error(error.stack);}
finally{
  await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({passed:!failure,channel,checks,scenarios,measurements,failure:failure?.message},null,2));
  for(const context of contexts)await context.close().catch(()=>{});await browser.close();await new Promise(resolve=>server.close(resolve));
}
if(failure)process.exitCode=1;
