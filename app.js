/* =========================================================
   شحنلي | Shahnly — الأدوات المشتركة
   ========================================================= */
(function () {
  'use strict';

  var CFG = window.APP_CONFIG || {};
  var DATA = window.GAMES || [];

  /* ------------------ selectors / helpers ------------------ */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(window.location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  }
  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /* ------------------ i18n shortcuts ------------------ */
  function T(key, vars) { return window.I18N ? window.I18N.t(key, vars) : key; }
  function P(text) { return window.I18N ? window.I18N.p(text) : text; }
  function AMT(text) { return window.I18N ? window.I18N.amount(text) : text; }
  function country() { return window.COUNTRIES ? window.COUNTRIES.active() : null; }

  /* الأسعار مخزّنة بالجنيه المصري وبتتحوّل تلقائيًا لعملة الدولة المختارة */
  function money(n) {
    if (window.COUNTRIES) return window.COUNTRIES.fmt(Number(n || 0));
    var c = CFG.currency || { symbol: 'ج.م', decimals: 0 };
    var num = Number(n || 0).toFixed(c.decimals);
    return (c.symbol_position === 'before' ? c.symbol + ' ' + num : num + ' ' + c.symbol);
  }
  function formatDate(ts) {
    if (window.I18N) return window.I18N.date(ts);
    try {
      return new Date(ts).toLocaleString('ar-EG', {
        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch (e) { return new Date(ts).toISOString(); }
  }

  /* ------------------ catalog ------------------ */
  function getGame(id) {
    for (var i = 0; i < DATA.length; i++) if (DATA[i].id === id) return DATA[i];
    return null;
  }
  function getPackage(gameId, pkgId) {
    var g = getGame(gameId);
    if (!g) return null;
    for (var i = 0; i < g.packages.length; i++) if (g.packages[i].id === pkgId) return g.packages[i];
    return null;
  }

  /* ------------------ storage (localStorage + memory fallback) ------------------ */
  var mem = { orders: {}, draft: null };
  var LS_KEY = 'shahnly_orders_v1';
  var DRAFT_KEY = 'shahnly_draft_v1';

  function lsGet(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function lsSet(key, val) {
    try { window.localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }

  function allOrders() {
    var stored = lsGet(LS_KEY, null);
    if (!stored) return mem.orders;
    return stored;
  }
  function saveOrder(order) {
    var orders = allOrders();
    orders[order.id] = order;
    mem.orders[order.id] = order;
    lsSet(LS_KEY, orders);
    return order;
  }
  function getOrder(id) {
    var orders = allOrders();
    return orders[String(id || '').toUpperCase()] || mem.orders[String(id || '').toUpperCase()] || null;
  }
  function updateOrder(id, patch) {
    var o = getOrder(id);
    if (!o) return null;
    for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) o[k] = patch[k];
    saveOrder(o);
    return o;
  }
  function saveDraft(draft) { mem.draft = draft; lsSet(DRAFT_KEY, draft); }
  function getDraft() { return lsGet(DRAFT_KEY, null) || mem.draft; }
  function clearDraft() { mem.draft = null; try { window.localStorage.removeItem(DRAFT_KEY); } catch (e) {} }

  function makeOrderId() {
    var d = new Date();
    var stamp = d.getFullYear().toString().slice(2) +
      ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    var rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return 'SHN-' + stamp + '-' + rand;
  }

  /* ------------------ order status ------------------ */
  /* مراحل الأوردر — النصوص بتتبني من قاموس اللغة الحالية */
  var STAGES = [];
  function buildStages() {
    STAGES = [
      { key: 'created',    title: T('status.created'),    desc: T('stage.d.created') },
      { key: 'paid',       title: T('status.paid'),       desc: T('stage.d.paid') },
      { key: 'processing', title: T('status.processing'), desc: T('stage.d.processing') },
      { key: 'delivered',  title: T('status.delivered'),  desc: T('stage.d.delivered') }
    ];
    return STAGES;
  }
  buildStages();

  var STATUS = {
    created:    { tone: 'warn',    stage: 0,  note: 'stage.d.created' },
    review:     { tone: 'warn',    stage: 0,  note: '' },
    paid:       { tone: 'accent',  stage: 1,  note: 'stage.d.paid' },
    processing: { tone: 'primary', stage: 2,  note: 'stage.d.processing' },
    delivered:  { tone: 'accent',  stage: 3,  note: 'stage.d.delivered' },
    failed:     { tone: 'danger',  stage: -1, note: '' },
    cancelled:  { tone: 'muted',   stage: -1, note: '' }
  };
  function statusMeta(status) {
    var key = STATUS[status] ? status : 'created';
    var d = STATUS[key];
    return {
      key: key,
      label: T('status.' + key),
      tone: d.tone,
      stage: d.stage,
      note: d.note ? T(d.note) : ''
    };
  }
  function badgeClass(tone) {
    if (tone === 'accent') return 'badge badge-accent';
    if (tone === 'warn') return 'badge badge-warn';
    if (tone === 'danger') return 'badge badge-danger';
    if (tone === 'muted') return 'badge badge-muted';
    return 'badge badge-primary';
  }

  /* ------------------ toast ------------------ */
  function toast(message, type) {
    var wrap = $('.toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'toast-wrap';
      document.body.appendChild(wrap);
    }
    var el = document.createElement('div');
    el.className = 'toast ' + (type || 'info');
    el.innerHTML = esc(message);
    wrap.appendChild(el);
    window.setTimeout(function () {
      el.style.transition = 'opacity .3s, transform .3s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-8px)';
      window.setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
    }, 3600);
  }

  /* ------------------ copy to clipboard ------------------ */
  function copyText(text, okMsg) {
    var done = function () { toast(okMsg || 'تم النسخ', 'ok'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { toast('انسخ يدويًا: ' + text, 'info'); });
    } else {
      toast('انسخ يدويًا: ' + text, 'info');
    }
  }

  /* ------------------ telegram notifications (optional) ------------------ */
  function orderToText(o) {
    var lines = [
      'أوردر جديد: ' + o.id,
      'اللعبة: ' + o.game.name,
      'الباقة: ' + o.pkg.amount,
      'المبلغ: ' + money(o.total),
      'آيدي اللاعب: ' + o.player.playerId
    ];
    for (var k in (o.player.extra || {})) lines.push(k + ': ' + o.player.extra[k]);
    lines.push('طريقة الدفع: ' + o.payment.label);
    lines.push('العميل: ' + o.customer.name + ' - ' + o.customer.phone);
    lines.push('الحالة: ' + statusMeta(o.status).label);
    return lines.join('\n');
  }
  function notifyOrder(order) {
    var tg = CFG.telegram || {};
    if (!tg.enabled || !tg.botToken || !tg.chatId) return;
    try {
      fetch('https://api.telegram.org/bot' + tg.botToken + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: tg.chatId, text: orderToText(order) })
      }).catch(function () {});
    } catch (e) { /* silent in demo */ }
  }

  /* ------------------ shared chrome (header/footer) ------------------ */
  function initChrome() {
    var path = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    $$('.main-nav a').forEach(function (a) {
      var href = (a.getAttribute('href') || '').toLowerCase();
      if (href === path) a.classList.add('active');
    });

    var toggle = $('.nav-toggle');
    var nav = $('.main-nav');
    if (toggle && nav) {
      toggle.addEventListener('click', function () { nav.classList.toggle('open'); });
    }

    /* تهيئة طبقة اللغات + مبدّل الدولة/العملة */
    if (window.I18N) window.I18N.init();
    if (window.COUNTRIES) window.COUNTRIES.init();

    var year = $('#year');
    if (year) year.textContent = new Date().getFullYear();

    /* إعادة بناء مراحل الأوردر لما اللغة تتغيّر */
    document.addEventListener('shn:i18n', function () {
      buildStages();
      window.SHN.STAGES = STAGES;
    });

    var footerGames = $('#footer-games');
    if (footerGames) {
      footerGames.innerHTML = DATA.map(function (g) {
        return '<li><a href="game.html?id=' + g.id + '">' + esc(T('footer.recharge', { game: g.name })) + '</a></li>';
      }).join('');
    }

    $$('[data-brand-name]').forEach(function (el) { el.textContent = CFG.brand.name; });
    $$('[data-brand-en]').forEach(function (el) { el.textContent = CFG.brand.nameEn; });
    $$('[data-phone]').forEach(function (el) { el.textContent = CFG.brand.phoneDisplay; });
    $$('[data-email]').forEach(function (el) { el.textContent = CFG.brand.email; });
    $$('[data-address]').forEach(function (el) { el.textContent = CFG.brand.address; });

    var waText = encodeURIComponent('مرحبًا، محتاج مساعدة في شحن لعبة على ' + CFG.brand.name);
    $$('[data-wa]').forEach(function (el) {
      el.setAttribute('href', 'https://wa.me/' + CFG.brand.whatsapp + '?text=' + waText);
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener');
    });
    $$('[data-tg]').forEach(function (el) {
      el.setAttribute('href', 'https://t.me/' + CFG.brand.telegramUser);
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener');
    });

    if (!CFG.demoMode) $$('.demo-bar').forEach(function (el) { el.remove(); });
  }

  /* ------------------ reveal on scroll ------------------ */
  function initReveal() {
    var items = $$('.reveal');
    if (!items.length) return;
    if (!('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: .12 });
    items.forEach(function (el) { io.observe(el); });
  }

  /* ------------------ validation helpers ------------------ */
  function luhn(num) {
    var digits = String(num).replace(/\D/g, '');
    if (digits.length < 12) return false;
    var sum = 0, alt = false;
    for (var i = digits.length - 1; i >= 0; i--) {
      var d = parseInt(digits.charAt(i), 10);
      if (alt) { d *= 2; if (d > 9) d -= 9; }
      sum += d; alt = !alt;
    }
    return sum % 10 === 0;
  }
  function cardBrand(num) {
    var d = String(num).replace(/\D/g, '');
    if (/^4/.test(d)) return 'Visa';
    if (/^(5[1-5]|2[2-7])/.test(d)) return 'Mastercard';
    if (/^3[47]/.test(d)) return 'Amex';
    if (/^(60|65|64)/.test(d)) return 'Meeza';
    return 'بطاقة';
  }
  /* تحقق دولي: بيقبل رقم محلي أو دولي من أي دولة في جدول COUNTRIES،
     ولو الدولة مش في الجدول بنقبل أي رقم بصيغة E.164 (6 - 15 رقم). */
  function phoneInfo(p, countryCode) {
    if (window.COUNTRIES) {
      var r = window.COUNTRIES.validate(p, countryCode || window.COUNTRIES.active().c);
      if (r.ok) return r;
      var g = window.COUNTRIES.validateGeneric(p);
      if (g.ok) return g;
      return r;
    }
    return { ok: /^01[0125][0-9]{8}$/.test(String(p).replace(/\s|-/g, '')), reason: 'pattern', e164: String(p) };
  }
  function validPhone(p, countryCode) { return !!phoneInfo(p, countryCode).ok; }
  function normalizePhone(p, countryCode) { return phoneInfo(p, countryCode).e164 || ''; }
  function validEmail(e) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e).trim());
  }
  function markError(input, show, msg) {
    if (!input) return;
    input.classList.toggle('is-error', !!show);
    var box = input.parentNode.querySelector('.error-msg') || input.parentNode.parentNode.querySelector('.error-msg');
    if (box) {
      if (msg) box.textContent = msg;
      box.classList.toggle('show', !!show);
    }
  }

  /* ------------------ export ------------------ */
  window.SHN = {
    CFG: CFG, GAMES: DATA,
    $: $, $$: $$, param: param, esc: esc, money: money, formatDate: formatDate,
    getGame: getGame, getPackage: getPackage,
    allOrders: allOrders, saveOrder: saveOrder, getOrder: getOrder, updateOrder: updateOrder,
    saveDraft: saveDraft, getDraft: getDraft, clearDraft: clearDraft, makeOrderId: makeOrderId,
    STAGES: STAGES, buildStages: buildStages, statusMeta: statusMeta, badgeClass: badgeClass,
    toast: toast, copyText: copyText, notifyOrder: notifyOrder, orderToText: orderToText,
    luhn: luhn, cardBrand: cardBrand, validPhone: validPhone, validEmail: validEmail, markError: markError,
    phoneInfo: phoneInfo, normalizePhone: normalizePhone,
    T: T, P: P, AMT: AMT, country: country,
    I18N: window.I18N, COUNTRIES: window.COUNTRIES
  };

  document.addEventListener('DOMContentLoaded', function () {
    initChrome();
    initReveal();
  });
})();
