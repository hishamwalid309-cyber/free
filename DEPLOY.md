# دليل النشر الآمن — شحنلي | Shahnly

> **القاعدة الأولى:** الموقع المنشور = **واجهة فقط**. الكود والملفات الداخلية
> وقواعد البيانات **ممنوع** تترفع على الإنترنت نهائيًا.

---

## 1) الملفات المسموح رفعها (الواجهة فقط) ✅

ارفع **الملفات دي بالظبط**:

```
index.html · game.html · checkout.html · order.html · track.html
faq.html · contact.html · news.html · live.html · help.html · account.html · 404.html
robots.txt · sitemap.xml · _redirects · _headers
assets/            ← الفولدر كامل (css + js)
```

الطريقة الآمنة: من داخل فولدر المشروع، **اختار الملفات دي بس + فولدر `assets`**
واسحبهم في [app.netlify.com/drop](https://app.netlify.com/drop).

## 2) ممنوع رفعها نهائيًا ❌

```
backend/               ← كود Python / C++ / Node + SQL + orders.jsonl + أي ملف .db
README.md · ARCHITECTURE.md · DEPLOY.md      ← توثيق داخلي (يكشف تفاصيل النظام)
build-standalone.js    ← سكربت تطوير
*.db · *.jsonl · *.log ← أي بيانات تشغيل أو قاعدة بيانات
```

**حماية إضافية مضمّنة:** ملف `_redirects` بيرجّع **404** لأي محاولة وصول لـ
`/backend/*` أو ملفات التوثيق — يعني حتى لو الفولدر كامل اترفع بالغلط، الكود مش هيبقى متاح للعامة.
(بس الأفضل والأسلم إنك ما ترفعوش من الأصل.)

## 3) تدقيق الخصوصية (تم فحصه فعليًا)

| البند | النتيجة |
|---|---|
| مفاتيح دفع (`publicKey` / `integrationId` / `iframeId`) | فاضية ✅ |
| توكن تليجرام (`botToken` / `chatId`) | فاضية + الإشعارات مقفولة ✅ |
| مفتاح توقيع المزود (`backend.key`) | فاضي ✅ |
| كلمات مرور / API keys / شهادات | مفيش أي واحدة في ملفات الواجهة ✅ |
| الحسابات البنكية والمحافظ | **بيانات تجريبية** (holder: `Shahnly Demo Store`) ✅ |
| رقم الواتساب والإيميل | بيانات تجريبية (`+20 100 123 4567` / `support@shahnly.demo`) ✅ |
| أوردرات العملاء | بتتخزن في **متصفح العميل** فقط (localStorage) — مش بترفع لأي سيرفر ✅ |

**قبل الإنتاج الحقيقي:** أي مفتاح دفع أو توكن تليجرام يتحط في **الباك اند فقط**
(متغيرات بيئة، زي `PROVIDER_KEY` / `TELEGRAM_BOT_TOKEN`)، ومينفعش يتحط في `assets/js/config.js`
لأن أي حد يفتح الموقع يقدر يقرأه.

## 4) بعد النشر

1. **اسم الموقع:** `Site settings → Change site name` → مثلاً `shahnly-demo` → اللينك يبقى `https://shahnly-demo.netlify.app`.
2. **الدومين في الفهرسة:** عدّل `robots.txt` و`sitemap.xml` وحطّ الدومين الحقيقي بدل `your-domain.com`.
3. **لوحة الدفع:** `assets/js/config.js → demoMode: true` تفضل زي ما هي لحد ما تجهّز بوابة حقيقية.
4. **البيانات:** صفحة `checkout.html` و`order.html` ممنوع فهرستها (موجودة في `robots.txt` تحت `Disallow`).
