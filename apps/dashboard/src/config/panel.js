import { TABLES, SCALAR_GROUPS } from './fields.js';
import { getPath, setPath, validateConfig, parseConfigJson, mergeConfig, SAFE_ICONS } from './schema.js';
import { fetchApiPatch } from './api.js';
import { PREVIOUS_KEY } from './store.js';

const element=(tag,cls='',text='')=>{const node=document.createElement(tag);node.className=cls;node.textContent=text;return node;};
const action=(parent,label,run,cls='')=>{const node=element('button','config-button '+cls,label);node.type='button';node.addEventListener('click',run);parent.append(node);return node;};
const download=(bytes,name,type)=>{const url=URL.createObjectURL(new Blob([bytes],{type}));const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};

/** 表单、导入和 API 预览只修改草稿；保存通过总校验后才触发 onApply。 */
export function createConfigPanel(options){
  let draft,tab='basic',dirty=false,jsonInput,operation=0,worker,request,busy=false,returnFocus;
  const dialog=element('dialog','config-dialog');dialog.setAttribute('aria-labelledby','config-heading');
  const top=element('header','config-header'),heading=element('div');
  const title=element('h2','','数据配置');title.id='config-heading';heading.append(title,element('p','','本地保存 · 全屏数据联动'));top.append(heading);
  action(top,'关闭',()=>close(),'quiet');dialog.append(top);
  const tabs=element('nav','config-tabs');tabs.setAttribute('aria-label','配置分类');dialog.append(tabs);
  const entries=[['basic','基础与指标'],['attractions','景点与图片'],['charts','图表与客源'],['map','地图与飞线'],['import','导入 / API'],['json','完整 JSON']];
  for(const [id,label] of entries){const node=action(tabs,label,()=>switchTab(id),'tab');node.dataset.tab=id;}
  const body=element('div','config-body');dialog.append(body);
  const status=element('pre','config-message','尚未修改');status.setAttribute('role','status');status.setAttribute('aria-live','polite');dialog.append(status);
  const footer=element('footer','config-footer');dialog.append(footer);
  action(footer,'校验草稿',()=>validateDraft(),'quiet');
  const save=action(footer,'保存并应用',()=>{
    try{syncJson();const config=validateConfig(draft);const message=options.onApply(config);dirty=false;close(false);window.dispatchEvent(new CustomEvent('dashboard:saved',{detail:message}));}catch(error){show(error.message,true);}
  },'primary');
  document.body.append(dialog);

  function show(message,error=false){status.textContent=message;status.classList.toggle('error',error);}
  function changed(){dirty=true;show('草稿已修改，保存后生效。');}
  function close(confirmChanges=true){
    if(confirmChanges&&dirty&&!confirm('放弃尚未保存的配置修改？'))return;
    operation++;worker?.terminate();request?.abort();busy=false;dialog.close();options.onResume();returnFocus?.focus();
  }
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();}});
  function syncJson(){if(tab==='json'&&jsonInput)draft=parseConfigJson(jsonInput.value);}
  function switchTab(id){if(busy){show('正在处理导入或 API，请等待完成后切换。');return;}try{syncJson();tab=id;render();}catch(error){show(error.message,true);}}
  function validateDraft(){try{syncJson();validateConfig(draft);show(`校验通过：${draft.attractions.length} 个景点、${draft.routes.length} 条飞线、${draft.trend.categories.length} 个趋势时间点。尚未应用。`);}catch(error){show(error.message,true);}}

  function field(parent,column,value,onChange){
    const label=element('label','config-field');const caption=element('span','',column.label);label.append(caption);
    let input;
    const choices=column.values||(column.key==='icon'?SAFE_ICONS:null);
    if(column.type==='boolean'||choices){
      input=element('select');
      for(const option of column.type==='boolean'?[['true','是 / 启用'],['false','否 / 禁用']]:choices.map(value=>[value,value])){const node=element('option','',option[1]);node.value=option[0];input.append(node);}
      input.value=String(value);
    }else{
      input=element('input');input.type=column.type==='number'?'number':'text';if(column.type==='number')input.step='any';input.value=value??'';
    }
    input.setAttribute('aria-label',column.label);input.dataset.field=column.key;
    input.addEventListener('input',()=>{let next=input.value;if(column.type==='number')next=next.trim()===''?'':Number(next);if(column.type==='boolean')next=next==='true';onChange(next);changed();});
    label.append(input);parent.append(label);return input;
  }
  function section(title,description){const node=element('section','config-section');node.append(element('h3','',title));if(description)node.append(element('p','config-hint',description));body.append(node);return node;}
  function scalarGroup(group){const node=section(group.name),grid=element('div','config-grid');node.append(grid);for(const column of group.fields)field(grid,column,getPath(draft,column.key),value=>setPath(draft,column.key,value));return node;}
  function table(key,{subset,add=true}={}){
    const definition=TABLES.find(item=>item.key===key),rows=getPath(draft,key),node=section(definition.name);
    const wrap=element('div','config-table-scroll'),table=element('table','config-table'),head=element('thead'),headRow=element('tr');
    const columns=subset?definition.columns.filter(column=>subset.includes(column.key)):definition.columns;
    columns.forEach(column=>headRow.append(element('th','',column.label)));if(add)headRow.append(element('th','','操作'));head.append(headRow);table.append(head);
    const tbody=element('tbody');table.append(tbody);wrap.append(table);node.append(wrap);
    rows.forEach((row,index)=>{
      const tr=element('tr');tr.dataset.rowId=row.id||String(index);tbody.append(tr);
      for(const column of columns){const td=element('td');tr.append(td);field(td,column,row[column.key],value=>{row[column.key]=value;});}
      if(add){const td=element('td');action(td,'移除',()=>{if(!confirm('从草稿中移除此行？'))return;rows.splice(index,1);changed();render();},'quiet danger');tr.append(td);}
    });
    if(add)action(node,'添加一行',()=>{
      const item=Object.fromEntries(definition.columns.map(column=>[column.key,column.type==='number'?0:column.type==='boolean'?true:column.type==='color'?'#3ff6fc':'']));
      if('id'in item)item.id=key.replaceAll('.','-')+'-'+Date.now().toString(36);if('icon'in item)item.icon='pin';
      if(key==='routes'){item.fromId='hub';item.toId=draft.attractions[0]?.id||'';item.height=4000;}
      rows.push(item);changed();render();
    },'quiet');return node;
  }
  function imageFields(parent,row){
    const preview=element('img','config-photo');preview.alt=row.name||'图片预览';preview.referrerPolicy='no-referrer';if(row.image)preview.src=row.image;preview.style.objectPosition=row.imagePosition||'50% 50%';parent.append(preview);
    const fileLabel=element('label','config-upload','上传替换图片'),input=element('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.setAttribute('aria-label','上传'+row.name+'图片');fileLabel.append(input);parent.append(fileLabel);
    input.addEventListener('change',async()=>{
      const file=input.files[0];if(!file)return;
      try{
        if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024)throw new Error('请选择不超过 8MB 的 PNG、JPEG 或 WebP 图片');
        const bitmap=await createImageBitmap(file);if(bitmap.width*bitmap.height>50000000){bitmap.close();throw new Error('图片像素过大，请缩小后上传');}
        const canvas=document.createElement('canvas'),scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
        canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
        const url=canvas.toDataURL('image/jpeg',.82);if(url.length>900000)throw new Error('压缩后图片仍过大，请降低分辨率或使用图片 URL');
        row.image=url;if('imageSource'in row)row.imageSource='';if('imageCredit'in row)row.imageCredit='用户上传素材';changed();render();show('图片已压缩并加入草稿，保存后联动到地图详情和景点照片。');
      }catch(error){show(error.message,true);}finally{input.value='';}
    });
  }
  function attractions(){
    const intro=section('景点与图片','景点 ID 是飞线关联键；改名无需修改飞线。更改 ID 后请同步调整起终点 ID。坐标为参考位置，可按实际入口校准。');
    action(intro,'新增景点',()=>{
      draft.attractions.push({id:'poi-'+Date.now().toString(36),name:'新景点',district:draft.meta.city,longitude:draft.map.center[0],latitude:draft.map.center[1],rank:Math.max(0,...draft.attractions.map(row=>row.rank))+1,heat:0,image:'',imagePosition:'50% 50%',imageSource:'',imageCredit:'',description:'',coordinateNote:'待校准'});changed();render();
    },'quiet');
    draft.attractions.forEach((row,index)=>{
      const node=element('details','attraction-editor');node.open=index===0;const summary=element('summary','',row.name+' · '+row.id);node.append(summary);body.append(node);
      const media=element('div','config-media');node.append(media);imageFields(media,row);
      const grid=element('div','config-grid');node.append(grid);
      for(const column of TABLES.find(item=>item.key==='attractions').columns)field(grid,column,row[column.key],value=>{row[column.key]=value;});
      action(node,'移除此景点及关联飞线',()=>{if(!confirm('从草稿移除“'+row.name+'”及其关联飞线？保存后生效。'))return;draft.attractions.splice(index,1);draft.routes=draft.routes.filter(route=>route.fromId!==row.id&&route.toId!==row.id);changed();render();},'quiet danger');
    });
  }
  function trendEditor(){
    const node=section('趋势图','时间标签顺序就是图表顺序；数值数量必须与标签一致。支持逗号或换行分隔。');
    const labels=element('label','config-field');labels.append(element('span','','时间标签（逗号分隔）'));const input=element('textarea');input.value=draft.trend.categories.join(', ');input.rows=2;input.dataset.field='trend.categories';
    input.addEventListener('input',()=>{draft.trend.categories=input.value.split(/[,，\n]/).map(value=>value.trim()).filter(Boolean);changed();});labels.append(input);node.append(labels);
    draft.trend.series.forEach((row,index)=>{
      const grid=element('div','trend-editor-row');node.append(grid);
      field(grid,{key:'name',label:'系列名称'},row.name,value=>{row.name=value;});field(grid,{key:'color',label:'颜色'},row.color,value=>{row.color=value;});
      const values=element('label','config-field wide');values.append(element('span','','数值（逗号分隔）'));const input=element('textarea');input.value=row.values.join(', ');input.rows=2;input.dataset.field='trend.series.'+index+'.values';
      input.addEventListener('input',()=>{row.values=input.value.split(/[,，\n]/).map(value=>value.trim()===''?'':Number(value.trim()));changed();});values.append(input);grid.append(values);
      action(grid,'移除系列',()=>{if(confirm('从草稿移除此趋势系列？')){draft.trend.series.splice(index,1);changed();render();}},'quiet danger');
    });
    action(node,'添加系列',()=>{draft.trend.series.push({name:'新系列',color:'#49bcff',values:draft.trend.categories.map(()=>0)});changed();render();},'quiet');
  }
  function runWorker(actionName,buffer){
    return new Promise((resolve,reject)=>{
      const current=new Worker(new URL('./excel.worker.js',import.meta.url),{type:'module'});worker=current;
      const timer=setTimeout(()=>{current.terminate();reject(new Error('Excel 解析超过 30 秒，已停止，请减少文件体积'));},30000);
      current.onmessage=({data})=>{clearTimeout(timer);current.terminate();data.ok?resolve(data.result):reject(new Error(data.message));};
      current.onerror=event=>{clearTimeout(timer);current.terminate();reject(new Error('Excel 解析线程失败：'+event.message));};
      current.postMessage({action:actionName,buffer,config:draft});
    });
  }
  async function run(label,job){
    if(busy)return;busy=true;save.disabled=true;const epoch=++operation;show(label);
    try{await job(()=>epoch===operation&&dialog.open);}catch(error){if(epoch===operation)show(error.message,true);}finally{if(epoch===operation){busy=false;save.disabled=false;}}
  }
  function importTab(){
    const node=section('文件导入','导入结果只写入草稿，点击保存并应用后生效。缺失工作表沿用当前配置；有表头的数据表整组替换。');
    const buttons=element('div','config-actions');node.append(buttons);
    const file=element('input');file.type='file';file.accept='.xlsx,.json';file.id='config-import';file.setAttribute('aria-label','导入 Excel 或 JSON');node.append(file);
    file.addEventListener('change',()=>{const selected=file.files[0];if(!selected)return;run('正在解析 '+selected.name+'…',async valid=>{
      if(selected.size>5*1024*1024)throw new Error('文件超过 5MB');
      let next,summary;
      if(selected.name.toLowerCase().endsWith('.xlsx')){const result=await runWorker('import',await selected.arrayBuffer());next=result.config;summary=result.summary.join('、');}
      else if(selected.name.toLowerCase().endsWith('.json')){next=parseConfigJson(await selected.text(),draft);summary='JSON 配置';}
      else throw new Error('仅支持 .xlsx / .json；旧版 .xls 请先另存为 .xlsx');
      if(!valid())return;draft=next;dirty=true;show('导入校验通过：'+summary+'。请检查各页签，再保存并应用。');
    });file.value='';});
    action(buttons,'下载 Excel 模板',()=>run('正在生成 Excel 模板…',async valid=>{const bytes=await runWorker('export');if(valid()){download(bytes,'咸阳文旅配置模板.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');show('模板已下载，内容是当前草稿，可编辑后导入。');}}));
    action(buttons,'导出 JSON',()=>{try{const config=validateConfig(draft);download(JSON.stringify(config,null,2),'dashboard.json','application/json');show('JSON 已导出，不含 Token。');}catch(error){show(error.message,true);}});
    const api=scalarGroup(SCALAR_GROUPS.find(group=>group.name==='API设置'));
    api.append(element('p','config-hint','仅 GET JSON；跨域接口须允许 CORS。远程返回字段可与配置结构相同，也可按响应对象路径提取。自动同步不落盘，保存时才持久化。'));
    const tokenLabel=element('label','config-field');tokenLabel.append(element('span','','Bearer Token（仅本次会话）'));const token=element('input');token.type='password';token.autocomplete='off';token.value=options.getToken();token.dataset.field='api.token';token.addEventListener('input',()=>options.setToken(token.value));tokenLabel.append(token);api.append(tokenLabel);
    action(api,'测试接口并预览',()=>run('正在请求 API 并校验数据…',async valid=>{
      validateConfig(draft);request=new AbortController();const patch=await fetchApiPatch(draft.dataSource,{token:options.getToken(),signal:request.signal});
      const next=mergeConfig(draft,patch);if(valid()){draft=next;dirty=true;show('API 校验通过：'+Object.keys(patch).join('、')+'。数据已加入草稿，尚未应用。');}
    }));
    action(api,'填入本机演示 API',()=>{draft.dataSource={mode:'api',url:'api/dashboard',responsePath:'data',refreshSeconds:60,timeoutMs:10000};changed();render();},'quiet');
    const recovery=section('恢复与备份','恢复只写入草稿；保存前仍可关闭取消。默认素材不会删除。');
    action(recovery,'载入默认配置',()=>{if(!confirm('用默认配置替换当前草稿？现有已保存配置暂不改变。'))return;draft=structuredClone(options.getDefaults());changed();render();},'quiet');
    action(recovery,'载入上一次保存',()=>{try{const previous=localStorage.getItem(PREVIOUS_KEY);if(!previous)throw new Error('没有上一版备份');draft=parseConfigJson(previous);changed();render();show('已载入上一版，保存后生效。');}catch(error){show(error.message,true);}},'quiet');
  }
  function render(){
    body.replaceChildren();jsonInput=null;
    tabs.querySelectorAll('[data-tab]').forEach(node=>{node.classList.toggle('active',node.dataset.tab===tab);node.setAttribute('aria-current',node.dataset.tab===tab?'page':'false');});
    if(tab==='basic'){scalarGroup(SCALAR_GROUPS[0]);table('kpis',{add:false});}
    if(tab==='attractions')attractions();
    if(tab==='charts'){
      trendEditor();table('travel');const origins=table('origins');
      const photos=element('details','origin-photo-editor');photos.append(element('summary','','上传客源地图片'));origins.append(photos);
      draft.origins.forEach(row=>{const media=element('div','config-media');media.append(element('strong','',row.name));imageFields(media,row);photos.append(media);});
      table('demographics.gender',{add:false});table('demographics.ages');
    }
    if(tab==='map'){
      const node=section('3D 地图','默认咸阳边界内置真实 DEM 与山脊晕渲，空高程地址使用本地素材；更换边界须提供对应 DEM。启用地形时不再拉伸行政区。飞线是客流关联而非导航路线。天地图影像/晕渲需使用 w 瓦片与有效 tk；三维地形原始接口需转成 Terrain-RGB/Terrarium，不能直接填在 DEM 地址。');
      action(node,'使用当前地图视角',()=>{const view=options.getMapView();if(!view){show('当前为图片示意场景，没有 GIS 经纬度视角。请先切换 GIS 地图。',true);return;}Object.assign(draft.map,{zoom:Number(view.zoom.toFixed(3)),pitch:Number(view.pitch.toFixed(2)),bearing:Number(view.bearing.toFixed(2))});
        // 视角中心独立以 WGS84 输入；仅默认点坐标系为 WGS84 时可直接写回。
        if(draft.map.pointCrs==='WGS84')draft.map.center=view.center.map(value=>Number(value.toFixed(6)));changed();render();show(draft.map.pointCrs==='WGS84'?'视角已加入草稿。':'已更新缩放和角度；中心请按当前坐标系手动填写。');
      },'quiet');
      scalarGroup(SCALAR_GROUPS[1]);table('routes');
    }
    if(tab==='import')importTab();
    if(tab==='json'){const node=section('完整配置 JSON','所有配置字段均可编辑；保存前校验。普通表单与这里的数据完全一致。');jsonInput=element('textarea','json-editor');jsonInput.setAttribute('aria-label','完整配置 JSON');jsonInput.value=JSON.stringify(draft,null,2);jsonInput.spellcheck=false;jsonInput.addEventListener('input',changed);node.append(jsonInput);}
  }
  return {open(){returnFocus=document.activeElement;options.onPause();draft=structuredClone(options.getConfig());dirty=false;busy=false;save.disabled=false;render();show('编辑期间已暂停自动同步；保存并应用后恢复。');dialog.showModal();}};
}
