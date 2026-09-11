/* =========================================================
   شحنلي | Shahnly — كتالوج الألعاب والباقات
   عدّل الأسعار من هنا فقط، وكل الصفحات هتتحدّث تلقائيًا.
   السعر بالجنيه المصري (EGP) ويمثل سعر البيع للعميل.
   ========================================================= */
window.GAMES = [

  /* -------------------- PUBG Mobile -------------------- */
  {
    id: 'pubg',
    name: 'PUBG Mobile',
    nameAr: 'بابجي موبايل',
    emoji: '🎯',
    gradient: 'linear-gradient(135deg,#f7b733,#fc4a1a)',
    tag: 'الأكثر طلبًا',
    tagline: 'شحن شدات (UC) فوري على آيدي اللاعب مباشرة',
    currencyLabel: 'شدات UC',
    fields: [
      { key: 'playerId', label: 'آيدي اللاعب (Player ID)', placeholder: 'مثال: 5123456789', type: 'tel', digits: '8-12', min: 8, max: 12 }
    ],
    selects: [],
    delivery: '5 - 15 دقيقة',
    note: 'تأكد إن الآيدي صح — الشحن على آيدي غلط مفيش استرجاع ليه.',
    packages: [
      { id: 'uc60',   amount: '60 شدة',   sub: 'UC', price: 25,   oldPrice: 30 },
      { id: 'uc325',  amount: '325 شدة',  sub: 'UC', price: 115,  oldPrice: 130, tag: 'الأكثر مبيعًا' },
      { id: 'uc660',  amount: '660 شدة',  sub: 'UC', price: 220,  oldPrice: 245 },
      { id: 'uc1800', amount: '1800 شدة', sub: 'UC', price: 560,  oldPrice: 620 },
      { id: 'uc3850', amount: '3850 شدة', sub: 'UC', price: 1150, oldPrice: 1290 },
      { id: 'uc8100', amount: '8100 شدة', sub: 'UC', price: 2300, oldPrice: 2600, tag: 'أوفر سعر' }
    ]
  },

  /* -------------------- Free Fire -------------------- */
  {
    id: 'freefire',
    name: 'Free Fire',
    nameAr: 'فري فاير',
    emoji: '🔥',
    gradient: 'linear-gradient(135deg,#ff7a18,#ff2d55)',
    tag: 'تسليم لحظي',
    tagline: 'شحن جواهر (Diamonds) خلال دقائق',
    currencyLabel: 'جواهر',
    fields: [
      { key: 'playerId', label: 'آيدي اللاعب (Player ID)', placeholder: 'مثال: 1457896320', type: 'tel', digits: '8-12', min: 8, max: 12 }
    ],
    selects: [],
    delivery: 'فوري - 10 دقائق',
    note: 'فري فاير بيحتاج آيدي رقمي فقط، بدون أي بيانات دخول.',
    packages: [
      { id: 'ff100',  amount: '100 جوهرة',  sub: '💎', price: 30,   oldPrice: 38 },
      { id: 'ff310',  amount: '310 جوهرة',  sub: '💎', price: 85,   oldPrice: 100, tag: 'الأكثر مبيعًا' },
      { id: 'ff520',  amount: '520 جوهرة',  sub: '💎', price: 140,  oldPrice: 165 },
      { id: 'ff1060', amount: '1060 جوهرة', sub: '💎', price: 280,  oldPrice: 320 },
      { id: 'ff2180', amount: '2180 جوهرة', sub: '💎', price: 560,  oldPrice: 650 },
      { id: 'ff5600', amount: '5600 جوهرة', sub: '💎', price: 1400, oldPrice: 1650, tag: 'أوفر سعر' }
    ]
  },

  /* -------------------- Call of Duty Mobile -------------------- */
  {
    id: 'codm',
    name: 'Call of Duty Mobile',
    nameAr: 'كول أوف ديوتي موبايل',
    emoji: '🪖',
    gradient: 'linear-gradient(135deg,#4b6cb7,#182848)',
    tag: '',
    tagline: 'شحن نقاط CP لكل الحسابات',
    currencyLabel: 'نقاط CP',
    fields: [
      { key: 'playerId', label: 'آيدي اللاعب (Open ID)', placeholder: 'مثال: 6745123890', type: 'tel', digits: '8-12', min: 8, max: 12 }
    ],
    selects: [],
    delivery: '10 - 30 دقيقة',
    note: 'بتلاقي الـ Open ID في صفحة البروفايل تحت الاسم.',
    packages: [
      { id: 'cp80',   amount: '80 CP',   sub: 'نقاط', price: 35,   oldPrice: 45 },
      { id: 'cp420',  amount: '420 CP',  sub: 'نقاط', price: 160,  oldPrice: 190, tag: 'الأكثر مبيعًا' },
      { id: 'cp880',  amount: '880 CP',  sub: 'نقاط', price: 320,  oldPrice: 370 },
      { id: 'cp2400', amount: '2400 CP', sub: 'نقاط', price: 820,  oldPrice: 950 },
      { id: 'cp5000', amount: '5000 CP', sub: 'نقاط', price: 1650, oldPrice: 1900, tag: 'أوفر سعر' }
    ]
  },

  /* -------------------- Mobile Legends -------------------- */
  {
    id: 'mlbb',
    name: 'Mobile Legends',
    nameAr: 'موبايل ليجندز',
    emoji: '⚔️',
    gradient: 'linear-gradient(135deg,#11998e,#38ef7d)',
    tag: 'يحتاج Zone ID',
    tagline: 'شحن دايموند مع تحديد السيرفر',
    currencyLabel: 'دايموند',
    fields: [
      { key: 'playerId', label: 'آيدي اللاعب (User ID)', placeholder: 'مثال: 123456789', type: 'tel', digits: '7-12', min: 7, max: 12 }
    ],
    selects: [
      { key: 'zone', label: 'رقم السيرفر (Zone ID)', options: [
        /* الدول العربية */
        { v: '5001', c: 'EG' }, { v: '5002', c: 'SA' }, { v: '5003', c: 'AE' }, { v: '5004', c: 'KW' },
        { v: '5005', c: 'QA' }, { v: '5006', c: 'BH' }, { v: '5007', c: 'OM' }, { v: '5008', c: 'JO' },
        { v: '5009', c: 'LB' }, { v: '5010', c: 'IQ' }, { v: '5011', c: 'MA' }, { v: '5012', c: 'DZ' },
        { v: '5013', c: 'TN' }, { v: '5014', c: 'LY' }, { v: '5015', c: 'SD' }, { v: '5016', c: 'YE' },
        { v: '5017', c: 'SY' }, { v: '5018', c: 'PS' },
        /* أشهر الدول الأوروبية */
        { v: '5101', c: 'GB' }, { v: '5102', c: 'FR' }, { v: '5103', c: 'DE' }, { v: '5104', c: 'ES' },
        { v: '5105', c: 'IT' }, { v: '5106', c: 'PT' }, { v: '5107', c: 'NL' }, { v: '5108', c: 'BE' },
        { v: '5109', c: 'CH' }, { v: '5110', c: 'AT' }, { v: '5111', c: 'SE' }, { v: '5112', c: 'PL' },
        { v: '5113', c: 'RO' }, { v: '5114', c: 'GR' }, { v: '5115', c: 'TR' }, { v: '5116', c: 'RU' }
      ] }
    ],
    delivery: '15 - 45 دقيقة',
    note: 'رقم الـ Zone مطلوب وإلا الطلب بيتأخر.',
    packages: [
      { id: 'ml86',   amount: '86 دايموند',   sub: '💠', price: 30,  oldPrice: 38 },
      { id: 'ml172',  amount: '172 دايموند',  sub: '💠', price: 60,  oldPrice: 72, tag: 'الأكثر مبيعًا' },
      { id: 'ml257',  amount: '257 دايموند',  sub: '💠', price: 90,  oldPrice: 108 },
      { id: 'ml706',  amount: '706 دايموند',  sub: '💠', price: 240, oldPrice: 285 },
      { id: 'ml2195', amount: '2195 دايموند', sub: '💠', price: 700, oldPrice: 820, tag: 'أوفر سعر' }
    ]
  },

  /* -------------------- Genshin Impact -------------------- */
  {
    id: 'genshin',
    name: 'Genshin Impact',
    nameAr: 'جينشين إمباكت',
    emoji: '✨',
    gradient: 'linear-gradient(135deg,#0f4c81,#5ee7df)',
    tag: 'يحتاج سيرفر',
    tagline: 'شحن كريستال جينيسيس لكل السيرفرات',
    currencyLabel: 'كريستال',
    fields: [
      { key: 'playerId', label: 'الـ UID', placeholder: 'مثال: 701234567', type: 'tel', digits: '9', min: 9, max: 9 }
    ],
    selects: [
      { key: 'server', label: 'السيرفر', options: [
        { v: 'asia', k: 'srv.asia' }, { v: 'europe', k: 'srv.europe' },
        { v: 'america', k: 'srv.america' }, { v: 'tw', k: 'srv.tw' }
      ] }
    ],
    delivery: '20 - 60 دقيقة',
    note: 'رقم الـ UID 9 أرقام، وأول رقم بيحدد السيرفر تلقائيًا.',
    packages: [
      { id: 'gs60',    amount: '60 كريستال',    sub: '✦', price: 30,   oldPrice: 40 },
      { id: 'gs300',   amount: '300 كريستال',   sub: '✦', price: 150,  oldPrice: 180, tag: 'الأكثر مبيعًا' },
      { id: 'gs980',   amount: '980 كريستال',   sub: '✦', price: 480,  oldPrice: 540 },
      { id: 'gs1980',  amount: '1980 كريستال',  sub: '✦', price: 950,  oldPrice: 1080 },
      { id: 'gs3280',  amount: '3280 كريستال',  sub: '✦', price: 1550, oldPrice: 1750, tag: 'أوفر سعر' }
    ]
  },

  /* -------------------- Roblox -------------------- */
  {
    id: 'roblox',
    name: 'Roblox',
    nameAr: 'روبلوكس',
    emoji: '🧱',
    gradient: 'linear-gradient(135deg,#e2231a,#f5a623)',
    tag: 'باليوزر نيم',
    tagline: 'شحن روبوكس باسم الحساب',
    currencyLabel: 'روبوكس',
    fields: [
      { key: 'playerId', label: 'اسم المستخدم (Username)', placeholder: 'مثال: shahnly_demo', type: 'text', digits: '3-20 حرف', min: 3, max: 20 }
    ],
    selects: [],
    delivery: '30 - 120 دقيقة',
    note: 'لازم تتأكد إن اسم المستخدم مطابق تمامًا للحساب.',
    packages: [
      { id: 'rb80',   amount: '80 روبوكس',   sub: '🪙', price: 35,   oldPrice: 45 },
      { id: 'rb400',  amount: '400 روبوكس',  sub: '🪙', price: 160,  oldPrice: 195, tag: 'الأكثر مبيعًا' },
      { id: 'rb800',  amount: '800 روبوكس',  sub: '🪙', price: 300,  oldPrice: 360 },
      { id: 'rb1700', amount: '1700 روبوكس', sub: '🪙', price: 620,  oldPrice: 720 },
      { id: 'rb4500', amount: '4500 روبوكس', sub: '🪙', price: 1550, oldPrice: 1800, tag: 'أوفر سعر' }
    ]
  }
];

