// Minimal SPA static server for TGO web production build
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = '/workspace/dist';
const port = 5173;
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
