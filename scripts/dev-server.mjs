// Zero-dependency local server: serves public/ and runs the Netlify
// functions behind /api/, so the site behaves locally as it does in
// production. `netlify dev` does the same thing if you have the CLI;
// this exists so you do not need it.
//
//   node scripts/dev-server.mjs [port]
//
// Run from the repository root — the functions resolve rubrics/ relative
// to the working directory.

import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { join, extname, resolve } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ROOT = resolve(process.cwd());
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.argv[2]) || 8888;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.map': 'application/json'
};

const fn = name => require(join(ROOT, 'netlify', 'functions', `${name}.js`));

const readBody = req => new Promise(res => {
  let b = ''; req.on('data', c => { b += c; }); req.on('end', () => res(b));
});

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = decodeURIComponent(url.pathname);

  // /api/* -> the matching Netlify function, same shape as production
  const api = path.match(/^\/api\/(brief|score)$/);
  if (api) {
    try {
      const handler = fn(api[1]).handler;
      const out = await handler({
        httpMethod: req.method,
        queryStringParameters: Object.fromEntries(url.searchParams),
        body: req.method === 'POST' ? await readBody(req) : null,
        headers: req.headers
      });
      res.writeHead(out.statusCode, out.headers || { 'Content-Type': 'application/json' });
      return res.end(out.body);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // rubrics/ is outside the publish directory; mirror production's 404
  // so a stale client path fails here the same way it would live.
  if (path.startsWith('/rubrics/')) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found. Rubrics are not published; use /api/brief.');
  }

  let file = join(PUBLIC, path);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  try {
    const buf = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}).listen(PORT, () => {
  console.log(`PromptArcade dev server  http://127.0.0.1:${PORT}`);
  console.log(`  static   ${PUBLIC}`);
  console.log(`  api      /api/brief, /api/score  (netlify/functions)`);
  console.log(`  rubrics  ${join(ROOT, 'rubrics')}  — served to the API only, never over HTTP`);
});
