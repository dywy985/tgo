// Minimal SPA static server for TGO web production build
// 含 /api 反向代理 → tgo-api (容器网络 tgo-api:8008 / 宿主机 127.0.0.1:8008)
import { createServer } from 'node:http';
import { request as httpRequest } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = '/workspace/dist';
const port = 5173;
const apiTarget = process.env.TGO_API_URL || 'http://tgo-api:8000'; // docker 网络内 tgo-api 容器端口 (宿主 8008 映射到容器 8000)
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.map': 'application/json'
};

createServer(async (req, res) => {
  try {
    // /api 反代到 tgo-api (剥掉 /api 前缀, tgo-api 路由是 /v1/...)
    if (req.url.startsWith('/api')) {
      const u = new URL(req.url, apiTarget + '/');
      let proxyPath = u.pathname + u.search;
      if (proxyPath.startsWith('/api')) proxyPath = proxyPath.slice(4) || '/';
      const proxy = httpRequest({
        hostname: u.hostname,
        port: u.port,
        path: proxyPath,
        method: req.method,
        headers: { ...req.headers, host: u.host },
      }, (pres) => {
        res.writeHead(pres.statusCode || 502, pres.headers);
        pres.pipe(res);
      });
      proxy.on('error', (e) => {
        console.error('[serve.mjs] /api proxy error:', e.message);
        res.writeHead(502, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'API proxy error: ' + e.message }));
      });
      req.pipe(proxy);
      return;
    }

    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const fp = join(root, normalize(p));
    if (!fp.startsWith(root)) { res.writeHead(403); return res.end('Forbidden'); }
    const data = await readFile(fp);
    res.writeHead(200, { 'content-type': types[extname(fp)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    // SPA fallback to index.html
    try {
      const data = await readFile(join(root, 'index.html'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  }
}).listen(port, '0.0.0.0', () => console.log(`TGO static server listening on ${port}`));
