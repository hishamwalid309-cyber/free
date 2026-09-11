#!/usr/bin/env node
/* =========================================================
   شحنلي | Shahnly — بوابة Node (مكتبة قياسية فقط)
   1) تخدم الموقع الثابت (index.html، assets/...)
   2) تنفّذ نفس عقد ARCHITECTURE.md على /api/v1/*
   3) لو فيه BACKEND_UPSTREAM بتمرّر الطلبات له (Python/C++) وترجّع رده بالحرف
   التشغيل: node backend/node/server.js --port 8790
   ========================================================= */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const CFG = {
  port: Number(process.env.PORT || 8790),
  mode: process.env.PROVIDER_MODE || 'demo',
  providerUrl: process.env.PROVIDER_URL || '',
  providerKey: process.env.PROVIDER_KEY || '',
  failureRate: Number(process.env.DEMO_FAILURE_RATE || 0.05),
  maxAttempts: Number(process.env.MAX_ATTEMPTS || 3),
  ordersFile: process.env.ORDERS_FILE || path.join(__dirname, 'orders.jsonl'),
  dbPath: process.env.DB_PATH || path.join(__dirname, 'shahnly.db'),
  sqlSchema: path.join(ROOT, 'backend', 'sql', 'schema.sql'),
  useDb: ['1', 'true', 'yes'].indexOf(String(process.env.SHN_SQL || '').toLowerCase()) >= 0 || !!process.env.DB_PATH,
  upstream: (process.env.BACKEND_UPSTREAM || '').replace(/\/$/, ''),
  version: '1.0.0'
};

/* ------------------ جدول الدول: مصدر واحد مع الموقع ------------------ */
const FALLBACK = [
  { code: 'EG', name: 'مصر', nameEn: 'Egypt', flag: '🇪🇬', dial: '20', minDigits: 10, maxDigits: 10, pattern: '^1[0125]\\d{8}$', example: '01012345678' }
];

function loadCountries() {
  try {
    const src = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'countries.js'), 'utf8');
    const re = /\{\s*c:\s*'([A-Z]{2})',\s*ar:\s*'([^']*)',\s*en:\s*'([^']*)',\s*f:\s*'([^']*)',\s*dial:\s*'(\d+)',\s*min:\s*(\d+),\s*max:\s*(\d+),\s*pat:\s*'([^']*)',\s*ex:\s*'([^']*)'/g;
    const out = [];
    let m;
    while ((m = re.exec(src)) !== null) {
      out.push({
        code: m[1], name: m[2], nameEn: m[3], flag: m[4], dial: m[5],
        minDigits: Number(m[6]), maxDigits: Number(m[7]),
        pattern: m[8].replace(/\\\\d/g, '\\d'), example: m[9]
      });
    }
    return out.length >= 10 ? out : FALLBACK;
  } catch (e) {
    return FALLBACK;
  }
}
const COUNTRIES = loadCountries();
const byCode = c => COUNTRIES.find(x => x.code === String(c || '').toUpperCase()) || null;

/* ------------------ تحقق دولي (نفس منطق الموقع) ------------------ */
const digitsOf = v => String(v == null ? '' : v).replace(/\D/g, '');

function validatePhone(value, countryCode) {
  const c = byCode(countryCode) || byCode('EG') || COUNTRIES[0];
  const d = digitsOf(value);
  if (!d) return { ok: false, reason: 'empty', e164: null, country: c, message: 'رقم الهاتف مطلوب' };
  let nat = d.replace(/^00/, '');
  if (nat.indexOf(c.dial) === 0 && nat.length > c.dial.length + 4) nat = nat.slice(c.dial.length);
  nat = nat.replace(/^0+/, '');
  if (nat.length < c.minDigits || nat.length > c.maxDigits) {
    return { ok: false, reason: 'invalid_length', e164: null, country: c, message: `الرقم لازم يكون من ${c.minDigits} لـ ${c.maxDigits} رقم` };
  }
  if (!new RegExp(c.pattern).test(nat)) {
    return { ok: false, reason: 'invalid_pattern', e164: null, country: c, message: `الرقم مش مطابق لصيغة ${c.nameEn} (${c.example})` };
  }
  return { ok: true, reason: 'ok', e164: '+' + c.dial + nat, country: c };
}