/* =========================================================
   إثراء الكتالوج: التصنيفات + الشارات + ترتيب العرض
   (بتتدمج على GAMES تلقائيًا — عدّل من هنا)
   ========================================================= */
(function () {
  var META = {
    pubg:    { cats: ['all', 'latest', 'deal'],   badges: ['hot'],        rank: 1,  bonus: 5 },
    freefire:{ cats: ['all', 'hot', 'deal'],      badges: ['bonus'],      rank: 2,  bonus: 10 },
    codm:    { cats: ['all', 'ent'],              badges: [],             rank: 3,  bonus: 0 },
    mlbb:    { cats: ['all', 'hot', 'deal'],      badges: ['bonus'],      rank: 4,  bonus: 8 },
    genshin: { cats: ['all', 'ent'],              badges: ['bonus'],      rank: 5,  bonus: 7 },
    roblox:  { cats: ['all', 'latest', 'ent'],    badges: ['new'],        rank: 6,  bonus: 0 }
  };
  window.GAMES.forEach(function (g) {
    var m = META[g.id] || { cats: ['all'], badges: [], rank: 99, bonus: 0 };
    g.cats = m.cats;
    g.badges = m.badges;      /* hot = الأكثر طلبًا · new = جديد · bonus = مكافأة إضافية */
    g.rank = m.rank;
    g.bonus = m.bonus;        /* نسبة مكافأة إضافية % (للعرض) */
    var cheapest = Math.min.apply(null, g.packages.map(function (p) { return p.price; }));
    var dearest = Math.max.apply(null, g.packages.map(function (p) { return p.price; }));
    g.priceFrom = cheapest;
    g.priceTo = dearest;
    g.maxSave = g.packages.reduce(function (acc, p) {
      return Math.max(acc, p.oldPrice ? (1 - p.price / p.oldPrice) : 0);
    }, 0);
  });
})();

