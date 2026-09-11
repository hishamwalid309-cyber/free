# معمارية نظام الشحن التلقائي (Auto Top-Up)

هذا الملف هو **العقد الموحّد** بين كل أجزاء النظام. أي خدمة (JavaScript / Python / C++) لازم ترد بنفس شكل الـ JSON بالحرف، عشان الموقع يقدر يشتغل مع أي واحدة فيهم بدون تعديل.

---

## 1) الصورة الكاملة

```
┌──────────────────────────┐
│   المتصفح (الموقع)       │
│  index → game → checkout │
│  assets/js/topup.js      │  ← محرك الشحن التلقائي في JS (يعمل أوفلاين كديمو)
└───────────┬──────────────┘
            │  POST /api/v1/topup   (JSON)
            ▼
┌───────────────────────────────────────────────┐
│  خدمات الشحن التلقائي (أي واحدة منهم)          │
│  • backend/python/app.py   (منفذ 8787)        │
│  • backend/cpp/topup_server(منفذ 8788)        │
│  • backend/node/server.js  (منفذ 8790)        │
│  كلهم ينفّذوا: تحقق دولي + طابور + محرك شحن    │
└───────────┬───────────────────────────────────┘
            │  PROVIDER_MODE=demo  → محاكاة داخلية
            │  PROVIDER_MODE=live  → POST إلى PROVIDER_URL
            ▼
     مزود الشحن الحقيقي (API) — أو محاكاة
```

**القاعدة الأساسية:** الشحن تلقائي بالكامل. بمجرد تأكيد الدفع، النظام بيدخل الوظيفة في الطابور، بيحاول، بيعيد المحاولة لو فشل، وبيحدّث الحالة لحد `delivered` **بدون أي تدخل بشري**.

---

## 2) الحالات (Status)

| الحالة | المعنى | تدخل بشري؟ |
|---|---|---|
| `queued` | الوظيفة دخلت الطابور | لا |
| `processing` | جاري إرسال الشحن للمزود | لا |
| `retrying` | فشل مؤقت وجاري إعادة المحاولة | لا |
| `delivered` | تم الشحن بنجاح | لا |
| `failed` | فشل بعد كل المحاولات | يحتاج مراجعة |
| `review` | دفع بتحويل بنكي/محفظة (تأكيد يدوي للدفع فقط، وبعدها الشحن نفسه تلقائي) | تأكيد الدفع فقط |

المحاولات: **3 محاولات** بفاصل تصاعدي (2s → 4s → 8s). في وضع الديمو: 1s → 2s → 3s.

---

## 3) نقاط النهاية (Endpoints)

الـ base URL الافتراضي: `http://127.0.0.1:8787/api/v1`
كل الردود `application/json` و `charset=utf-8`.

### 3.1 `GET /api/v1/health`
```json
{ "ok": true, "service": "shahnly-topup-py", "version": "1.0.0",
  "uptimeSec": 42, "mode": "demo",
  "jobs": { "total": 5, "queued": 0, "processing": 1, "delivered": 3, "failed": 1 } }
```

### 3.2 `GET /api/v1/countries`
```json
{ "ok": true, "count": 2, "countries": [
  { "code": "EG", "name": "مصر", "nameEn": "Egypt", "flag": "🇪🇬", "dial": "20",
    "minDigits": 10, "maxDigits": 10, "pattern": "^01[0125][0-9]{8}$", "example": "01012345678" },
  { "code": "SA", "name": "السعودية", "nameEn": "Saudi Arabia", "flag": "🇸🇦", "dial": "966",
    "minDigits": 9, "maxDigits": 9, "pattern": "^5[0-9]{8}$", "example": "0512345678" }
] }
```

### 3.3 `POST /api/v1/validate`
طلب:
```json
{ "country": "EG", "phone": "01012345678", "playerId": "5123456789", "game": "pubg" }
```
رد ناجح (200):
```json
{ "ok": true, "valid": true, "country": "EG", "phoneE164": "+201012345678",
  "playerId": "5123456789", "errors": [], "warnings": [] }
```
رد فاشل التحقق (200 لكن `valid:false`):
```json
{ "ok": true, "valid": false, "country": "EG", "phoneE164": null, "playerId": "512",
  "errors": [
    { "field": "phone", "code": "invalid_pattern", "message": "الرقم مش مطابق لصيغة مصر (01x)" },
    { "field": "playerId", "code": "invalid_length", "message": "آيدي اللاعب لازم من 8 لـ 12 رقم" }
  ], "warnings": [] }
```
> ملاحظة: الرقم يقبل أي دولة — لو `country` فاضي بنحاول نكتشف الدولة من كود الدولة أو من الصيغة.