function validateGeneric(value) {
  const d = digitsOf(value).replace(/^00/, '');
  if (d.length >= 6 && d.length <= 15) return { ok: true, reason: 'generic', e164: '+' + d };
  return { ok: false, reason: d.length < 6 ? 'too_short' : 'too_long', e164: null };
}

/* ------------------ طبقة SQL (اختيارية) ------------------
   بتشتغل لما SHN_SQL=1 أو DB_PATH يكون مظبوط، وبتستخدم node:sqlite (Node 22.5+).
   لو مش متاح → الشغل بيكمل على orders.jsonl عادي بدون أي خطأ. */
let DB = null;
let DB_ERROR = '';
const ts = () => nowIso().slice(0, 19).replace('T', ' ');

/* تعبئة الدول والعملات من assets/js/countries.js (مصدر واحد مع الموقع)
   مهم: من غيرها بيفشل إدخال الأوردر بسبب قيد المفتاح الأجنبي على العملة. */
function seedDb(db) {
  let src = '';
  try {
    src = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'countries.js'), 'utf8');
  } catch (e) {
    DB_ERROR = 'مش لاقي countries.js لتعبئة الجداول';
    return 0;
  }
  const re = /\{\s*c:\s*'([A-Z]{2})',\s*ar:\s*'([^']*)',\s*en:\s*'([^']*)',\s*f:\s*'([^']*)',\s*dial:\s*'(\d+)',\s*min:\s*(\d+),\s*max:\s*(\d+),\s*pat:\s*'([^']*)',\s*ex:\s*'([^']*)',\s*zone:\s*'(\w+)',\s*lang:\s*'(\w+)',\s*cur:\s*\{\s*code:\s*'([A-Z]{3})',\s*sym:\s*'([^']*)',\s*dec:\s*(\d+),\s*rate:\s*([\d.]+),\s*pos:\s*'(\w+)'/g;
  const curs = new Map();
  const rows = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    const cur = { code: m[12], sym: m[13], dec: Number(m[14]), rate: Number(m[15]), pos: m[16] };
    curs.set(cur.code, cur);
    rows.push({
      code: m[1], ar: m[2], en: m[3], flag: m[4], dial: m[5],
      min: Number(m[6]), max: Number(m[7]), pat: m[8].replace(/\\\\d/g, '\\d'),
      ex: m[9], zone: m[10], lang: m[11], cur: cur.code
    });
  }
  let n = 0;
  try {
    const insCur = db.prepare('INSERT INTO currencies(code, symbol, decimals, rate_per_egp, position) VALUES (?,?,?,?,?) ' +
      'ON CONFLICT(code) DO UPDATE SET symbol=excluded.symbol, decimals=excluded.decimals, ' +
      'rate_per_egp=excluded.rate_per_egp, position=excluded.position');
    curs.forEach(c => insCur.run(c.code, c.sym, c.dec, c.rate, c.pos));

    const insCo = db.prepare('INSERT INTO countries(code, name_ar, name_en, flag, dial, min_digits, max_digits, ' +
      'pattern, example, zone, lang, currency_code) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ' +
      'ON CONFLICT(code) DO UPDATE SET name_ar=excluded.name_ar, name_en=excluded.name_en, flag=excluded.flag, ' +
      'dial=excluded.dial, min_digits=excluded.min_digits, max_digits=excluded.max_digits, pattern=excluded.pattern, ' +
      'example=excluded.example, zone=excluded.zone, lang=excluded.lang, currency_code=excluded.currency_code');
    rows.forEach(r => insCo.run(r.code, r.ar, r.en, r.flag, r.dial, r.min, r.max, r.pat, r.ex, r.zone, r.lang, r.cur));
    n = rows.length;
  } catch (e) {
    DB_ERROR = 'seed_failed: ' + e.message;
  }
  return n;
}

