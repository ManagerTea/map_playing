const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const HOST = '0.0.0.0';
const PORT = Number(process.env.PORT || 4444);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const defaultState = {
  mapSrc: '',
  mapScale: 100,
  stageZoom: 1,
  tokens: [],
  updatedAt: Date.now(),
};

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...defaultState,
      ...parsed,
      tokens: Array.isArray(parsed.tokens) ? parsed.tokens : [],
    };
  } catch {
    fs.writeFileSync(STATE_FILE, JSON.stringify(defaultState, null, 2));
    return { ...defaultState };
  }
}

function saveState(next) {
  const safe = {
    mapSrc: typeof next.mapSrc === 'string' ? next.mapSrc : '',
    mapScale: Number.isFinite(next.mapScale) ? next.mapScale : 100,
    stageZoom: Number.isFinite(next.stageZoom) ? next.stageZoom : 1,
    tokens: Array.isArray(next.tokens) ? next.tokens : [],
    updatedAt: Date.now(),
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(safe, null, 2));
  return safe;
}

function sendJson(res, code, body) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
  }[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext.startsWith('.ht') ? 'no-store' : 'public, max-age=600',
    });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 10 * 1024 * 1024) {
        reject(new Error('Body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function saveDataUrlImage(dataUrl, filename = 'image') {
  const match = String(dataUrl).match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid image data URL');
  }

  const mime = match[1].toLowerCase();
  const base64 = match[2];
  const ext = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
  }[mime];

  if (!ext) throw new Error('Unsupported image type');

  const safeName = path.basename(filename, path.extname(filename)).replace(/[^a-zA-Z0-9-_]/g, '');
  const id = `${Date.now()}-${randomUUID()}`;
  const output = `${safeName || 'img'}-${id}.${ext}`;
  const filePath = path.join(UPLOAD_DIR, output);

  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
  return `/uploads/${output}`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/api/state') {
    return sendJson(res, 200, loadState());
  }

  if (req.method === 'PUT' && url.pathname === '/api/state') {
    try {
      const raw = await readBody(req);
      const incoming = JSON.parse(raw || '{}');
      return sendJson(res, 200, saveState(incoming));
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/upload-image') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}');
      const imageUrl = saveDataUrlImage(body.dataUrl, body.filename || 'image');
      return sendJson(res, 200, { imageUrl });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (req.method === 'GET' && url.pathname.startsWith('/uploads/')) {
    const filePath = path.join(ROOT, url.pathname);
    if (!filePath.startsWith(UPLOAD_DIR)) {
      return sendJson(res, 403, { error: 'Forbidden' });
    }
    return sendFile(res, filePath);
  }

  if (req.method === 'GET') {
    const route = url.pathname === '/' ? '/index.html' : url.pathname;
    const filePath = path.join(ROOT, route);
    if (filePath.startsWith(ROOT)) {
      return sendFile(res, filePath);
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

server.listen(PORT, HOST, () => {
  console.log(`Map helper server running at http://${HOST}:${PORT}`);
});
