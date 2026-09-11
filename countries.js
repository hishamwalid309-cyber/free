/* =========================================================
   شحنلي | Shahnly — جدول الدول والمفاتيح الدولية والعملات
   يغطي: كل الدول العربية (18) + أشهر الدول الأوروبية (23) + دول أخرى (17) = 58 دولة
   ⚠️ أسعار التحويل تجريبية (Demo) للعرض فقط — عدّلها من هنا.
   الأسعار في data.js بالجنيه المصري (EGP) وهي الأساس.
   ========================================================= */
(function () {
  'use strict';

  var LS_KEY = 'shahnly_country_v1';

  /* cur: العملة · rate: كام وحدة من العملة = 1 جنيه مصري (تجريبي)
     dec: عدد الكسور · pos: مكان الرمز after/before · name: كود العملة */
  var LIST = [
    /* ---------------- الدول العربية ---------------- */
    { c: 'EG', ar: 'مصر', en: 'Egypt', f: '🇪🇬', dial: '20', min: 10, max: 10, pat: '^1[0125]\\d{8}$', ex: '01012345678', zone: 'arab', lang: 'ar',
      cur: { code: 'EGP', sym: 'ج.م', dec: 0, rate: 1, pos: 'after' } },
    { c: 'SA', ar: 'السعودية', en: 'Saudi Arabia', f: '🇸🇦', dial: '966', min: 9, max: 9, pat: '^5\\d{8}$', ex: '0512345678', zone: 'arab', lang: 'ar',
      cur: { code: 'SAR', sym: 'ر.س', dec: 2, rate: 0.0763, pos: 'after' } },
    { c: 'AE', ar: 'الإمارات', en: 'United Arab Emirates', f: '🇦🇪', dial: '971', min: 9, max: 9, pat: '^5[024568]\\d{7}$', ex: '0501234567', zone: 'arab', lang: 'ar',
      cur: { code: 'AED', sym: 'د.إ', dec: 2, rate: 0.0746, pos: 'after' } },
    { c: 'KW', ar: 'الكويت', en: 'Kuwait', f: '🇰🇼', dial: '965', min: 8, max: 8, pat: '^[569]\\d{7}$', ex: '51234567', zone: 'arab', lang: 'ar',
      cur: { code: 'KWD', sym: 'د.ك', dec: 3, rate: 0.0062, pos: 'after' } },
    { c: 'QA', ar: 'قطر', en: 'Qatar', f: '🇶🇦', dial: '974', min: 8, max: 8, pat: '^[3567]\\d{7}$', ex: '33123456', zone: 'arab', lang: 'ar',
      cur: { code: 'QAR', sym: 'ر.ق', dec: 2, rate: 0.0742, pos: 'after' } },
    { c: 'BH', ar: 'البحرين', en: 'Bahrain', f: '🇧🇭', dial: '973', min: 8, max: 8, pat: '^[1367]\\d{7}$', ex: '36123456', zone: 'arab', lang: 'ar',
      cur: { code: 'BHD', sym: 'د.ب', dec: 3, rate: 0.0077, pos: 'after' } },
    { c: 'OM', ar: 'عُمان', en: 'Oman', f: '🇴🇲', dial: '968', min: 8, max: 8, pat: '^[279]\\d{7}$', ex: '91234567', zone: 'arab', lang: 'ar',
      cur: { code: 'OMR', sym: 'ر.ع', dec: 3, rate: 0.0078, pos: 'after' } },
    { c: 'JO', ar: 'الأردن', en: 'Jordan', f: '🇯🇴', dial: '962', min: 9, max: 9, pat: '^7[789]\\d{7}$', ex: '0791234567', zone: 'arab', lang: 'ar',
      cur: { code: 'JOD', sym: 'د.أ', dec: 2, rate: 0.0145, pos: 'after' } },
    { c: 'LB', ar: 'لبنان', en: 'Lebanon', f: '🇱🇧', dial: '961', min: 7, max: 8, pat: '^[37]\\d{6,7}$', ex: '03123456', zone: 'arab', lang: 'ar',
      cur: { code: 'LBP', sym: 'ل.ل', dec: 0, rate: 1815, pos: 'after' } },
    { c: 'IQ', ar: 'العراق', en: 'Iraq', f: '🇮🇶', dial: '964', min: 10, max: 10, pat: '^7[0-9]\\d{8}$', ex: '07701234567', zone: 'arab', lang: 'ar',
      cur: { code: 'IQD', sym: 'د.ع', dec: 0, rate: 26.8, pos: 'after' } },
    { c: 'MA', ar: 'المغرب', en: 'Morocco', f: '🇲🇦', dial: '212', min: 9, max: 9, pat: '^[67]\\d{8}$', ex: '0612345678', zone: 'arab', lang: 'ar',
      cur: { code: 'MAD', sym: 'د.م', dec: 2, rate: 0.199, pos: 'after' } },
    { c: 'DZ', ar: 'الجزائر', en: 'Algeria', f: '🇩🇿', dial: '213', min: 9, max: 9, pat: '^[567]\\d{8}$', ex: '0551234567', zone: 'arab', lang: 'ar',
      cur: { code: 'DZD', sym: 'د.ج', dec: 0, rate: 2.72, pos: 'after' } },
    { c: 'TN', ar: 'تونس', en: 'Tunisia', f: '🇹🇳', dial: '216', min: 8, max: 8, pat: '^[2459]\\d{7}$', ex: '20123456', zone: 'arab', lang: 'ar',
      cur: { code: 'TND', sym: 'د.ت', dec: 3, rate: 0.0605, pos: 'after' } },
    { c: 'LY', ar: 'ليبيا', en: 'Libya', f: '🇱🇾', dial: '218', min: 9, max: 9, pat: '^9[1-6]\\d{7}$', ex: '0912345678', zone: 'arab', lang: 'ar',
      cur: { code: 'LYD', sym: 'د.ل', dec: 2, rate: 0.098, pos: 'after' } },
    { c: 'SD', ar: 'السودان', en: 'Sudan', f: '🇸🇩', dial: '249', min: 9, max: 9, pat: '^9\\d{8}$', ex: '0912345678', zone: 'arab', lang: 'ar',
      cur: { code: 'SDG', sym: 'ج.س', dec: 0, rate: 12.3, pos: 'after' } },
    { c: 'YE', ar: 'اليمن', en: 'Yemen', f: '🇾🇪', dial: '967', min: 9, max: 9, pat: '^7[0-8]\\d{7}$', ex: '0712345678', zone: 'arab', lang: 'ar',
      cur: { code: 'YER', sym: 'ر.ي', dec: 0, rate: 5.05, pos: 'after' } },
    { c: 'SY', ar: 'سوريا', en: 'Syria', f: '🇸🇾', dial: '963', min: 9, max: 9, pat: '^9\\d{8}$', ex: '0912345678', zone: 'arab', lang: 'ar',
      cur: { code: 'SYP', sym: 'ل.س', dec: 0, rate: 265, pos: 'after' } },
    { c: 'PS', ar: 'فلسطين', en: 'Palestine', f: '🇵🇸', dial: '970', min: 9, max: 9, pat: '^5[69]\\d{7}$', ex: '0591234567', zone: 'arab', lang: 'ar',
      cur: { code: 'ILS', sym: '₪', dec: 2, rate: 0.0748, pos: 'before' } },

    /* ---------------- أشهر الدول الأوروبية ---------------- */
    { c: 'GB', ar: 'بريطانيا', en: 'United Kingdom', f: '🇬🇧', dial: '44', min: 10, max: 10, pat: '^7\\d{9}$', ex: '07123456789', zone: 'europe', lang: 'en',
      cur: { code: 'GBP', sym: '£', dec: 2, rate: 0.0161, pos: 'before' } },
    { c: 'IE', ar: 'أيرلندا', en: 'Ireland', f: '🇮🇪', dial: '353', min: 9, max: 9, pat: '^8[356789]\\d{7}$', ex: '0851234567', zone: 'europe', lang: 'en',
      cur: { code: 'EUR', sym: '€', dec: 2, rate: 0.0187, pos: 'before' } },
    { c: 'FR', ar: 'فرنسا', en: 'France', f: '🇫🇷', dial: '33', min: 9, max: 9, pat: '^[67]\\d{8}$', ex: '0612345678', zone: 'europe', lang: 'fr',
      cur: { code: 'EUR', sym: '€', dec: 2, rate: 0.0187, pos: 'before' } },
    { c: 'DE', ar: 'ألمانيا', en: 'Germany', f: '🇩🇪', dial: '49', min: 10, max: 11, pat: '^1[5-7]\\d{8,9}$', ex: '015112345678', zone: 'europe', lang: 'de',
      cur: { code: 'EUR', sym: '€', dec: 2, rate: 0.0187, pos: 'before' } },
    { c: 'ES', ar: 'إسبانيا', en: 'Spain', f: '🇪🇸', dial: '34', min: 9, max: 9, pat: '^[67]\\d{8}$', ex: '0612345678', zone: 'europe', lang: 'es',
      cur: { code: 'EUR', sym: '€', dec: 2, rate: 0.0187, pos: 'before' } },
    { c: 'IT', ar: 'إيطاليا', en: 'Italy', f: '🇮🇹', dial: '39', min: 9, max: 10, pat: '^3\\d{8,9}$', ex: '0312345678', zone: 'europe', lang: 'it',
      cur: { code: 'EUR', sym: '€', dec: 2, rate: 0.0187, pos: 'before' } },
    { c: 'PT', ar: 'البرتغال', en: 'Portugal', f: '🇵🇹', dial: '351', min: 9, max: 9, pat: '^9[1236]\\d{7}$', ex: '0912345678', zone: 'europe', lang: 'pt',
      cur: { code: 'EUR', sym: '€', dec: 2, rate: 0.0187, pos: 'before' } },
    { c: 'NL', ar: 'هولندا', en: 'Netherlands', f: '🇳🇱', dial: '31', min: 9, max: 9, pat: '^6\\d{8}$', ex: '0612345678', zone: 'europe', lang: 'en',
      cur: { code: 'EUR', sym: '€', dec: 2, rate: 0.0187, pos: 'before' } },
    { c: 'BE', ar: 'بلجيكا', en: 'Belgium', f: '🇧🇪', dial: '32', min: 9, max: 9, pat: '^4\\d{8}$', ex: '0470123456', zone: 'europe', lang: 'fr',
      cur: { code: 'EUR', sym: '€', dec: 2, rate: 0.0187, pos: 'before' } },
    { c: 'CH', ar: 'سويسرا', en: 'Switzerland', f: '🇨🇭', dial: '41', min: 9, max: 9, pat: '^7[5-9]\\d{7}$', ex: '0751234567', zone: 'europe', lang: 'de',
      cur: { code: 'CHF', sym: 'CHF', dec: 2, rate: 0.0165, pos: 'before' } },
    { c: 'AT', ar: 'النمسا', en: 'Austria', f: '🇦🇹', dial: '43', min: 10, max: 11, pat: '^6\\d{8,9}$', ex: '06641234567', zone: 'europe', lang: 'de',
      cur: { code: 'EUR', sym: '€', dec: 2, rate: 0.0187, pos: 'before' } },
    { c: 'SE', ar: 'السويد', en: 'Sweden', f: '🇸🇪', dial: '46', min: 9, max: 9, pat: '^7\\d{8}$', ex: '0701234567', zone: 'europe', lang: 'en',
      cur: { code: 'SEK', sym: 'kr', dec: 2, rate: 0.195, pos: 'after' } },
    { c: 'NO', ar: 'النرويج', en: 'Norway', f: '🇳🇴', dial: '47', min: 8, max: 8, pat: '^[49]\\d{7}$', ex: '41234567', zone: 'europe', lang: 'en',
      cur: { code: 'NOK', sym: 'kr', dec: 2, rate: 0.216, pos: 'after' } },
    { c: 'DK', ar: 'الدنمارك', en: 'Denmark', f: '🇩🇰', dial: '45', min: 8, max: 8, pat: '^[2-9]\\d{7}$', ex: '20123456', zone: 'europe', lang: 'en',
      cur: { code: 'DKK', sym: 'kr', dec: 2, rate: 0.139, pos: 'after' } },
    { c: 'FI', ar: 'فنلندا', en: 'Finland', f: '🇫🇮', dial: '358', min: 9, max: 10, pat: '^4\\d{8,9}$', ex: '0412345678', zone: 'europe', lang: 'en',
      cur: { code: 'EUR', sym: '€', dec: 2, rate: 0.0187, pos: 'before' } },
    { c: 'PL', ar: 'بولندا', en: 'Poland', f: '🇵🇱', dial: '48', min: 9, max: 9, pat: '^[5-8]\\d{8}$', ex: '512345678', zone: 'europe', lang: 'en',
      cur: { code: 'PLN', sym: 'zł', dec: 2, rate: 0.0735, pos: 'after' } },
    { c: 'RO', ar: 'رومانيا', en: 'Romania', f: '🇷🇴', dial: '40', min: 9, max: 9, pat: '^7\\d{8}$', ex: '0712345678', zone: 'europe', lang: 'en',
      cur: { code: 'RON', sym: 'lei', dec: 2, rate: 0.0935, pos: 'after' } },
    { c: 'GR', ar: 'اليونان', en: 'Greece', f: '🇬🇷', dial: '30', min: 10, max: 10, pat: '^69\\d{8}$', ex: '6912345678', zone: 'europe', lang: 'en',
      cur: { code: 'EUR', sym: '€', dec: 2, rate: 0.0187, pos: 'before' } },
    { c: 'CZ', ar: 'التشيك', en: 'Czechia', f: '🇨🇿', dial: '420', min: 9, max: 9, pat: '^[67]\\d{8}$', ex: '601123456', zone: 'europe', lang: 'en',
      cur: { code: 'CZK', sym: 'Kč', dec: 2, rate: 0.445, pos: 'after' } },
    { c: 'HU', ar: 'المجر', en: 'Hungary', f: '🇭🇺', dial: '36', min: 9, max: 9, pat: '^[2367]\\d{8}$', ex: '0612345678', zone: 'europe', lang: 'en',
      cur: { code: 'HUF', sym: 'Ft', dec: 0, rate: 7.45, pos: 'after' } },
    { c: 'UA', ar: 'أوكرانيا', en: 'Ukraine', f: '🇺🇦', dial: '380', min: 9, max: 9, pat: '^[3-9]\\d{8}$', ex: '0501234567', zone: 'europe', lang: 'ru',
      cur: { code: 'UAH', sym: '₴', dec: 2, rate: 0.85, pos: 'after' } },
    { c: 'RU', ar: 'روسيا', en: 'Russia', f: '🇷🇺', dial: '7', min: 10, max: 10, pat: '^9\\d{9}$', ex: '09123456789', zone: 'europe', lang: 'ru',
      cur: { code: 'RUB', sym: '₽', dec: 2, rate: 1.62, pos: 'after' } },
    { c: 'TR', ar: 'تركيا', en: 'Türkiye', f: '🇹🇷', dial: '90', min: 10, max: 10, pat: '^5\\d{9}$', ex: '05123456789', zone: 'europe', lang: 'tr',
      cur: { code: 'TRY', sym: '₺', dec: 2, rate: 0.79, pos: 'after' } },

    /* ---------------- دول أخرى ---------------- */
    { c: 'US', ar: 'أمريكا', en: 'United States', f: '🇺🇸', dial: '1', min: 10, max: 10, pat: '^[2-9]\\d{9}$', ex: '2025550123', zone: 'other', lang: 'en',
      cur: { code: 'USD', sym: '$', dec: 2, rate: 0.0203, pos: 'before' } },
    { c: 'CA', ar: 'كندا', en: 'Canada', f: '🇨🇦', dial: '1', min: 10, max: 10, pat: '^[2-9]\\d{9}$', ex: '4165550123', zone: 'other', lang: 'en',
      cur: { code: 'CAD', sym: 'C$', dec: 2, rate: 0.0282, pos: 'before' } },
    { c: 'AU', ar: 'أستراليا', en: 'Australia', f: '🇦🇺', dial: '61', min: 9, max: 9, pat: '^4\\d{8}$', ex: '0412345678', zone: 'other', lang: 'en',
      cur: { code: 'AUD', sym: 'A$', dec: 2, rate: 0.0312, pos: 'before' } },
    { c: 'IN', ar: 'الهند', en: 'India', f: '🇮🇳', dial: '91', min: 10, max: 10, pat: '^[6-9]\\d{9}$', ex: '9876543210', zone: 'other', lang: 'en',
      cur: { code: 'INR', sym: '₹', dec: 2, rate: 1.78, pos: 'before' } },
    { c: 'PK', ar: 'باكستان', en: 'Pakistan', f: '🇵🇰', dial: '92', min: 10, max: 10, pat: '^3\\d{9}$', ex: '03001234567', zone: 'other', lang: 'en',
      cur: { code: 'PKR', sym: '₨', dec: 0, rate: 5.65, pos: 'after' } },
    { c: 'NG', ar: 'نيجيريا', en: 'Nigeria', f: '🇳🇬', dial: '234', min: 10, max: 10, pat: '^[789]\\d{9}$', ex: '08031234567', zone: 'other', lang: 'en',
      cur: { code: 'NGN', sym: '₦', dec: 0, rate: 30.5, pos: 'before' } },
    { c: 'KE', ar: 'كينيا', en: 'Kenya', f: '🇰🇪', dial: '254', min: 9, max: 9, pat: '^7\\d{8}$', ex: '0712345678', zone: 'other', lang: 'en',
      cur: { code: 'KES', sym: 'KSh', dec: 2, rate: 2.62, pos: 'before' } },
    { c: 'ZA', ar: 'جنوب أفريقيا', en: 'South Africa', f: '🇿🇦', dial: '27', min: 9, max: 9, pat: '^[6-8]\\d{8}$', ex: '0712345678', zone: 'other', lang: 'en',
      cur: { code: 'ZAR', sym: 'R', dec: 2, rate: 0.375, pos: 'before' } },
    { c: 'BR', ar: 'البرازيل', en: 'Brazil', f: '🇧🇷', dial: '55', min: 10, max: 11, pat: '^\\d{10,11}$', ex: '11912345678', zone: 'other', lang: 'pt',
      cur: { code: 'BRL', sym: 'R$', dec: 2, rate: 0.113, pos: 'before' } },
    { c: 'MX', ar: 'المكسيك', en: 'Mexico', f: '🇲🇽', dial: '52', min: 10, max: 10, pat: '^\\d{10}$', ex: '5512345678', zone: 'other', lang: 'es',
      cur: { code: 'MXN', sym: 'MX$', dec: 2, rate: 0.375, pos: 'before' } },
    { c: 'ID', ar: 'إندونيسيا', en: 'Indonesia', f: '🇮🇩', dial: '62', min: 9, max: 11, pat: '^8\\d{8,10}$', ex: '08123456789', zone: 'other', lang: 'en',
      cur: { code: 'IDR', sym: 'Rp', dec: 0, rate: 330, pos: 'before' } },
    { c: 'PH', ar: 'الفلبين', en: 'Philippines', f: '🇵🇭', dial: '63', min: 10, max: 10, pat: '^9\\d{9}$', ex: '09171234567', zone: 'other', lang: 'en',
      cur: { code: 'PHP', sym: '₱', dec: 2, rate: 1.16, pos: 'before' } },
    { c: 'MY', ar: 'ماليزيا', en: 'Malaysia', f: '🇲🇾', dial: '60', min: 9, max: 10, pat: '^1\\d{8,9}$', ex: '0123456789', zone: 'other', lang: 'en',
      cur: { code: 'MYR', sym: 'RM', dec: 2, rate: 0.0925, pos: 'before' } },
    { c: 'SG', ar: 'سنغافورة', en: 'Singapore', f: '🇸🇬', dial: '65', min: 8, max: 8, pat: '^[89]\\d{7}$', ex: '81234567', zone: 'other', lang: 'en',
      cur: { code: 'SGD', sym: 'S$', dec: 2, rate: 0.0272, pos: 'before' } },
    { c: 'JP', ar: 'اليابان', en: 'Japan', f: '🇯🇵', dial: '81', min: 10, max: 10, pat: '^[789]0\\d{8}$', ex: '09012345678', zone: 'other', lang: 'en',
      cur: { code: 'JPY', sym: '¥', dec: 0, rate: 3.05, pos: 'before' } },
    { c: 'KR', ar: 'كوريا الجنوبية', en: 'South Korea', f: '🇰🇷', dial: '82', min: 9, max: 10, pat: '^1\\d{8,9}$', ex: '01012345678', zone: 'other', lang: 'en',
      cur: { code: 'KRW', sym: '₩', dec: 0, rate: 27.6, pos: 'before' } },
    { c: 'CN', ar: 'الصين', en: 'China', f: '🇨🇳', dial: '86', min: 11, max: 11, pat: '^1[3-9]\\d{9}$', ex: '013123456789', zone: 'other', lang: 'en',
      cur: { code: 'CNY', sym: '¥', dec: 2, rate: 0.147, pos: 'before' } }
  ];

  function lsGet(k) { try { return window.localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function each(l, fn) { Array.prototype.slice.call(l || []).forEach(fn); }

  /* ------------------ lookups ------------------ */
  function byCode(code) {
    code = String(code || '').toUpperCase();
    for (var i = 0; i < LIST.length; i++) if (LIST[i].c === code) return LIST[i];
    return null;
  }
  var EG = byCode('EG');
  function active() {
    var saved = lsGet(LS_KEY).toUpperCase();
    return (saved && byCode(saved)) || EG;
  }
  function name(c) { return window.I18N && window.I18N.lang() === 'ar' ? c.ar : c.en; }
  function curName(c) { return window.I18N && window.I18N.lang() === 'ar' ? c.ar : c.en; }
  function list(zone) {
    if (!zone || zone === 'all') return LIST.slice();
    return LIST.filter(function (x) { return x.zone === zone; });
  }

  /* ------------------ international phone ------------------ */
  function digits(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }

  /* يحوّل أي إدخال (محلي أو دولي) إلى صيغة E.164 */
  function toE164(value, country) {
    var c = typeof country === 'string' ? byCode(country) : (country || active());
    var d = digits(value);
    if (!d) return '';
    if (d.slice(0, 2) === '00') d = d.slice(2);
    if (d.charAt(0) === '+') d = d.slice(1);
    if (d.indexOf(c.dial) === 0 && d.length > c.dial.length + 4) return '+' + d;
    if (d.charAt(0) === '0') return '+' + c.dial + d.replace(/^0+/, '');
    if (new RegExp(c.pat).test(d)) return '+' + c.dial + d;
    return '+' + d;
  }

  /* التحقق: يرجّع {ok, e164, country, reason} */
  function validate(value, country) {
    var c = typeof country === 'string' ? byCode(country) : (country || active());
    if (!c) c = EG;
    var d = digits(value);
    if (!d) return { ok: false, reason: 'empty', e164: '', country: c };
    var e164 = toE164(d, c);
    var nat = d.replace(/^00/, '');
    if (nat.indexOf(c.dial) === 0 && nat.length > c.dial.length + 4) nat = nat.slice(c.dial.length);
    nat = nat.replace(/^0+/, '');
    if (nat.length < c.min) return { ok: false, reason: 'short', e164: e164, country: c };
    if (nat.length > c.max) return { ok: false, reason: 'long', e164: e164, country: c };
    if (!new RegExp(c.pat).test(nat)) return { ok: false, reason: 'pattern', e164: e164, country: c };
    return { ok: true, reason: 'ok', e164: e164, country: c };
  }

  /* يكتشف الدولة من الرقم لوحده — يدعم أي دولة في الجدول */
  function detect(value) {
    var d = digits(value);
    if (!d) return null;
    var sorted = LIST.slice().sort(function (a, b) { return b.dial.length - a.dial.length; });
    for (var i = 0; i < sorted.length; i++) {
      var c = sorted[i];
      if (d.indexOf(c.dial) !== 0) continue;
      var r = validate(d, c);
      if (r.ok) return { country: c, e164: r.e164 };
    }
    return null;
  }

  /* رقم عام لأي دولة تانية (مش في الجدول): 6 - 15 رقم زي E.164 */
  function validateGeneric(value) {
    var d = digits(value).replace(/^00/, '');
    if (d.length >= 6 && d.length <= 15) return { ok: true, reason: 'generic', e164: '+' + d, country: null };
    return { ok: false, reason: d.length < 6 ? 'short' : 'long', e164: '', country: null };
  }

  function format(value, country) {
    var r = validate(value, country);
    var c = r.country;
    if (!r.ok) return value || '';
    return c.f + ' +' + c.dial + ' ' + digits(r.e164).slice(c.dial.length);
  }

  /* ------------------ currency ------------------ */
  function convert(egp, country) {
    var c = typeof country === 'string' ? byCode(country) : (country || active());
    if (!c) c = EG;
    return Number(egp || 0) * c.cur.rate;
  }
  /* يحوّل مبلغ بالجنيه المصري لعملة الدولة المختارة ويُنسّقه */
  function fmt(egp, country) {
    var c = typeof country === 'string' ? byCode(country) : (country || active());
    if (!c) c = EG;
    var v = convert(egp, c);
    var s;
    if (window.I18N) s = window.I18N.num(v, c.cur.dec);
    else s = v.toFixed(c.cur.dec);
    return (c.cur.pos === 'before' ? c.cur.sym + ' ' + s : s + ' ' + c.cur.sym);
  }

  /* ------------------ country picker UI ------------------ */
  var REGIONS = [
    { key: 'arab', label: 'co.region.arab' },
    { key: 'europe', label: 'co.region.europe' },
    { key: 'other', label: 'co.region.other' }
  ];

  function pickerHTML() {
    var act = active();
    var t = window.I18N ? window.I18N.t : function (k) { return k; };
    var opts = REGIONS.map(function (r) {
      var items = LIST.filter(function (x) { return x.zone === r.key; }).map(function (x) {
        return '<option value="' + x.c + '"' + (x.c === act.c ? ' selected' : '') + '>' +
          x.f + ' ' + name(x) + ' — ' + x.cur.code + '</option>';
      }).join('');
      return '<optgroup label="' + t(r.label) + '">' + items + '</optgroup>';
    }).join('');
    return '<div class="country-switch" id="country-div">' +
      '<span class="cs-label">' + t('ui.country') + '</span>' +
      '<select class="country-select" id="country-select" aria-label="' + t('ui.country') + '">' + opts + '</select>' +
      '</div>';
  }

  function renderPicker() {
    each(document.querySelectorAll('#country-switch, .country-switch'), function (box) {
      box.innerHTML = pickerHTML();
      var sel = box.querySelector('#country-select');
      if (sel) sel.addEventListener('change', function () { set(sel.value); });
    });
  }

  function set(code, opts) {
    var c = byCode(code);
    if (!c) return;
    lsSet(LS_KEY, c.c);
    renderPicker();
    if (!opts || opts.silent !== true) {
      /* لو المستخدم مختارش لغة بنفسه، نبدّل اللغة المقترحة للدولة */
      if (window.I18N && !window.I18N.hasChosen() && c.lang !== window.I18N.lang()) {
        window.I18N.set(c.lang, { silent: true });
      }
      try {
        document.dispatchEvent(new CustomEvent('shn:country', { detail: { country: c } }));
      } catch (e) { /* ignore */ }
    }
  }

  function init() { renderPicker(); }

  window.COUNTRIES = {
    LIST: LIST, REGIONS: REGIONS,
    byCode: byCode, active: active, set: set, list: list, init: init, renderPicker: renderPicker,
    name: name, curName: curName,
    digits: digits, toE164: toE164, validate: validate, detect: detect,
    validateGeneric: validateGeneric, format: format,
    convert: convert, fmt: fmt,
    /* عدد الدول لكل منطقة (18 عربية + 23 أوروبية + 17 أخرى) */
    counts: function () {
      return {
        arab: LIST.filter(function (x) { return x.zone === 'arab'; }).length,
        europe: LIST.filter(function (x) { return x.zone === 'europe'; }).length,
        other: LIST.filter(function (x) { return x.zone === 'other'; }).length,
        all: LIST.length
      };
    }
  };
})();