function openDb() {
  if (!CFG.useDb) return null;
  let DatabaseSync;
  try {
    ({ DatabaseSync } = require('node:sqlite'));
  } catch (e) {
    DB_ERROR = 'node:sqlite مش متاح (محتاج Node 22.5+) — الشغل على orders.jsonl';
    return null;
  }
  try {
    const db = new DatabaseSync(CFG.dbPath);
    db.exec('PRAGMA foreign_keys = ON;');
    if (fs.existsSync(CFG.sqlSchema)) {
      const clean = fs.readFileSync(CFG.sqlSchema, 'utf8')
        .split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
      clean.split(';').map(s => s.trim()).filter(Boolean).forEach(stmt => {
        try { db.exec(stmt); } catch (e) { /* الجدول موجود بالفعل */ }
      });
    }
    /* تعبئة الدول والعملات تلقائيًا (مرة واحدة) لو الجدول فاضي */
    try {
      const cnt = db.prepare('SELECT COUNT(*) AS c FROM countries').get();
      if (!cnt || !cnt.c || cnt.c < 10) seedDb(db);
    } catch (e) {
      DB_ERROR = 'seed_check: ' + e.message;
    }
    return db;
  } catch (e) {
    DB_ERROR = 'فشل فتح قاعدة البيانات: ' + e.message;
    return null;
  }
}
DB = openDb();

function dbSaveJob(job) {
  if (!DB) return;
  try {
    const last = (job.timeline && job.timeline[job.timeline.length - 1]) || {};
    /* الأوردر: نحدّث حالته (لو مش مسجّل بنسجّله بالبيانات المتاحة) */
    DB.prepare('INSERT INTO orders(id, game, package, package_label, player_id, region, amount_base, ' +
      'currency_code, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ' +
      'ON CONFLICT(id) DO UPDATE SET status=excluded.status, updated_at=excluded.updated_at')
      .run(job.orderId, String(job.game || ''), String(job.package || ''), job.packageLabel || '',
        job.playerId || '', job.region || null, Number(job.amount || 0), job.currency || 'EGP',
        job.status, ts(), ts());

    const exists = DB.prepare('SELECT job_id FROM jobs WHERE job_id = ?').get(job.jobId);
    if (!exists) {
      DB.prepare('INSERT INTO jobs(job_id, order_id, status, attempts, max_attempts, progress, provider_ref, ' +
        'idempotency_key, mode, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .run(job.jobId, job.orderId, job.status, job.attempts || 0, CFG.maxAttempts, job.progress || 0,
          job.providerRef || null, job.idempotencyKey || job.orderId, CFG.mode, ts(), ts());
      DB.prepare('INSERT INTO job_events(job_id, status, message, at) VALUES (?,?,?,?)')
        .run(job.jobId, 'queued', 'دخل الطابور', ts());
    }
    DB.prepare('UPDATE jobs SET status=?, attempts=?, progress=?, provider_ref=COALESCE(?, provider_ref), ' +
      'failure_reason=?, delivered_at=COALESCE(delivered_at, ?), updated_at=? WHERE job_id=?')
      .run(job.status, job.attempts || 0, job.progress || 0, job.providerRef || null,
        job.status === 'failed' ? (last.message || null) : null,
        job.status === 'delivered' ? ts() : null, ts(), job.jobId);
    DB.prepare('INSERT INTO job_events(job_id, status, message, at) VALUES (?,?,?,?)')
      .run(job.jobId, job.status, last.message || '', ts());
  } catch (e) {
    DB_ERROR = 'db_write: ' + e.message;
  }
}

