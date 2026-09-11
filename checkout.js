/* =========================================================
   شحنلي | Shahnly — صفحة الدفع (checkout)
   3 طرق دفع: بطاقة (محاكاة بوابة) · تحويل بنكي/إنستاباي · محفظة إلكترونية
   بعد نجاح الدفع → تشغيل الشحن التلقائي (topup.js) → صفحة الأوردر
   ========================================================= */
(function () {
  'use strict';
  var S = window.SHN;
  var CFG = S.CFG;
  var PAY = CFG.payments || {};
  var body = document.getElementById('ck-body');
  var emptyBox = document.getElementById('ck-empty');
  if (!body) return;

  var draft = S.getDraft();
  var game = draft ? S.getGame(draft.gameId) : null;
  var pkg = (game && draft.pkgId) ? S.getPackage(draft.gameId, draft.pkgId) : null;

  if (!draft || !game || !pkg) {
    body.classList.add('hidden');
    if (emptyBox) emptyBox.classList.remove('hidden');
    return;
  }

  var method = 'card';
  var busy = false;

  /* ---------------- ملخص الطلب ---------------- */
  function renderSummary() {
    var c = S.country();
    var rows = [
      [S.T('gp.row.game'), game.name],
      [S.T('gp.row.pkg'), S.AMT(pkg.amount)],
      [S.T('ck.player'), (draft.player && draft.player.playerId) || '—'],
      [S.T('gp.row.price'), S.money(pkg.price)],
      [S.T('gp.row.fees'), S.T('gp.free')],
      [S.T('gp.row.delivery'), S.P(game.delivery)]
    ];
    var zone = draft.extra && (draft.extra.zone || draft.extra.server);
    if (zone) rows.splice(3, 0, [S.T('ck.region'), S.P(String(zone))]);
    document.getElementById('ck-summary').innerHTML = rows.map(function (r) {
      return '<div><span>' + S.esc(r[0]) + '</span><b>' + S.esc(r[1]) + '</b></div>';
    }).join('');
    document.getElementById('ck-total').textContent = S.money(pkg.price);
    var note = document.getElementById('ck-rate-note');
    if (note) {
      note.textContent = c && c.c !== 'EG'
        ? S.T('ck.rateNote', { c: COUNTRIES.curName(c), e: S.money(pkg.price) })
        : S.T('ui.demoRates');
    }
    var back = document.getElementById('ck-back');
    if (back) back.setAttribute('href', 'game.html?id=' + game.id + '&pkg=' + pkg.id);
  }

  /* ---------------- اختيار الدولة ---------------- */
  function renderCountrySelect() {
    var sel = document.getElementById('ck-country');
    if (!sel || !window.COUNTRIES) return;
    var act = COUNTRIES.active();
    var groups = COUNTRIES.REGIONS.map(function (r) {
      var items = COUNTRIES.list(r.key).map(function (x) {
        return '<option value="' + x.c + '"' + (x.c === act.c ? ' selected' : '') + '>' + x.f + ' ' + COUNTRIES.name(x) + '</option>';
      }).join('');
      return '<optgroup label="' + S.esc(S.T(r.label)) + '">' + items + '</optgroup>';
    }).join('');
    sel.innerHTML = groups;
    sel.onchange = function () {
      COUNTRIES.set(sel.value);
      renderHint();
      renderSummary();
    };
  }

  function renderHint() {
    var hint = document.getElementById('ck-phone-hint');
    var c = S.country();
    if (!hint || !c) return;
    hint.textContent = S.T('ck.phoneHint', { dial: '+' + c.dial, ex: c.ex, n: c.min });
  }

  /* ---------------- طرق الدفع ---------------- */
  var METHODS = [
    { key: 'card', ico: '💳', enabled: PAY.card && PAY.card.enabled, t: 'pay.card.t', d: 'ck.cardD' },
    { key: 'bank', ico: '🏦', enabled: PAY.bank && PAY.bank.enabled, t: 'pay.bank.t', d: 'ck.bankD' },
    { key: 'wallet', ico: '📱', enabled: PAY.wallet && PAY.wallet.enabled, t: 'pay.wallet.t', d: 'ck.walletD' }
  ].filter(function (m) { return m.enabled; });

  function renderMethods() {
    var box = document.getElementById('ck-methods');
    box.innerHTML = METHODS.map(function (m) {
      return '<label class="pay-method' + (m.key === method ? ' is-selected' : '') + '" data-m="' + m.key + '">' +
        '<input type="radio" name="paymethod" value="' + m.key + '"' + (m.key === method ? ' checked' : '') + '>' +
        '<span class="ico">' + m.ico + '</span>' +
        '<span><strong>' + S.esc(S.T(m.t)) + '</strong>' +
        '<span class="desc">' + S.esc(m.key === 'card' ? (PAY.card.desc || S.T(m.d)) : S.T(m.d)) + '</span></span>' +
        '<span class="check">✓</span>' +
      '</label>';
    }).join('');
    S.$$('#ck-methods .pay-method').forEach(function (el) {
      el.addEventListener('click', function () {
        method = el.getAttribute('data-m');
        renderMethods();
        renderPanel();
      });
    });
  }

  function accountsHTML(list, kind) {
    return (list || []).map(function (a) {
      return '<div class="acc-row">' +
        '<div><b>' + S.esc(a.bank) + '</b><span dir="ltr">' + S.esc(a.number) + '</span>' +
        '<small>' + S.esc(a.holder) + (a.note ? ' · ' + S.esc(S.P(a.note)) : '') + '</small></div>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-copy="' + S.esc(a.number) + '" data-copy-kind="' + kind + '">' + S.esc(S.T('ui.copy')) + '</button>' +
      '</div>';
    }).join('');
  }

  function renderPanel() {
    var box = document.getElementById('ck-panel');
    if (method === 'card') {
      var cards = (PAY.card.demoCards || []).map(function (c) {
        return '<li><code dir="ltr">' + S.esc(c.number) + '</code> — ' + S.esc(S.P(c.label)) + '</li>';
      }).join('');
      box.innerHTML =
        '<div class="field"><label for="c-num" data-i18n="ck.cardNumber"></label>' +
          '<input class="input" id="c-num" inputmode="numeric" dir="ltr" placeholder="4242 4242 4242 4242" autocomplete="cc-number">' +
          '<div class="hint" id="c-brand"></div><div class="error-msg"></div></div>' +
        '<div class="field"><label for="c-name" data-i18n="ck.cardName"></label>' +
          '<input class="input" id="c-name" dir="ltr" placeholder="AHMED MOHAMED" autocomplete="cc-name">' +
          '<div class="error-msg"></div></div>' +
        '<div class="field-row">' +
          '<div class="field"><label for="c-exp" data-i18n="ck.cardExp"></label>' +
            '<input class="input" id="c-exp" dir="ltr" inputmode="numeric" placeholder="12/28" autocomplete="cc-exp">' +
            '<div class="error-msg"></div></div>' +
          '<div class="field"><label for="c-cvv" data-i18n="ck.cardCvv"></label>' +
            '<input class="input" id="c-cvv" dir="ltr" inputmode="numeric" placeholder="123" autocomplete="cc-csc">' +
            '<div class="error-msg"></div></div>' +
        '</div>' +
        '<div class="notice notice-info"><strong>' + S.esc(S.T('ck.demoCardsT')) + '</strong><ul class="mini-list">' + cards + '</ul></div>';
      bindCardInputs();
    } else if (method === 'bank') {
      box.innerHTML =
        '<p class="muted" style="font-size:.86rem">' + S.esc(S.T('ck.bankNote')) + '</p>' +
        accountsHTML(PAY.bank.accounts, 'bank') +
        '<div class="field" style="margin-top:16px"><label for="c-ref" data-i18n="ck.bankRef"></label>' +
          '<input class="input" id="c-ref" dir="ltr" placeholder="TRF-123456">' +
          '<div class="hint" data-i18n="ck.bankRefHint"></div><div class="error-msg"></div></div>';
    } else {
      box.innerHTML =
        '<p class="muted" style="font-size:.86rem">' + S.esc(S.T('ck.walletNote')) + '</p>' +
        accountsHTML(PAY.wallet.accounts, 'wallet') +
        '<div class="field" style="margin-top:16px"><label for="c-sender" data-i18n="ck.walletSender"></label>' +
          '<input class="input" id="c-sender" inputmode="tel" dir="ltr" placeholder="01012345678">' +
          '<div class="hint" data-i18n="ck.walletHint"></div><div class="error-msg"></div></div>';
    }
    if (window.I18N) I18N.apply(box);
    S.$$('[data-copy]', box).forEach(function (b) {
      b.addEventListener('click', function () { S.copyText(b.getAttribute('data-copy'), S.T('ui.copied')); });
    });
  }

  /* ---------------- تنسيق حقول البطاقة ---------------- */
  function digitsOnly(v) { return String(v || '').replace(/\D/g, ''); }
  function formatCard(v) { return digitsOnly(v).slice(0, 19).replace(/(.{4})/g, '$1 ').trim(); }

  function bindCardInputs() {
    var num = document.getElementById('c-num');
    var exp = document.getElementById('c-exp');
    var brand = document.getElementById('c-brand');
    if (num) {
      num.addEventListener('input', function () {
        num.value = formatCard(num.value);
        if (brand) brand.textContent = num.value.length >= 4 ? S.cardBrand(num.value) : '';
      });
    }
    if (exp) {
      exp.addEventListener('input', function () {
        var d = digitsOnly(exp.value).slice(0, 4);
        exp.value = d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d;
      });
    }
  }

  /* ---------------- التحقق ---------------- */
  function err(el, key, vars) { S.markError(el, true, S.T(key, vars)); return false; }
  function ok(el) { S.markError(el, false); return true; }

  function validateCustomer() {
    var good = true;
    var name = document.getElementById('ck-name');
    var phone = document.getElementById('ck-phone');
    var email = document.getElementById('ck-email');

    var nv = name.value.trim();
    if (nv.length < 2 || nv.length > 40) good = err(name, 'ck.err.name') && good; else ok(name);

    var r = window.COUNTRIES ? COUNTRIES.validate(phone.value, COUNTRIES.active().c) : { ok: true, e164: phone.value };
    if (!r.ok) {
      var key = r.reason === 'empty' ? 'gp.err.required' : 'ck.err.phone';
      good = err(phone, key, { ex: (COUNTRIES.active().ex || ''), dial: '+' + COUNTRIES.active().dial }) && good;
    } else ok(phone);

    var ev = email.value.trim();
    if (ev && !S.validEmail(ev)) good = err(email, 'ck.err.email') && good; else ok(email);

    return good;
  }

  function validatePayment() {
    var good = true;
    if (method === 'card') {
      var num = document.getElementById('c-num');
      var cname = document.getElementById('c-name');
      var exp = document.getElementById('c-exp');
      var cvv = document.getElementById('c-cvv');

      if (!S.luhn(num.value) || digitsOnly(num.value).length < 12) good = err(num, 'ck.err.card') && good; else ok(num);
      if (cname.value.trim().length < 3) good = err(cname, 'ck.err.holder') && good; else ok(cname);

      var m = /^(\d{2})\/(\d{2})$/.exec(exp.value.trim());
      var validExp = false;
      if (m) {
        var mm = parseInt(m[1], 10), yy = 2000 + parseInt(m[2], 10);
        var end = new Date(yy, mm, 1);
        validExp = mm >= 1 && mm <= 12 && end > new Date();
      }
      if (!validExp) good = err(exp, 'ck.err.exp') && good; else ok(exp);

      if (digitsOnly(cvv.value).length < 3 || digitsOnly(cvv.value).length > 4) good = err(cvv, 'ck.err.cvv') && good; else ok(cvv);
    } else if (method === 'bank') {
      var ref = document.getElementById('c-ref');
      if (ref.value.trim().length < 4) good = err(ref, 'ck.err.ref') && good; else ok(ref);
    } else {
      var sender = document.getElementById('c-sender');
      var sr = window.COUNTRIES ? COUNTRIES.validate(sender.value, COUNTRIES.active().c) : { ok: true, e164: sender.value };
      if (!sr.ok) good = err(sender, 'ck.err.sender') && good; else ok(sender);
    }
    return good;
  }

  /* ---------------- شاشة المعالجة ---------------- */
  function overlay(html) {
    var card = document.getElementById('ck-overlay-card');
    card.innerHTML = html;
    document.getElementById('ck-overlay').classList.add('show');
  }
  function closeOverlay() { document.getElementById('ck-overlay').classList.remove('show'); }

  function ref4(prefix) {
    return prefix + '-' + String(Math.floor(100000 + Math.random() * 899999));
  }

  function payResult() {
    if (method !== 'card') return { ok: true, status: 'review', reference: ref4(method === 'bank' ? 'TRF' : 'WLT') };
    var num = digitsOnly(document.getElementById('c-num').value);
    var cards = (PAY.card.demoCards || []);
    for (var i = 0; i < cards.length; i++) {
      if (digitsOnly(cards[i].number) === num) {
        return { ok: cards[i].result !== 'failed', status: cards[i].result === 'failed' ? 'failed' : 'paid', reference: ref4('PAY') };
      }
    }
    return { ok: true, status: 'paid', reference: ref4('PAY') };
  }

  /* ---------------- الدفع ---------------- */
  function buildOrder(payment) {
    var c = S.country();
    var nameEl = document.getElementById('ck-name');
    var phoneEl = document.getElementById('ck-phone');
    var emailEl = document.getElementById('ck-email');
    return {
      id: S.makeOrderId(),
      game: { id: game.id, name: game.name },
      pkg: { id: pkg.id, amount: S.AMT(pkg.amount), price: pkg.price },
      player: draft.player || {},
      extra: draft.extra || {},
      customer: {
        name: nameEl.value.trim(),
        phone: window.COUNTRIES ? COUNTRIES.toE164(phoneEl.value, c) : phoneEl.value.trim(),
        phoneLocal: phoneEl.value.trim(),
        email: emailEl.value.trim(),
        country: c ? c.c : 'EG'
      },
      payment: payment,
      total: pkg.price,
      currency: c ? c.cur.code : 'EGP',
      totalDisplay: S.money(pkg.price),
      lang: window.I18N ? I18N.lang() : 'ar',
      createdAt: Date.now(),
      status: payment.status === 'paid' ? 'paid' : 'review'
    };
  }

  function submit() {
    if (busy) return;
    var payErr = document.getElementById('ck-pay-error');
    payErr.classList.remove('show');
    var okCustomer = validateCustomer();
    var okPayment = validatePayment();
    if (!okCustomer || !okPayment) {
      S.toast(S.T('gp.toast.review'), 'err');
      if (!okPayment) {
        payErr.textContent = S.T('ck.err.fix');
        payErr.classList.add('show');
      }
      return;
    }

    busy = true;
    var btn = document.getElementById('ck-pay');
    btn.classList.add('is-disabled');
    overlay('<div class="spinner"></div><h3>' + S.esc(S.T('ck.processing')) + '</h3>' +
      '<p class="muted">' + S.esc(S.T('ck.processingD')) + '</p>');

    var res = payResult();

    window.setTimeout(function () {
      var payment = {
        method: method,
        label: method === 'card' ? S.T('pay.card.t') : method === 'bank' ? S.T('pay.bank.t') : S.T('pay.wallet.t'),
        reference: res.reference,
        status: res.status,
        paidAt: res.status === 'paid' ? Date.now() : null
      };
      var order = buildOrder(payment);
      S.saveOrder(order);
      S.clearDraft();
      S.notifyOrder(order);

      if (res.status === 'paid' && window.SHN_TOPUP) {
        window.SHN_TOPUP.enqueue(order, payment);
      }

      if (res.ok) {
        overlay('<div class="result-ico ok">✓</div>' +
          '<h3>' + S.esc(res.status === 'paid' ? S.T('ck.successT') : S.T('ck.reviewT')) + '</h3>' +
          '<p class="muted">' + S.esc(S.T('ck.orderNo', { id: order.id })) + '</p>' +
          '<p class="muted" style="font-size:.84rem">' + S.esc(res.status === 'paid' ? S.T('ck.successD') : S.T('ck.reviewD')) + '</p>');
        window.setTimeout(function () { window.location.href = 'order.html?id=' + encodeURIComponent(order.id); }, 1700);
      } else {
        busy = false;
        btn.classList.remove('is-disabled');
        overlay('<div class="result-ico err">!</div>' +
          '<h3>' + S.esc(S.T('ck.failedT')) + '</h3>' +
          '<p class="muted">' + S.esc(S.T('ck.failedD')) + '</p>' +
          '<button class="btn btn-primary btn-block" id="ck-retry" style="margin-top:14px">' + S.esc(S.T('ck.retry')) + '</button>');
        var retry = document.getElementById('ck-retry');
        if (retry) retry.addEventListener('click', function () { closeOverlay(); });
      }
    }, 1400);
  }

  /* ---------------- التهيئة ---------------- */
  function renderAll() {
    renderCountrySelect();
    renderHint();
    renderMethods();
    renderPanel();
    renderSummary();
  }
  renderAll();
  document.getElementById('ck-pay').addEventListener('click', submit);
  document.addEventListener('shn:i18n', renderAll);
  document.addEventListener('shn:country', renderAll);
})();
