/* Fltour 運転日報 · 客户端（优先自有服务器，断线时本机缓存） */
(function (w) {
  const KEY = 'fltour-nikki-v1';
  const API_BASE = (function () {
    try {
      const q = new URLSearchParams(location.search).get('api');
      if (q) return q.replace(/\/$/, '');
    } catch (_) {}
    if (w.NIKKI_API) return String(w.NIKKI_API).replace(/\/$/, '');
    return '';
  })();

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

  let useServer = false;
  let onSaveStatus = null;
  let pending = null;
  let saveTimer = 0;

  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function todayISO() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function reiwaParts(iso) {
    const [y, m, d] = (iso || todayISO()).split('-').map(Number);
    return { y: y - 2018, m, d };
  }
  function emptyTrip() {
    return { depart: '', pickup: '', pax: '', dropoff: '', arrive: '', wait: '' };
  }
  function emptyRest() {
    return { place: '', from: '', to: '' };
  }
  function tripFilled(t) {
    if (!t) return false;
    return !!(t.depart || t.pickup || t.pax || t.dropoff || t.arrive || t.wait);
  }
  function compactTrips(trips) {
    const list = Array.isArray(trips) ? trips : [];
    const filled = list.filter(tripFilled);
    return filled.length ? filled : [emptyTrip()];
  }
  function blankReport(partial) {
    const date = (partial && partial.date) || todayISO();
    const r = reiwaParts(date);
    return {
      id: uid('r'),
      date,
      driverId: '',
      vehicleId: '',
      manager: '',
      assistant: '',
      startPlace: '車庫',
      startHour: '',
      startMin: '',
      endPlace: '車庫',
      endHour: '',
      endMin: '',
      meterEnd: '',
      meterStart: '',
      emptyKm: '',
      rests: [emptyRest(), emptyRest(), emptyRest()],
      trips: [emptyTrip()],
      accident: '',
      instruction: '',
      status: 'draft',
      submittedAt: '',
      updatedAt: new Date().toISOString(),
      ...r,
      ...partial,
    };
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
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      const s = JSON.parse(raw);
      s.drivers = s.drivers || DEFAULT_DRIVERS;
      s.vehicles = s.vehicles || DEFAULT_VEHICLES;
      s.driverVehicle = s.driverVehicle || { ...DRIVER_VEHICLE };
      s.reports = s.reports || [];
      s.logs = s.logs || [];
      return s;
    } catch (_) {
      return defaultState();
    }
  }
  function saveLocal(s) {
    localStorage.setItem(KEY, JSON.stringify(s));
  }
  function token() {
    return sessionStorage.getItem('nikki-token') || '';
  }
  function authHeaders() {
    const h = { 'Content-Type': 'application/json' };
    const t = token();
    if (t) h.Authorization = 'Bearer ' + t;
    return h;
  }
  function api(p) {
    return API_BASE + p;
  }
  function setStatus(t) {
    if (typeof onSaveStatus === 'function') onSaveStatus(t);
  }
  function normPlate(s) {
    return String(s || '')
      .normalize('NFKC')
      .replace(/[\s　\-ー－·・‧∙.]/g, '');
  }

  async function ping() {
    try {
      const r = await fetch(api('/api/health'), { cache: 'no-store' });
      useServer = r.ok;
    } catch (_) {
      useServer = false;
    }
    return useServer;
  }

  async function fetchJson(p, opt) {
    const r = await fetch(api(p), opt);
    let j = {};
    try { j = await r.json(); } catch (_) {}
    if (!r.ok) {
      const err = new Error(j.error || ('请求失败 ' + r.status));
      err.status = r.status;
      throw err;
    }
    return j;
  }

  async function pullState() {
    const s = await fetchJson('/api/state', { headers: authHeaders(), cache: 'no-store' });
    saveLocal(s);
    return s;
  }

  function queue(kind, payload) {
    pending = { kind, payload };
    setStatus('保存中…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 450);
  }

  async function flush() {
    clearTimeout(saveTimer);
    const job = pending;
    pending = null;
    if (!job || !useServer || !token()) {
      setStatus(useServer ? '' : '未连上服务器，仅保存在本机');
      return;
    }
    try {
      if (job.kind === 'report') {
        await fetchJson('/api/report', {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify(job.payload),
        });
      } else if (job.kind === 'people') {
        await fetchJson('/api/people', {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify(job.payload),
        });
      } else if (job.kind === 'logs') {
        await fetchJson('/api/logs', {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify(job.payload),
        });
      }
      setStatus('已保存到服务器');
    } catch (e) {
      pending = job;
      setStatus(e.message || '保存失败');
    }
  }

  async function boot() {
    await ping();
    if (useServer && token()) {
      try {
        return await pullState();
      } catch (e) {
        if (e.status === 401) logout();
      }
    }
    return load();
  }

  async function publicDrivers() {
    await ping();
    if (useServer) {
      try { return await fetchJson('/api/drivers', { cache: 'no-store' }); }
      catch (_) {}
    }
    return load().drivers.map((d) => ({ id: d.id, name: d.name }));
  }

  async function loginDriver(driverId, password) {
    await ping();
    if (useServer) {
      const j = await fetchJson('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'driver', driverId, password }),
      });
      sessionStorage.setItem('nikki-token', j.token);
      sessionStorage.setItem('nikki-driver', driverId);
      sessionStorage.setItem('nikki-role', 'driver');
      return pullState();
    }
    const s = load();
    const vid = s.driverVehicle && s.driverVehicle[driverId];
    const plate = vehiclePlate(s, vid);
    if (!plate) throw new Error('该乘务员未绑定车辆');
    if (normPlate(password) !== normPlate(plate)) throw new Error('车辆番号不对');
    sessionStorage.setItem('nikki-driver', driverId);
    sessionStorage.setItem('nikki-role', 'driver');
    return s;
  }

  async function loginAdmin(user, password) {
    await ping();
    if (useServer) {
      const j = await fetchJson('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'admin', user, password }),
      });
      sessionStorage.setItem('nikki-token', j.token);
      sessionStorage.setItem('nikki-role', 'admin');
      sessionStorage.removeItem('nikki-driver');
      return pullState();
    }
    if (String(user || '').trim() !== 'Admin' || String(password || '') !== 'FltourAdmin2026') {
      throw new Error('账号或密码不对');
    }
    sessionStorage.setItem('nikki-role', 'admin');
    return load();
  }

  function logout() {
    sessionStorage.removeItem('nikki-token');
    sessionStorage.removeItem('nikki-driver');
    sessionStorage.removeItem('nikki-role');
  }

  function distanceKm(rep) {
    if (rep.meterEnd === '' || rep.meterStart === '' || rep.meterEnd == null || rep.meterStart == null) return '';
    const a = Number(rep.meterEnd);
    const b = Number(rep.meterStart);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return '';
    const d = a - b;
    return d >= 0 ? String(d) : '';
  }
  function driverName(s, id) {
    const d = (s.drivers || []).find((x) => x.id === id);
    return d ? d.name : '';
  }
  function vehiclePlate(s, id) {
    const v = (s.vehicles || []).find((x) => x.id === id);
    return v ? v.plate : '';
  }
  function findToday(s, driverId, date) {
    const day = date || todayISO();
    return (s.reports || []).find((r) => r.driverId === driverId && r.date === day) || null;
  }
  function ensureToday(s, driverId, date) {
    const day = date || todayISO();
    let r = findToday(s, driverId, day);
    if (r) {
      if (r.status !== 'submitted') {
        const before = JSON.stringify(r.trips || []);
        r.trips = compactTrips(r.trips);
        if (JSON.stringify(r.trips) !== before) {
          saveLocal(s);
          queue('report', { report: r, log: null });
        }
      }
      return r;
    }
    r = blankReport({
      date: day,
      driverId,
      vehicleId: (s.driverVehicle && s.driverVehicle[driverId]) || '',
    });
    s.reports.unshift(r);
    saveLocal(s);
    queue('report', { report: r, log: null });
    return r;
  }
  function upsertReport(s, report, logEntry) {
    const i = s.reports.findIndex((x) => x.id === report.id);
    report.updatedAt = new Date().toISOString();
    if (i >= 0) s.reports[i] = report;
    else s.reports.unshift(report);
    if (logEntry) s.logs.unshift({ id: uid('l'), at: report.updatedAt, reportId: report.id, ...logEntry });
    saveLocal(s);
    queue('report', { report, log: logEntry || null });
  }
  function savePeople(s) {
    saveLocal(s);
    queue('people', {
      drivers: s.drivers,
      vehicles: s.vehicles,
      driverVehicle: s.driverVehicle,
    });
  }
  function saveLogs(s) {
    saveLocal(s);
    queue('logs', { logs: s.logs });
  }
  function diffFields(before, after) {
    const labels = {
      driverId: '乗務員',
      vehicleId: '車両番号',
      date: '日付',
      startHour: '開始時',
      startMin: '開始分',
      endHour: '終了時',
      endMin: '終了分',
      meterStart: '乗務開始メーター',
      meterEnd: '乗務終了メーター',
      emptyKm: '空車距離',
      accident: '異常状況',
      instruction: '運行指示変更',
      manager: '運行管理者',
      assistant: '運行補助者',
    };
    const out = [];
    Object.keys(labels).forEach((k) => {
      const a = String(before[k] ?? '');
      const b = String(after[k] ?? '');
      if (a !== b) out.push({ field: labels[k], from: a, to: b });
    });
    if (JSON.stringify(before.trips || []) !== JSON.stringify(after.trips || [])) {
      out.push({ field: '主な経過地', from: '（行程）', to: '（已改）' });
    }
    if (JSON.stringify(before.rests || []) !== JSON.stringify(after.rests || [])) {
      out.push({ field: '休憩・睡眠', from: '（休息）', to: '（已改）' });
    }
    return out;
  }
  function hours() {
    return Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  }
  function mins() {
    return Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
  }
  function paxOptions() {
    return ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10+'];
  }
  function testRoster() {
    return DEFAULT_DRIVERS.map((d) => {
      const vid = DRIVER_VEHICLE[d.id];
      const v = DEFAULT_VEHICLES.find((x) => x.id === vid);
      return { id: d.id, name: d.name, plate: v ? v.plate : '' };
    });
  }

  w.addEventListener('pagehide', () => { flush(); });
  w.addEventListener('visibilitychange', () => {
    if (document.hidden) flush();
  });

  w.Nikki = {
    KEY,
    API_BASE,
    get useServer() { return useServer; },
    set onSaveStatus(fn) { onSaveStatus = fn; },
    load,
    save: saveLocal,
    savePeople,
    saveLogs,
    uid,
    todayISO,
    reiwaParts,
    blankReport,
    emptyTrip,
    emptyRest,
    compactTrips,
    distanceKm,
    driverName,
    vehiclePlate,
    findToday,
    ensureToday,
    upsertReport,
    diffFields,
    hours,
    mins,
    paxOptions,
    testRoster,
    boot,
    ping,
    flush,
    publicDrivers,
    loginDriver,
    loginAdmin,
    logout,
    token,
    reset() {
      localStorage.removeItem(KEY);
      return load();
    },
  };
})(window);
