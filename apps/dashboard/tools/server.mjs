// 零额外服务端依赖：静态页面 + 只读 GET 演示 API。生产鉴权由真实业务服务负责。
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.geojson':'application/geo+json; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.woff2':'font/woff2'};
export async function demoApi(req,res){
  if((req.url||'').split('?')[0]!=='/api/dashboard')return false;
  if(req.method!=='GET'){res.writeHead(405,{'Allow':'GET'});res.end('Method Not Allowed');return true;}
  try{
    const config=JSON.parse(await fs.readFile(path.join(root,'public/config/dashboard.json'),'utf8'));
    const {dataSource,...data}=config;
    data.meta={...data.meta,dataLabel:'演示 API 数据',updatedAt:new Date().toISOString()};
    res.writeHead(200,{'Content-Type':types['.json'],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify({data}));
  }catch{res.writeHead(500,{'Content-Type':types['.json']});res.end(JSON.stringify({error:'演示配置无法读取'}));}
  return true;
}
export async function startServer({port=5199,host='127.0.0.1',directory=path.join(root,'dist')}={}){
  const server=http.createServer(async(req,res)=>{
    if(await demoApi(req,res))return;
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
    try{
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      const target=path.resolve(directory,'.'+(pathname==='/'?'/index.html':pathname));
      const prefix=path.resolve(directory)+path.sep;
      if(!target.startsWith(prefix)||pathname.split('/').some(part=>part.startsWith('.'))||pathname.includes(String.fromCharCode(92))){res.writeHead(403);res.end();return;}
      const bytes=await fs.readFile(target);res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':pathname.endsWith('.json')?'no-store':'no-cache'});res.end(req.method==='HEAD'?undefined:bytes);
    }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('文件不存在');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
  return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.DASHBOARD_PORT||5199);
  await startServer({port});console.log(`咸阳文旅大屏：http://127.0.0.1:${port}`);
}
