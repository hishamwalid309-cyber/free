/* =========================================================
   شحنلي | Shahnly — صفحة الأوردر (تفاصيل + خط زمني + الشحن التلقائي)
   ========================================================= */
(function () {
  'use strict';
  var S = window.SHN;
  var id = S.param('id') || '';
  var body = document.getElementById('or-body');
  var empty = document.getElementById('or-empty');
  if (!body) return;

  var order = id ? S.getOrder(id) : null;
  if (!order) {
    if (empty) empty.classList.remove('hidden');
    return;
  }
  body.classList.remove('hidden');
  if (empty) empty.classList.add('hidden');

  var pollTimer = null;

  function job() {
    return (window.SHN_TOPUP && order.topup && order.topup.jobId) ? SHN_TOPUP.get(order.topup.jobId) : null;
  }

  /* ---------------- رأس الأوردر ---------------- */
  function renderHead() {
    var meta = S.statusMeta(order.status);
    document.getElementById('or-head').innerHTML =
      '<div class="row" style="justify-content:space-between;align-items:flex-start;gap:16px">' +
        '<div>' +
          '<div class="muted" style="font-size:.78rem">' + S.esc(S.T('or.id')) + '</div>' +
          '<h2 style="margin:2px 0 6px;font-size:1.5rem;letter-spacing:.5px" dir="ltr">' + S.esc(order.id) + '</h2>' +
          '<div class="row">' +
            '<span class="' + S.badgeClass(meta.tone) + '">' + S.esc(meta.label) + '</span>' +
            '<span class="chip">' + S.esc(S.P(order.game.name)) + '</span>' +
            '<span class="chip">' + S.esc(order.pkg.amount) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="row">' +
          '<button class="btn btn-ghost btn-sm" id="or-copy">' + S.esc(S.T('or.copy')) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="divider"></div>' +
      '<div class="row" style="gap:26px">' +
        '<div><div class="muted" style="font-size:.75rem">' + S.esc(S.T('gp.total')) + '</div>' +
          '<strong style="font-size:1.15rem;color:var(--accent)">' + S.esc(S.money(order.total)) + '</strong></div>' +
        '<div><div class="muted" style="font-size:.75rem">' + S.esc(S.T('or.createdAt')) + '</div>' +
          '<strong>' + S.esc(S.formatDate(order.createdAt)) + '</strong></div>' +
        '<div><div class="muted" style="font-size:.75rem">' + S.esc(S.T('or.payment')) + '</div>' +
          '<strong>' + S.esc(order.payment && order.payment.label || '—') + '</strong></div>' +
      '</div>';

    var copy = document.getElementById('or-copy');
    if (copy) copy.addEventListener('click', function () { S.copyText(order.id, S.T('or.copied')); });
  }

  /* ---------------- خط الحالة ---------------- */
  function renderTimeline() {
    var j = job();
    var nodes = [];

    nodes.push({ t: S.T('status.created'), d: S.T('stage.d.created'), at: order.createdAt, done: true });

    if (order.status === 'review') {
      nodes.push({ t: S.T('status.review'), d: S.T('ck.reviewD'), at: order.createdAt, done: false, current: true });
    } else {
      nodes.push({ t: S.T('status.paid'), d: S.T('stage.d.paid'), at: order.payment && order.payment.paidAt, done: true });
      var tl = (j && j.timeline) || (order.topup && order.topup.timeline) || [];
      tl.forEach(function (step) {
        if (step.status === 'queued' || step.status === 'processing' || step.status === 'retrying') {
          nodes.push({
            t: S.T('status.' + (step.status === 'retrying' ? 'processing' : step.status)),
            d: S.T('or.attempt', { n: (j && j.attempts) || order.topup && order.topup.attempts || 1 }),
            at: Date.parse(step.at), done: false, current: true
          });
        }
      });
      var done = order.status === 'delivered';
      nodes.push({
        t: S.T('status.delivered'),
        d: done ? S.T('stage.d.delivered') : S.T('or.waitDelivery'),
        at: done ? order.createdAt : null,
        done: done,
        current: !done && order.status !== 'failed'
      });
    }

    if (order.status === 'failed') {
      nodes.push({ t: S.T('status.failed'), d: S.T('or.failedD'), at: Date.now(), danger: true, current: true });
    }

    document.getElementById('or-timeline').innerHTML = nodes.map(function (n) {
      var cls = n.danger ? 'current' : (n.done ? 'done' : (n.current ? 'current' : ''));
      return '<li class="' + cls + '">' +
        '<h4>' + S.esc(n.t) + '</h4>' +
        '<p>' + S.esc(n.d) + '</p>' +
        (n.at ? '<span class="time">' + S.esc(S.formatDate(n.at)) + '</span>' : '') +
      '</li>';
    }).join('');
  }

  /* ---------------- بطاقة الحالة الجانبية ---------------- */
  function renderStatusCard() {
    var meta = S.statusMeta(order.status);
    var j = job();
    document.getElementById('or-status-card').innerHTML =
      '<div class="card-title"><span class="dot"></span> <span>' + S.esc(S.T('or.status')) + '</span></div>' +
      '<div style="text-align:center;padding:8px 0 4px">' +
        '<div style="font-size:2.4rem;line-height:1">' + (order.status === 'delivered' ? '✅' : order.status === 'failed' ? '⚠️' : order.status === 'review' ? '⏳' : '⚡') + '</div>' +
        '<strong style="font-size:1.05rem">' + S.esc(meta.label) + '</strong>' +
        '<p class="muted" style="font-size:.82rem;margin:6px 0 0">' + S.esc(meta.note || S.T('or.waitDelivery')) + '</p>' +
      '</div>' +
      (j ? '<div class="divider"></div>' +
        '<div class="kv">' +
          '<div><span>' + S.esc(S.T('or.jobId')) + '</span><b dir="ltr">' + S.esc(j.id) + '</b></div>' +
          '<div><span>' + S.esc(S.T('or.attempts')) + '</span><b>' + (j.attempts || 0) + ' / ' + (SHN_TOPUP.MAX_ATTEMPTS || 3) + '</b></div>' +
        '</div>' : '');
  }

  /* ---------------- تفاصيل الأوردر ---------------- */
  function renderDetails() {
    var c = order.customer || {};
    var rows = [
      [S.T('gp.row.game'), S.P(order.game.name)],
      [S.T('gp.row.pkg'), order.pkg.amount],
      [S.T('ck.player'), (order.player && order.player.playerId) || '—'],
      [S.T('ck.region'), S.P(String((order.extra && (order.extra.zone || order.extra.server)) || '—'))],
      [S.T('gp.row.price'), S.money(order.pkg.price)],
      [S.T('gp.total'), S.money(order.total) + (order.currency && order.currency !== 'EGP' ? ' (' + order.currency + ')' : '')],
      [S.T('ck.customer'), c.name || '—'],
      [S.T('ck.phone'), c.phone || '—'],
      [S.T('or.payment'), (order.payment && order.payment.label) || '—'],
      [S.T('or.reference'), (order.payment && order.payment.reference) || '—']
    ];
    document.getElementById('or-details').innerHTML = rows.map(function (r) {
      return '<div><span>' + S.esc(r[0]) + '</span><b>' + S.esc(String(r[1])) + '</b></div>';
    }).join('');

    var wa = document.getElementById('or-wa');
    if (wa) {
      var S_ = S;
      var msg = S_.T('or.waMsg', { id: order.id });
      wa.setAttribute('href', 'https://wa.me/' + (S.CFG.brand.whatsapp || '') + '?text=' + encodeURIComponent(msg));
    }
  }

  /* ---------------- الشحن التلقائي ---------------- */
  function renderTopup() {
    var j = job();
    var card = document.getElementById('or-topup-card');
    if (!j) {
      card.classList.add('hidden');
      return;
    }
    card.classList.remove('hidden');
    document.getElementById('or-progress').style.width = (j.progress || 5) + '%';
    var rows = [
      [S.T('or.topupStatus'), S.T('status.' + (j.status === 'retrying' ? 'processing' : j.status))],
      [S.T('or.attempts'), (j.attempts || 0) + ' / ' + (SHN_TOPUP.MAX_ATTEMPTS || 3)],
      [S.T('or.providerRef'), j.providerRef || '—'],
      [S.T('or.eta'), j.status === 'delivered' || j.status === 'failed' ? '—' : (SHN_TOPUP.etaSeconds(j) + 's')],
      [S.T('or.updatedAt'), S.formatDate(Date.parse(j.updatedAt) || Date.now())]
    ];
    document.getElementById('or-topup-kv').innerHTML = rows.map(function (r) {
      return '<div><span>' + S.esc(r[0]) + '</span><b>' + S.esc(String(r[1])) + '</b></div>';
    }).join('');
  }

  function renderAll() {
    order = S.getOrder(order.id) || order;
    renderHead();
    renderTimeline();
    renderStatusCard();
    renderDetails();
    renderTopup();
  }

  renderAll();

  /* متابعة لحظية: أحداث المحرك + استعلام دوري */
  if (window.SHN_TOPUP) SHN_TOPUP.onChange(function (j) { if (j.orderId === order.id) renderAll(); });
  document.addEventListener('shn:i18n', renderAll);
  pollTimer = window.setInterval(function () {
    var j = job();
    if (j && (j.status === 'delivered' || j.status === 'failed')) { renderAll(); window.clearInterval(pollTimer); return; }
    renderAll();
  }, 2500);

  var print = document.getElementById('or-print');
  if (print) print.addEventListener('click', function () { window.print(); });
})();