### 3.4 `POST /api/v1/topup` — بدء الشحن التلقائي
طلب:
```json
{ "orderId": "SHN-260911-AB12",
  "game": "pubg", "package": "uc660", "packageLabel": "660 شدة",
  "playerId": "5123456789", "region": "EG",
  "amount": 220, "currency": "EGP",
  "payment": { "method": "card", "reference": "PAY-8812", "status": "paid" },
  "customer": { "name": "أحمد", "phone": "+201012345678", "email": "a@b.com" },
  "idempotencyKey": "SHN-260911-AB12" }
```
رد (202):
```json
{ "ok": true, "jobId": "JOB-260911-0001", "orderId": "SHN-260911-AB12",
  "status": "queued", "attempts": 0, "etaSeconds": 12, "duplicate": false }
```
لو نفس `idempotencyKey` تاني → نفس الوظيفة (200):
```json
{ "ok": true, "jobId": "JOB-260911-0001", "orderId": "SHN-260911-AB12",
  "status": "processing", "attempts": 1, "etaSeconds": 8, "duplicate": true }
```

### 3.5 `GET /api/v1/topup/{jobId}` — متابعة الحالة
```json
{ "ok": true, "jobId": "JOB-260911-0001", "orderId": "SHN-260911-AB12",
  "status": "processing", "attempts": 1, "progress": 60,
  "providerRef": "PRV-DEMO-4412", "message": "جاري تنفيذ الشحن على المزود",
  "createdAt": "2026-09-11T10:00:00Z", "updatedAt": "2026-09-11T10:00:06Z",
  "timeline": [
    { "status": "queued",     "at": "2026-09-11T10:00:00Z", "message": "دخل الطابور" },
    { "status": "processing", "at": "2026-09-11T10:00:03Z", "message": "محاولة 1" }
  ] }
```

---

## 4) الأخطاء

| HTTP | code | متى |
|---|---|---|
| 400 | `invalid_json` | الجسم مش JSON صحيح |
| 400 | `invalid_input` | حقول ناقصة (orderId/game/playerId) |
| 404 | `not_found` | مسار غير موجود أو jobId غير معروف |
| 404 | `job_not_found` | الوظيفة مش موجودة |
| 422 | `validation_failed` | فشل التحقق من الرقم/الآيدي |
| 500 | `provider_error` | خطأ داخلي أو من المزود |
| 503 | `engine_busy` | الطابور ممتلي (أكتر من 500 وظيفة) |

شكل الخطأ الموحّد:
```json
{ "ok": false, "error": { "code": "not_found", "message": "المسار غير موجود", "details": [] } }
```

---

## 5) متغيرات البيئة

| المتغير | الافتراضي | الوصف |
|---|---|---|
| `PORT` | 8787 (py) / 8788 (cpp) / 8790 (node) | منفذ الخدمة |
| `PROVIDER_MODE` | `demo` | `demo` محاكاة، `live` مزود حقيقي |
| `PROVIDER_URL` | `""` | عنوان مزود الشحن الحقيقي |
| `PROVIDER_KEY` | `""` | مفتاح المزود |
| `DEMO_FAILURE_RATE` | `0.05` | نسبة الفشل في وضع الديمو |
| `MAX_ATTEMPTS` | `3` | عدد محاولات الشحن |
| `ORDERS_FILE` | `orders.jsonl` | ملف تخزين الوظائف |
| `TELEGRAM_BOT_TOKEN` | `""` | إشعارات تليجرام |
| `TELEGRAM_CHAT_ID` | `""` | شات الإشعارات |

---

## 6) التشغيل

```bash
# Python (مكتبة قياسية فقط)
python backend/python/app.py --port 8787
python backend/python/app.py --selftest        # اختبارات ذاتية بدون شبكة

# C++
cd backend/cpp && g++ -std=c++17 -O2 -pthread -o topup_server topup_server.cpp -lws2_32
topup_server --port 8788
topup_server --selftest

# Node (بوابة + موقع ثابت)
node backend/node/server.js --port 8790
```

