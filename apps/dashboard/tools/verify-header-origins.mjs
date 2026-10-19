// 固定原始舞台与缩放视口复核两处回归：标题安全区、客源地照片/圆框/编号分层。
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {PNG} from '../../../packages/img2code/node_modules/pngjs/lib/png.js';
import {launchBrowser} from '../../../packages/img2code/src/commands/shot.mjs';
import {startServer} from './server.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'out/header-origins-fix');
const defaults=JSON.parse(await fs.readFile(path.join(root,'public/config/dashboard.json'),'utf8'));
const server=await startServer({port:0});const {browser,channel}=await launchBrowser();
const context=await browser.newContext({viewport:{width:1871,height:841},locale:'zh-CN',timezoneId:'Asia/Shanghai',reducedMotion:'reduce'});
const page=await context.newPage();page.setDefaultTimeout(15000);
await page.addInitScript(()=>{window.__img2codeFrozen=true;});
const checks=[],errors=[],requests=[],measurements=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
page.on('requestfailed',request=>requests.push(request.url()+': '+request.failure()?.errorText));
async function check(name,run){try{await run();checks.push({name,passed:true});console.log('PASS '+name);}catch(error){checks.push({name,passed:false,error:error.message});console.error('FAIL '+name+'：'+error.message);}}
async function ready(){
  await page.waitForFunction(()=>window.__dashboard?.mapStats?.state==='ready');
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode()));});
  await page.waitForLoadState('networkidle');
}
async function measure(){return page.evaluate(()=>{
  const stage=document.querySelector('#stage').getBoundingClientRect(),scale=stage.width/1871;
  const rect=box=>({x:(box.left-stage.left)/scale,y:(box.top-stage.top)/scale,w:box.width/scale,h:box.height/scale,right:(box.right-stage.left)/scale,bottom:(box.bottom-stage.top)/scale});
  const textBox=node=>{const range=document.createRange();range.selectNodeContents(node);return rect(range.getBoundingClientRect());};
  return {scale,title:textBox(document.querySelector('.header-title')),subtitle:textBox(document.querySelector('.dashboard-subtitle')),
    subtitleText:document.querySelector('.dashboard-subtitle').textContent,
    photos:[...document.querySelectorAll('.origin-circle')].map(frame=>{const image=frame.querySelector('img'),style=getComputedStyle(frame);return {frame:rect(frame.getBoundingClientRect()),image:rect(image.getBoundingClientRect()),source:image.getAttribute('src'),size:[image.naturalWidth,image.naturalHeight],borderRadius:style.borderRadius,overflow:style.overflow,clipPath:style.clipPath,objectFit:getComputedStyle(image).objectFit};}),
    ranks:[...document.querySelectorAll('.origin-number')].map(node=>({text:node.textContent,box:rect(node.getBoundingClientRect()),insidePhoto:Boolean(node.closest('.origin-circle')),title:node.title})),
  };});}
