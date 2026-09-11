-- =========================================================
-- شحنلي | Shahnly — مخطط قاعدة البيانات (SQL Schema)
-- الافتراضي: SQLite (بدون أي تثبيت، بيشتغل بمكتبة Python القياسية sqlite3)
-- نفس المخطط يشتغل على PostgreSQL و MySQL مع الفروق الموضّحة تحت.
-- للتشغيل:  python backend/python/db.py --init
-- =========================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------
-- 1) العملات (سعر التحويل مقابل الجنيه المصري)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS currencies (
  code         TEXT PRIMARY KEY,           -- EGP, SAR, EUR ...
  symbol       TEXT NOT NULL,              -- ج.م / ر.س / €
  decimals     INTEGER NOT NULL DEFAULT 2, -- عدد الكسور في العرض
  rate_per_egp REAL NOT NULL DEFAULT 1,    -- كام وحدة من العملة = 1 جنيه مصري
  position     TEXT NOT NULL DEFAULT 'after'
               CHECK (position IN ('before','after'))
);

-- ---------------------------------------------------------
-- 2) الدول (مفتاح دولي + نمط الرقم + اللغة + العملة)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS countries (
  code          TEXT PRIMARY KEY,          -- EG, SA, FR ...
  name_ar       TEXT NOT NULL,
  name_en       TEXT NOT NULL,
  flag          TEXT,
  dial          TEXT NOT NULL,             -- 20, 966, 33 ...
  min_digits    INTEGER NOT NULL,
  max_digits    INTEGER NOT NULL,
  pattern       TEXT NOT NULL,             -- نمط الرقم المحلي بعد تجريد الصفر/المفتاح
  example       TEXT NOT NULL,
  zone          TEXT NOT NULL CHECK (zone IN ('arab','europe','other')),
  lang          TEXT NOT NULL DEFAULT 'ar',
  currency_code TEXT REFERENCES currencies(code)
);
CREATE INDEX IF NOT EXISTS ix_countries_zone ON countries(zone);

-- ---------------------------------------------------------
-- 3) العملاء
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,   -- Postgres: GENERATED ALWAYS AS IDENTITY · MySQL: AUTO_INCREMENT
  name         TEXT NOT NULL,
  phone_e164   TEXT,                                -- +201012345678
  phone_local  TEXT,                                -- 01012345678
  email        TEXT,
  country_code TEXT REFERENCES countries(code),
  orders_count INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
-- فهرس فريد على رقم الموبايل (SQLite/Postgres: partial index. MySQL: استخدم UNIQUE(phone_e164) مع السماح بـ NULL)
CREATE UNIQUE INDEX IF NOT EXISTS ux_customers_phone
  ON customers(phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_customers_email ON customers(email);

-- ---------------------------------------------------------
-- 4) الأوردرات
--    amount_base = السعر الأساسي بالجنيه المصري (مصدر الحقيقة)
--    amount_display = السعر المعروض بعملة العميل وقت الشراء
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id                TEXT PRIMARY KEY,               -- SHN-260911-AB12
  game              TEXT NOT NULL,                  -- pubg / freefire ...
  package           TEXT,
  package_label     TEXT,                           -- 660 شدة
  player_id         TEXT,
  region            TEXT,                           -- Zone ID أو السيرفر
  amount_base       REAL NOT NULL DEFAULT 0,        -- EGP
  currency_code     TEXT REFERENCES currencies(code),
  amount_display    REAL,
  payment_method    TEXT,                           -- card / bank / wallet
  payment_label     TEXT,
  payment_reference TEXT,
  payment_status    TEXT,                           -- paid / review / failed
  status            TEXT NOT NULL,                  -- created / review / paid / processing / delivered / failed / cancelled
  lang              TEXT,
  customer_id       INTEGER REFERENCES customers(id),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_orders_status     ON orders(status);
CREATE INDEX IF NOT EXISTS ix_orders_game       ON orders(game);
CREATE INDEX IF NOT EXISTS ix_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS ix_orders_customer   ON orders(customer_id);