الموقع بيقرأ عنوان الـ API من `assets/js/config.js` → `backend.url`.
لو `backend.url` فاضي أو الخدمة مش شغالة، المحرك في المتصفح بيشتغل لوحده في **وضع الديمو** بدون أي خطأ.

---

## 7) قواعد الأمان

1. **بدون بيانات دخول:** بنطلب آيدي/يوزر نيم اللعبة فقط، وممنوع طلب باسورد أو OTP.
2. **Idempotency:** استخدام `idempotencyKey` يمنع تكرار الشحن لنفس الأوردر.
3. **توقيع الطلب:** لطلبات المزود الحقيقي: `HMAC-SHA256(body, PROVIDER_KEY)` في هيدر `X-Signature`.
4. **تقييد المحاولات:** 3 محاولات كحد أقصى + سجل كامل في `orders.jsonl`.
5. **عدم تخزين بيانات الكارت:** الموقع ما يخزّنش رقم الكارت إطلاقًا (الدفع يمر على بوابة الدفع).

---

## 9) طبقة اللغات (i18n) والدول والعملات

### الملفات
| الملف | الوظيفة |
|---|---|
| `assets/js/i18n.js` | محرّك الترجمة + قائمة اللغات + مبدّل اللغة في الواجهة |
| `assets/js/lang.js` | القواميس (9 لغات) + ترجمة نصوص الكتالوج + وحدات الباقات |
| `assets/js/countries.js` | جدول الدول (مفتاح دولي/نمط الرقم/العملة/سعر تحويل) + التحقق + مبدّل الدولة |

### اللغات المدعومة (9)
| الكود | اللغة | الاتجاه | دول أساسية |
|---|---|---|---|
| `ar` | العربية (افتراضي) | RTL | كل الدول العربية (18) |
| `en` | English | LTR | بريطانيا · أيرلندا · أمريكا · كندا · أستراليا |
| `fr` | Français | LTR | فرنسا · بلجيكا · سويسرا · لوكسمبورج (+ المغرب/الجزائر/تونس) |
| `de` | Deutsch | LTR | ألمانيا · النمسا · سويسرا |
| `es` | Español | LTR | إسبانيا · المكسيك · الأرجنتين |
| `it` | Italiano | LTR | إيطاليا · سويسرا |
| `pt` | Português | LTR | البرتغال · البرازيل |
| `tr` | Türkçe | LTR | تركيا · قبرص |
| `ru` | Русский | LTR | روسيا · بيلاروسيا · كازاخستان |

### واجهة الاستخدام (JS)
```js
I18N.t('gp.continue')                       // ترجمة مفتاح (مع {vars} للقوالب)
I18N.p('الأكثر مبيعًا')                      // ترجمة نص قادم من data.js
I18N.amount('660 شدة')                      // "660 UC" حسب اللغة
I18N.num(1234.5, 2) · I18N.date(ts)         // تنسيق أرقام/تواريخ حسب اللغة
I18N.set('fr') · I18N.lang() · I18N.apply() // تبديل اللغة / تطبيقها على الصفحة
COUNTRIES.fmt(220)                          // 220 EGP → عملة الدولة المختارة
COUNTRIES.validate('01012345678', 'EG')     // {ok, e164, country, reason}
COUNTRIES.detect('+966512345678')           // تحديد الدولة من الرقم
```

### سمات HTML المدعومة
`data-i18n` · `data-i18n-html` · `data-i18n-ph` (placeholder) · `data-i18n-title` ·
`data-i18n-aria` · `data-phrase` (نص كتالوج) · `data-amount` (كمية باقة) ·
`data-title` على `<html>` لعنوان الصفحة (بيدعم `{brand}`).

### الأحداث (Events)
- `shn:i18n` → تتطلق لما اللغة تتغيّر. أي صفحة تسمعها تعيد الرسم.
- `shn:country` → تتطلق لما الدولة/العملة تتغيّر.

### الأرقام الدولية
- كل دولة في `COUNTRIES.LIST` عندها: `dial` (المفتاح)، `min/max` (عدد الأرقام)،
  `pat` (نمط الرقم المحلي)، `ex` (مثال).