function dbReport() {
  if (!DB) {
    return { source: 'jsonl', note: DB_ERROR || 'SQL مش مفعّل (شغّل بـ SHN_SQL=1 أو DB_PATH)', jobsInMemory: jobs.size };
  }
  const one = sql => { try { return DB.prepare(sql).get() || {}; } catch (e) { return {}; } };
  const many = sql => { try { return DB.prepare(sql).all(); } catch (e) { return []; } };
  return {
    source: 'sql',
    orders: one('SELECT COUNT(*) AS c FROM orders').c || 0,
    delivered: one("SELECT COUNT(*) AS c FROM orders WHERE status='delivered'").c || 0,
    failed: one("SELECT COUNT(*) AS c FROM orders WHERE status='failed'").c || 0,
    jobs: one('SELECT COUNT(*) AS c FROM jobs').c || 0,
    revenueEgp: one("SELECT COALESCE(SUM(amount_base),0) AS c FROM orders WHERE payment_status='paid'").c || 0,
    countries: one('SELECT COUNT(*) AS c FROM countries').c || 0,
    topGames: many('SELECT game, COUNT(*) AS orders, SUM(amount_base) AS egp FROM orders GROUP BY game ORDER BY orders DESC LIMIT 5'),
    topupSuccess: many('SELECT * FROM v_topup_success ORDER BY jobs_total DESC'),
    daily: many('SELECT * FROM v_daily_sales ORDER BY day DESC LIMIT 7')
  };
}

/* ------------------ تخزين + محرّك الشحن ------------------ */
const jobs = new Map();
const byIdem = new Map();
let seq = 0;
const startedAt = Date.now();

function log(line) {
  try { fs.appendFileSync(CFG.ordersFile, JSON.stringify(line) + '\n'); } catch (e) { /* ignore */ }
}

function save(job) {
  jobs.set(job.jobId, job);
  if (job.idempotencyKey) byIdem.set(job.idempotencyKey, job.jobId);
  log(job);
  dbSaveJob(job);   /* مرآة SQL لو مفعّلة */
  return job;
}
function nowIso() { return new Date().toISOString(); }

function setStatus(job, status, message) {
  job.status = status;
  job.updatedAt = nowIso();
  job.progress = ({ queued: 5, processing: 55, retrying: 70, delivered: 100, failed: 100 })[status] || 0;
  job.timeline.push({ status, at: job.updatedAt, message: message || '' });
  save(job);
}

function delayFor(attempt) {
  const base = CFG.mode === 'demo' ? [1000, 2000, 3000] : [2000, 4000, 8000];
  return base[Math.min(attempt, base.length - 1)];
}

function providerCall(job) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ orderId: job.orderId, game: job.game, package: job.package, playerId: job.playerId, attempt: job.attempts });
    if (CFG.mode === 'live' && CFG.providerUrl) {
      const sig = crypto.createHmac('sha256', CFG.providerKey).update(body).digest('hex');
      const req = http.request(CFG.providerUrl + '/topup/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'X-Signature': sig }
      }, res => {
        let data = '';
        res.on('data', ch => { data += ch; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data || '{}');
            resolve({ ok: res.statusCode < 400 && parsed.ok !== false, message: parsed.message || '' });
          } catch (e) { resolve({ ok: false, message: 'provider_bad_json' }); }
        });
      });
      req.on('error', err => resolve({ ok: false, message: 'provider_error: ' + err.message }));
      req.end(body);
      return;
    }
    /* وضع الديمو: محاكاة حتمية لنفس الأوردر */
    const seed = job.orderId + ':' + job.attempts;
    const h = crypto.createHash('md5').update(seed).digest('hex');
    const roll = parseInt(h.slice(0, 4), 16) / 65535;
    setTimeout(() => {
      resolve({ ok: roll >= CFG.failureRate, message: roll >= CFG.failureRate ? 'تم تنفيذ الشحن على المزود (محاكاة)' : 'المزود رجع خطأ مؤقت (محاكاة)' });
    }, 500);
  });
}

function runJob(jobId) {
  const job = jobs.get(jobId);
  if (!job || job.status === 'delivered' || job.status === 'failed') return;
  job.attempts += 1;
  setStatus(job, 'processing', 'attempt ' + job.attempts);

  providerCall(job).then(res => {
    if (res.ok) {
      job.providerRef = 'PRV-' + (CFG.mode === 'live' ? 'LIVE' : 'DEMO') + '-' + (1000 + jobs.size);
      setStatus(job, 'delivered', res.message);
      return;
    }
    if (job.attempts >= CFG.maxAttempts) {
      setStatus(job, 'failed', res.message);
      return;
    }
    setStatus(job, 'retrying', res.message);
    setTimeout(() => runJob(job.jobId), delayFor(job.attempts));
  });
}

