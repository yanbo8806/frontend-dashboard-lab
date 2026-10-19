// Minimal static file server used by `shot --serve-dir` and for manual preview.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

export async function startStaticServer(rootDir, { host = '127.0.0.1', port = 0 } = {}) {
  const root = path.resolve(rootDir);
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, `http://${host}`);
      let rel = decodeURIComponent(url.pathname);
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.join(root, path.normalize(rel).replace(/^([/\\])+/, ''));
      const relative = path.relative(root, file);
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        res.writeHead(403).end('forbidden');
        return;
      }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end(`404 ${rel}`);
        return;
      }
      res.writeHead(200, {
        'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end(String(e));
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const addr = server.address();
  return {
    url: `http://${host}:${addr.port}/`,
    port: addr.port,
    close: () => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }),
  };
}