- `validate()` يقبل الرقم بصيغته المحلية (`01012345678`) أو الدولية (`+201012345678` أو `0020...`).
- `COUNTRIES.validateGeneric()` يقبل أي رقم من أي دولة خارج الجدول بصيغة E.164 (6 - 15 رقم).

### العملات (⚠️ أسعار تجريبية للعرض فقط)
- الأسعار في `data.js` بالجنيه المصري (EGP) وهي **الأساس**.
- كل دولة عندها `cur.rate` = كام وحدة من العملة تساوي 1 جنيه مصري، و`dec` عدد الكسور.
- العرض بيتم عبر `SHN.money()` → `COUNTRIES.fmt()`، فأي مكان في الموقع بيتحوّل تلقائيًا.
- لتعديل الأسعار: غيّر `cur.rate` في `assets/js/countries.js` فقط.

### إضافة لغة جديدة
1. أضف قاموس في `assets/js/lang.js`: `window.I18N_DICT.xx = { ... }` بنفس مفاتيح `ar`.
2. أضف `window.I18N_PHRASES.xx` (نصوص الكتالوج) و`window.I18N_UNITS.xx` (وحدات الباقات).
3. سجّل اللغة في مصفوفة `LANGS` في `assets/js/i18n.js`.

### إضافة دولة جديدة
أضف عنصرًا في `LIST` داخل `assets/js/countries.js`:
```js
{ c:'XX', ar:'الاسم بالعربي', en:'Name', f:'🏳️', dial:'999', min:9, max:9,
  pat:'^5\\d{8}$', ex:'0512345678', zone:'arab|europe|other', lang:'ar',
  cur:{ code:'XXX', sym:'X', dec:2, rate:0.05, pos:'after' } }
```

### علاقة الطبقة بالـ API
`GET /api/v1/countries` في هذا المستند يرجّع **نفس** جدول `countries.js`
(نفس الحقول: `code`, `dial`, `min`, `max`, `pattern`, `currency`) حتى تتطابق
الواجهة الأمامية مع خدمات Python / C++ / Node.

---

## 10) طبقة التخزين SQL (قاعدة بيانات حقيقية)

### الملفات
| الملف | الوظيفة |
|---|---|
| `backend/sql/schema.sql` | المخطط الكامل: 8 جداول + 3 عروض (views) + الفهارس، مع فروق PostgreSQL/MySQL |
| `backend/sql/queries.sql` | 14 استعلام تقارير جاهز (إيراد يومي/شهري، أعلى الألعاب، نجاح الشحن، الأوردرات المتعطلة، أكثر الدول، أفضل العملاء، زمن التسليم، توزيع طرق الدفع، أسباب الفشل) |
| `backend/python/db.py` | طبقة التخزين بـ Python (SQLite بمكتبة قياسية) + CLI + اختبارات ذاتية |

### الجداول
| الجدول | الوصف |
|---|---|
| `currencies` | العملات: الرمز، عدد الكسور، **rate_per_egp** (كام وحدة = 1 جنيه مصري)، مكان الرمز |
| `countries` | الدول: الاسم عربي/إنجليزي، العلم، المفتاح الدولي، min/max للأرقام، نمط الرقم، المثال، المنطقة، اللغة، العملة |
| `customers` | العملاء: الاسم، الرقم بصيغة E.164 والمحلية، البريد، الدولة، عدد الأوردرات |
| `orders` | الأوردرات: اللعبة، الباقة، آيدي اللاعب، المنطقة، **amount_base (EGP)** و**amount_display**، طريقة الدفع ومرجعها وحالتها، الحالة، اللغة، العميل |
| `jobs` | وظائف الشحن: الحالة، المحاولات، الحد الأقصى، نسبة التقدم، مرجع المزوّد، **idempotency_key (فريد)**، الوضع، سبب الفشل، أوقات الإنشاء/التحديث/التسليم |
| `job_events` | كل تغيير حالة كسطر مستقل (الـ timeline) |
| `payments` | سجل مستقل لكل عملية دفع |
| `schema_meta` | إصدار المخطط (للترقيات المستقبلية) |

**العروض:** `v_orders_full` (أوردر + عميل + دولة + وظيفة شحن) · `v_daily_sales` (مبيعات يومية) · `v_topup_success` (نسبة نجاح الشحن لكل لعبة).

