/* =========================================================
   شحنلي | Shahnly — الهيدر والفوتر المشترك (مصدر واحد لكل الصفحات)
   الاستخدام في أي صفحة:
     <div id="site-chrome"></div>   ← شريط التجربة + الدولة/العملة + الهيدر
     ... محتوى الصفحة ...
     <div id="site-footer"></div>   ← الفوتر
   لازم يتحمّل بعد i18n.js وقبل app.js
   ========================================================= */
(function () {
  'use strict';

  var NAV = [
    { href: 'index.html', key: 'nav.home' },
    { href: 'index.html#games', key: 'nav.games' },
    { href: 'news.html', key: 'nav.news' },
    { href: 'live.html', key: 'nav.live' },
    { href: 'help.html', key: 'nav.help' },
    { href: 'track.html', key: 'nav.track' }
  ];

  var page = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var USER_KEY = 'shahnly_user_v1';

  function user() {
    try { return JSON.parse(window.localStorage.getItem(USER_KEY) || 'null'); } catch (e) { return null; }
  }

  function navLinks() {
    return NAV.map(function (n) {
      var active = n.href.toLowerCase() === page ? ' class="active"' : '';
      return '<a href="' + n.href + '"' + active + ' data-i18n="' + n.key + '">' + n.key + '</a>';
    }).join('');
  }

  function logo() {
    return '<a class="logo" href="index.html">' +
      '<span class="logo-mark">🎮</span>' +
      '<span><span data-brand-name>شحنلي</span><small>SHAHNLY</small></span>' +
      '</a>';
  }

  /* ------------------ قوائم النافبار ------------------ */
  function notifMenu() {
    return '<div class="has-menu" id="nav-notif">' +
      '<button type="button" class="nav-ico" data-i18n-aria="nav.notify" aria-label="الإشعارات">🔔<span class="ping"></span></button>' +
      '<div class="nav-menu">' +
        '<div class="hint" data-i18n="nt.title"></div>' +
        '<div class="sep"></div>' +
        '<a href="news.html">🎁 <span data-i18n="nt.1"></span></a>' +
        '<a href="news.html">⚡ <span data-i18n="nt.2"></span></a>' +
        '<a href="track.html">🚚 <span data-i18n="nt.3"></span></a>' +
        '<div class="sep"></div>' +
        '<button type="button" data-i18n="nt.markAll"></button>' +
      '</div>' +
    '</div>';
  }

  function accountMenu() {
    var u = user();
    var head = u
      ? '<div class="hint"><b>' + (u.name || '') + '</b> · ' + (u.level || 'VIP 1') + '</div>'
      : '<div class="hint" data-i18n="nav.login"></div>';
    return '<div class="has-menu" id="nav-account">' +
      '<button type="button" class="nav-ico" data-i18n-aria="nav.account" aria-label="الحساب">' +
        (u ? '🙋' : '👤') + '</button>' +
      '<div class="nav-menu">' +
        head +
        '<div class="sep"></div>' +
        (u
          ? '<a href="account.html">👤 <span data-i18n="nav.account"></span></a>'
          : '<a href="account.html#login">🔑 <span data-i18n="nav.login"></span></a>') +
        '<a href="account.html#orders">🧾 <span data-i18n="nav.orders"></span></a>' +
        '<a href="account.html#coupons">🎟️ <span data-i18n="nav.coupons"></span></a>' +
        '<a href="account.html#vip">⭐ <span data-i18n="nav.vip"></span></a>' +
        '<a href="account.html#security">🔐 <span data-i18n="nav.security"></span></a>' +
        (u ? '<div class="sep"></div><button type="button" data-logout data-i18n="nav.logout"></button>' : '') +
      '</div>' +
    '</div>';
  }

  var top =
    '<a class="skip-link" href="#main" data-i18n="ui.skip">تخطَّ إلى المحتوى</a>' +
    '<div class="demo-bar" data-i18n="demo.bar">⚡ نسخة تجريبية (Demo)</div>' +
    '<div class="locale-bar"><div class="container">' +
      '<div id="country-switch"></div>' +
      '<span class="spacer"></span>' +
      '<span class="lb-note" data-i18n="ui.demoRates"></span>' +
    '</div></div>' +
    '<header class="site-header"><div class="container">' +
      logo() +
      '<nav class="main-nav" id="main-nav">' + navLinks() + '</nav>' +
      '<div class="header-actions">' +
        '<div class="lang-switch nav-lang" id="lang-switch"></div>' +
        notifMenu() +
        accountMenu() +
        '<a class="btn btn-ghost btn-sm" data-wa href="#" data-i18n="nav.whatsapp">واتساب</a>' +
        '<a class="btn btn-primary btn-sm" href="index.html#games" data-i18n="nav.browse">الألعاب</a>' +
        '<button class="nav-toggle" data-i18n-aria="nav.menu" aria-label="القائمة" aria-controls="main-nav">☰</button>' +
      '</div>' +
    '</div></header>';

  var footer =
    '<footer class="site-footer"><div class="container">' +
      '<div class="footer-grid">' +
        '<div>' + logo() +
          '<p class="muted" style="font-size:.85rem;margin-top:14px" data-i18n="footer.about"></p>' +
          '<div class="socials">' +
            '<a data-wa href="#" data-i18n-title="nav.whatsapp" title="واتساب" aria-label="WhatsApp">💬</a>' +
            '<a data-tg href="#" data-i18n-title="nav.telegram" title="تليجرام" aria-label="Telegram">✈️</a>' +
            '<a href="contact.html" data-i18n-title="nav.contact" title="راسلنا" aria-label="Email">✉️</a>' +
          '</div>' +
        '</div>' +
        '<div><h4 data-i18n="footer.games">الألعاب</h4><ul id="footer-games"></ul></div>' +
        '<div><h4 data-i18n="footer.links">روابط سريعة</h4><ul>' +
          '<li><a href="index.html" data-i18n="nav.home">الرئيسية</a></li>' +
          '<li><a href="news.html" data-i18n="nav.news">الأخبار</a></li>' +
          '<li><a href="live.html" data-i18n="nav.live">البث والفيديو</a></li>' +
          '<li><a href="help.html" data-i18n="nav.help">مركز المساعدة</a></li>' +
          '<li><a href="track.html" data-i18n="nav.track">تتبع الطلب</a></li>' +
          '<li><a href="account.html" data-i18n="nav.account">حسابي</a></li>' +
        '</ul></div>' +
        '<div><h4 data-i18n="footer.contact">تواصل معنا</h4><ul>' +
          '<li class="muted" style="font-size:.86rem"><span data-phone>+20 100 123 4567</span></li>' +
          '<li class="muted" style="font-size:.86rem"><span data-email>support@shahnly.demo</span></li>' +
          '<li class="muted" style="font-size:.86rem"><span data-address>القاهرة، مصر</span></li>' +
          '<li><a data-wa href="#" data-i18n="footer.wa">دعم واتساب فوري</a></li>' +
        '</ul></div>' +
      '</div>' +
      '<div class="legal" style="margin-bottom:12px">' +
        '<a href="faq.html" data-i18n="ft.terms"></a>' +
        '<a href="faq.html" data-i18n="ft.privacy"></a>' +
        '<a href="faq.html" data-i18n="ft.cookies"></a>' +
        '<a href="faq.html" data-i18n="ft.cookiePref"></a>' +
      '</div>' +
      '<div class="footer-bottom">' +
        '<span>© <span id="year">2026</span> <span data-brand-name>شحنلي</span> — ' +
          '<span data-i18n="ft.rights">جميع الحقوق محفوظة</span></span>' +
        '<span data-i18n="footer.demo">موقع تجريبي (Demo) لأغراض العرض.</span>' +
      '</div>' +
    '</div></footer>';

  var mountTop = document.getElementById('site-chrome');
  if (mountTop) mountTop.innerHTML = top;
  var mountFooter = document.getElementById('site-footer');
  if (mountFooter) mountFooter.innerHTML = footer;

  /* ------------------ سلوك القوائم المنسدلة ------------------ */
  function closeAll(except) {
    Array.prototype.slice.call(document.querySelectorAll('.has-menu.open')).forEach(function (el) {
      if (el !== except) el.classList.remove('open');
    });
  }
  Array.prototype.slice.call(document.querySelectorAll('.has-menu')).forEach(function (box) {
    var btn = box.querySelector('.nav-ico');
    if (btn) btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var willOpen = !box.classList.contains('open');
      closeAll(box);
      box.classList.toggle('open', willOpen);
    });
  });
  document.addEventListener('click', function () { closeAll(null); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeAll(null);
  });

  /* زر تسجيل الخروج (لو المستخدم مسجل دخول) */
  var logout = document.querySelector('[data-logout]');
  if (logout) logout.addEventListener('click', function () {
    try { window.localStorage.removeItem(USER_KEY); } catch (e) { /* ignore */ }
    window.location.href = 'index.html';
  });
})();
