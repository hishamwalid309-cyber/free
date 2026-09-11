/* =========================================================
   شحنلي | Shahnly — صفحات المتجر: الأخبار · البث والفيديو · مركز المساعدة
   (سكربت واحد بيشتغل حسب الصفحة اللي فيها عناصره)
   ========================================================= */
(function () {
  'use strict';
  var S = window.SHN;
  var STORE = window.STORE || {};
  function $(id) { return document.getElementById(id); }
  function txt(v) { return S.esc(v == null ? '' : String(v)); }

  /* =========================================================
     1) الأخبار والأحداث
     ========================================================= */
  var newsBox = $('news-list');
  if (newsBox) {
    var filter = 'all';

    function gamesWithNews() {
      var out = [];
      (STORE.news || []).forEach(function (n) { if (out.indexOf(n.game) < 0) out.push(n.game); });
      return out;
    }

    function renderFilter() {
      var box = $('news-filter');
      if (!box) return;
      var chips = [{ id: 'all', label: S.T('sn.all') }].concat(gamesWithNews().map(function (id) {
        var g = S.getGame(id);
        return { id: id, label: g ? g.name : id };
      }));
      box.innerHTML = chips.map(function (c) {
        return '<button type="button" class="cat-chip' + (c.id === filter ? ' is-active' : '') + '" data-ng="' + c.id + '">' +
          txt(c.label) + '</button>';
      }).join('');
      Array.prototype.slice.call(box.querySelectorAll('[data-ng]')).forEach(function (b) {
        b.addEventListener('click', function () {
          filter = b.getAttribute('data-ng');
          renderFilter();
          renderNews();
        });
      });
    }

    function renderNews() {
      var list = (STORE.news || []).slice();
      if (filter !== 'all') list = list.filter(function (n) { return n.game === filter; });
      if (!list.length) {
        newsBox.innerHTML = '<div class="card empty"><div class="ico">📰</div><p>' + txt(S.T('hp.noRes')) + '</p></div>';
        return;
      }
      newsBox.innerHTML = list.map(function (n) {
        var g = S.getGame(n.game) || { name: n.game, emoji: '🎮', gradient: 'var(--surface-2)' };
        return '<a class="news-card" id="' + n.id + '" href="game.html?id=' + (S.getGame(n.game) ? n.game : 'pubg') + '">' +
          '<div class="news-thumb" style="background:' + g.gradient + '">' + g.emoji + '</div>' +
          '<div class="news-body">' +
            (n.tag ? '<span class="badge badge-bonus" style="align-self:flex-start">' + txt(S.T(n.tag)) + '</span>' : '') +
            '<h4>' + txt(S.T(n.k)) + '</h4>' +
            '<div class="news-date">' + txt(g.name) + ' · ' + txt(S.formatDate(Date.parse(n.date))) + '</div>' +
            '<span class="btn btn-ghost btn-sm" style="align-self:flex-start;margin-top:6px">' + txt(S.T('nw.read')) + '</span>' +
          '</div>' +
        '</a>';
      }).join('');
    }

    renderFilter();
    renderNews();
    document.addEventListener('shn:i18n', function () { renderFilter(); renderNews(); });
  }

  /* =========================================================
     2) البث والفيديو
     ========================================================= */
  var videoBox = $('video-list');
  if (videoBox) {
    function renderVideos() {
      videoBox.innerHTML = (STORE.videos || []).map(function (v) {
        return '<div class="video-card" data-v="' + v.id + '" role="button" tabindex="0">' +
          '<div class="video-thumb" style="background:' + v.grad + '">' +
            '<span>' + v.emoji + '</span>' +
            '<span class="video-play"><span>▶</span></span>' +
            '<span class="video-dur">' + v.dur + '</span>' +
          '</div>' +
          '<div class="video-body"><h4>' + txt(S.T(v.k)) + '</h4>' +
          '<div class="meta">' + txt(S.T('sv.views', { n: v.views })) + '</div></div>' +
        '</div>';
      }).join('');
      Array.prototype.slice.call(videoBox.querySelectorAll('[data-v]')).forEach(function (c) {
        c.addEventListener('click', function () { play(c.getAttribute('data-v')); });
      });
    }

    function play(id) {
      var v = (STORE.videos || []).filter(function (x) { return x.id === id; })[0];
      if (!v) return;
      var other = (STORE.videos || []).filter(function (x) { return x.id !== id; });
      var modal = $('video-modal');
      $('video-modal-body').innerHTML =
        '<div class="video-thumb" style="background:' + v.grad + ';aspect-ratio:16/9;border-radius:16px">' +
          '<span style="font-size:3rem">' + v.emoji + '</span>' +
        '</div>' +
        '<h3 style="margin:16px 0 6px">' + txt(S.T(v.k)) + '</h3>' +
        '<p class="muted" style="font-size:.86rem">' + txt(S.T('sv.soon')) + '</p>' +
        '<div class="divider"></div>' +
        '<h4 style="font-size:.92rem">' + txt(S.T('lv.related')) + '</h4>' +
        '<div class="row" style="flex-wrap:wrap;gap:8px">' +
          other.map(function (o) {
            return '<button class="cat-chip" data-rel="' + o.id + '">' + o.emoji + ' ' + txt(S.T(o.k)) + '</button>';
          }).join('') +
        '</div>';
      modal.classList.add('show');
      Array.prototype.slice.call($('video-modal-body').querySelectorAll('[data-rel]')).forEach(function (b) {
        b.addEventListener('click', function () { play(b.getAttribute('data-rel')); });
      });
    }

    var closeBtn = $('video-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { $('video-modal').classList.remove('show'); });
    var modalEl = $('video-modal');
    if (modalEl) modalEl.addEventListener('click', function (e) {
      if (e.target === modalEl) modalEl.classList.remove('show');
    });

    renderVideos();
    document.addEventListener('shn:i18n', renderVideos);
  }

  /* =========================================================
     3) مركز المساعدة
     ========================================================= */
  var helpBox = $('help-list');
  if (helpBox) {
    /* تصنيفات مبنية على مفاتيح موجودة أصلًا */
    var CATS = [
      { id: 'order', ico: '🧾', key: 'nav.track' },
      { id: 'pay', ico: '💳', key: 'pay.title' },
      { id: 'delivery', ico: '🚚', key: 'gp.step3' },
      { id: 'refund', ico: '↩️', key: 'gp.side.refund' },
      { id: 'security', ico: '🔒', key: 'nav.security' },
      { id: 'account', ico: '👤', key: 'nav.account' }
    ];
    /* كل سؤال مرتبط بتصنيف */
    var FAQ_CAT = { 1: 'order', 2: 'security', 3: 'delivery', 4: 'refund', 5: 'pay', 6: 'order', 7: 'pay', 8: 'account' };
    var active = 'all';
    var query = '';

    function items() {
      var out = [];
      for (var i = 1; i <= 8; i++) {
        out.push({ n: i, cat: FAQ_CAT[i] || 'order', q: S.T('fq.q' + i), a: S.T('fq.a' + i) });
      }
      return out;
    }

    function renderCats() {
      var box = $('help-cats');
      if (!box) return;
      var chips = [{ id: 'all', ico: '📚', label: S.T('sn.all') }].concat(CATS.map(function (c) {
        return { id: c.id, ico: c.ico, label: S.T(c.key) };
      }));
      box.innerHTML = chips.map(function (c) {
        return '<button type="button" class="cat-chip' + (c.id === active ? ' is-active' : '') + '" data-hc="' + c.id + '">' +
          c.ico + ' ' + txt(c.label) + '</button>';
      }).join('');
      Array.prototype.slice.call(box.querySelectorAll('[data-hc]')).forEach(function (b) {
        b.addEventListener('click', function () {
          active = b.getAttribute('data-hc');
          renderCats();
          renderList();
        });
      });
    }

    function renderList() {
      var list = items().filter(function (it) {
        var okCat = active === 'all' || it.cat === active;
        var q = query.trim().toLowerCase();
        var okQuery = !q || (it.q + ' ' + it.a).toLowerCase().indexOf(q) >= 0;
        return okCat && okQuery;
      });
      if (!list.length) {
        helpBox.innerHTML = '<div class="card empty"><div class="ico">🔍</div><p>' + txt(S.T('hp.noRes')) + '</p></div>';
        return;
      }
      helpBox.innerHTML = list.map(function (it) {
        return '<div class="acc"><details><summary>' + txt(it.q) + '</summary>' +
          '<div class="acc-body"><p>' + txt(it.a) + '</p></div></details></div>';
      }).join('');
    }

    var search = $('help-search');
    if (search) search.addEventListener('input', function () { query = search.value; renderList(); });

    renderCats();
    renderList();
    document.addEventListener('shn:i18n', function () { renderCats(); renderList(); });
  }
})();
