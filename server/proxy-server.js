const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:9999';
const backend = new URL(BACKEND_URL);
const BACKEND_PORT = Number(backend.port || (backend.protocol === 'https:' ? 443 : 80));
const ROOT = __dirname;

function resolveWebDir() {
  if (process.env.WEB_DIR) {
    return path.resolve(process.env.WEB_DIR);
  }
  const candidates = [
    path.join(ROOT, '..', 'dist', 'leon-app-store', 'browser'),
    path.join(ROOT, '..', 'dist', 'leon-app-store'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html'))) {
      return dir;
    }
  }
  return candidates[0];
}

const WEB_DIR = resolveWebDir();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.apk': 'application/vnd.android.package-archive',
};

function contentType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function cacheControl(filePath) {
  const base = path.basename(filePath);
  if (base === 'index.html' || base === 'ngsw-worker.js' || base === 'ngsw.json' || base === 'safety-worker.js') {
    return 'no-cache';
  }
  return 'public, max-age=3600';
}

function isBackendPath(pathname) {
  return (
    pathname === '/api' ||
    pathname.startsWith('/api/') ||
    pathname === '/uploads' ||
    pathname.startsWith('/uploads/')
  );
}

function proxy(req, res) {
  const upstream = http.request(
    {
      protocol: backend.protocol,
      hostname: backend.hostname,
      port: BACKEND_PORT,
      method: req.method,
      path: req.url,
      headers: Object.assign({}, req.headers, {
        host: backend.host,
        'x-forwarded-host': req.headers.host || '',
        'x-forwarded-proto': 'https',
      }),
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  upstream.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    }
    res.end(JSON.stringify({ error: `Backend nicht erreichbar (${BACKEND_URL}): ${err.message}` }));
  });

  req.on('aborted', () => upstream.destroy());
  req.pipe(upstream);
}

function sendFile(req, res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('500 Internal Server Error');
      return;
    }
    res.writeHead(200, {
      'content-type': contentType(filePath),
      'cache-control': cacheControl(filePath),
      'content-length': data.length,
    });
    if (req.method === 'HEAD') {
      res.end();
    } else {
      res.end(data);
    }
  });
}

const server = http.createServer((req, res) => {
  let pathname = '/';
  try {
    pathname = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('400 Bad Request');
    return;
  }

  if (isBackendPath(pathname)) {
    proxy(req, res);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }

  const cleaned = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(WEB_DIR, cleaned);

  if (filePath !== WEB_DIR && !filePath.startsWith(WEB_DIR + path.sep)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      sendFile(req, res, path.join(WEB_DIR, 'index.html'));
      return;
    }
    sendFile(req, res, filePath);
  });
});

server.listen(PORT, () => {
  console.log(`AppStore-Server läuft auf http://localhost:${PORT}`);
  console.log(`Statische Dateien: ${WEB_DIR}`);
  console.log(`API-Proxy: ${BACKEND_URL}`);
});