function etaSeconds(job) {
  if (job.status === 'delivered' || job.status === 'failed') return 0;
  return Math.max(3, (CFG.maxAttempts - job.attempts + 1) * 4);
}

/* ------------------ أدوات HTTP ------------------ */
function send(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Signature',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}
function fail(res, code, errCode, message, details) {
  send(res, code, { ok: false, error: { code: errCode, message: message, details: details || [] } });
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', ch => {
      data += ch;
      if (data.length > 1e6) { reject(new Error('payload_too_large')); req.destroy(); }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('invalid_json')); }
    });
    req.on('error', reject);
  });
}
function proxy(req, res, rawBody) {
  const target = CFG.upstream + req.url;
  const opts = { method: req.method, headers: { 'Content-Type': 'application/json' } };
  const pReq = http.request(target, opts, pRes => {
    let data = '';
    pRes.on('data', ch => { data += ch; });
    pRes.on('end', () => {
      res.writeHead(pRes.statusCode || 502, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(data);
    });
  });
  pReq.on('error', err => fail(res, 502, 'upstream_error', String(err.message)));
  pReq.end(rawBody || '');
}

/* ------------------ الموقع الثابت ------------------ */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.woff2': 'font/woff2'
};

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const filePath = path.join(ROOT, path.normalize(rel).replace(/^([\\/])+/, ''));
  if (!filePath.startsWith(ROOT)) return fail(res, 403, 'forbidden', 'المسار غير مسموح');
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      const notFound = path.join(ROOT, '404.html');
      return fs.readFile(notFound, (e2, html) => {
        if (e2) return fail(res, 404, 'not_found', 'المسار غير موجود');
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      });
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ------------------ الراوتر ------------------ */
function handleApi(req, res, pathname, rawBody) {
  const p = pathname.replace(/^\/api\/v1/, '') || '/';

  if (p === '/health') {
    const counts = { total: jobs.size, queued: 0, processing: 0, delivered: 0, failed: 0 };
    jobs.forEach(j => {
      if (j.status === 'queued') counts.queued++;
      else if (j.status === 'processing' || j.status === 'retrying') counts.processing++;
      else if (j.status === 'delivered') counts.delivered++;
      else if (j.status === 'failed') counts.failed++;
    });
    return send(res, 200, { ok: true, service: 'shahnly-topup-node', version: CFG.version, uptimeSec: Math.round((Date.now() - startedAt) / 1000), mode: CFG.mode, jobs: counts });
  }

  if (p === '/countries') {
    return send(res, 200, { ok: true, count: COUNTRIES.length, countries: COUNTRIES });
  }

  if (p === '/validate') {
    return readBody(req).then(body => {
      const r = validatePhone(body.phone, body.country);
      const errors = [];
      if (!r.ok) errors.push({ field: 'phone', code: r.reason, message: r.message });
      const pid = digitsOf(body.playerId);
      if (body.playerId && (pid.length < 6 || pid.length > 20)) {
        errors.push({ field: 'playerId', code: 'invalid_length', message: 'آيدي اللاعب لازم من 6 لـ 20 رقم' });
      }
      const warnings = [];
      if (!byCode(body.country)) warnings.push({ field: 'country', code: 'unknown_country', message: 'الدولة غير معروفة — تم استخدام القواعد العامة' });
      return send(res, 200, {
        ok: true, valid: errors.length === 0, country: r.country ? r.country.code : null,
        phoneE164: r.ok ? r.e164 : null, playerId: body.playerId || null, errors, warnings
      });
    }).catch(err => fail(res, 400, err.message === 'invalid_json' ? 'invalid_json' : 'invalid_input', 'جسم الطلب غير صحيح'));
  }

  if (p === '/topup' && req.method === 'POST') {
    return readBody(req).then(body => {
      if (!body.orderId || !body.game || !body.playerId) {
        return fail(res, 400, 'invalid_input', 'حقول ناقصة: orderId / game / playerId');
      }
      const idem = body.idempotencyKey || body.orderId;
      if (byIdem.has(idem)) {
        const ex = jobs.get(byIdem.get(idem));
        return send(res, 200, { ok: true, jobId: ex.jobId, orderId: ex.orderId, status: ex.status, attempts: ex.attempts, etaSeconds: etaSeconds(ex), duplicate: true });
      }
      if (jobs.size > 500) return fail(res, 503, 'engine_busy', 'الطابور ممتلي — حاول تاني بعد شوية');

      seq += 1;
      const job = {
        jobId: 'JOB-' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + String(seq).padStart(4, '0'),
        orderId: body.orderId, game: body.game, package: body.package || null, packageLabel: body.packageLabel || '',
        playerId: body.playerId, region: body.region || null, amount: body.amount || 0, currency: body.currency || 'EGP',
        payment: body.payment || null, customer: body.customer || null,
        status: 'queued', attempts: 0, progress: 5, providerRef: '', idempotencyKey: idem,
        createdAt: nowIso(), updatedAt: nowIso(),
        timeline: [{ status: 'queued', at: nowIso(), message: 'دخل الطابور' }]
      };
      save(job);
      setTimeout(() => runJob(job.jobId), 400);
      return send(res, 202, { ok: true, jobId: job.jobId, orderId: job.orderId, status: 'queued', attempts: 0, etaSeconds: etaSeconds(job), duplicate: false });
    }).catch(err => fail(res, 400, 'invalid_json', 'جسم الطلب مش JSON صحيح'));
  }

  /* تقرير SQL (أو تقرير بسيط من orders.jsonl لو SQL مقفول) */
  if (p === '/report' || p === '/stats') {
    if (DB) return send(res, 200, { ok: true, source: 'sql', report: dbReport() });

    let lines = [];
    try {
      lines = fs.readFileSync(CFG.ordersFile, 'utf8').split('\n').filter(Boolean);
    } catch (e) { lines = []; }
    const jm = new Map();
    const games = new Map();
    let orders = 0, paid = 0, revenue = 0, delivered = 0, failed = 0;
    lines.forEach(line => {
      let rec;
      try { rec = JSON.parse(line); } catch (e) { return; }
      if (rec.jobId) {
        jm.set(rec.jobId, rec);
        if (rec.status === 'delivered') delivered++;
        if (rec.status === 'failed') failed++;
      }
      if (rec.id && rec.game) {
        orders++;
        if (rec.payment && rec.payment.status === 'paid') { paid++; revenue += Number(rec.total || 0); }
        const g = String((rec.game && rec.game.id) || rec.game);
        const cur = games.get(g) || { game: g, orders: 0, egp: 0 };
        cur.orders++;
        cur.egp += Number(rec.total || 0);
        games.set(g, cur);
      }
    });
    return send(res, 200, {
      ok: true,
      source: 'jsonl',
      note: DB_ERROR || 'SQL مش مفعّل — شغّل الخدمة بـ SHN_SQL=1 أو DB_PATH للحصول على تقارير كاملة',
      report: {
        orders: orders, paidOrders: paid, deliveredOrders: delivered, failedJobs: failed,
        revenueEgp: Math.round(revenue), jobs: jm.size,
        topGames: Array.from(games.values()).sort((a, b) => b.orders - a.orders).slice(0, 5),
        inMemoryJobs: jobs.size
      }
    });
  }

  const m = /^\/topup\/([A-Za-z0-9\-_]+)$/.exec(p);
  if (m) {
    const job = jobs.get(m[1]);
    if (!job) return fail(res, 404, 'job_not_found', 'الوظيفة مش موجودة');
    return send(res, 200, {
      ok: true, jobId: job.jobId, orderId: job.orderId, status: job.status, attempts: job.attempts,
      progress: job.progress, providerRef: job.providerRef,
      message: job.timeline.length ? job.timeline[job.timeline.length - 1].message : '',
      createdAt: job.createdAt, updatedAt: job.updatedAt, timeline: job.timeline
    });
  }

  return fail(res, 404, 'not_found', 'المسار غير موجود');
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const pathname = u.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Signature', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' });
    return res.end();
  }

  if (pathname.startsWith('/api/v1')) {
    if (CFG.upstream) {
      let raw = '';
      req.on('data', ch => { raw += ch; });
      req.on('end', () => proxy(req, res, raw));
      return;
    }
    return handleApi(req, res, pathname, '');
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'method_not_allowed', 'الميثود غير مدعومة');
  return serveStatic(req, res, pathname);
});