### قواعد ثابتة
- **الأسعار تُخزَّن بالجنيه المصري في `amount_base`** (مصدر الحقيقة)، و`amount_display` للعرض بعملة العميل وقت الشراء.
- **كل الأوقات UTC بصيغة `YYYY-MM-DD HH:MM:SS`** عشان دوال SQLite (زي `datetime('now','-1 hour')`) تشتغل بالمقارنة النصية صح.
- `idempotency_key` فريد على مستوى قاعدة البيانات → مستحيل يتكرر شحن نفس الأوردر حتى لو الخدمات اتشغلت بالتوازي.

### التشغيل
```bash
python backend/python/db.py --init                        # إنشاء/ترقية الجداول
python backend/python/db.py --seed                        # تعبئة الدول والعملات من assets/js/countries.js
python backend/python/db.py --selftest                    # اختبارات ذاتية كاملة (بدون شبكة) → PASS/FAIL
python backend/python/db.py --import-jsonl orders.jsonl   # ترحيل بيانات JSONL القديمة
python backend/python/db.py --report                      # تقرير سريع في التيرمينال
python backend/python/db.py --query "SELECT * FROM v_orders_full LIMIT 5"
```

### تفعيل SQL في الخدمات
| الخدمة | طريقة التفعيل | النتيجة |
|---|---|---|
| Python (`backend/python/app.py`) | `SHN_SQL=1` أو `DB_PATH=shahnly.db` | مرآة تلقائية على SQL عند **كل تغيير حالة** (من `_append_log`) — بدون أي تغيير في منطق الشحن، وأي فشل في SQL ما بيوقّفش الخدمة |
| Node (`backend/node/server.js`) | `DB_PATH=...` أو `SHN_SQL=1` (+ `node:sqlite` أي Node 22.5+) | نفس المرآة على كل تحديث وظيفة، + نقطة نهاية `GET /api/v1/report` |
| C++ (`backend/cpp/topup_server.cpp`) | غير مدعوم افتراضيًا | الملف يفضل `orders.jsonl`. لتفعيله: اربط `sqlite3` بـ `-DSHN_SQLITE` وافتح اتصال واحد بمكتبة sqlite3 ثم احقن نفس الجداول (المنطق نفسه موجود في `jobs`/`job_events`) |

لو SQL مقفول، كل حاجة بتشتغل عادي على `orders.jsonl` — يعني الترقية اختيارية ومش كاسرة لأي حاجة.

### نقطة نهاية التقارير
```http
GET /api/v1/report
```
- لو SQL مفعّل → `{"ok":true,"source":"sql","report":{orders,delivered,failed,jobs,revenueEgp,countries,topGames,topupSuccess,daily}}`
- لو مقفول → `{"ok":true,"source":"jsonl","note":"...","report":{...}}` (تجميع من `orders.jsonl` في الذاكرة)

### PostgreSQL / MySQL
```bash
python backend/python/db.py --url "postgresql://user:pass@host:5432/shahnly" --init --seed
```
- محتاج مكتبة اتصال مثبتة (`psycopg2` لـ Postgres أو `pymysql` لـ MySQL).
- المخطط نفسه يشتغل مع الفروق الموثّقة في آخر `schema.sql`:
  `AUTOINCREMENT` → `GENERATED ALWAYS AS IDENTITY` (Postgres) أو `AUTO_INCREMENT` (MySQL)،
  والجزئيات (partial index) في فهرس العملاء الفريد غير مدعومة في MySQL → استخدم `UNIQUE KEY` عادي،
  ولو محتاج دقة مالية كاملة خزّن المبالغ بالقروش كـ INTEGER.

### متغيرات البيئة
| المتغير | الافتراضي | الوصف |
|---|---|---|
| `SHN_SQL` | غير مفعّل | `1` لتفعيل SQL |
| `DB_PATH` | `backend/python/shahnly.db` أو `backend/node/shahnly.db` | مسار ملف SQLite |
| `DB_URL` | فارغ | رابط Postgres/MySQL (يتجاوز `DB_PATH`) |
| `ORDERS_FILE` | `orders.jsonl` | ملف JSONL (يفضل مفعّل كنسخة احتياطية) |

> ⚠️ لم يُشغَّل أي من ده فعليًا على جهاز إعداد المشروع (الـ shell معطوب: `exit 124`).
> أول خطوة على جهاز سليم: `python backend/python/db.py --selftest` ثم `node backend/node/server.js --init-db`.
