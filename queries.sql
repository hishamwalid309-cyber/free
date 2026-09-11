-- =========================================================
-- شحنلي | Shahnly — استعلامات جاهزة (تقارير التشغيل والمالية)
-- ملاحظة: كل الأوقات مخزّنة UTC بصيغة 'YYYY-MM-DD HH:MM:SS' عشان دوال SQLite
--         زي (datetime('now','-1 hour')) تشتغل بالمقارنة النصية صح.
-- شغّلها:  python backend/python/db.py --query "$(cat backend/sql/queries.sql)"  ← بتشغّل كل حاجة
-- أو استخدم: python backend/python/db.py --report     ← التقرير الأساسي جاهز
-- =========================================================

-- 1) آخر 20 أوردر بالتفاصيل الكاملة
SELECT * FROM v_orders_full ORDER BY created_at DESC LIMIT 20;

-- 2) إيراد اليوم (بالجنيه المصري) وعدد الأوردرات
SELECT day, orders_count, paid_egp, delivered_count, failed_count
FROM v_daily_sales
ORDER BY day DESC LIMIT 1;

-- 3) إيراد آخر 30 يوم (يوم بيوم)
SELECT day, orders_count AS orders, paid_egp AS revenue_egp
FROM v_daily_sales
ORDER BY day DESC LIMIT 30;

-- 4) أعلى 5 ألعاب بالمبيعات (عدد + إيراد)
SELECT game,
       COUNT(*)                       AS orders,
       SUM(amount_base)               AS revenue_egp,
       ROUND(AVG(amount_base), 2)     AS avg_order_egp
FROM orders
WHERE payment_status = 'paid'
GROUP BY game
ORDER BY revenue_egp DESC
LIMIT 5;

-- 5) نسبة نجاح الشحن التلقائي لكل لعبة
SELECT * FROM v_topup_success ORDER BY jobs_total DESC;

-- 6) الأوردرات المتعطلة (محتاجة تدخل بشري: فشلت أو قعدت أكتر من ساعة بدون تسليم)
SELECT order_id, game, package_label, player_id, status, topup_status, attempts, created_at
FROM v_orders_full
WHERE status = 'failed'
   OR (status = 'processing' AND created_at < datetime('now', '-1 hour'))
ORDER BY created_at DESC;

-- 7) توزيع طرق الدفع (نسبة كل طريقة)
SELECT payment_method                                AS method,
       COUNT(*)                                      AS orders,
       SUM(amount_base)                              AS revenue_egp,
       ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM orders), 1) AS share_percent
FROM orders
WHERE payment_method IS NOT NULL
GROUP BY payment_method
ORDER BY orders DESC;

-- 8) أكثر 10 دول شراءً
SELECT country_ar AS country, country_flag AS flag,
       COUNT(*)   AS orders,
       SUM(amount_egp) AS revenue_egp
FROM v_orders_full
WHERE country_ar IS NOT NULL
GROUP BY country_ar, country_flag
ORDER BY orders DESC
LIMIT 10;

-- 9) العملاء الأكثر شراءً (Top customers)
SELECT c.name, c.phone_e164, c.country_code,
       COUNT(o.id)            AS orders,
       SUM(o.amount_base)     AS total_egp,
       MAX(o.created_at)      AS last_order
FROM customers c
JOIN orders o ON o.customer_id = c.id
GROUP BY c.id
ORDER BY total_egp DESC
LIMIT 10;

-- 10) متوسط زمن التسليم بالدقايق (من إنشاء الأوردر لحد نجاح الوظيفة)
SELECT ROUND(AVG((julianday(j.delivered_at) - julianday(o.created_at)) * 24 * 60), 1) AS avg_delivery_minutes,
       COUNT(*) AS delivered_jobs
FROM jobs j
JOIN orders o ON o.id = j.order_id
WHERE j.status = 'delivered' AND j.delivered_at IS NOT NULL;

-- 10.b) أسرع/أبطأ 5 أوردرات في التسليم
SELECT o.id AS order_id, o.game,
       ROUND((julianday(j.delivered_at) - julianday(o.created_at)) * 24 * 60, 1) AS delivery_minutes
FROM jobs j
JOIN orders o ON o.id = j.order_id
WHERE j.status = 'delivered' AND j.delivered_at IS NOT NULL
ORDER BY delivery_minutes DESC
LIMIT 5;

-- 11) محاولات الشحن: توزيع عدد المحاولات (لقياس جودة المزود)
SELECT attempts, COUNT(*) AS jobs
FROM jobs
GROUP BY attempts
ORDER BY attempts;

-- 12) أسباب الفشل الأكثر تكرارًا
SELECT failure_reason, COUNT(*) AS failures
FROM jobs
WHERE status = 'failed'
GROUP BY failure_reason
ORDER BY failures DESC;

-- 13) أوردرات بدون وظيفة شحن (مؤشر على مشكلة في التسجيل)
SELECT o.id, o.status, o.created_at
FROM orders o
LEFT JOIN jobs j ON j.order_id = o.id
WHERE j.job_id IS NULL AND o.payment_status = 'paid';

-- 14) أباطال (تنظيف) بيانات أقدم من سنة
-- DELETE FROM orders WHERE created_at < datetime('now', '-1 year');