let failure;
try{
  await fs.mkdir(out,{recursive:true});
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});await ready();
  for(const viewport of [{width:1871,height:841},{width:1366,height:768}]){
    await page.setViewportSize(viewport);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const result=await measure();measurements.push({viewport,...result});
    await check(`${viewport.width} 视口：主标题与完整假期文字不越过标题底边、不重叠`,async()=>{
      assert.equal(result.subtitleText,defaults.meta.subtitle);
      for(const box of [result.title,result.subtitle]){assert.ok(box.x>=697&&box.right<=1175,'文字超出中央标题横向安全区');assert.ok(box.y>=0&&box.bottom<=54,'文字压住 y=54 的标题底部发光线');}
      assert.ok(result.title.bottom<=result.subtitle.y,'两行文字发生重叠');
    });
    await check(`${viewport.width} 视口：教学插图以 cover 铺满独立圆框`,async()=>{
      assert.equal(result.photos.length,5);
      for(const {frame,image,size,overflow,borderRadius,objectFit} of result.photos){
        assert.equal(borderRadius,'50%');assert.equal(overflow,'hidden');assert.equal(objectFit,'cover');assert.ok(Math.abs(frame.w-frame.h)<.01);
        assert.ok(size[0]>0&&size[1]>0,'插图已实际加载');
        assert.ok(Math.abs(frame.w-image.w)<.1&&Math.abs(frame.h-image.h)<.1,'图片与圆框等大');
      }
    });
    await check(`${viewport.width} 视口：五个金色 1–5 徽章居中跨在圆框下沿`,async()=>{
      assert.deepEqual(result.ranks.map(item=>item.text),['1','2','3','4','5']);
      for(let i=0;i<5;i++){const photo=result.photos[i].frame,rank=result.ranks[i];assert.equal(rank.insidePhoto,false);assert.ok(Math.abs(rank.box.x+rank.box.w/2-photo.x-photo.w/2)<.1);assert.ok(rank.box.y<photo.bottom&&rank.box.bottom>photo.bottom&&rank.box.bottom<598);assert.match(rank.title,/%/);}
    });
    await page.screenshot({path:path.join(out,viewport.width===1871?'after.png':'after-1366.png')});
  }
  await page.setViewportSize({width:1871,height:841});
  const solid=new PNG({width:240,height:100});for(let i=0;i<solid.data.length;i+=4){solid.data[i]=255;solid.data[i+1]=0;solid.data[i+2]=255;solid.data[i+3]=255;}
  await page.route('**/test-origin.png',route=>route.fulfill({contentType:'image/png',body:PNG.sync.write(solid)}));
  await page.route('**/config/dashboard.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({...defaults,origins:defaults.origins.map(row=>({...row,image:'test-origin.png'}))})}));
  await page.reload({waitUntil:'networkidle'});await ready();
  await check('替换宽幅照片仍真实圆形裁切，四角不露图，编号不被裁掉',async()=>{
    const result=await measure();const bytes=await page.screenshot({path:path.join(out,'custom-photo.png')});const png=PNG.sync.read(bytes);
    const magenta=(x,y)=>{const offset=(Math.floor(y)*png.width+Math.floor(x))*4;return png.data[offset]>230&&png.data[offset+1]<20&&png.data[offset+2]>230;};
    for(const {frame,image} of result.photos){assert.ok(Math.abs(frame.w-image.w)<.1&&Math.abs(frame.h-image.h)<.1,'上传照片应正常 cover，不套用旧截图裁切');assert.equal(magenta(frame.x+frame.w/2,frame.y+frame.h/2),true);for(const [dx,dy] of [[2,2],[frame.w-3,2],[2,frame.h-3],[frame.w-3,frame.h-3]])assert.equal(magenta(frame.x+dx,frame.y+dy),false);}
    assert.equal(result.ranks.length,5);
  });
  await check('客源占比调整后图片随数据重排，名次始终由页面生成',async()=>{
    const origins=defaults.origins.map((row,index)=>({...row,value:index+1}));
    await page.route('**/config/dashboard.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({...defaults,origins})}));
    await page.reload({waitUntil:'networkidle'});await ready();
    const rows=await page.locator('.origin-item').evaluateAll(nodes=>nodes.map(node=>({id:node.dataset.origin,name:node.querySelector('.origin-name').textContent,rank:node.querySelector('.origin-number').textContent,src:node.querySelector('.origin-img').getAttribute('src')})));
    const expected=[...origins].reverse();
    assert.deepEqual(rows,expected.map((row,index)=>({id:row.id,name:row.name,rank:String(index+1),src:row.image})));
  });
  await check('页面无脚本错误、失败请求，GIS 仍正常就绪',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);assert.equal(await page.evaluate(()=>window.__dashboard.mapStats.state),'ready');});
}catch(error){failure=error.message;console.error(error.stack);}
finally{await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({passed:!failure&&checks.every(item=>item.passed),channel,checks,measurements,errors,requests,failure},null,2));await browser.close();await new Promise(resolve=>server.close(resolve));}
if(failure||checks.some(item=>!item.passed))process.exitCode=1;
