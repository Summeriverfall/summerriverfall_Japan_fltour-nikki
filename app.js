/* Fltour 運転日報 · 初版本地数据层（localStorage） */
(function (w) {
  const KEY = 'fltour-nikki-v1';

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
      trips: [emptyTrip(), emptyTrip(), emptyTrip()],
      accident: '',
      instruction: '',
      status: 'draft',
      submittedAt: '',
      updatedAt: new Date().toISOString(),
      ...r,
      ...partial,
    };
  }

  function seedReports() {
    const date = todayISO();
    const r = reiwaParts(date);
    return [
      {
        ...blankReport({
          id: 'r-demo-1',
          date,
          driverId: 'd1',
          vehicleId: 'v1',
          manager: '',
          startHour: '08',
          startMin: '00',
          endHour: '18',
          endMin: '30',
          meterStart: '45210',
          meterEnd: '45302',
          emptyKm: '18',
          rests: [
            { place: 'サービスエリア', from: '12:00', to: '12:40' },
            emptyRest(),
            emptyRest(),
          ],
          trips: [
            { depart: '08:20', pickup: 'なんば', pax: '2', dropoff: '関西空港', arrive: '09:15', wait: '10' },
            { depart: '10:40', pickup: '関西空港', pax: '3', dropoff: '心斎橋', arrive: '11:35', wait: '15' },
            { depart: '14:00', pickup: '梅田', pax: '1', dropoff: 'USJ', arrive: '14:40', wait: '20' },
            { depart: '16:10', pickup: 'USJ', pax: '4', dropoff: '難波', arrive: '16:55', wait: '' },
          ],
          accident: '',
          instruction: '',
          status: 'submitted',
          submittedAt: date + 'T18:42:00',
          y: r.y, m: r.m, d: r.d,
        }),
      },
    ];
  }

  function defaultState() {
    return {
      drivers: DEFAULT_DRIVERS,
      vehicles: DEFAULT_VEHICLES,
      driverVehicle: { ...DRIVER_VEHICLE },
      reports: seedReports(),
      logs: [
        {
          id: 'l-demo',
          reportId: 'r-demo-1',
          at: todayISO() + 'T19:05:00',
          who: '管理者',
          field: '空車距離',
          from: '15',
          to: '18',
        },
      ],
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
  function save(s) {
    localStorage.setItem(KEY, JSON.stringify(s));
  }

  function distanceKm(rep) {
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
    if (r) return r;
    r = blankReport({
      date: day,
      driverId,
      vehicleId: (s.driverVehicle && s.driverVehicle[driverId]) || '',
    });
    s.reports.unshift(r);
    save(s);
    return r;
  }

  function upsertReport(s, report, logEntry) {
    const i = s.reports.findIndex((x) => x.id === report.id);
    report.updatedAt = new Date().toISOString();
    if (i >= 0) s.reports[i] = report;
    else s.reports.unshift(report);
    if (logEntry) s.logs.unshift({ id: uid('l'), at: report.updatedAt, reportId: report.id, ...logEntry });
    save(s);
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

  w.Nikki = {
    KEY,
    load,
    save,
    uid,
    todayISO,
    reiwaParts,
    blankReport,
    emptyTrip,
    emptyRest,
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
    reset() {
      localStorage.removeItem(KEY);
      return load();
    },
  };
})(window);
