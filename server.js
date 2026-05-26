const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { AppDatabase } = require('./src/db');
const { scoreSuppliers } = require('./src/scoring');
const { fetchMarketplaceCandidates } = require('./src/connectors');
const { crawlMarketplaces } = require('./src/browser-crawler');
const { buildExcelXml } = require('./src/exporter');
const { parseImportContent } = require('./src/importer');
const { extractProductInfo } = require('./src/product-extractor');

const argPort = process.argv.find((arg) => arg.startsWith('--port='));
const PORT = Number((argPort && argPort.split('=')[1]) || process.env.PORT || 5500);
const PUBLIC_DIR = path.join(__dirname, 'public');
const EXPORT_DIR = process.env.VERCEL ? path.join('/tmp', 'supplier-comparison-exports') : path.join(__dirname, 'exports');
const db = new AppDatabase();

async function handleRequest(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(req, res, url);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

const server = http.createServer(handleRequest);

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, 200, { ok: true, app: 'supplier-comparison-local-app' });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/requests') {
    sendJson(res, 200, { requests: db.listRequests() });
    return;
  }

  const suggestionMatch = url.pathname.match(/^\/api\/suggestions\/(products|models|warehouses|suppliers)$/);
  if (suggestionMatch && req.method === 'GET') {
    const suggestions = db.listSuggestions(suggestionMatch[1], url.searchParams.get('q') || '', 8);
    sendJson(res, 200, { suggestions });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/settings') {
    sendJson(res, 200, db.getSettings());
    return;
  }

  if (req.method === 'PUT' && url.pathname === '/api/settings') {
    const payload = await readJson(req);
    sendJson(res, 200, db.updateSettings(payload));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/requests') {
    const payload = await readJson(req);
    const saved = db.createRequest(payload);
    sendJson(res, 201, saved);
    return;
  }

  const requestMatch = url.pathname.match(/^\/api\/requests\/(\d+)$/);
  if (requestMatch && req.method === 'GET') {
    const data = db.getRequest(Number(requestMatch[1]));
    if (!data) return sendJson(res, 404, { error: 'Request not found' });
    sendJson(res, 200, data);
    return;
  }

  if (requestMatch && req.method === 'PUT') {
    const payload = await readJson(req);
    const saved = db.updateRequest(Number(requestMatch[1]), payload);
    if (!saved) return sendJson(res, 404, { error: 'Request not found' });
    sendJson(res, 200, saved);
    return;
  }

  if (requestMatch && req.method === 'DELETE') {
    const ok = db.deleteRequest(Number(requestMatch[1]));
    sendJson(res, ok ? 200 : 404, { ok });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/score') {
    const payload = await readJson(req);
    const settings = db.getSettings();
    const result = scoreSuppliers(payload.purchaseRequest || {}, payload.suppliers || [], {
      weights: payload.weights || settings.weights,
    });
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/fetch-marketplaces') {
    const payload = await readJson(req);
    const mode = payload.mode || 'browser';
    if (mode === 'html') {
      const candidates = await fetchMarketplaceCandidates(payload.query || '', payload.model || '');
      sendJson(res, 200, { candidates, warnings: ['Đang dùng chế độ HTML cũ, dữ liệu thường thiếu hoặc bị sàn chặn.'] });
      return;
    }
    const result = await crawlMarketplaces({
      query: payload.query || '',
      model: payload.model || '',
      platforms: payload.platforms || undefined,
      maxItems: payload.maxItems || 5,
    });
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/import-preview') {
    const payload = await readJson(req);
    const preview = parseImportContent(payload);
    sendJson(res, 200, preview);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/extract-product-info') {
    const payload = await readJson(req);
    const result = await extractProductInfo(payload);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/open-external') {
    const payload = await readJson(req);
    const externalUrl = String(payload.url || '').trim();
    if (!isSafeExternalUrl(externalUrl)) {
      sendJson(res, 400, { error: 'Invalid URL' });
      return;
    }
    openExternalUrl(externalUrl);
    sendJson(res, 200, { ok: true });
    return;
  }

  const scoreMatch = url.pathname.match(/^\/api\/requests\/(\d+)\/score$/);
  if (scoreMatch && req.method === 'POST') {
    const requestId = Number(scoreMatch[1]);
    const data = db.getRequest(requestId);
    if (!data) return sendJson(res, 404, { error: 'Request not found' });
    const result = scoreSuppliers(data.purchaseRequest, data.suppliers, db.getSettings());
    db.saveScores(requestId, result.ranked);
    sendJson(res, 200, result);
    return;
  }

  const exportMatch = url.pathname.match(/^\/api\/requests\/(\d+)\/export$/);
  if (exportMatch && req.method === 'GET') {
    const exported = buildExport(Number(exportMatch[1]));
    if (!exported) return sendJson(res, 404, { error: 'Request not found' });
    res.writeHead(200, {
      'content-type': 'application/vnd.ms-excel; charset=utf-8',
      'content-disposition': `attachment; filename="${exported.filename}"`,
    });
    res.end(exported.xml);
    return;
  }

  const saveExportMatch = url.pathname.match(/^\/api\/requests\/(\d+)\/export-save$/);
  if (saveExportMatch && req.method === 'POST') {
    const exported = buildExport(Number(saveExportMatch[1]));
    if (!exported) return sendJson(res, 404, { error: 'Request not found' });
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
    const filePath = path.join(EXPORT_DIR, exported.filename);
    fs.writeFileSync(filePath, exported.xml, 'utf8');
    sendJson(res, 200, {
      ok: true,
      filename: exported.filename,
      filePath,
      downloadUrl: `/api/exports/${encodeURIComponent(exported.filename)}`,
    });
    return;
  }

  const savedExportMatch = url.pathname.match(/^\/api\/exports\/([^/]+)$/);
  if (savedExportMatch && req.method === 'GET') {
    const filename = path.basename(decodeURIComponent(savedExportMatch[1]));
    const filePath = path.join(EXPORT_DIR, filename);
    if (!filePath.startsWith(EXPORT_DIR) || !fs.existsSync(filePath)) {
      return sendJson(res, 404, { error: 'Export file not found' });
    }
    res.writeHead(200, {
      'content-type': 'application/vnd.ms-excel; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  sendJson(res, 404, { error: 'API route not found' });
}

function isSafeExternalUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function openExternalUrl(value) {
  const url = String(value);
  let command;
  let args;
  if (process.platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', url];
  } else if (process.platform === 'darwin') {
    command = 'open';
    args = [url];
  } else {
    command = 'xdg-open';
    args = [url];
  }
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

function buildExport(requestId) {
  const data = db.getRequest(requestId);
  if (!data) return null;
  const settings = db.getSettings();
  const result = scoreSuppliers(data.purchaseRequest, data.suppliers, settings);
  const xml = buildExcelXml(data.purchaseRequest, result.ranked, settings);
  const filename = exportFilename(data.purchaseRequest);
  return { filename, xml };
}

function exportFilename(purchaseRequest) {
  const product = safeFilenamePart(purchaseRequest.product_name || 'yeu-cau');
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  return `supplier-ranking-${purchaseRequest.id}-${product}-${timestamp}.xls`;
}

function safeFilenamePart(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .toLowerCase() || 'export';
}

function serveStatic(req, res, url) {
  const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'content-type': mimeType(filePath) });
    res.end(data);
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10_000_000) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
  }[ext] || 'application/octet-stream';
}

function listen(port, attemptsLeft = 10) {
  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && attemptsLeft > 0) {
      listen(port + 1, attemptsLeft - 1);
      return;
    }
    throw error;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Supplier comparison app running at http://127.0.0.1:${port}`);
  });
}

if (require.main === module) {
  listen(PORT);
}

module.exports = {
  handleRequest,
  handleApi,
};
