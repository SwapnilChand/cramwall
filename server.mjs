// Self hosting: `npm start` builds the site and serves it with the API on one port.
// Needs one model key in the environment (see README). No database: rate limits are kept
// in memory unless Upstash env vars are set.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const dist = join(root, 'dist');
const handlers = {
  '/api/generate': () => import('./api/generate.js'),
  '/api/health': () => import('./api/health.js'),
};

export function mountApi(app) {
  app.use(async (req, res, next) => {
    const path = req.url.split('?')[0];
    const load = handlers[path];
    if (!load) return next();
    try { (await load()).default(req, res); } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: 'server error' })); }
  });
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.ico': 'image/x-icon' };

async function serveStatic(req, res) {
  let path = decodeURIComponent(req.url.split('?')[0]);
  if (path === '/') path = '/index.html';
  if (path === '/make' || path === '/make/') path = '/make.html';
  const file = normalize(join(dist, path));
  if (!file.startsWith(dist)) { res.statusCode = 403; return res.end(); }
  try {
    if (!(await stat(file)).isFile()) throw new Error();
    res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
    if (path.startsWith('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404; res.end('Not found');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const stack = [];
  mountApi({ use: (fn) => stack.push(fn) });
  const port = +process.env.PORT || 3000;
  http.createServer((req, res) => stack[0](req, res, () => serveStatic(req, res))).listen(port, () => {
    console.log(`cramwall running on http://localhost:${port}`);
  });
}