/* ------------------ تشغيل ------------------ */
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) CFG.port = Number(args[i + 1]);
  if (args[i].startsWith('--port=')) CFG.port = Number(args[i].slice(7));
  if (args[i] === '--db' && args[i + 1]) { CFG.dbPath = args[i + 1]; CFG.useDb = true; }
  if (args[i].startsWith('--db=')) { CFG.dbPath = args[i].slice(5); CFG.useDb = true; }
}

/* تجهيز قاعدة البيانات فقط ثم الخروج:  node server.js --init-db */
if (args.includes('--init-db')) {
  if (!CFG.useDb) { CFG.useDb = true; DB = openDb(); }
  else if (!DB) { DB = openDb(); }
  if (DB) {
    const rep = dbReport();
    console.log('✅ قاعدة البيانات جاهزة: ' + CFG.dbPath);
    console.log('   الدول المخزّنة: ' + (rep.countries || 0) + ' · الأوردرات: ' + (rep.orders || 0) + ' · الوظائف: ' + (rep.jobs || 0));
    process.exit(0);
  }
  console.log('⚠️ تعذّر تفعيل SQL: ' + (DB_ERROR || 'شغّل بـ SHN_SQL=1 أو --db=مسار'));
  process.exit(1);
}

if (args.includes('--selftest')) {
  let pass = 0, fail_ = 0;
  const check = (name, cond) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail_++; console.log('  ✗ ' + name); } };
  console.log('=== shahnly-topup-node selftest ===');
  check('country table loaded (>= 50)', COUNTRIES.length >= 50);
  check('EG valid local', validatePhone('01012345678', 'EG').ok === true);
  check('EG valid with dial', validatePhone('+201012345678', 'EG').ok === true);
  check('EG invalid rejected', validatePhone('01000000000', 'EG').ok === false);
  check('SA valid', validatePhone('0512345678', 'SA').ok === true);
  check('FR valid', validatePhone('0612345678', 'FR').ok === true);
  check('generic E.164 accepted', validateGeneric('+15551234567').ok === true);
  check('generic too short rejected', validateGeneric('123').ok === false);
  const p = validatePhone('01012345678', 'EG');
  check('E.164 output', p.e164 === '+201012345678');
  /* طبقة SQL: بنتحقق بس إنها اتحمّلت لما تكون مفعّلة (مش بنفشل لو مقفولة) */
  if (CFG.useDb) {
    check('SQL layer loaded (node:sqlite)', !!DB);
    if (DB) {
      const rep = dbReport();
      check('SQL report readable (orders/jobs counts)', typeof rep.orders === 'number' && typeof rep.jobs === 'number');
    }
  } else {
    console.log('  ℹ SQL مقفول — شغّل بـ SHN_SQL=1 أو --db=مسار لتفعيل تقارير SQL');
  }
  console.log(fail_ === 0 ? 'PASS' : 'FAIL (' + fail_ + ' failed)');
  process.exit(fail_ === 0 ? 0 : 1);
}

server.listen(CFG.port, () => {
  console.log('🎮 Shahnly Node gateway');
  console.log('   site  : http://127.0.0.1:' + CFG.port + '/');
  console.log('   api   : http://127.0.0.1:' + CFG.port + '/api/v1/health');
  console.log('   mode  : ' + CFG.mode + (CFG.upstream ? ' (upstream: ' + CFG.upstream + ')' : ' (local engine)'));
  console.log('   countries: ' + COUNTRIES.length);
  console.log('   sql   : ' + (DB ? 'مفعّل · ' + CFG.dbPath
    : 'مقفول (' + (DB_ERROR || 'شغّل بـ SHN_SQL=1 أو --db=مسار') + ')'));
  if (DB) console.log('   report: http://127.0.0.1:' + CFG.port + '/api/v1/report');
});
