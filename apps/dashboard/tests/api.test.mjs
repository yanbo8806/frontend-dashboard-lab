import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchApiPatch, createApiPoller } from '../src/config/api.js';
const settings = { url: 'https://example.test/dashboard', responsePath: 'data', timeoutMs: 100, refreshSeconds: 0 };
test('API 响应路径与临时 Bearer Token', async () => {
  const patch = await fetchApiPatch(settings, { token: 'temporary', fetcher: async (url, init) => {
    assert.equal(init.headers.Authorization, 'Bearer temporary');
    assert.equal(init.credentials, 'omit');
    return Response.json({ data: { meta: { title: 'API 标题' } } });
  } });
  assert.equal(patch.meta.title, 'API 标题');
});
test('HTTP、非 JSON、错误路径及远程修改接口设置均被拒绝', async () => {
  for (const response of [new Response('bad', {status:503}), new Response('<html/>'), Response.json({ wrong: {} }), Response.json({ data: { dataSource: { url:'evil' } } }), Response.json({data:{}})]) {
    await assert.rejects(fetchApiPatch(settings, {fetcher: async()=>response}));
  }
});
test('接口超时有上限', async () => {
  await assert.rejects(fetchApiPatch({...settings,timeoutMs:25}, {fetcher: async (_, init) => new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason)))}), /25ms/);
});
test('停止轮询后迟到响应不得覆盖当前数据', async () => {
  let resolveFetch, applied = 0;
  const poller = createApiPoller({ getConfig:()=>({dataSource:{...settings,mode:'api'}}), getToken:()=>'', apply:()=>applied++, onStatus:()=>{}, fetcher:()=>new Promise(resolve=>{resolveFetch=resolve;}) });
  poller.start(); poller.stop();
  resolveFetch(Response.json({data:{meta:{title:'过期'}}}));
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(applied,0);
});
