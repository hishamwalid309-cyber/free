/* =========================================================
   شحنلي | Shahnly — سكربت الصفحة الرئيسية (ستور كامل)
   سلايدر · تصنيفات · ألعاب · مصغرة · عروض · فيديو · أخبار · دول · حول · شركاء دفع
   ========================================================= */
(function () {
  'use strict';
  var S = window.SHN;
  var STORE = window.STORE || {};
  var coTab = 'all';
  var cat = 'all';
  var newsGame = 'all';
  var visible = 6;
  var slide = 0;
  var slideTimer = null;
  var tickTimer = null;

  function $(id) { return document.getElementById(id); }
  function txt(v) { return S.esc(v == null ? '' : String(v)); }

  /* ================= السلايدر ================= */
  function slidesHTML() {
    return (STORE.banners || []).map(function (b) {
      return '<div class="slide" style="background:' + b.grad + '">' +
        '<span class="slide-emoji">' + b.emoji + '</span>' +
        '<div style="flex:1;min-width:220px">' +
          (b.badge ? '<span class="badge">' + txt(S.T(b.badge)) + '</span>' : '') +
          '<h3 style="margin-top:10px">' + txt(S.T(b.k)) + '</h3>' +
          '<p>' + txt(S.T(b.k + '.d')) + '</p>' +
          '<div class="slide-row">' +
            '<a class="btn btn-primary" href="#games">' + txt(S.T(b.cta)) + '</a>' +
            (b.timerMin ? '<span class="slide-timer" data-timer="' + b.id + '">⏳</span>'
                        : '<span class="slide-timer">📅 ' + txt(S.T('s.endsAt', { date: '2026-12-31' })) + '</span>') +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function renderSlider() {
    var box = $('slides');
    if (!box) return;
    box.innerHTML = slidesHTML();
    $('slide-dots').innerHTML = (STORE.banners || []).map(function (b, i) {
      return '<button class="dot' + (i === 0 ? ' is-active' : '') + '" data-i="' + i + '" aria-label="slide ' + (i + 1) + '"></button>';
    }).join('');
    Array.prototype.slice.call(document.querySelectorAll('#slide-dots .dot')).forEach(function (d) {
      d.addEventListener('click', function () { goTo(parseInt(d.getAttribute('data-i'), 10)); });
    });
    goTo(0);
    startAutoplay();
    startCountdowns();
  }

  function goTo(i) {
    var total = (STORE.banners || []).length;
    if (!total) return;
    slide = (i + total) % total;
    var box = $('slides');
    if (box) box.style.transform = 'translateX(' + (S.I18N && S.I18N.isRTL ? slide * 100 : -slide * 100) + '%)';
    Array.prototype.slice.call(document.querySelectorAll('#slide-dots .dot')).forEach(function (d, idx) {
      d.classList.toggle('is-active', idx === slide);
    });
  }

  function startAutoplay() {
    if (slideTimer) window.clearInterval(slideTimer);
    slideTimer = window.setInterval(function () { goTo(slide + 1); }, 6000);
  }

  /* عدّاد تنازلي في البانرات */
  function startCountdowns() {
    var ends = {};
    (STORE.banners || []).forEach(function (b) {
      if (b.timerMin) ends[b.id] = Date.now() + b.timerMin * 60000;
    });
    function tick() {
      Object.keys(ends).forEach(function (id) {
        var el = document.querySelector('[data-timer="' + id + '"]');
        if (!el) return;
        var left = Math.max(0, ends[id] - Date.now());
        var h = Math.floor(left / 3600000);
        var m = Math.floor((left % 3600000) / 60000);
        var s = Math.floor((left % 60000) / 1000);
        var t = (h > 0 ? h + ':' : '') + (m < 10 && h > 0 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
        el.textContent = '⏳ ' + S.T('s.endsIn', { time: t });
      });
    }
    tick();
    if (tickTimer) window.clearInterval(tickTimer);
    tickTimer = window.setInterval(tick, 1000);
  }

  /* ================= التصنيفات + الألعاب ================= */
  function gamesInCat() {
    var list = S.GAMES.slice().sort(function (a, b) { return (a.rank || 99) - (b.rank || 99); });
    if (cat === 'all') return list;
    return list.filter(function (g) { return (g.cats || ['all']).indexOf(cat) >= 0; });
  }

  function badgeHTML(g) {
    var out = [];
    if ((g.badges || []).indexOf('new') >= 0) out.push('<span class="badge badge-new">' + txt(S.T('sg.badgeNew')) + '</span>');
    if ((g.badges || []).indexOf('hot') >= 0) out.push('<span class="badge badge-hot">' + txt(S.T('sg.badgeHot')) + '</span>');
    if ((g.badges || []).indexOf('bonus') >= 0) {
      var b = g.bonus ? '+ ' + g.bonus + '%' : '';
      out.push('<span class="badge badge-bonus">' + txt(S.T('sg.badgeBonus')) + (b ? ' ' + b : '') + '</span>');
    }
    return out.length ? '<span class="card-badges">' + out.join('') + '</span>' : '';
  }

  function renderCats() {
    var bar = $('cat-bar');
    if (!bar) return;
    bar.innerHTML = (STORE.cats || []).map(function (c) {
      return '<button type="button" class="cat-chip' + (c.id === cat ? ' is-active' : '') + '" data-cat="' + c.id + '">' +
        '<span>' + c.ico + '</span>' + txt(S.T(c.key)) + '</button>';
    }).join('');
    Array.prototype.slice.call(bar.querySelectorAll('.cat-chip')).forEach(function (b) {
      b.addEventListener('click', function () {
        cat = b.getAttribute('data-cat');
        visible = 6;
        renderCats();
        renderGames();
      });
    });
  }

  function renderGames() {
    var grid = $('games-grid');
    if (!grid) return;
    var list = gamesInCat();
    var shown = list.slice(0, visible);
    grid.innerHTML = shown.map(function (g) {
      var save = Math.round((g.maxSave || 0) * 100);
      return '<a class="game-card" href="game.html?id=' + g.id + '" style="--g:' + g.gradient + '">' +
        badgeHTML(g) +
        '<span class="game-thumb">' + g.emoji + '</span>' +
        '<h3>' + txt(g.name) + '</h3>' +
        '<span class="meta">' + txt(S.P(g.tagline)) + '</span>' +
        '<span class="foot">' +
          '<span class="game-price"><span class="from">' + txt(S.T('sg.fromPrice', { p: '' })) + '</span>' +
            '<b>' + S.money(g.priceFrom) + '</b></span>' +
          '<span class="btn btn-primary btn-sm">' + txt(S.T('games.cta')) + '</span>' +
        '</span>' +
        (save > 0 ? '<span class="save-tag">' + txt(S.T('sg.save', { n: save })) + '</span>' : '') +
      '</a>';
    }).join('');

    var more = $('load-more');
    if (more) {
      var all = list.length <= shown.length;
      more.style.display = all ? 'none' : '';
    }
  }

  var moreBtn = $('load-more');
  if (moreBtn) moreBtn.addEventListener('click', function () { visible += 6; renderGames(); });

  /* ================= ألعاب مصغرة ================= */
  function renderMini() {
    var box = $('mini-grid');
    if (!box) return;
    box.innerHTML = (STORE.miniGames || []).map(function (m) {
      return '<div class="mini-card" style="background:' + m.grad + '">' +
        '<div><span class="ico">' + m.emoji + '</span>' +
          '<h4>' + txt(S.T(m.k)) + '</h4>' +
          '<p>' + txt(S.T('mg.sub')) + '</p></div>' +
        '<div class="row" style="margin-top:14px">' +
          (m.tag ? '<span class="badge badge-accent">' + txt(S.T(m.tag)) + '</span>' : '') +
          '<button class="btn btn-ghost btn-sm" type="button" data-soon>' + txt(S.T('mg.play')) + '</button>' +
        '</div>' +
      '</div>';
    }).join('');
    Array.prototype.slice.call(box.querySelectorAll('[data-soon]')).forEach(function (b) {
      b.addEventListener('click', function () { S.toast(S.T('mg.soon'), 'info'); });
    });
  }

  /* ================= أوفر العروض ================= */
  function renderDeals() {
    var grid = $('deals-grid');
    if (!grid) return;
    var deals = [];
    S.GAMES.forEach(function (g) {
      g.packages.forEach(function (p) {
        if (!p.oldPrice || p.oldPrice <= p.price) return;
        deals.push({ game: g, pkg: p, off: Math.round((1 - p.price / p.oldPrice) * 100) });
      });
    });
    deals.sort(function (a, b) { return b.off - a.off; });
    grid.innerHTML = deals.slice(0, 4).map(function (d) {
      return '<a class="card" href="game.html?id=' + d.game.id + '&pkg=' + d.pkg.id + '" style="text-decoration:none">' +
        '<div class="row" style="justify-content:space-between">' +
          '<span class="badge badge-accent">' + txt(S.T('deals.off', { n: d.off })) + '</span>' +
          '<span style="font-size:1.3rem">' + d.game.emoji + '</span>' +
        '</div>' +
        '<h3 style="margin:12px 0 4px;font-size:1rem">' + txt(S.AMT(d.pkg.amount)) + '</h3>' +
        '<div class="muted" style="font-size:.82rem">' + txt(d.game.name) + '</div>' +
        '<div class="row" style="justify-content:space-between;margin-top:14px;align-items:flex-end">' +
          '<span style="font-size:1.15rem;font-weight:900;color:var(--accent)">' + S.money(d.pkg.price) + '</span>' +
          '<s class="muted" style="font-size:.85rem">' + S.money(d.pkg.oldPrice) + '</s>' +
        '</div>' +
      '</a>';
    }).join('');
  }

  /* ================= الفيديو ================= */
  function renderVideos() {
    var box = $('video-grid');
    if (!box) return;
    box.innerHTML = (STORE.videos || []).map(function (v) {
      return '<div class="video-card" data-video="' + v.id + '" role="button" tabindex="0">' +
        '<div class="video-thumb" style="background:' + v.grad + '">' +
          '<span>' + v.emoji + '</span>' +
          '<span class="video-play"><span>▶</span></span>' +
          '<span class="video-dur">' + v.dur + '</span>' +
        '</div>' +
        '<div class="video-body">' +
          '<h4>' + txt(S.T(v.k)) + '</h4>' +
          '<div class="meta">' + txt(S.T('sv.views', { n: v.views })) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
    Array.prototype.slice.call(box.querySelectorAll('[data-video]')).forEach(function (c) {
      c.addEventListener('click', function () { S.toast(S.T('sv.soon'), 'info'); });
    });
  }

  /* ================= الأخبار ================= */
  function newsList() {
    var list = (STORE.news || []).slice();
    if (newsGame !== 'all') list = list.filter(function (n) { return n.game === newsGame; });
    return list;
  }

  function renderNewsFilter() {
    var box = $('news-filter');
    if (!box) return;
    var games = [];
    (STORE.news || []).forEach(function (n) { if (games.indexOf(n.game) < 0) games.push(n.game); });
    var chips = [{ id: 'all', label: S.T('sn.all') }].concat(games.map(function (id) {
      var g = S.getGame(id);
      return { id: id, label: g ? g.name : id };
    }));
    box.innerHTML = chips.map(function (c) {
      return '<button type="button" class="cat-chip' + (c.id === newsGame ? ' is-active' : '') + '" data-ng="' + c.id + '">' +
        txt(c.label) + '</button>';
    }).join('');
    Array.prototype.slice.call(box.querySelectorAll('[data-ng]')).forEach(function (b) {
      b.addEventListener('click', function () {
        newsGame = b.getAttribute('data-ng');
        renderNewsFilter();
        renderNews();
      });
    });
  }

  function renderNews() {
    var box = $('news-grid');
    if (!box) return;
    box.innerHTML = newsList().map(function (n) {
      var g = S.getGame(n.game) || { name: n.game, emoji: '🎮', gradient: 'var(--surface-2)' };
      return '<a class="news-card" href="news.html#' + n.id + '">' +
        '<div class="news-thumb" style="background:' + g.gradient + '">' + g.emoji + '</div>' +
        '<div class="news-body">' +
          (n.tag ? '<span class="badge badge-bonus" style="align-self:flex-start">' + txt(S.T(n.tag)) + '</span>' : '') +
          '<h4>' + txt(S.T(n.k)) + '</h4>' +
          '<div class="news-date">' + txt(g.name) + ' · ' + txt(S.formatDate(Date.parse(n.date))) + '</div>' +
        '</div>' +
      '</a>';
    }).join('');
  }

  /* ================= الدول واللغات ================= */
  function renderCountryTabs() {
    var box = $('co-tabs');
    if (!box || !window.COUNTRIES) return;
    var tabs = [{ key: 'all', label: S.T('nav.countries') }].concat(COUNTRIES.REGIONS.map(function (r) {
      return { key: r.key, label: S.T(r.label) };
    }));
    box.innerHTML = tabs.map(function (tb) {
      var n = tb.key === 'all' ? COUNTRIES.counts().all : COUNTRIES.counts()[tb.key];
      return '<button type="button" class="lang-btn' + (tb.key === coTab ? ' is-active' : '') + '" data-tab="' + tb.key + '">' +
        txt(tb.label) + ' <span class="badge badge-muted">' + n + '</span></button>';
    }).join('');
    Array.prototype.slice.call(box.querySelectorAll('[data-tab]')).forEach(function (b) {
      b.addEventListener('click', function () {
        coTab = b.getAttribute('data-tab');
        renderCountryTabs();
        renderCountries();
      });
    });
  }

  function renderCountries() {
    var grid = $('co-grid');
    if (!grid || !window.COUNTRIES) return;
    var act = COUNTRIES.active();
    var items = coTab === 'all' ? COUNTRIES.list() : COUNTRIES.list(coTab);
    grid.innerHTML = items.map(function (c) {
      return '<div class="co-card' + (c.c === act.c ? ' is-active' : '') + '" data-c="' + c.c + '" title="' + txt(COUNTRIES.name(c)) + '">' +
        '<span class="flag">' + c.f + '</span>' +
        '<div><b>' + txt(COUNTRIES.name(c)) + '</b><small>+' + c.dial + ' · ' + c.cur.code + '</small></div>' +
        '<span class="cur">' + S.money(minPrice()) + '</span>' +
      '</div>';
    }).join('');
    Array.prototype.slice.call(grid.querySelectorAll('.co-card')).forEach(function (el) {
      el.addEventListener('click', function () { COUNTRIES.set(el.getAttribute('data-c')); });
    });
  }

  function renderLangs() {
    var box = $('co-langs');
    if (!box || !window.I18N) return;
    var cur = I18N.lang();
    box.innerHTML = I18N.list().map(function (l) {
      return '<button type="button" class="co-lang' + (l.code === cur ? ' is-active' : '') + '" data-lang="' + l.code + '">' +
        l.flag + ' ' + l.native + ' <small>' + l.en + '</small></button>';
    }).join('');
    Array.prototype.slice.call(box.querySelectorAll('.co-lang')).forEach(function (b) {
      b.addEventListener('click', function () { I18N.set(b.getAttribute('data-lang')); });
    });
  }

  /* ================= حول المتجر + الأرقام + الشركاء ================= */
  function renderAbout() {
    var box = $('about-grid');
    if (!box) return;
    box.innerHTML = (STORE.about || []).map(function (a) {
      var parts = String(S.T(a.k)).split('|');
      var title = parts[0] || '';
      var desc = parts[1] || '';
      return '<div class="about-card">' +
        '<span class="about-num">' + a.n + '</span>' +
        '<span class="ico">' + a.ico + '</span>' +
        '<h4>' + txt(title) + '</h4>' +
        '<p>' + txt(desc) + '</p>' +
      '</div>';
    }).join('');
  }

  function minPrice() {
    var all = [];
    S.GAMES.forEach(function (g) { g.packages.forEach(function (p) { all.push(p.price); }); });
    return Math.min.apply(null, all);
  }

  function packageCount() {
    var n = 0;
    S.GAMES.forEach(function (g) { n += g.packages.length; });
    return n;
  }

  function renderStats() {
    var box = $('stat-grid');
    if (!box) return;
    var items = [
      { ico: '🎮', num: S.GAMES.length + '', l: S.T('st.games') },
      { ico: '📦', num: packageCount() + '+', l: S.T('st.packages') },
      { ico: '🌍', num: (window.COUNTRIES ? COUNTRIES.counts().all : 58) + '+', l: S.T('st.countries') },
      { ico: '🗣️', num: (window.I18N ? I18N.list().length : 9) + '', l: S.T('st.langs') },
      { ico: '💬', num: '24/7', l: S.T('st.support') },
      { ico: '💳', num: '6', l: S.T('st.pay') }
    ];
    box.innerHTML = items.map(function (i) {
      return '<div class="stat-big"><span class="ico">' + i.ico + '</span>' +
        '<span class="stat-num">' + txt(i.num) + '</span>' +
        '<span class="stat-lbl">' + txt(i.l) + '</span></div>';
    }).join('');
  }

  function renderPartners() {
    var box = $('partner-grid');
    if (!box) return;
    box.innerHTML = (STORE.partners || []).map(function (p) {
      return '<div class="partner-chip"><span class="ico">' + p.ico + '</span><span>' + txt(S.T(p.k)) + '</span></div>';
    }).join('');
  }

  /* ================= التشغيل + إعادة الرسم ================= */
  function renderAll() {
    renderSlider();
    renderCats();
    renderGames();
    renderMini();
    renderDeals();
    renderVideos();
    renderNewsFilter();
    renderNews();
    renderCountryTabs();
    renderCountries();
    renderLangs();
    renderAbout();
    renderStats();
    renderPartners();
  }

  renderAll();

  var prev = $('slide-prev'), next = $('slide-next');
  if (prev) prev.addEventListener('click', function () { goTo(slide - 1); startAutoplay(); });
  if (next) next.addEventListener('click', function () { goTo(slide + 1); startAutoplay(); });

  document.addEventListener('shn:i18n', renderAll);
  document.addEventListener('shn:country', renderAll);
})();
