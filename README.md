# خدمة C++ — الشحن التلقائي (shahnly-topup-cpp)

خدمة HTTP بلغة **C++17** بمكتبة قياسية فقط (WinSock2 على Windows / POSIX sockets على Linux و macOS)،
بتنفّذ **نفس العقد** الموجود في [ARCHITECTURE.md](../../ARCHITECTURE.md) بالحرف.

## البناء

**Windows (PowerShell):**
```powershell
powershell -ExecutionPolicy Bypass -File build.ps1            # بناء فقط
powershell -ExecutionPolicy Bypass -File build.ps1 -Selftest  # بناء + اختبار ذاتي
powershell -ExecutionPolicy Bypass -File build.ps1 -Run       # بناء + تشغيل
```
أو يدويًا:
```powershell
g++ -std=c++17 -O2 -pthread -o topup_server.exe topup_server.cpp -lws2_32
```
(بديل بكومبايلر ميكروسوفت: `cl /std:c++17 /EHsc /O2 topup_server.cpp ws2_32.lib`)

**Linux / macOS:**
```bash
chmod +x build.sh
./build.sh --selftest
./build.sh --run
```

## التشغيل

```bash
topup_server --port 8788      # افتراضي 8788
topup_server --selftest       # اختبارات ذاتية بدون شبكة (تطبع PASS/FAIL)
```

## نقاط النهاية

| الميثود | المسار | الوصف |
|---|---|---|
| GET | `/api/v1/health` | حالة الخدمة + عدّادات الوظائف |
| GET | `/api/v1/countries` | جدول الدول (58 دولة) |
| POST | `/api/v1/validate` | تحقق من رقم الهاتف وآيدي اللاعب |
| POST | `/api/v1/topup` | بدء الشحن التلقائي (idempotent) |
| GET | `/api/v1/topup/{jobId}` | متابعة حالة الوظيفة + الـ timeline |

كل الردود `application/json; charset=utf-8`، وشكل الأخطاء زي ما هو موصوف في القسم الرابع من العقد.

## متغيرات البيئة

| المتغير | الافتراضي | الوصف |
|---|---|---|
| `PORT` | `8788` | منفذ الخدمة (أو `--port`) |
| `PROVIDER_MODE` | `demo` | `demo` محاكاة · `live` مزود حقيقي |
| `PROVIDER_URL` | `""` | عنوان مزود الشحن |
| `PROVIDER_KEY` | `""` | مفتاح التوقيع (HMAC-SHA256 في هيدر `X-Signature`) |
| `DEMO_FAILURE_RATE` | `0.05` | نسبة الفشل في وضع الديمو |
| `MAX_ATTEMPTS` | `3` | عدد محاولات الشحن |
| `ORDERS_FILE` | `orders.jsonl` | ملف تخزين الوظائف |

## الربط بالموقع

في `assets/js/config.js`:

```js
backend: { url: 'http://127.0.0.1:8788/api/v1', mode: 'demo', key: '' }
```

الموقع بيشتغل من غير الخدمة كمان (المحرك في المتصفح `assets/js/topup.js` بوضع الديمو).

> ⚠️ الكود مكتوب ومراجَع لكن **لم يُبنَ ولم يُشغَّل** على جهاز إعداد المشروع لأن الـ shell كان معطوبًا
> (كل أمر يرجع `exit 124`). شغّل `--selftest` أول حاجة بعد البناء للتأكد من سلامته على جهازك.