/* =========================================================
   بيانات الواجهة (سلايدر · تصنيفات · أخبار · فيديو · ألعاب مصغرة · شركاء دفع)
   ========================================================= */
window.STORE = {
  /* ---------- بانرات السلايدر ---------- */
  banners: [
    { id: 'b1', emoji: '🎯', grad: 'linear-gradient(120deg,#7c3aed,#22d3ee)', k: 'bn.1', badge: 'sg.badgeBonus', cta: 's.go', timerMin: 90 },
    { id: 'b2', emoji: '💳', grad: 'linear-gradient(120deg,#f59e0b,#ef4444)', k: 'bn.2', badge: 'pay.b.instant', cta: 's.go', timerMin: 240 },
    { id: 'b3', emoji: '🏆', grad: 'linear-gradient(120deg,#10b981,#0ea5e9)', k: 'bn.3', badge: 'sg.badgeNew', cta: 's.go', endsAt: '+30d' },
    { id: 'b4', emoji: '🎁', grad: 'linear-gradient(120deg,#ec4899,#8b5cf6)', k: 'bn.4', badge: 'deals.title', cta: 's.go', timerMin: 45 }
  ],

  /* ---------- تصنيفات الألعاب ---------- */
  cats: [
    { id: 'all',    key: 'sg.all',   ico: '🎮' },
    { id: 'latest', key: 'sg.new',   ico: '🆕' },
    { id: 'hot',    key: 'sg.hot',   ico: '🔥' },
    { id: 'ent',    key: 'sg.ent',   ico: '🎬' },
    { id: 'deal',   key: 'sg.deal',  ico: '🏷️' }
  ],

  /* ---------- ألعاب مصغرة ---------- */
  miniGames: [
    { id: 'pool', emoji: '🎱', k: 'mg.1', tag: 'sg.badgeNew', grad: 'linear-gradient(135deg,#0ea5e9,#0369a1)' },
    { id: 'ludo', emoji: '🎲', k: 'mg.2', tag: 'mg.live', grad: 'linear-gradient(135deg,#f43f5e,#be123c)' }
  ],

  /* ---------- فيديوهات ---------- */
  videos: [
    { id: 'v1', k: 'vd.1', views: '10.9K', dur: '01:22', emoji: '🎬', grad: 'linear-gradient(135deg,#7c3aed,#22d3ee)' },
    { id: 'v2', k: 'vd.2', views: '81.7K', dur: '00:13', emoji: '🎯', grad: 'linear-gradient(135deg,#f59e0b,#ef4444)' },
    { id: 'v3', k: 'vd.3', views: '45.3K', dur: '01:36', emoji: '🔥', grad: 'linear-gradient(135deg,#10b981,#0ea5e9)' },
    { id: 'v4', k: 'vd.4', views: '40.6K', dur: '01:04', emoji: '💎', grad: 'linear-gradient(135deg,#ec4899,#8b5cf6)' }
  ],

  /* ---------- آخر الأخبار / الأحداث ---------- */
  news: [
    { id: 'n1', k: 'nw.1', game: 'pubg',    date: '2026-09-09', tag: 'sg.badgeBonus' },
    { id: 'n2', k: 'nw.2', game: 'freefire', date: '2026-09-08', tag: '' },
    { id: 'n3', k: 'nw.3', game: 'mlbb',     date: '2026-08-31', tag: 'sg.badgeBonus' },
    { id: 'n4', k: 'nw.4', game: 'genshin',  date: '2026-08-30', tag: '' },
    { id: 'n5', k: 'nw.5', game: 'roblox',   date: '2026-08-19', tag: 'sg.badgeNew' },
    { id: 'n6', k: 'nw.6', game: 'codm',     date: '2026-08-12', tag: '' }
  ],

  /* ---------- حول المتجر (صفات مرقّمة) ---------- */
  about: [
    { n: '01', ico: '🛡️', k: 'sb.1' },
    { n: '02', ico: '⚡', k: 'sb.2' },
    { n: '03', ico: '💳', k: 'sb.3' },
    { n: '04', ico: '🔐', k: 'sb.4' },
    { n: '05', ico: '🌍', k: 'sb.5' },
    { n: '06', ico: '🎁', k: 'sb.6' }
  ],

  /* ---------- شركاء قنوات الدفع ---------- */
  partners: [
    { ico: '💳', k: 'pp.1' }, { ico: '📱', k: 'pp.2' }, { ico: '🟢', k: 'pp.3' },
    { ico: '🏪', k: 'pp.4' }, { ico: '🍎', k: 'pp.5' }, { ico: '📞', k: 'pp.6' }
  ]
};
