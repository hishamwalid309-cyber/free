#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
شحنلي | Shahnly — طبقة تخزين SQL
=================================
تخزين الأوردرات والعملاء ووظائف الشحن التلقائي في قاعدة بيانات حقيقية.

• الافتراضي SQLite (مكتبة Python القياسية sqlite3 — مفيش أي تثبيت).
• اختياري: PostgreSQL / MySQL عبر `--url` (لو مكتبة الاتصال مثبتة: psycopg2 أو pymysql).
• المخطط في backend/sql/schema.sql والاستعلامات في backend/sql/queries.sql.

أوامر سريعة:
    python db.py --init                      # إنشاء/ترقية قاعدة البيانات
    python db.py --seed                      # تعبئة الدول والعملات من assets/js/countries.js
    python db.py --selftest                  # اختبارات ذاتية كاملة (بدون شبكة) → PASS/FAIL
    python db.py --import-jsonl orders.jsonl  # ترحيل بيانات orders.jsonl القديمة
    python db.py --report                    # تقرير سريع في التيرمينال
    python db.py --query "SELECT * FROM v_orders_full LIMIT 5"
"""

import argparse
import ast
import datetime as _dt
import json
import os
import re
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SCHEMA_FILE = os.path.join(ROOT, "backend", "sql", "schema.sql")
COUNTRIES_JS = os.path.join(ROOT, "assets", "js", "countries.js")
DEFAULT_DB = os.environ.get("DB_PATH") or os.path.join(HERE, "shahnly.db")

TS_FMT = "%Y-%m-%d %H:%M:%S"   # صيغة موحّدة متوافقة مع دوال SQLite


def now_ts():
    """الوقت الحالي UTC بصيغة 'YYYY-MM-DD HH:MM:SS'."""
    return _dt.datetime.utcnow().strftime(TS_FMT)


def to_ts(value):
    """يحوّل أي وقت (ISO نصّي / أرقام مللي ثانية / كائن datetime) لصيغة القاعدة."""
    if value is None or value == "":
        return now_ts()
    if isinstance(value, _dt.datetime):
        return value.strftime(TS_FMT)
    if isinstance(value, (int, float)):
        return _dt.datetime.utcfromtimestamp(float(value) / (1000.0 if value > 1e11 else 1.0)).strftime(TS_FMT)
    text = str(value).strip().replace("Z", "")
    text = text.replace("T", " ")
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return _dt.datetime.strptime(text, fmt).strftime(TS_FMT)
        except ValueError:
            continue
    return now_ts()


# =========================================================
#  اتصال + ترحيل
# =========================================================
class SqlStore(object):
    """تخزين SQL للأوردرات والعملاء ووظائف الشحن."""

    def __init__(self, db_path=None, url=None, verbose=False):
        self.db_path = db_path or DEFAULT_DB
        self.url = url or os.environ.get("DB_URL") or ""
        self.verbose = verbose
        self.dialect = "sqlite"
        self.conn = None
        self._connect()

    # ---------- الاتصال ----------
    def _connect(self):
        if self.url.startswith("postgres"):
            import psycopg2  # noqa
            self.dialect = "postgres"
            self.conn = psycopg2.connect(self.url)
            self.db_path = self.url
        elif self.url.startswith("mysql"):
            import pymysql  # noqa
            self.dialect = "mysql"
            self.conn = pymysql.connect(host="localhost", user="root", password="", database="shahnly")
            self.db_path = self.url
        else:
            self.dialect = "sqlite"
            self.conn = sqlite3.connect(self.db_path)
            self.conn.row_factory = sqlite3.Row
            self.conn.execute("PRAGMA foreign_keys = ON")
            self.conn.execute("PRAGMA journal_mode = WAL")
            self.conn.execute("PRAGMA synchronous = NORMAL")

    def placeholder(self):
        return "%s" if self.dialect in ("postgres", "mysql") else "?"

    def _sql(self, sql):
        if self.dialect in ("postgres", "mysql"):
            return sql.replace("?", "%s")
        return sql

    def _exec(self, sql, params=()):
        cur = self.conn.cursor()
        cur.execute(self._sql(sql), params)
        return cur

    def _query(self, sql, params=()):
        cur = self._exec(sql, params)
        rows = cur.fetchall()
        if rows and hasattr(rows[0], "keys"):
            return [dict(r) for r in rows]
        if rows and isinstance(rows[0], (tuple, list)):
            cols = [d[0] for d in (cur.description or [])]
            return [dict(zip(cols, r)) for r in rows]
        return []

    def query(self, sql, params=()):
        return self._query(sql, params)

    def commit(self):
        self.conn.commit()

    def close(self):
        try:
            self.conn.commit()
        except Exception:
            pass
        try:
            self.conn.close()
        except Exception:
            pass

    # ---------- الترحيل ----------
    def migrate(self):
        """يشغّل schema.sql (idempotent — آمن يتكرر)."""
        with open(SCHEMA_FILE, "r", encoding="utf-8") as fh:
            raw = fh.read()
        # إزالة التعليقات لتفادي أخطاء التنفيذ
        sql = "\n".join(line for line in raw.splitlines() if not line.strip().startswith("--"))
        statements = [s.strip() for s in sql.split(";") if s.strip()]
        done = 0
        for stmt in statements:
            if not stmt:
                continue
            try:
                self._exec(stmt)
                done += 1
            except Exception as exc:  # نتجاهل «موجود بالفعل» فقط
                msg = str(exc).lower()
                if "already exists" in msg or "duplicate" in msg:
                    continue
                if self.verbose:
                    sys.stderr.write("  ! تعذّر تنفيذ: %s\n    %s\n" % (stmt.split("\n")[0][:60], exc))
        self.commit()
        return done

    # ---------- الدول والعملات (من ملف الموقع — مصدر واحد) ----------
    def seed_from_js(self, path=None):
        """يقرأ assets/js/countries.js ويعبّي جدولَي countries و currencies."""
        path = path or COUNTRIES_JS
        with open(path, "r", encoding="utf-8") as fh:
            src = fh.read()

        countries = []
        pattern = re.compile(
            r"\{[^{}]*?c:\s*'([A-Z]{2})'[^{}]*?ar:\s*'([^']*)'[^{}]*?en:\s*'([^']*)'[^{}]*?f:\s*'([^']*)'"
            r"[^{}]*?dial:\s*'(\d+)'[^{}]*?min:\s*(\d+)[^{}]*?max:\s*(\d+)[^{}]*?pat:\s*'([^']*)'"
            r"[^{}]*?ex:\s*'([^']*)'[^{}]*?zone:\s*'(\w+)'[^{}]*?lang:\s*'(\w+)'"
            r"[^{}]*?cur:\s*\{([^}]*)\}",
            re.S,
        )
        for m in pattern.finditer(src):
            cur_raw = m.group(12)
            def pick(key, cast=str, default=None):
                mm = re.search(key + r"\s*:\s*'?([^,'}]+)'?", cur_raw)
                if not mm:
                    return default
                val = mm.group(1).strip()
                try:
                    return cast(val)
                except Exception:
                    return default
            countries.append({
                "code": m.group(1), "name_ar": m.group(2), "name_en": m.group(3), "flag": m.group(4),
                "dial": m.group(5), "min_digits": int(m.group(6)), "max_digits": int(m.group(7)),
                "pattern": m.group(8).replace("\\\\d", "\\d"), "example": m.group(9),
                "zone": m.group(10), "lang": m.group(11),
                "currency_code": pick("code"), "symbol": pick("sym", default=""),
                "decimals": pick("dec", int, 2), "rate": pick("rate", float, 1.0),
                "position": pick("pos", default="after"),
            })

        currencies = {}
        for c in countries:
            if c["currency_code"]:
                currencies[c["currency_code"]] = (c["currency_code"], c["symbol"], c["decimals"], c["rate"], c["position"])

        ph = self.placeholder()
        for code, sym, dec, rate, pos in currencies.values():
            self._exec(
                "INSERT INTO currencies(code, symbol, decimals, rate_per_egp, position) VALUES (?,?,?,?,?) "
                "ON CONFLICT(code) DO UPDATE SET symbol=excluded.symbol, decimals=excluded.decimals, "
                "rate_per_egp=excluded.rate_per_egp, position=excluded.position",
                (code, sym, dec, rate, pos),
            )
        for c in countries:
            self._exec(
                "INSERT INTO countries(code, name_ar, name_en, flag, dial, min_digits, max_digits, pattern, "
                "example, zone, lang, currency_code) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT(code) DO UPDATE SET name_ar=excluded.name_ar, name_en=excluded.name_en, "
                "flag=excluded.flag, dial=excluded.dial, min_digits=excluded.min_digits, "
                "max_digits=excluded.max_digits, pattern=excluded.pattern, example=excluded.example, "
                "zone=excluded.zone, lang=excluded.lang, currency_code=excluded.currency_code",
                (c["code"], c["name_ar"], c["name_en"], c["flag"], c["dial"], c["min_digits"],
                 c["max_digits"], c["pattern"], c["example"], c["zone"], c["lang"], c["currency_code"]),
            )
        self.commit()
        return len(countries), len(currencies)

    # ---------- العملاء ----------
    def upsert_customer(self, name, phone_e164=None, phone_local=None, email=None, country_code=None):
        if phone_e164:
            rows = self._query("SELECT id FROM customers WHERE phone_e164 = ? LIMIT 1", (phone_e164,))
            if rows:
                cid = rows[0]["id"]
                self._exec(
                    "UPDATE customers SET name=?, phone_local=COALESCE(?, phone_local), email=COALESCE(?, email), "
                    "country_code=COALESCE(?, country_code), updated_at=? WHERE id=?",
                    (name, phone_local, email, country_code, now_ts(), cid),
                )
                self.commit()
                return cid
        if email:
            rows = self._query("SELECT id FROM customers WHERE email = ? AND (phone_e164 IS NULL OR phone_e164 = '') LIMIT 1", (email,))
            if rows:
                return rows[0]["id"]
        cur = self._exec(
            "INSERT INTO customers(name, phone_e164, phone_local, email, country_code, created_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?)",
            (name, phone_e164, phone_local, email, country_code, now_ts(), now_ts()),
        )
        cid = getattr(cur, "lastrowid", None)
        self.commit()
        if cid is None:
            rows = self._query("SELECT id FROM customers WHERE phone_e164 = ? OR email = ? LIMIT 1", (phone_e164, email))
            cid = rows[0]["id"] if rows else None
        return cid

    def bump_customer_orders(self, customer_id):
        if not customer_id:
            return
        self._exec("UPDATE customers SET orders_count = orders_count + 1, updated_at = ? WHERE id = ?",
                   (now_ts(), customer_id))
        self.commit()

    # ---------- الأوردرات ----------
    def save_order(self, order):
        """يحفظ/يحدّث أوردر. الشكل زي أوردر الموقع (JSON)."""
        customer = order.get("customer") or {}
        cid = None
        if customer.get("name"):
            cid = self.upsert_customer(
                customer.get("name"),
                customer.get("phone") or customer.get("phoneE164"),
                customer.get("phoneLocal"),
                customer.get("email"),
                customer.get("country"),
            )
        payment = order.get("payment") or {}
        game = order.get("game") or {}
        pkg = order.get("pkg") or {}
        payload = (
            order.get("id"),
            game.get("id") or order.get("gameId") or "",
            pkg.get("id") or order.get("pkgId"),
            pkg.get("amount") or order.get("packageLabel"),
            (order.get("player") or {}).get("playerId") or order.get("playerId"),
            (order.get("extra") or {}).get("zone") or (order.get("extra") or {}).get("server"),
            float(pkg.get("price") or order.get("total") or 0),
            order.get("currency") or "EGP",
            float(order.get("total") or pkg.get("price") or 0),
            payment.get("method"),
            payment.get("label"),
            payment.get("reference"),
            payment.get("status"),
            order.get("status") or "created",
            order.get("lang"),
            cid,
            to_ts(order.get("createdAt")),
            now_ts(),
        )
        self._exec(
            "INSERT INTO orders(id, game, package, package_label, player_id, region, amount_base, currency_code, "
            "amount_display, payment_method, payment_label, payment_reference, payment_status, status, lang, "
            "customer_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET game=excluded.game, package=excluded.package, "
            "package_label=excluded.package_label, player_id=excluded.player_id, region=excluded.region, "
            "amount_base=excluded.amount_base, currency_code=excluded.currency_code, "
            "amount_display=excluded.amount_display, payment_method=excluded.payment_method, "
            "payment_label=excluded.payment_label, payment_reference=excluded.payment_reference, "
            "payment_status=excluded.payment_status, status=excluded.status, lang=excluded.lang, "
            "customer_id=COALESCE(excluded.customer_id, orders.customer_id), updated_at=excluded.updated_at",
            payload,
        )
        if payment:
            self._exec(
                "INSERT INTO payments(order_id, method, reference, status, amount, currency_code, created_at) "
                "VALUES (?,?,?,?,?,?,?)",
                (order.get("id"), payment.get("method") or "unknown", payment.get("reference"),
                 payment.get("status") or "unknown", float(order.get("total") or 0),
                 order.get("currency") or "EGP", to_ts(payment.get("paidAt") or order.get("createdAt"))),
            )
        self.commit()
        return True

    def update_order_status(self, order_id, status, topup=None):
        self._exec("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?", (status, now_ts(), order_id))
        if topup:
            self._exec(
                "UPDATE jobs SET status=COALESCE(?, status), attempts=COALESCE(?, attempts), "
                "progress=COALESCE(?, progress), provider_ref=COALESCE(?, provider_ref), updated_at=? "
                "WHERE order_id = ?",
                (topup.get("status"), topup.get("attempts"), topup.get("progress"),
                 topup.get("providerRef") or None, now_ts(), order_id),
            )
        self.commit()
        return True

    def get_order(self, order_id):
        rows = self._query("SELECT * FROM v_orders_full WHERE order_id = ? LIMIT 1", (order_id,))
        return rows[0] if rows else None

    def list_orders(self, limit=50, status=None):
        if status:
            return self._query(
                "SELECT * FROM v_orders_full WHERE status = ? ORDER BY created_at DESC LIMIT ?", (status, limit))
        return self._query("SELECT * FROM v_orders_full ORDER BY created_at DESC LIMIT ?", (limit,))

    # ---------- الوظائف ----------
    def create_job(self, job):
        """ينشئ وظيفة شحن. يرجّع (job_id, created_bool). لو idempotency_key موجود → ما يكرّرش."""
        idem = job.get("idempotencyKey") or job.get("orderId")
        rows = self._query("SELECT job_id FROM jobs WHERE idempotency_key = ? LIMIT 1", (idem,))
        if rows:
            return rows[0]["job_id"], False
        self._exec(
            "INSERT INTO jobs(job_id, order_id, status, attempts, max_attempts, progress, provider_ref, "
            "idempotency_key, mode, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (job.get("jobId") or job.get("job_id"), job.get("orderId"), job.get("status") or "queued",
             int(job.get("attempts") or 0), int(job.get("maxAttempts") or 3), int(job.get("progress") or 0),
             job.get("providerRef"), idem, job.get("mode") or "demo",
             to_ts(job.get("createdAt")), now_ts()),
        )
        self.commit()
        self.add_event(job.get("jobId") or job.get("job_id"), "queued", "دخل الطابور")
        return job.get("jobId") or job.get("job_id"), True

    def update_job(self, job_id, status=None, attempts=None, progress=None, provider_ref=None, failure_reason=None):
        delivered_at = now_ts() if status == "delivered" else None
        self._exec(
            "UPDATE jobs SET status=COALESCE(?, status), attempts=COALESCE(?, attempts), "
            "progress=COALESCE(?, progress), provider_ref=COALESCE(?, provider_ref), "
            "failure_reason=COALESCE(?, failure_reason), delivered_at=COALESCE(delivered_at, ?), updated_at=? "
            "WHERE job_id = ?",
            (status, attempts, progress, provider_ref, failure_reason, delivered_at, now_ts(), job_id),
        )
        self.commit()
        return True

    def add_event(self, job_id, status, message=""):
        self._exec("INSERT INTO job_events(job_id, status, message, at) VALUES (?,?,?,?)",
                   (job_id, status, message or "", now_ts()))
        self.commit()
        return True

    def get_job(self, job_id):
        rows = self._query("SELECT * FROM jobs WHERE job_id = ? LIMIT 1", (job_id,))
        if not rows:
            return None
        job = rows[0]
        job["timeline"] = self._query("SELECT status, message, at FROM job_events WHERE job_id = ? ORDER BY id", (job_id,))
        return job

    def find_job_by_idempotency(self, key):
        rows = self._query("SELECT job_id FROM jobs WHERE idempotency_key = ? LIMIT 1", (key,))
        return self.get_job(rows[0]["job_id"]) if rows else None

    def list_jobs(self, limit=50, status=None):
        if status:
            return self._query("SELECT * FROM jobs WHERE status = ? ORDER BY created_at DESC LIMIT ?", (status, limit))
        return self._query("SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?", (limit,))

    # ---------- ترحيل JSONL ----------
    def import_jsonl(self, path):
        """يستورد ملف orders.jsonl (سطر JSON لكل تغيير حالة). يرجّع عدد السطور المُعالَجة."""
        if not os.path.exists(path):
            raise IOError("ملف مش موجود: " + path)
        seen_jobs, orders, events, count = set(), 0, 0, 0
        with open(path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                count += 1
                try:
                    rec = json.loads(line)
                except ValueError:
                    continue
                if rec.get("jobId") or rec.get("job_id"):
                    jid = rec.get("jobId") or rec.get("job_id")
                    if jid not in seen_jobs:
                        self.create_job(rec)
                        seen_jobs.add(jid)
                    self.update_job(jid, rec.get("status"), rec.get("attempts"), rec.get("progress"),
                                    rec.get("providerRef"), rec.get("failureReason"))
                    self.add_event(jid, rec.get("status") or "processing", rec.get("message") or "")
                    events += 1
                elif rec.get("id") and rec.get("game"):
                    self.save_order(rec)
                    orders += 1
        self.commit()
        return {"lines": count, "jobs": len(seen_jobs), "orders": orders, "events": events}

    # ---------- تقارير ----------
    def stats(self):
        def one(sql, params=()):
            rows = self._query(sql, params)
            return rows[0] if rows else {}
        return {
            "orders": one("SELECT COUNT(*) AS c FROM orders").get("c", 0),
            "delivered": one("SELECT COUNT(*) AS c FROM orders WHERE status='delivered'").get("c", 0),
            "failed": one("SELECT COUNT(*) AS c FROM orders WHERE status='failed'").get("c", 0),
            "jobs": one("SELECT COUNT(*) AS c FROM jobs").get("c", 0),
            "customers": one("SELECT COUNT(*) AS c FROM customers").get("c", 0),
            "countries": one("SELECT COUNT(*) AS c FROM countries").get("c", 0),
            "revenue_egp": one("SELECT COALESCE(SUM(amount_base),0) AS c FROM orders WHERE payment_status='paid'").get("c", 0),
            "today": one("SELECT * FROM v_daily_sales ORDER BY day DESC LIMIT 1"),
            "top_games": self._query("SELECT game, COUNT(*) AS orders, SUM(amount_base) AS egp FROM orders "
                                    "GROUP BY game ORDER BY orders DESC LIMIT 5"),
            "topup_success": self._query("SELECT * FROM v_topup_success ORDER BY jobs_total DESC"),
        }


# =========================================================
#  اختبارات ذاتية
# =========================================================
def run_selftest():
    import tempfile
    passed, failed = [], []

    def check(name, cond):
        (passed if cond else failed).append(name)
        print(("  ✓ " if cond else "  ✗ ") + name)

    tmpdir = tempfile.mkdtemp(prefix="shahnly_sql_")
    db_file = os.path.join(tmpdir, "test.db")
    store = SqlStore(db_path=db_file)

    print("=== shahnly SQL selftest ===")
    created = store.migrate()
    check("تم تنفيذ schema.sql (>= 10 عبارة)", created >= 10)

    n_countries, n_cur = store.seed_from_js()
    check("تمت تعبئة الدول من countries.js (>= 50)", n_countries >= 50)
    check("تمت تعبئة العملات (>= 10)", n_cur >= 10)
    eg = store.query("SELECT * FROM countries WHERE code='EG'")
    check("مصر موجودة بمفتاحها الدولي 20", bool(eg) and eg[0]["dial"] == "20")
    check("نمط مصر اتخزّن صح", bool(eg) and eg[0]["pattern"].startswith("^1[0125]"))

    cid = store.upsert_customer("أحمد محمد", "+201012345678", "01012345678", "a@example.com", "EG")
    check("إضافة عميل", bool(cid))
    cid2 = store.upsert_customer("أحمد محمد تاني", "+201012345678", None, None, "EG")
    check("نفس الرقم ما بيعملش عميل مكرر", cid == cid2)

    order = {
        "id": "SHN-260911-AB12",
        "game": {"id": "pubg", "name": "PUBG Mobile"},
        "pkg": {"id": "uc660", "amount": "660 شدة", "price": 220},
        "player": {"playerId": "5123456789"},
        "customer": {"name": "أحمد محمد", "phone": "+201012345678", "country": "EG", "email": "a@example.com"},
        "payment": {"method": "card", "label": "فيزا", "reference": "PAY-123456", "status": "paid", "paidAt": 1757558400000},
        "total": 220, "currency": "EGP", "status": "paid", "lang": "ar", "createdAt": 1757558400000,
    }
    check("حفظ أوردر", store.save_order(order) is True)
    store.save_order(order)  # idempotent
    rows = store.query("SELECT COUNT(*) AS c FROM orders")
    check("الأوردر ما اتكررش في الجدول", rows[0]["c"] == 1)
    pay = store.query("SELECT COUNT(*) AS c FROM payments")
    check("اتسجل صف دفع", pay[0]["c"] >= 1)

    job_id, created_flag = store.create_job({
        "jobId": "JOB-260911-0001", "orderId": "SHN-260911-AB12", "status": "queued",
        "attempts": 0, "maxAttempts": 3, "progress": 5, "mode": "demo",
        "idempotencyKey": "SHN-260911-AB12", "createdAt": 1757558400000,
    })
    check("إنشاء وظيفة شحن", created_flag is True and job_id == "JOB-260911-0001")
    again, created2 = store.create_job({
        "jobId": "JOB-260911-9999", "orderId": "SHN-260911-AB12", "idempotencyKey": "SHN-260911-AB12"})
    check("idempotency_key منع وظيفة مكررة", created2 is False and again == "JOB-260911-0001")

    store.update_job(job_id, "processing", attempts=1, progress=55)
    store.add_event(job_id, "processing", "attempt 1")
    store.update_job(job_id, "delivered", attempts=1, progress=100, provider_ref="PRV-DEMO-1234")
    store.add_event(job_id, "delivered", "تم الشحن")
    store.update_order_status("SHN-260911-AB12", "delivered", {"status": "delivered", "attempts": 1, "progress": 100, "providerRef": "PRV-DEMO-1234"})

    job = store.get_job(job_id)
    check("حالة الوظيفة اتحدّثت لـ delivered", job and job["status"] == "delivered")
    check("مرجع المزود اتخزّن", job and job["providerRef"] == "PRV-DEMO-1234")
    check("الـ timeline فيه 3 أحداث على الأقل", job and len(job["timeline"]) >= 3)
    check("تاريخ التسليم اتسجّل", job and job["delivered_at"] is not None)

    full = store.get_order("SHN-260911-AB12")
    check("العرض v_orders_full بيرجّع بيانات العميل", full and full["customer_name"] == "أحمد محمد")
    check("العرض بيربط الدولة (EG)", full and full["country_ar"] == "مصر")
    check("العرض بيربط حالة الشحن", full and full["topup_status"] == "delivered")

    st = store.stats()
    check("الإيراد المحصّل = 220 جنيه", abs(float(st["revenue_egp"]) - 220) < 0.001)
    check("عدد الأوردرات = 1", st["orders"] == 1)
    check("تقرير أعلى الألعاب فيه PUBG", bool(st["top_games"]) and st["top_games"][0]["game"] == "pubg")
    check("نسبة نجاح الشحن = 100%", bool(st["topup_success"]) and st["topup_success"][0]["success_rate"] == 100.0)

    jsonl = os.path.join(tmpdir, "orders.jsonl")
    with open(jsonl, "w", encoding="utf-8") as fh:
        fh.write(json.dumps({"jobId": "JOB-OLD-1", "orderId": "SHN-OLD-1", "status": "delivered",
                             "attempts": 1, "progress": 100, "idempotencyKey": "SHN-OLD-1"}) + "\n")
        fh.write(json.dumps({"id": "SHN-OLD-1", "game": {"id": "freefire", "name": "Free Fire"},
                             "pkg": {"id": "d520", "amount": "520 جوهرة", "price": 300},
                             "payment": {"method": "wallet", "status": "paid"},
                             "total": 300, "status": "delivered"}) + "\n")
    imp = store.import_jsonl(jsonl)
    check("ترحيل orders.jsonl اشتغل", imp["lines"] == 2 and imp["jobs"] >= 1 and imp["orders"] >= 1)

    check("الـ WAL مفعّل", store.query("PRAGMA journal_mode")[0].get("journal_mode", "").lower() == "wal")
    store.close()

    print("")
    if failed:
        print("FAIL (%d فشل من %d)" % (len(failed), len(failed) + len(passed)))
        for f in failed:
            print("   - " + f)
        return 1
    print("PASS (%d اختبار)" % len(passed))
    return 0


# =========================================================
#  تقرير سريع للتيرمينال
# =========================================================
def print_report(store):
    st = store.stats()
    print("=" * 56)
    print("  شحنلي | تقرير قاعدة البيانات")
    print("=" * 56)
    print("  الأوردرات      : %s" % st["orders"])
    print("  تم التسليم     : %s" % st["delivered"])
    print("  فشل            : %s" % st["failed"])
    print("  وظائف الشحن    : %s" % st["jobs"])
    print("  العملاء        : %s" % st["customers"])
    print("  الدول          : %s" % st["countries"])
    print("  الإيراد (ج.م)  : %s" % st["revenue_egp"])
    if st["today"]:
        print("  آخر يوم        : %s" % st["today"])
    print("-" * 56)
    print("  أعلى الألعاب:")
    for g in st["top_games"]:
        print("    • %-12s %4s أوردر · %s ج.م" % (g["game"], g["orders"], g["egp"]))
    print("-" * 56)
    print("  نجاح الشحن:")
    for t in st["topup_success"]:
        print("    • %-12s %s/%s (%s%%)" % (t.get("game"), t.get("delivered"), t.get("jobs_total"), t.get("success_rate")))
    print("=" * 56)


# =========================================================
#  CLI
# =========================================================
def main(argv=None):
    parser = argparse.ArgumentParser(description="شحنلي — طبقة تخزين SQL")
    parser.add_argument("--db", default=DEFAULT_DB, help="مسار ملف SQLite (افتراضي shahnly.db)")
    parser.add_argument("--url", default="", help="رابط Postgres/MySQL (اختياري)")
    parser.add_argument("--init", action="store_true", help="إنشاء/ترقية الجداول")
    parser.add_argument("--seed", action="store_true", help="تعبئة الدول والعملات من countries.js")
    parser.add_argument("--selftest", action="store_true", help="اختبارات ذاتية (بدون شبكة)")
    parser.add_argument("--report", action="store_true", help="تقرير سريع")
    parser.add_argument("--import-jsonl", dest="import_jsonl", default="", help="ترحيل ملف orders.jsonl")
    parser.add_argument("--query", default="", help="تنفيذ استعلام SQL وطباعة الناتج JSON")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args(argv)

    if args.selftest:
        return run_selftest()

    store = SqlStore(db_path=args.db, url=args.url, verbose=args.verbose)
    code = 0
    try:
        if args.init or not any([args.seed, args.report, args.import_jsonl, args.query]):
            created = store.migrate()
            print("✅ المخطط جاهز (%d عبارة) — %s" % (created, store.db_path))
        if args.seed:
            n, c = store.seed_from_js()
            print("✅ تمت التعبئة: %d دولة · %d عملة" % (n, c))
        if args.import_jsonl:
            res = store.import_jsonl(args.import_jsonl)
            print("✅ الترحيل: %s" % json.dumps(res, ensure_ascii=False))
        if args.query:
            rows = store.query(args.query)
            print(json.dumps(rows, ensure_ascii=False, indent=2))
        if args.report:
            print_report(store)
    finally:
        store.close()
    return code


if __name__ == "__main__":
    sys.exit(main())
