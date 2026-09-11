/* =========================================================
   شحنلي | Shahnly — صفحة الحساب (نسخة محلية/تجريبية)
   تسجيل دخول وإنشاء حساب · مركز الطلبيات · الكوبونات · VIP · الأمان
   كل البيانات في localStorage فقط — مفيش أي سيرفر.
   ========================================================= */
(function () {
  'use strict';
  var S = window.SHN;
  var app = document.getElementById('ac-app');
  if (!app) return;

  var USER_KEY = 'shahnly_user_v1';
  var USED_KEY = 'shahnly_coupons_used_v1';
  var TABS = [
    { id: 'profile', key: 'ac.tabProfile', ico: '👤' },
    { id: 'orders', key: 'ac.tabOrders', ico: '🧾' },
    { id: 'coupons', key: 'ac.tabCoupons', ico: '🎟️' },
    { id: 'vip', key: 'ac.tabVip', ico: '⭐' },
    { id: 'security', key: 'ac.tabSec', ico: '🔐' }
  ];
  var COUPONS = [
    { code: 'WELCOME10', pct: 10, min: 100 },
    { code: 'FIRST5', pct: 5, min: 0 },
    { code: 'VIP20', pct: 20, min: 500 }
  ];
  var mode = 'login';         /* login | register */
  var tab = (window.location.hash || '').replace('#', '') || 'profile';
  if (tab === 'login' || tab === 'register') { mode = tab; tab = 'profile'; }

  function $(id) { return document.getElementById(id); }
  function txt(v) { return S.esc(v == null ? '' : String(v)); }
  function getUser() {
    try { return JSON.parse(window.localStorage.getItem(USER_KEY) || 'null'); } catch (e) { return null; }
  }
  function setUser(u) {
    try { window.localStorage.setItem(USER_KEY, JSON.stringify(u)); } catch (e) { /* ignore */ }
  }
  function usedCoupons() {
    try { return JSON.parse(window.localStorage.getItem(USED_KEY) || '[]'); } catch (e) { return []; }
  }
  function markUsed(code) {
    var l = usedCoupons();
    if (l.indexOf(code) < 0) l.push(code);
    try { window.localStorage.setItem(USED_KEY, JSON.stringify(l)); } catch (e) { /* ignore */ }
  }
  function orders() {
    var all = S.allOrders() || {};
    var out = [];
    for (var k in all) if (Object.prototype.hasOwnProperty.call(all, k)) out.push(all[k]);
    out.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    return out;
  }
  function points() {
    return orders().reduce(function (acc, o) {
      return acc + (o.payment && o.payment.status === 'paid' ? Number(o.total || 0) : 0);
    }, 0);
  }
  function level() {
    var p = points();
    if (p >= 1500) return 3;
    if (p >= 500) return 2;
    return 1;
  }

  /* ================= تسجيل الدخول / التسجيل ================= */
  function renderAuth() {
    var isReg = mode === 'register';
    var c = window.COUNTRIES ? COUNTRIES.active() : null;
    app.innerHTML =
      '<div class="card card-pad-lg" style="max-width:560px;margin-inline:auto">' +
        '<div class="card-title"><span class="dot"></span> <span>' + txt(S.T(isReg ? 'ac.register' : 'ac.login')) + '</span></div>' +
        '<div class="field"><label for="ac-name" data-i18n="ac.name"></label>' +
          '<input class="input" id="ac-name" autocomplete="name"><div class="error-msg"></div></div>' +
        '<div class="field"><label for="ac-phone" data-i18n="ac.phone"></label>' +
          '<input class="input" id="ac-phone" type="tel" dir="ltr" placeholder="' + txt(c ? c.ex : '') + '">' +
          '<div class="hint">' + txt(c ? '+' + c.dial : '') + '</div><div class="error-msg"></div></div>' +
        '<div class="field"><label for="ac-email" data-i18n="ac.email"></label>' +
          '<input class="input" id="ac-email" type="email" dir="ltr" placeholder="name@example.com"><div class="error-msg"></div></div>' +
        '<div class="field"><label for="ac-pass" data-i18n="ac.pass"></label>' +
          '<input class="input" id="ac-pass" type="password" autocomplete="new-password">' +
          '<div class="hint" data-i18n="ac.passHint"></div><div class="error-msg"></div></div>' +
        '<button class="btn btn-primary btn-block btn-lg" id="ac-submit">' + txt(S.T(isReg ? 'ac.registerBtn' : 'ac.loginBtn')) + '</button>' +
        '<button class="btn btn-ghost btn-block" id="ac-switch" style="margin-top:10px">' +
          txt(S.T(isReg ? 'ac.switchLog' : 'ac.switchReg')) + '</button>' +
      '</div>';
    if (window.I18N) I18N.apply(app);

    $('ac-switch').addEventListener('click', function () {
      mode = isReg ? 'login' : 'register';
      renderAuth();
    });
    $('ac-submit').addEventListener('click', function () {
      var name = $('ac-name'), phone = $('ac-phone'), email = $('ac-email'), pass = $('ac-pass');
      var good = true;
      if (name.value.trim().length < 2) { S.markError(name, true, S.T('ac.errName')); good = false; } else S.markError(name, false);
      var r = window.COUNTRIES ? COUNTRIES.validate(phone.value, COUNTRIES.active().c) : { ok: true, e164: phone.value };
      if (!r.ok) { S.markError(phone, true, S.T('ac.errPhone')); good = false; } else S.markError(phone, false);
      if (!S.validEmail(email.value.trim())) { S.markError(email, true, S.T('ac.errEmail')); good = false; } else S.markError(email, false);
      if (pass.value.length < 4) { S.markError(pass, true, S.T('ac.errPass')); good = false; } else S.markError(pass, false);
      if (!good) { S.toast(S.T('gp.toast.review'), 'err'); return; }

      setUser({
        name: name.value.trim(),
        phone: r.e164 || phone.value.trim(),
        phoneLocal: phone.value.trim(),
        email: email.value.trim(),
        country: window.COUNTRIES ? COUNTRIES.active().c : 'EG',
        lang: window.I18N ? I18N.lang() : 'ar',
        since: Date.now()
      });
      S.toast(S.T('ac.saved'), 'ok');
      tab = 'profile';
      renderAccount();
    });
  }

  /* ================= لوحة الحساب ================= */
  function tabsHTML() {
    return '<div class="cat-bar" style="margin-bottom:18px">' + TABS.map(function (t) {
      return '<button type="button" class="cat-chip' + (t.id === tab ? ' is-active' : '') + '" data-tab="' + t.id + '">' +
        t.ico + ' ' + txt(S.T(t.key)) + '</button>';
    }).join('') + '</div>';
  }

  function panelProfile(u) {
    var c = window.COUNTRIES ? COUNTRIES.active() : null;
    return '<div class="card card-pad-lg">' +
      '<div class="card-title"><span class="dot"></span> <span data-i18n="ac.tabProfile"></span></div>' +
      '<div class="field-row">' +
        '<div class="field"><label data-i18n="ac.name"></label><input class="input" id="pf-name" value="' + txt(u.name) + '"><div class="error-msg"></div></div>' +
        '<div class="field"><label data-i18n="ac.phone"></label><input class="input" id="pf-phone" dir="ltr" value="' + txt(u.phoneLocal || u.phone) + '"><div class="error-msg"></div></div>' +
      '</div>' +
      '<div class="field"><label data-i18n="ac.email"></label><input class="input" id="pf-email" dir="ltr" value="' + txt(u.email) + '"><div class="error-msg"></div></div>' +
      '<div class="kv">' +
        '<div><span>' + txt(S.T('ui.country')) + '</span><b>' + txt(c ? COUNTRIES.name(c) + ' ' + c.f : '—') + '</b></div>' +
        '<div><span>' + txt(S.T('ui.lang')) + '</span><b>' + txt(window.I18N ? I18N.meta().native : '—') + '</b></div>' +
        '<div><span>' + txt(S.T('ac.vipLevel', { n: level() })) + '</span><b>⭐</b></div>' +
      '</div>' +
      '<button class="btn btn-primary btn-block" id="pf-save" style="margin-top:16px" data-i18n="ac.save"></button>' +
    '</div>';
  }

  function panelOrders() {
    var list = orders();
    if (!list.length) {
      return '<div class="card empty"><div class="ico">🧾</div><h3>' + txt(S.T('ac.orders')) + '</h3>' +
        '<p>' + txt(S.T('ac.noOrders')) + '</p>' +
        '<a class="btn btn-primary" href="index.html#games">' + txt(S.T('cta.choose')) + '</a></div>';
    }
    return '<div class="stack-sm">' + list.map(function (o) {
      var meta = S.statusMeta(o.status);
      return '<a class="card" href="order.html?id=' + encodeURIComponent(o.id) + '" style="display:block;text-decoration:none">' +
        '<div class="row" style="justify-content:space-between">' +
          '<strong dir="ltr">' + txt(o.id) + '</strong>' +
          '<span class="' + S.badgeClass(meta.tone) + '">' + txt(meta.label) + '</span>' +
        '</div>' +
        '<div class="row" style="justify-content:space-between;margin-top:8px">' +
          '<span class="muted" style="font-size:.84rem">' + txt(S.P(o.game.name)) + ' — ' + txt(o.pkg.amount) + '</span>' +
          '<b style="color:var(--accent)">' + S.money(o.total) + '</b>' +
        '</div>' +
        '<div class="muted" style="font-size:.74rem;margin-top:8px">' + txt(S.formatDate(o.createdAt)) +
          (o.payment ? ' · ' + txt(o.payment.label || '') : '') + '</div>' +
      '</a>';
    }).join('') + '</div>';
  }

  function panelCoupons() {
    var used = usedCoupons();
    return '<div class="grid grid-3">' + COUPONS.map(function (cp) {
      var isUsed = used.indexOf(cp.code) >= 0;
      return '<div class="card">' +
        '<div class="row" style="justify-content:space-between">' +
          '<span class="badge badge-accent">' + txt(S.T('deals.off', { n: cp.pct })) + '</span>' +
          '<span style="font-size:1.2rem">🎟️</span>' +
        '</div>' +
        '<div style="font-family:ui-monospace,Consolas,monospace;font-size:1.1rem;font-weight:800;margin:12px 0 6px" dir="ltr">' + txt(cp.code) + '</div>' +
        '<p class="muted" style="font-size:.8rem;margin:0">' + txt(S.T('sg.fromPrice', { p: S.money(cp.min) })) + '</p>' +
        '<button class="btn btn-ghost btn-block" style="margin-top:14px" data-cp="' + cp.code + '"' + (isUsed ? ' disabled' : '') + '>' +
          txt(S.T(isUsed ? 'ac.couponUsed' : 'ac.couponUse')) + '</button>' +
      '</div>';
    }).join('') + '</div>';
  }

  function panelVip() {
    var p = points(), l = level();
    var next = l === 1 ? 500 : l === 2 ? 1500 : null;
    return '<div class="card card-pad-lg">' +
      '<div class="card-title"><span class="dot"></span> <span data-i18n="ac.vip"></span></div>' +
      '<div class="row" style="gap:20px;flex-wrap:wrap">' +
        '<div><div class="muted" style="font-size:.78rem">' + txt(S.T('ac.vipPoints')) + '</div>' +
          '<strong style="font-size:1.6rem;color:var(--accent)">' + S.money(p) + '</strong></div>' +
        '<div><div class="muted" style="font-size:.78rem">' + txt(S.T('ac.vip')) + '</div>' +
          '<strong style="font-size:1.6rem">⭐ ' + txt(S.T('ac.vipLevel', { n: l })) + '</strong></div>' +
      '</div>' +
      '<div class="progress-line" style="margin-top:16px"><i style="width:' +
        (next ? Math.min(100, Math.round(p / next * 100)) : 100) + '%"></i></div>' +
      '<p class="muted" style="font-size:.82rem;margin:10px 0 0">' +
        (next ? txt(S.T('ac.vipNext', { n: Math.max(0, next - p) })) : '🔥') + '</p>' +
      '<div class="divider"></div>' +
      '<div class="kv">' +
        '<div><span>' + txt(S.T('ac.orders')) + '</span><b>' + orders().length + '</b></div>' +
        '<div><span>' + txt(S.T('ac.coupons')) + '</span><b>' + COUPONS.length + '</b></div>' +
      '</div>' +
    '</div>';
  }

  function panelSecurity(u) {
    return '<div class="card card-pad-lg">' +
      '<div class="card-title"><span class="dot"></span> <span data-i18n="ac.security"></span></div>' +
      '<div class="field"><label data-i18n="ac.name"></label><input class="input" id="sc-name" value="' + txt(u.name) + '"><div class="error-msg"></div></div>' +
      '<div class="field"><label data-i18n="ac.phone"></label><input class="input" id="sc-phone" dir="ltr" value="' + txt(u.phoneLocal || u.phone) + '"><div class="error-msg"></div></div>' +
      '<div class="field"><label data-i18n="ui.lang"></label>' +
        '<select class="select" id="sc-lang">' + (window.I18N ? I18N.list().map(function (l) {
          return '<option value="' + l.code + '"' + (l.code === I18N.lang() ? ' selected' : '') + '>' + l.flag + ' ' + l.native + '</option>';
        }).join('') : '') + '</select></div>' +
      '<button class="btn btn-primary btn-block" id="sc-save" data-i18n="ac.save"></button>' +
      '<div class="divider"></div>' +
      '<button class="btn btn-ghost btn-block" id="sc-logout" data-i18n="ac.logout"></button>' +
    '</div>';
  }

  function renderAccount() {
    var u = getUser();
    if (!u) { renderAuth(); return; }
    app.innerHTML =
      '<div class="card card-pad-lg" style="margin-bottom:18px">' +
        '<div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:12px">' +
          '<div><h1 style="font-size:1.35rem;margin:0 0 6px">' + txt(S.T('ac.welcome', { name: u.name })) + '</h1>' +
            '<p class="muted" style="margin:0;font-size:.88rem">' + txt(S.T('ac.welcomeD')) + '</p></div>' +
          '<div class="row"><span class="badge badge-accent">⭐ ' + txt(S.T('ac.vipLevel', { n: level() })) + '</span>' +
            '<span class="chip">' + txt(S.T('ac.vipPoints')) + ': ' + S.money(points()) + '</span></div>' +
        '</div>' +
      '</div>' +
      tabsHTML() +
      '<div id="ac-panel"></div>';
    if (window.I18N) I18N.apply(app);

    var panel = $('ac-panel');
    panel.innerHTML = tab === 'orders' ? panelOrders()
      : tab === 'coupons' ? panelCoupons()
      : tab === 'vip' ? panelVip()
      : tab === 'security' ? panelSecurity(u)
      : panelProfile(u);
    if (window.I18N) I18N.apply(panel);
    bindPanel(u);
  }

  function bindPanel(u) {
    Array.prototype.slice.call(app.querySelectorAll('[data-tab]')).forEach(function (b) {
      b.addEventListener('click', function () {
        tab = b.getAttribute('data-tab');
        window.location.hash = tab;
        renderAccount();
      });
    });

    var save = $('pf-save');
    if (save) save.addEventListener('click', function () {
      var name = $('pf-name'), phone = $('pf-phone'), email = $('pf-email');
      var good = true;
      if (name.value.trim().length < 2) { S.markError(name, true, S.T('ac.errName')); good = false; } else S.markError(name, false);
      var r = window.COUNTRIES ? COUNTRIES.validate(phone.value, COUNTRIES.active().c) : { ok: true, e164: phone.value };
      if (!r.ok) { S.markError(phone, true, S.T('ac.errPhone')); good = false; } else S.markError(phone, false);
      if (email.value.trim() && !S.validEmail(email.value.trim())) { S.markError(email, true, S.T('ac.errEmail')); good = false; } else S.markError(email, false);
      if (!good) return;
      u.name = name.value.trim();
      u.phone = r.e164 || phone.value.trim();
      u.phoneLocal = phone.value.trim();
      u.email = email.value.trim();
      setUser(u);
      S.toast(S.T('ac.saved'), 'ok');
      renderAccount();
    });

    var scSave = $('sc-save');
    if (scSave) scSave.addEventListener('click', function () {
      var name = $('sc-name'), phone = $('sc-phone'), lang = $('sc-lang');
      var good = true;
      if (name.value.trim().length < 2) { S.markError(name, true, S.T('ac.errName')); good = false; } else S.markError(name, false);
      var r = window.COUNTRIES ? COUNTRIES.validate(phone.value, COUNTRIES.active().c) : { ok: true, e164: phone.value };
      if (!r.ok) { S.markError(phone, true, S.T('ac.errPhone')); good = false; } else S.markError(phone, false);
      if (!good) return;
      u.name = name.value.trim();
      u.phone = r.e164 || phone.value.trim();
      u.phoneLocal = phone.value.trim();
      setUser(u);
      if (lang && window.I18N && lang.value !== I18N.lang()) {
        I18N.set(lang.value);
        return;   /* I18N بيعيد الرسم من حدث shn:i18n */
      }
      S.toast(S.T('ac.saved'), 'ok');
      renderAccount();
    });

    var lg = $('sc-logout');
    if (lg) lg.addEventListener('click', function () {
      try { window.localStorage.removeItem(USER_KEY); } catch (e) { /* ignore */ }
      window.location.href = 'index.html';
    });

    Array.prototype.slice.call(app.querySelectorAll('[data-cp]')).forEach(function (b) {
      b.addEventListener('click', function () {
        var code = b.getAttribute('data-cp');
        S.copyText(code, S.T('ui.copied'));
        markUsed(code);
        S.toast(S.T('ui.copied') + ' — ' + code, 'ok');
        renderAccount();
      });
    });
  }

  /* ================= التشغيل ================= */
  renderAccount();
  document.addEventListener('shn:i18n', function () { renderAccount(); });
  window.addEventListener('hashchange', function () {
    var h = (window.location.hash || '').replace('#', '');
    if (h === 'login' || h === 'register') { mode = h; tab = 'profile'; renderAccount(); return; }
    if (h) { tab = h; renderAccount(); }
  });
  window.SHN_ACCOUNT = { refresh: renderAccount, level: level, points: points };
})();
