/* =========================================================
   شحنلي | Shahnly — طبقة اللغات (i18n)
   العربية + لغات أشهر الدول الأوروبية (9 لغات)
   بدون أي مكتبة خارجية · RTL / LTR تلقائي
   القواميس في assets/js/lang.js
   ========================================================= */
(function () {
  'use strict';

  var DICT = window.I18N_DICT = window.I18N_DICT || {};
  var PHRASES = window.I18N_PHRASES = window.I18N_PHRASES || {};
  var UNITS = window.I18N_UNITS = window.I18N_UNITS || {};

  var LS_KEY = 'shahnly_lang_v1';
  var DEFAULT = 'ar';

  /* ---------------------------------------------------------
     اللغات المدعومة + الدول اللي بتتكلم كل لغة
     (لغات أشهر الدول الأوروبية + العربية بتغطي كل الدول العربية)
     --------------------------------------------------------- */
  var LANGS = [
    {
      code: 'ar', native: 'العربية', en: 'Arabic', dir: 'rtl', flag: '🇪🇬', locale: 'ar-EG', region: 'arab',
      countries: [
        { f: '🇪🇬', ar: 'مصر', en: 'Egypt' }, { f: '🇸🇦', ar: 'السعودية', en: 'Saudi Arabia' },
        { f: '🇦🇪', ar: 'الإمارات', en: 'UAE' }, { f: '🇰🇼', ar: 'الكويت', en: 'Kuwait' },
        { f: '🇶🇦', ar: 'قطر', en: 'Qatar' }, { f: '🇧🇭', ar: 'البحرين', en: 'Bahrain' },
        { f: '🇴🇲', ar: 'عُمان', en: 'Oman' }, { f: '🇯🇴', ar: 'الأردن', en: 'Jordan' },
        { f: '🇱🇧', ar: 'لبنان', en: 'Lebanon' }, { f: '🇮🇶', ar: 'العراق', en: 'Iraq' },
        { f: '🇲🇦', ar: 'المغرب', en: 'Morocco' }, { f: '🇩🇿', ar: 'الجزائر', en: 'Algeria' },
        { f: '🇹🇳', ar: 'تونس', en: 'Tunisia' }, { f: '🇱🇾', ar: 'ليبيا', en: 'Libya' },
        { f: '🇸🇩', ar: 'السودان', en: 'Sudan' }, { f: '🇾🇪', ar: 'اليمن', en: 'Yemen' },
        { f: '🇸🇾', ar: 'سوريا', en: 'Syria' }, { f: '🇵🇸', ar: 'فلسطين', en: 'Palestine' }
      ]
    },
    {
      code: 'en', native: 'English', en: 'English', dir: 'ltr', flag: '🇬🇧', locale: 'en-GB', region: 'europe',
      countries: [
        { f: '🇬🇧', ar: 'بريطانيا', en: 'United Kingdom' }, { f: '🇮🇪', ar: 'أيرلندا', en: 'Ireland' },
        { f: '🇺🇸', ar: 'أمريكا', en: 'United States' }, { f: '🇨🇦', ar: 'كندا', en: 'Canada' },
        { f: '🇦🇺', ar: 'أستراليا', en: 'Australia' }
      ]
    },
    {
      code: 'fr', native: 'Français', en: 'French', dir: 'ltr', flag: '🇫🇷', locale: 'fr-FR', region: 'europe',
      countries: [
        { f: '🇫🇷', ar: 'فرنسا', en: 'France' }, { f: '🇧🇪', ar: 'بلجيكا', en: 'Belgium' },
        { f: '🇨🇭', ar: 'سويسرا', en: 'Switzerland' }, { f: '🇱🇺', ar: 'لوكسمبورج', en: 'Luxembourg' },
        { f: '🇲🇦', ar: 'المغرب', en: 'Morocco' }, { f: '🇩🇿', ar: 'الجزائر', en: 'Algeria' },
        { f: '🇹🇳', ar: 'تونس', en: 'Tunisia' }
      ]
    },
    {
      code: 'de', native: 'Deutsch', en: 'German', dir: 'ltr', flag: '🇩🇪', locale: 'de-DE', region: 'europe',
      countries: [
        { f: '🇩🇪', ar: 'ألمانيا', en: 'Germany' }, { f: '🇦🇹', ar: 'النمسا', en: 'Austria' },
        { f: '🇨🇭', ar: 'سويسرا', en: 'Switzerland' }
      ]
    },
    {
      code: 'es', native: 'Español', en: 'Spanish', dir: 'ltr', flag: '🇪🇸', locale: 'es-ES', region: 'europe',
      countries: [
        { f: '🇪🇸', ar: 'إسبانيا', en: 'Spain' }, { f: '🇲🇽', ar: 'المكسيك', en: 'Mexico' },
        { f: '🇦🇷', ar: 'الأرجنتين', en: 'Argentina' }
      ]
    },
    {
      code: 'it', native: 'Italiano', en: 'Italian', dir: 'ltr', flag: '🇮🇹', locale: 'it-IT', region: 'europe',
      countries: [
        { f: '🇮🇹', ar: 'إيطاليا', en: 'Italy' }, { f: '🇨🇭', ar: 'سويسرا', en: 'Switzerland' }
      ]
    },
    {
      code: 'pt', native: 'Português', en: 'Portuguese', dir: 'ltr', flag: '🇵🇹', locale: 'pt-PT', region: 'europe',
      countries: [
        { f: '🇵🇹', ar: 'البرتغال', en: 'Portugal' }, { f: '🇧🇷', ar: 'البرازيل', en: 'Brazil' }
      ]
    },
    {
      code: 'tr', native: 'Türkçe', en: 'Turkish', dir: 'ltr', flag: '🇹🇷', locale: 'tr-TR', region: 'europe',
      countries: [
        { f: '🇹🇷', ar: 'تركيا', en: 'Türkiye' }, { f: '🇨🇾', ar: 'قبرص', en: 'Cyprus' }
      ]
    },
    {
      code: 'ru', native: 'Русский', en: 'Russian', dir: 'ltr', flag: '🇷🇺', locale: 'ru-RU', region: 'europe',
      countries: [
        { f: '🇷🇺', ar: 'روسيا', en: 'Russia' }, { f: '🇧🇾', ar: 'بيلاروسيا', en: 'Belarus' },
        { f: '🇰🇿', ar: 'كازاخستان', en: 'Kazakhstan' }
      ]
    }
  ];

  /* ------------------ helpers ------------------ */
  function lsGet(k) { try { return window.localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function each(list, fn) { Array.prototype.slice.call(list || []).forEach(fn); }

  function norm(code) {
    code = String(code || '').toLowerCase().replace('_', '-');
    for (var i = 0; i < LANGS.length; i++) if (LANGS[i].code === code) return code;
    var short = code.split('-')[0];
    for (var j = 0; j < LANGS.length; j++) if (LANGS[j].code === short) return LANGS[j].code;
    return DEFAULT;
  }
  function meta(code) {
    code = norm(code);
    for (var i = 0; i < LANGS.length; i++) if (LANGS[i].code === code) return LANGS[i];
    return LANGS[0];
  }
  function saved() { return lsGet(LS_KEY); }
  function detect() {
    var s = saved(); if (s) return norm(s);
    var n = (navigator.language || navigator.userLanguage || '').toLowerCase();
    return n ? norm(n) : DEFAULT;
  }

  var cur = detect();

  /* ------------------ translation core ------------------ */
  function t(key, vars) {
    var d = DICT[cur] || {}, a = DICT[DEFAULT] || {}, e = DICT.en || {};
    var s = d[key];
    /* الترتيب: اللغة الحالية → الإنجليزية → العربية → المفتاح نفسه */
    if (s == null) s = e[key];
    if (s == null) s = a[key];
    if (s == null) s = key;
    s = String(s);
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    return s;
  }

  /* ترجمة نصوص قادمة من الكتالوج (data.js) بالعبارة نفسها */
  function p(text) {
    if (text == null) return '';
    var s = String(text);
    if (cur === DEFAULT) return s;
    var map = PHRASES[cur] || {};
    if (map[s] != null) return map[s];
    return s;
  }

  /* ترجمة كمية الباقة: "660 شدة" → "660 UC" */
  function amount(text) {
    if (text == null) return '';
    var s = String(text);
    if (cur === DEFAULT) return s;
    var map = PHRASES[cur] || {};
    if (map[s] != null) return map[s];
    var m = /^([\d.,]+)\s*(.+)$/.exec(s);
    if (m) {
      var u = (UNITS[cur] || {})[m[2]];
      if (u) return m[1] + ' ' + u;
    }
    return s;
  }

  function num(n, dec) {
    try {
      return new Intl.NumberFormat(meta(cur).locale, {
        minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0
      }).format(Number(n) || 0);
    } catch (e) { return String(n); }
  }
  function date(ts) {
    try {
      return new Date(ts).toLocaleString(meta(cur).locale, {
        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch (e) { return new Date(ts).toISOString(); }
  }

  /* ------------------ DOM apply ------------------ */
  function apply(root) {
    root = root || document;
    each(root.querySelectorAll('[data-i18n]'), function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    each(root.querySelectorAll('[data-i18n-html]'), function (el) {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    each(root.querySelectorAll('[data-i18n-ph]'), function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
    });
    each(root.querySelectorAll('[data-i18n-title]'), function (el) {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });
    each(root.querySelectorAll('[data-i18n-aria]'), function (el) {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });
    each(root.querySelectorAll('[data-phrase]'), function (el) {
      el.textContent = p(el.getAttribute('data-phrase'));
    });
    each(root.querySelectorAll('[data-amount]'), function (el) {
      el.textContent = amount(el.getAttribute('data-amount'));
    });
    var wantTitle = document.documentElement.getAttribute('data-title');
    if (wantTitle) {
      var brandEl = root.querySelector('[data-brand-name]');
      var brand = brandEl ? brandEl.textContent : '';
      document.title = t(wantTitle).replace('{brand}', brand);
    }
  }

  /* ------------------ language switcher UI ------------------ */
  function switcherHTML() {
    var m = meta(cur);
    var items = LANGS.map(function (l) {
      var flags = l.countries.slice(0, 6).map(function (c) { return c.f; }).join('');
      return '<button type="button" class="lang-item' + (l.code === cur ? ' is-active' : '') + '" data-lang="' + l.code + '" role="menuitem">' +
        '<span class="lf">' + l.flag + '</span>' +
        '<span class="ln"><b>' + l.native + '</b><small>' + l.en + '</small></span>' +
        '<span class="lc">' + flags + (l.countries.length > 6 ? '+' + (l.countries.length - 6) : '') + '</span>' +
        '</button>';
    }).join('');
    return '' +
      '<button type="button" class="lang-btn" id="lang-btn" aria-haspopup="true" aria-expanded="false">' +
        '<span class="globe">🌐</span><b>' + m.native + '</b><span class="caret">▾</span>' +
      '</button>' +
      '<div class="lang-panel" id="lang-panel" role="menu">' +
        '<div class="lang-head"><strong>' + t('ui.lang') + '</strong><span>' + t('ui.langSub') + '</span></div>' +
        items +
      '</div>';
  }

  function renderSwitcher() {
    each(document.querySelectorAll('#lang-switch, .lang-switch'), function (box) {
      box.innerHTML = switcherHTML();
      var btn = box.querySelector('.lang-btn');
      if (btn) btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = box.classList.toggle('open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      each(box.querySelectorAll('.lang-item'), function (it) {
        it.addEventListener('click', function () {
          box.classList.remove('open');
          set(it.getAttribute('data-lang'));
        });
      });
    });
  }

  /* إغلاق القائمة بالضغط برّه أو بـ Escape */
  document.addEventListener('click', function () {
    each(document.querySelectorAll('.lang-switch.open'), function (b) { b.classList.remove('open'); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') each(document.querySelectorAll('.lang-switch.open'), function (b) { b.classList.remove('open'); });
  });

  /* ------------------ public API ------------------ */
  function set(code, opts) {
    cur = norm(code);
    lsSet(LS_KEY, cur);
    var m = meta(cur), h = document.documentElement;
    h.setAttribute('lang', cur);
    h.setAttribute('dir', m.dir);
    if (document.body) document.body.setAttribute('data-lang', cur);
    apply();
    renderSwitcher();
    if (!opts || opts.silent !== true) {
      try { document.dispatchEvent(new CustomEvent('shn:i18n', { detail: { lang: cur } })); } catch (e) { /* old browsers */ }
    }
  }

  function init() {
    var m = meta(cur), h = document.documentElement;
    h.setAttribute('lang', cur);
    h.setAttribute('dir', m.dir);
    if (document.body) document.body.setAttribute('data-lang', cur);
    renderSwitcher();
    apply();
  }

  function list() { return LANGS.slice(); }
  function hasChosen() { return !!saved(); }

  /* واجهة عامة */
  window.I18N = {
    LANGS: LANGS, lang: function () { return cur; }, meta: function (c) { return meta(c || cur); },
    isRTL: function () { return meta(cur).dir === 'rtl'; }, detect: detect, norm: norm,
    t: t, p: p, amount: amount, num: num, date: date,
    apply: apply, set: set, init: init, renderSwitcher: renderSwitcher,
    list: list, hasChosen: hasChosen, dict: function () { return DICT; }
  };

  /* اختصار عام */
  window.t = t;
})();
