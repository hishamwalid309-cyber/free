/* =========================================================
   شحنلي | Shahnly — تتبع الطلب
   بحث برقم الأوردر + قائمة آخر الأوردرات المحفوظة على الجهاز
   ========================================================= */
(function () {
  'use strict';
  var S = window.SHN;
  var input = document.getElementById('tr-id');
  var btn = document.getElementById('tr-btn');
  if (!input || !btn) return;

  function clean(v) { return String(v || '').trim().toUpperCase().replace(/\s+/g, ''); }

  function showError(msg) {
    var box = document.getElementById('tr-err');
    box.textContent = msg;
    box.classList.add('show');
    input.classList.add('is-error');
  }
  function clearError() {
    document.getElementById('tr-err').classList.remove('show');
    input.classList.remove('is-error');
  }

  function search() {
    clearError();
    var id = clean(input.value);
    if (!id) { showError(S.T('gp.err.required')); return; }
    var order = S.getOrder(id);
    if (!order) { showError(S.T('tr.notFound')); S.toast(S.T('tr.notFound'), 'err'); return; }
    window.location.href = 'order.html?id=' + encodeURIComponent(order.id);
  }

  btn.addEventListener('click', search);
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') search(); });
  input.addEventListener('input', function () { if (input.value) clearError(); });

  /* ---------------- آخر الأوردرات ---------------- */
  function renderList() {
    var box = document.getElementById('tr-list');
    var clear = document.getElementById('tr-clear');
    if (!box) return;

    var orders = [];
    var all = S.allOrders();
    for (var k in all) if (Object.prototype.hasOwnProperty.call(all, k)) orders.push(all[k]);
    orders.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    orders = orders.slice(0, 6);

    if (!orders.length) {
      box.innerHTML = '<div class="card empty"><div class="ico">📦</div>' +
        '<p data-i18n="tr.empty" style="margin:0">' + S.esc(S.T('tr.empty')) + '</p></div>';
      if (clear) clear.classList.add('hidden');
      return;
    }
    if (clear) {
      clear.classList.remove('hidden');
      clear.onclick = function () {
        var a = S.allOrders();
        for (var kk in a) if (Object.prototype.hasOwnProperty.call(a, kk)) delete a[kk];
        try { window.localStorage.setItem('shahnly_orders_v1', '{}'); } catch (e) { /* ignore */ }
        renderList();
        S.toast(S.T('tr.cleared'), 'ok');
      };
    }
    box.innerHTML = orders.map(function (o) {
      var meta = S.statusMeta(o.status);
      var j = (o.topup && window.SHN_TOPUP) ? SHN_TOPUP.get(o.topup.jobId) : null;
      var progress = j ? (j.progress || 5) : (o.status === 'delivered' ? 100 : 35);
      return '<a class="card" href="order.html?id=' + encodeURIComponent(o.id) + '" style="display:block;text-decoration:none">' +
        '<div class="row" style="justify-content:space-between">' +
          '<strong dir="ltr" style="letter-spacing:.5px">' + S.esc(o.id) + '</strong>' +
          '<span class="' + S.badgeClass(meta.tone) + '">' + S.esc(meta.label) + '</span>' +
        '</div>' +
        '<div class="row" style="justify-content:space-between;margin-top:8px">' +
          '<span class="muted" style="font-size:.84rem">' + S.esc(S.P(o.game.name)) + ' — ' + S.esc(o.pkg.amount) + '</span>' +
          '<span style="font-weight:800;color:var(--accent)">' + S.esc(S.money(o.total)) + '</span>' +
        '</div>' +
        '<div class="progress-line" style="margin-top:10px"><i style="width:' + progress + '%"></i></div>' +
        '<div class="muted" style="font-size:.74rem;margin-top:8px">' + S.esc(S.formatDate(o.createdAt)) + '</div>' +
      '</a>';
    }).join('');
  }

  renderList();
  document.addEventListener('shn:i18n', renderList);
})();
