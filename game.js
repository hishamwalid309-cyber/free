/* =========================================================
   شحنلي | Shahnly — صفحة الشحن (اختيار الباقة + بيانات اللاعب)
   بيدعم 9 لغات + تحويل العملة حسب الدولة المختارة
   ========================================================= */
(function () {
  'use strict';
  var S = window.SHN;
  var main = document.getElementById('game-main');
  if (!main) return;

  var gameId = S.param('id') || 'pubg';
  var presetPkg = S.param('pkg');
  var game = S.getGame(gameId);
  var selectedPkg = null;

  if (!game) {
    main.innerHTML = '<div class="container"><div class="card empty">' +
      '<div class="ico">🎮</div>' +
      '<h3>' + S.esc(S.T('gp.nf.t')) + '</h3>' +
      '<p>' + S.esc(S.T('gp.nf.d')) + '</p>' +
      '<a class="btn btn-primary" href="index.html#games">' + S.esc(S.T('gp.nf.back')) + '</a>' +
      '</div></div>';
    return;
  }

  function setTitle() { document.title = S.T('gp.titlePrefix', { game: game.name }); }

  /* ---------------- خيارات الحقول: نص عادي أو {v,c} دولة أو {v,k} مفتاح ترجمة ---------------- */
  function optionValue(o) { return typeof o === 'string' ? o : o.v; }
  function optionLabel(o) {
    if (typeof o === 'string') return S.P(o);
    if (o.c && window.COUNTRIES) {
      var c = COUNTRIES.byCode(o.c);
      if (c) return o.v + ' - ' + COUNTRIES.name(c) + ' ' + c.f;
    }
    if (o.k) return S.T(o.k);
    return o.v;
  }

  /* ---------------- كارت اللعبة ---------------- */
  function renderHeader() {
    var head = document.getElementById('game-header');
    if (!head) return;
    var isAr = window.I18N ? I18N.lang() === 'ar' : true;
    head.innerHTML =
      '<div class="row" style="gap:18px;align-items:center">' +
        '<span class="game-thumb" style="--g:' + game.gradient + ';margin:0">' + game.emoji + '</span>' +
        '<div style="flex:1;min-width:200px">' +
          '<h2 style="margin:0;font-size:1.3rem">' + S.esc(game.name) +
            (isAr ? ' <span class="muted" style="font-size:.85rem;font-weight:600">' + S.esc(game.nameAr) + '</span>' : '') +
          '</h2>' +
          '<p class="muted" style="margin:4px 0 0;font-size:.88rem">' + S.esc(S.P(game.tagline)) + '</p>' +
        '</div>' +
        (game.tag ? '<span class="badge badge-primary">' + S.esc(S.P(game.tag)) + '</span>' : '') +
      '</div>' +
      '<div class="divider"></div>' +
      '<div class="row" style="gap:26px">' +
        '<div><div class="muted" style="font-size:.76rem">' + S.esc(S.T('gp.deliveryTime')) + '</div><strong>' + S.esc(S.P(game.delivery)) + '</strong></div>' +
        '<div><div class="muted" style="font-size:.76rem">' + S.esc(S.T('gp.currency')) + '</div><strong>' + S.esc(S.P(game.currencyLabel)) + '</strong></div>' +
        '<div><div class="muted" style="font-size:.76rem">' + S.esc(S.T('gp.pkgCount')) + '</div><strong>' + game.packages.length + '</strong></div>' +
      '</div>';

    var note = document.getElementById('game-note');
    if (note) note.innerHTML = '<strong>' + S.esc(S.T('gp.note.tip')) + '</strong>' + S.esc(S.P(game.note));
  }

  /* ---------------- الباقات ---------------- */
  function renderPackages(keepSel) {
    var pkgGrid = document.getElementById('pkg-grid');
    if (!pkgGrid) return;
    pkgGrid.innerHTML = game.packages.map(function (p) {
      return '' +
        '<label class="pkg" data-pkg="' + p.id + '">' +
          '<input type="radio" name="pkg" value="' + p.id + '">' +
          (p.tag ? '<span class="tag badge badge-accent">' + S.esc(S.P(p.tag)) + '</span>' : '') +
          '<span class="amount">' + S.esc(S.AMT(p.amount)) + '</span>' +
          '<span class="sub">' + S.esc(p.sub) + '</span>' +
          '<span class="price">' + S.money(p.price) +
            (p.oldPrice ? '<s>' + S.money(p.oldPrice) + '</s>' : '') +
          '</span>' +
        '</label>';
    }).join('');
    if (keepSel && selectedPkg) selectPkg(selectedPkg.id);
  }

  /* مستمع واحد فقط على شبكة الباقات (بيتبني مرة واحدة) */
  function bindPkgGrid() {
    var pkgGrid = document.getElementById('pkg-grid');
    if (!pkgGrid) return;
    pkgGrid.addEventListener('click', function (e) {
      var label = e.target.closest ? e.target.closest('.pkg') : null;
      if (label) selectPkg(label.getAttribute('data-pkg'));
    });
  }

  /* ---------------- بيانات اللاعب ---------------- */
  function renderFields(saved) {
    var fieldsBox = document.getElementById('player-fields');
    if (!fieldsBox) return;
    var values = saved || {};
    var html = '';
    (game.fields || []).forEach(function (f) {
      var isTel = f.type === 'tel';
      html +=
        '<div class="field">' +
          '<label for="f-' + f.key + '">' + S.esc(S.P(f.label)) + '</label>' +
          '<input class="input" id="f-' + f.key + '" data-key="' + f.key + '" ' +
                 'data-min="' + (f.min || 1) + '" data-max="' + (f.max || 64) + '" data-type="' + (f.type || 'text') + '" ' +
                 'type="' + (isTel ? 'tel' : 'text') + '" inputmode="' + (isTel ? 'numeric' : 'text') + '" ' +
                 'placeholder="' + S.esc(S.P(f.placeholder || '')) + '" value="' + S.esc(values[f.key] || '') + '" autocomplete="off">' +
          '<div class="hint">' + S.esc(S.T('gp.hint.required', { range: S.P(f.digits || (f.min + ' - ' + f.max)) })) +
            (f.key === 'playerId' ? S.esc(S.T('gp.hint.reviewId')) : '') + '</div>' +
          '<div class="error-msg"></div>' +
        '</div>';
    });
    (game.selects || []).forEach(function (s) {
      html +=
        '<div class="field">' +
          '<label for="s-' + s.key + '">' + S.esc(S.P(s.label)) + '</label>' +
          '<select class="select" id="s-' + s.key + '" data-key="' + s.key + '" data-type="select">' +
            '<option value="">' + S.esc(S.T('gp.select.placeholder')) + '</option>' +
            s.options.map(function (o) {
              var v = optionValue(o);
              return '<option value="' + S.esc(v) + '"' + (values[s.key] === v ? ' selected' : '') + '>' +
                S.esc(optionLabel(o)) + '</option>';
            }).join('') +
          '</select>' +
          '<div class="error-msg"></div>' +
        '</div>';
    });
    fieldsBox.innerHTML = html;
    bindFields();
  }

  function currentValues() {
    var out = {};
    S.$$('#player-fields .input, #player-fields .select').forEach(function (el) {
      out[el.getAttribute('data-key')] = el.value;
    });
    return out;
  }

  /* ---------------- الملخص ---------------- */
  function updateSummary() {
    var rows = [
      [S.T('gp.row.game'), game.name],
      [S.T('gp.row.pkg'), selectedPkg ? S.AMT(selectedPkg.amount) : S.T('gp.undefined')],
      [S.T('gp.row.price'), selectedPkg ? S.money(selectedPkg.price) : '—'],
      [S.T('gp.row.fees'), S.T('gp.free')],
      [S.T('gp.row.delivery'), S.P(game.delivery)]
    ];
    document.getElementById('summary').innerHTML = rows.map(function (r) {
      return '<div><span>' + S.esc(r[0]) + '</span><b>' + S.esc(r[1]) + '</b></div>';
    }).join('');
    var totalEl = document.getElementById('total');
    totalEl.textContent = selectedPkg ? S.money(selectedPkg.price) : '—';
    var btn = document.getElementById('btn-continue');
    btn.classList.toggle('is-disabled', !selectedPkg);
  }

  function selectPkg(pkgId) {
    var p = S.getPackage(game.id, pkgId);
    if (!p) return;
    selectedPkg = p;
    S.$$('.pkg', document.getElementById('pkg-grid')).forEach(function (el) {
      el.classList.toggle('is-selected', el.getAttribute('data-pkg') === pkgId);
    });
    var radio = document.querySelector('#pkg-grid input[value="' + pkgId + '"]');
    if (radio) radio.checked = true;
    document.getElementById('pkg-error').classList.remove('show');
    updateSummary();
  }

  function initialPkg() {
    if (presetPkg && S.getPackage(game.id, presetPkg)) return presetPkg;
    var tagged = game.packages.filter(function (p) { return p.tag; })[0];
    return (tagged || game.packages[0]).id;
  }

  /* ---------------- التحقق ---------------- */
  function validateField(input) {
    var val = String(input.value || '').trim();
    var type = input.getAttribute('data-type');
    var min = parseInt(input.getAttribute('data-min'), 10);
    var max = parseInt(input.getAttribute('data-max'), 10);

    if (type === 'select') {
      var okSel = val.length > 0;
      S.markError(input, !okSel, S.T('gp.err.select'));
      return okSel;
    }
    if (!val) {
      S.markError(input, true, S.T('gp.err.required'));
      return false;
    }
    if (type === 'tel') {
      var dig = val.replace(/\D/g, '');
      if (dig.length < min || dig.length > max || !/^\d+$/.test(dig)) {
        S.markError(input, true, S.T('gp.err.tel', { min: min, max: max }));
        return false;
      }
    } else {
      if (val.length < min || val.length > max || !/^[A-Za-z0-9_.\- ]+$/.test(val)) {
        S.markError(input, true, S.T('gp.err.text', { min: min, max: max }));
        return false;
      }
    }
    S.markError(input, false);
    return true;
  }

  function bindFields() {
    S.$$('#player-fields .input, #player-fields .select').forEach(function (input) {
      input.addEventListener('blur', function () { validateField(input); });
      input.addEventListener('input', function () {
        if (input.classList.contains('is-error')) validateField(input);
      });
    });
  }

  /* ---------------- المتابعة للدفع ---------------- */
  document.getElementById('btn-continue').addEventListener('click', function () {
    if (!selectedPkg) {
      document.getElementById('pkg-error').classList.add('show');
      S.toast(S.T('gp.toast.pickPkg'), 'err');
      return;
    }
    var ok = true, player = {}, extra = {};
    S.$$('#player-fields .input, #player-fields .select').forEach(function (input) {
      if (!validateField(input)) ok = false;
      var key = input.getAttribute('data-key');
      if (input.getAttribute('data-type') === 'select') extra[key] = input.value.trim();
      else player[key] = input.value.trim();
    });
    if (!ok) {
      S.toast(S.T('gp.toast.review'), 'err');
      return;
    }

    S.saveDraft({
      gameId: game.id,
      pkgId: selectedPkg.id,
      player: player,
      extra: extra,
      lang: window.I18N ? I18N.lang() : 'ar',
      country: window.COUNTRIES ? COUNTRIES.active().c : 'EG',
      currency: window.COUNTRIES ? COUNTRIES.active().cur.code : 'EGP',
      createdAt: Date.now()
    });
    window.location.href = 'checkout.html';
  });

  /* ---------------- الرسم الكامل + إعادة الرسم ---------------- */
  function renderAll() {
    setTitle();
    renderHeader();
    renderPackages(true);
    renderFields(currentValues());
    updateSummary();
  }

  setTitle();
  renderHeader();
  bindPkgGrid();
  renderPackages(false);
  renderFields({});
  selectPkg(initialPkg());

  document.addEventListener('shn:i18n', renderAll);
  document.addEventListener('shn:country', renderAll);
})();
