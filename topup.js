/* =========================================================
   شحنلي | Shahnly — محرّك الشحن التلقائي (Auto Top-Up Engine)
   ينفّذ نفس عقد ARCHITECTURE.md:
   الحالات: queued → processing → retrying → delivered | failed
   محاولات: 3 · backoff: 2s/4s/8s (offset: 1s/2s/3s) · idempotencyKey
   المزوّد: demo (محاكاة) أو live (POST + X-Signature HMAC-SHA256)
   ولو فيه خدمة backend شغالة (config.backend.url) يبعتلها ويستخدم ردّها.
   ========================================================= */
(function () {
  'use strict';

  var CFG = (window.APP_CONFIG || {});
  var BACKEND = CFG.backend || {};
  var LS_JOBS = 'shahnly_jobs_v1';
  var MAX_ATTEMPTS = 3;
  var listeners = [];
  var timers = {};

  function nowIso() { return new Date().toISOString(); }
  function uid(prefix, n) {
    var s = String(n || Math.floor(Math.random() * 9000) + 1000);
    return prefix + '-' + s;
  }
  function lsGet(k, fb) {
    try { var raw = window.localStorage.getItem(k); return raw ? JSON.parse(raw) : fb; }
    catch (e) { return fb; }
  }
  function lsSet(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function delayFor(mode, attempt) {
    var base = mode === 'demo' ? [1000, 2000, 3000] : [2000, 4000, 8000];
    return base[Math.min(attempt, base.length - 1)];
  }

  /* ------------------ التخزين ------------------ */
  function allJobs() { return lsGet(LS_JOBS, {}) || {}; }
  function saveJob(job) {
    var jobs = allJobs();
    jobs[job.id] = job;
    lsSet(LS_JOBS, jobs);
    return job;
  }
  function getJob(id) { return allJobs()[String(id || '').toUpperCase()] || null; }
  function listJobs() {
    var jobs = allJobs(), out = [];
    for (var k in jobs) if (Object.prototype.hasOwnProperty.call(jobs, k)) out.push(jobs[k]);
    out.sort(function (a, b) { return (b.createdAtMs || 0) - (a.createdAtMs || 0); });
    return out;
  }
  function findByIdem(key) {
    var jobs = allJobs();
    for (var k in jobs) if (jobs[k].idempotencyKey === key) return jobs[k];
    return null;
  }

  /* ------------------ الأحداث ------------------ */
  function emit(job) {
    listeners.forEach(function (fn) { try { fn(job); } catch (e) { /* ignore */ } });
    try {
      document.dispatchEvent(new CustomEvent('shn:topup', { detail: { job: job } }));
    } catch (e) { /* old browsers */ }
  }
  function onChange(fn) { if (typeof fn === 'function') listeners.push(fn); }

  /* ------------------ HMAC-SHA256 للتوقيع (للمزود الحقيقي) ------------------ */
  function hmacHex(message, key) {
    if (!window.crypto || !window.crypto.subtle || !window.TextEncoder) return Promise.resolve('');
    var enc = new TextEncoder();
    return window.crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
      .then(function (k) { return window.crypto.subtle.sign('HMAC', k, enc.encode(message)); })
      .then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) {
          return ('0' + b.toString(16)).slice(-2);
        }).join('');
      })
      .catch(function () { return ''; });
  }

  /* ------------------ محوّل المزود ------------------ */
  function providerRef(job) {
    var seed = (job.orderId || '') + (job.attempts || 0);
    var n = 0;
    for (var i = 0; i < seed.length; i++) n = (n * 31 + seed.charCodeAt(i)) % 9000;
    return 'PRV-' + (BACKEND.mode === 'live' ? 'LIVE' : 'DEMO') + '-' + (1000 + n);
  }

  function callProvider(job) {
    var mode = BACKEND.mode || 'demo';

    if (mode === 'live' && BACKEND.url) {
      var body = JSON.stringify({
        orderId: job.orderId, game: job.game, package: job.package,
        playerId: job.playerId, region: job.region, attempt: job.attempts
      });
      return hmacHex(body, BACKEND.key || '').then(function (sig) {
        return fetch(BACKEND.url + '/topup/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Signature': sig },
          body: body
        });
      }).then(function (res) {
        if (!res.ok) throw new Error('provider_http_' + res.status);
        return res.json();
      }).then(function (data) {
        return { ok: data.ok !== false, ref: data.providerRef || providerRef(job), message: data.message || '' };
      });
    }

    /* وضع الديمو: محاكاة بسيطة — نفس الأوردر بنفس النتيجة */
    var rate = (typeof BACKEND.demoFailureRate === 'number') ? BACKEND.demoFailureRate : 0.05;
    var roll = (function () {
      var s = (job.orderId || '') + ':' + job.attempts, h = 0;
      for (var i = 0; i < s.length; i++) h = (h * 17 + s.charCodeAt(i)) % 1000;
      return (h % 1000) / 1000;
    })();
    return new Promise(function (resolve) {
      window.setTimeout(function () {
        resolve({
          ok: roll >= rate,
          ref: providerRef(job),
          message: roll >= rate ? 'تم تنفيذ الشحن على المزود (محاكاة)' : 'المزود رجع خطأ مؤقت (محاكاة)'
        });
      }, 700);
    });
  }

  /* ------------------ الخط الزمني ------------------ */
  function push(job, status, message) {
    job.status = status;
    job.updatedAt = nowIso();
    job.timeline = job.timeline || [];
    job.timeline.push({ status: status, at: job.updatedAt, message: message || '' });
    job.progress = ({ queued: 5, processing: 55, retrying: 70, delivered: 100, failed: 100 })[status] || 0;
    saveJob(job);
    emit(job);
    return job;
  }

  /* ------------------ تنفيذ الوظيفة ------------------ */
  function run(jobId) {
    var job = getJob(jobId);
    if (!job) return;
    if (job.status === 'delivered' || job.status === 'failed') return;

    job.attempts = (job.attempts || 0) + 1;
    push(job, 'processing', 'attempt ' + job.attempts);

    callProvider(job).then(function (res) {
      if (res.ok) {
        job.providerRef = res.ref;
        push(job, 'delivered', res.message);
        syncOrder(job);
        return;
      }
      if (job.attempts >= MAX_ATTEMPTS) {
        job.providerRef = res.ref;
        push(job, 'failed', res.message);
        syncOrder(job);
        return;
      }
      push(job, 'retrying', res.message);
      var wait = delayFor(BACKEND.mode || 'demo', job.attempts);
      timers[job.id] = window.setTimeout(function () { run(job.id); }, wait);
    }).catch(function (err) {
      if (job.attempts >= MAX_ATTEMPTS) {
        push(job, 'failed', String(err && err.message || err));
        syncOrder(job);
        return;
      }
      push(job, 'retrying', String(err && err.message || err));
      timers[job.id] = window.setTimeout(function () { run(job.id); }, delayFor(BACKEND.mode || 'demo', job.attempts));
    });
  }

  /* تحديث حالة الأوردر في localStorage */
  function syncOrder(job) {
    try {
      if (!window.SHN || !window.SHN.updateOrder) return;
      window.SHN.updateOrder(job.orderId, {
        status: job.status === 'delivered' ? 'delivered'
          : job.status === 'failed' ? 'failed'
          : 'processing',
        topup: {
          jobId: job.id, status: job.status, attempts: job.attempts,
          providerRef: job.providerRef || '', progress: job.progress || 0,
          timeline: job.timeline || []
        }
      });
    } catch (e) { /* ignore */ }
  }

  /* ------------------ الواجهة العامة ------------------ */
  function enqueue(order, payment) {
    var idem = order.id || ('SHN-' + Date.now());
    var existing = findByIdem(idem);
    if (existing) return { job: existing, duplicate: true };

    var job = {
      id: uid('JOB', Date.now() % 100000),
      orderId: order.id,
      game: order.game && order.game.id || order.gameId,
      package: order.pkg && order.pkg.id || order.pkgId,
      packageLabel: (order.pkg && order.pkg.amount) || '',
      playerId: (order.player && order.player.playerId) || '',
      region: (order.player && order.player.zone) || (window.COUNTRIES ? COUNTRIES.active().c : 'EG'),
      amount: order.total || 0,
      currency: (window.COUNTRIES ? COUNTRIES.active().cur.code : 'EGP'),
      payment: payment || null,
      customer: order.customer || null,
      status: 'queued',
      attempts: 0,
      progress: 5,
      providerRef: '',
      idempotencyKey: idem,
      createdAt: nowIso(),
      createdAtMs: Date.now(),
      updatedAt: nowIso(),
      timeline: [{ status: 'queued', at: nowIso(), message: 'دخل الطابور' }]
    };
    saveJob(job);
    emit(job);

    /* لو خدمة الباك اند شغالة — نبعتلها نسخة (بدون تعطيل المحرك المحلي) */
    if (BACKEND.url) {
      try {
        fetch(BACKEND.url + '/topup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: job.orderId, game: job.game, package: job.package, packageLabel: job.packageLabel,
            playerId: job.playerId, region: job.region, amount: job.amount, currency: job.currency,
            payment: job.payment, customer: job.customer, idempotencyKey: idem
          })
        }).catch(function () { /* الديمو المحلي يكفي */ });
      } catch (e) { /* ignore */ }
    }

    /* تأخير بسيط لحد ما يبدأ التنفيذ */
    timers[job.id] = window.setTimeout(function () { run(job.id); }, 600);
    return { job: job, duplicate: false };
  }

  function etaSeconds(job) {
    if (!job) return 0;
    if (job.status === 'delivered' || job.status === 'failed') return 0;
    var left = MAX_ATTEMPTS - (job.attempts || 0) + 1;
    return Math.max(3, left * 4);
  }

  function reset() {
    lsSet(LS_JOBS, {});
  }

  window.SHN_TOPUP = {
    MAX_ATTEMPTS: MAX_ATTEMPTS,
    enqueue: enqueue, get: getJob, list: listJobs, all: listJobs,
    onChange: onChange, etaSeconds: etaSeconds, reset: reset,
    providerRefOf: function (id) { var j = getJob(id); return j ? j.providerRef : ''; }
  };
})();