-- ---------------------------------------------------------
-- 5) وظائف الشحن التلقائي (كل محاولة ليها سطر في job_events)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS jobs (
  job_id          TEXT PRIMARY KEY,                 -- JOB-260911-0001
  order_id        TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status          TEXT NOT NULL,                    -- queued/processing/retrying/delivered/failed
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 3,
  progress        INTEGER NOT NULL DEFAULT 0,
  provider_ref    TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,             -- يمنع الشحن مرتين لنفس الأوردر
  mode            TEXT,                             -- demo / live
  failure_reason  TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  delivered_at    TEXT
);
CREATE INDEX IF NOT EXISTS ix_jobs_status   ON jobs(status);
CREATE INDEX IF NOT EXISTS ix_jobs_order    ON jobs(order_id);
CREATE INDEX IF NOT EXISTS ix_jobs_created  ON jobs(created_at);

CREATE TABLE IF NOT EXISTS job_events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id  TEXT NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  status  TEXT NOT NULL,
  message TEXT,
  at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_job_events_job ON job_events(job_id, at);

-- ---------------------------------------------------------
-- 6) المدفوعات (سجل مستقل لكل محاولة دفع)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id      TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method        TEXT NOT NULL,                      -- card / bank / wallet
  reference     TEXT,
  status        TEXT NOT NULL,                      -- paid / review / failed
  amount        REAL,
  currency_code TEXT REFERENCES currencies(code),
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_payments_order ON payments(order_id);

-- ---------------------------------------------------------
-- 7) بيانات المخطط (للترقيات المستقبلية)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
INSERT INTO schema_meta(key, value) VALUES ('schema_version', '1')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;

-- ---------------------------------------------------------
-- 8) عروض جاهزة للاستخدام في التقارير
-- ---------------------------------------------------------
DROP VIEW IF EXISTS v_orders_full;
CREATE VIEW v_orders_full AS
SELECT o.id            AS order_id,
       o.game          AS game,
       o.package_label AS package_label,
       o.player_id     AS player_id,
       o.region        AS region,
       o.status        AS status,
       o.amount_base   AS amount_egp,
       o.currency_code AS currency_code,
       o.amount_display AS amount_display,
       o.payment_method AS payment_method,
       o.payment_status AS payment_status,
       o.created_at    AS created_at,
       c.name          AS customer_name,
       c.phone_e164    AS customer_phone,
       co.name_ar      AS country_ar,
       co.name_en      AS country_en,
       co.flag         AS country_flag,
       j.job_id        AS job_id,
       j.status        AS topup_status,
       j.attempts      AS attempts,
       j.provider_ref  AS provider_ref
FROM orders o
LEFT JOIN customers c  ON c.id  = o.customer_id
LEFT JOIN countries co ON co.code = c.country_code
LEFT JOIN jobs j       ON j.order_id = o.id;

DROP VIEW IF EXISTS v_daily_sales;
CREATE VIEW v_daily_sales AS
SELECT substr(created_at, 1, 10) AS day,
       COUNT(*)                  AS orders_count,
       SUM(CASE WHEN payment_status = 'paid' THEN amount_base ELSE 0 END) AS paid_egp,
       SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END)              AS delivered_count,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)                 AS failed_count
FROM orders
GROUP BY substr(created_at, 1, 10);

DROP VIEW IF EXISTS v_topup_success;
CREATE VIEW v_topup_success AS
SELECT game,
       COUNT(*) AS jobs_total,
       SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
       ROUND(100.0 * SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) / COUNT(*), 1) AS success_rate
FROM jobs j
LEFT JOIN orders o ON o.id = j.order_id
GROUP BY game;

-- =========================================================
-- فروق اللهجات (Dialects)
-- ---------------------------------------------------------
-- PostgreSQL:
--   • AUTOINCREMENT  →  GENERATED ALWAYS AS IDENTITY
--   • TEXT لتواريخ ISO مقبول، ويُفضّل TIMESTAMPTZ
--   • الجداول بنفس الأسماء؛ الأخطاء المحتملة: «ORDER» كلمة محجوزة في MySQL فقط
-- MySQL:
--   • AUTOINCREMENT  →  AUTO_INCREMENT
--   • الجزئيات (partial index) غير مدعومة → استبدل فهرس العملاء الفريد بـ
--       UNIQUE KEY ux_customers_phone (phone_e164)
--   • CHECK مدعوم من 8.0.16+
--   • REAL → DECIMAL(12,2) لو محتاج دقة مالية
-- ولو عايز دقة مالية كاملة في SQLite: خزّن المبالغ بالقروش (INTEGER) واضرب ×100 عند الإدخال.
-- =========================================================
