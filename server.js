/* Fltour 運転日報 · 本机/自有服务器 JSON 存储 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8090);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'nikki.json');
const SESS_FILE = path.join(DATA_DIR, 'sessions.json');
const ADMIN_USER = 'Admin';
const ADMIN_PASSWORD = process.env.NIKKI_ADMIN_PASSWORD || 'FltourAdmin2026';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const DEFAULT_DRIVERS = [
  { id: 'd1', name: '艾倫' },
  { id: 'd2', name: '肖哲' },
  { id: 'd3', name: '王鵬' },
  { id: 'd4', name: '邵明暁' },
  { id: 'd5', name: '桑勝旺' },
  { id: 'd6', name: '于成龍' },
  { id: 'd7', name: '宮城小伶' },
  { id: 'd8', name: '胡玉平' },
  { id: 'd9', name: '包自強' },
];
const DEFAULT_VEHICLES = [
  { id: 'v1', plate: 'なにわ330く1100' },
  { id: 'v2', plate: 'なにわ330う1107' },
  { id: 'v3', plate: 'なにわ302え····7', note: '车牌中间被遮，待补全' },
  { id: 'v4', plate: 'なにわ330き1110' },
  { id: 'v5', plate: 'なにわ330う1104' },
  { id: 'v6', plate: 'なにわ330き1105' },
  { id: 'v7', plate: 'なにわ330か1106' },
  { id: 'v8', plate: 'なにわ300あ6264' },
  { id: 'v9', plate: 'なにわ301う1111' },
];
const DRIVER_VEHICLE = {
  d1: 'v1', d2: 'v2', d3: 'v3', d4: 'v4', d5: 'v5',
  d6: 'v6', d7: 'v7', d8: 'v8', d9: 'v9',
};

function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function defaultState() {
  return {
    drivers: DEFAULT_DRIVERS,
    vehicles: DEFAULT_VEHICLES,
    driverVehicle: { ...DRIVER_VEHICLE },
    reports: [],
    logs: [],
  };
}
function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}
function loadState() {
  if (!fs.existsSync(DATA_FILE)) writeJson(DATA_FILE, defaultState());
  const s = readJson(DATA_FILE, defaultState());
  s.drivers = s.drivers || DEFAULT_DRIVERS;
  s.vehicles = s.vehicles || DEFAULT_VEHICLES;
  s.driverVehicle = s.driverVehicle || { ...DRIVER_VEHICLE };
  s.reports = s.reports || [];
  s.logs = s.logs || [];
  return s;
}
function saveState(s) {
  writeJson(DATA_FILE, s);
}
function loadSessions() {
  return readJson(SESS_FILE, {});
}
function saveSessions(ss) {
  writeJson(SESS_FILE, ss);
}
function normPlate(s) {
  return String(s || '')
    .normalize('NFKC')
    .replace(/[\s　\-ー－·・‧∙.]/g, '');
}
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}
function tokenOf(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}
function auth(req) {
  const token = tokenOf(req);
  if (!token) return null;
  const ss = loadSessions();
  return ss[token] || null;
}
function plateOf(state, driverId) {
  const vid = state.driverVehicle && state.driverVehicle[driverId];
  const v = (state.vehicles || []).find((x) => x.id === vid);
  return v ? v.plate : '';
}

async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    });
    return res.end();
  }

  if (url.pathname === '/api/health' && req.method === 'GET') {
    return json(res, 200, { ok: true, service: 'fltour-nikki' });
  }

  if (url.pathname === '/api/drivers' && req.method === 'GET') {
    const s = loadState();
    return json(res, 200, s.drivers.map((d) => ({ id: d.id, name: d.name })));
  }

  if (url.pathname === '/api/login' && req.method === 'POST') {
    const body = await readBody(req);
    const role = body.role === 'admin' ? 'admin' : 'driver';
    if (role === 'admin') {
      const user = String(body.user || body.username || '').trim();
      if (user !== ADMIN_USER || String(body.password || '') !== ADMIN_PASSWORD) {
        return json(res, 401, { error: '账号或密码不对' });
      }
      const token = crypto.randomBytes(24).toString('hex');
      const ss = loadSessions();
      ss[token] = { role: 'admin', user: ADMIN_USER, at: new Date().toISOString() };
      saveSessions(ss);
      return json(res, 200, { token, role: 'admin', user: ADMIN_USER });
    }
    const driverId = String(body.driverId || '').trim();
    const s = loadState();
    const driver = (s.drivers || []).find((d) => d.id === driverId);
    if (!driver) return json(res, 401, { error: '请选择乘务员' });
    const plate = plateOf(s, driverId);
    if (!plate) return json(res, 401, { error: '该乘务员未绑定车辆' });
    if (normPlate(body.password) !== normPlate(plate)) {
      return json(res, 401, { error: '车辆番号不对' });
    }
    const token = crypto.randomBytes(24).toString('hex');
    const ss = loadSessions();
    ss[token] = { role: 'driver', driverId, at: new Date().toISOString() };
    saveSessions(ss);
    return json(res, 200, { token, role: 'driver', driverId, name: driver.name });
  }

  const sess = auth(req);
  if (!sess) return json(res, 401, { error: '请先登录' });

  if (url.pathname === '/api/state' && req.method === 'GET') {
    return json(res, 200, loadState());
  }

  if (url.pathname === '/api/report' && req.method === 'PUT') {
    const body = await readBody(req);
    const report = body.report;
    if (!report || !report.id) return json(res, 400, { error: '缺少日报' });
    if (sess.role === 'driver' && report.driverId !== sess.driverId) {
      return json(res, 403, { error: '只能改自己的日报' });
    }
    const s = loadState();
    report.updatedAt = new Date().toISOString();
    const i = s.reports.findIndex((x) => x.id === report.id);
    if (i >= 0) s.reports[i] = report;
    else s.reports.unshift(report);
    if (body.log) {
      s.logs.unshift({
        id: 'l' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex'),
        at: report.updatedAt,
        reportId: report.id,
        ...body.log,
      });
    }
    saveState(s);
    return json(res, 200, { ok: true, updatedAt: report.updatedAt });
  }

  if (url.pathname === '/api/people' && req.method === 'PUT') {
    if (sess.role !== 'admin') return json(res, 403, { error: '仅管理员可改人员车辆' });
    const body = await readBody(req);
    const s = loadState();
    if (Array.isArray(body.drivers)) s.drivers = body.drivers;
    if (Array.isArray(body.vehicles)) s.vehicles = body.vehicles;
    if (body.driverVehicle && typeof body.driverVehicle === 'object') s.driverVehicle = body.driverVehicle;
    saveState(s);
    return json(res, 200, { ok: true });
  }

  if (url.pathname === '/api/logs' && req.method === 'PUT') {
    if (sess.role !== 'admin') return json(res, 403, { error: '仅管理员' });
    const body = await readBody(req);
    const s = loadState();
    if (Array.isArray(body.logs)) s.logs = body.logs;
    saveState(s);
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: 'not found' });
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  if (rel.startsWith('/data') || rel.includes('..')) {
    res.writeHead(404);
    return res.end('Not found');
  }
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404);
    return res.end('Not found');
  }
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://' + (req.headers.host || 'localhost'));
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return serveStatic(req, res, url);
  } catch (e) {
    if (!res.headersSent) json(res, 500, { error: 'server error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Fltour 運転日報 http://127.0.0.1:' + PORT + '/');
  console.log('司机 http://127.0.0.1:' + PORT + '/driver.html');
  console.log('管理 http://127.0.0.1:' + PORT + '/admin.html');
});
