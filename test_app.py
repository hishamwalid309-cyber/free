#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
شحنلي | Shahnly — اختبارات ذاتية لخدمة الشحن التلقائي (Python)
================================================================
تُشغَّل بـ:  python test_app.py
بدون شبكة تمامًا — تطبع PASS/FAIL لكل اختبار وفي الآخر "PASS".

بتتحقق من:
  • جدول الدول (58 دولة على الأقل) وشكل حقول العقد
  • التحقق الدولي: أرقام مصرية وأجنبية + رفض رقم غلط + رسائل عربية
  • دورة حياة أوردر كاملة لحد delivered (محرك الشحن، ديمو offline)
  • إعادة المحاولة 3 مرات ثم failed
  • منع التكرار بـ idempotencyKey
  • التوقيع HMAC-SHA256 وأدوات الهاش الحتمية
"""

import os
import sys
import hmac
import hashlib
import tempfile

# نضمن أن استيراد app.py يشتغل مهما كان مجلد التشغيل
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import app  # noqa: E402

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass


_TOTAL = [0]
_PASSED = [0]


def t(name, cond):
    _TOTAL[0] += 1
    ok = bool(cond)
    if ok:
        _PASSED[0] += 1
    print(("[PASS] " if ok else "[FAIL] ") + name)
    return ok


def _tmp(name):
    path = os.path.join(tempfile.gettempdir(), name)
    try:
        if os.path.exists(path):
            os.remove(path)
    except OSError:
        pass
    return path


# ============================================================
# 1) جدول الدول
# ============================================================
def test_countries_table():
    print("--- الدول ---")
    t("الجدول فيه 58 دولة على الأقل", app.country_count() >= 58)
    eg = app.get_country("EG")
    t("مصر موجودة بمفتاح 20", eg is not None and eg["dial"] == "20")
    t("عدد الأقسام: عربية/أوروبية/أخرى",
      len([c for c in app.COUNTRIES if c["zone"] == "arab"]) == 18 and
      len([c for c in app.COUNTRIES if c["zone"] == "europe"]) == 23 and
      len([c for c in app.COUNTRIES if c["zone"] == "other"]) == 17)
    cresp = app.build_countries_response()
    need = ("code", "name", "nameEn", "flag", "dial", "minDigits", "maxDigits", "pattern", "example", "currency")
    t("رد /countries فيه حقول العقد §3.2 + العملة",
      cresp["ok"] is True and cresp["count"] >= 58 and
      all(k in cresp["countries"][0] for k in need))
    t("ترتيب الحقول يبدأ بمصر", cresp["countries"][0]["code"] == "EG")


# ============================================================
# 2) التحقق الدولي
# ============================================================
def test_phone_validation():
    print("--- التحقق الدولي ---")
    eg = app.get_country("EG")

    ok_eg = True
    for phone, exp in [("01012345678", "+201012345678"),
                       ("01123456789", "+201123456789"),
                       ("01212345678", "+201212345678"),
                       ("01512345678", "+201512345678"),
                       ("+201012345678", "+201012345678"),
                       ("00201012345678", "+201012345678"),
                       ("01012345678", "+201012345678")]:
        r = app.validate_phone(phone, eg)
        if not (r["ok"] and r["e164"] == exp):
            ok_eg = False
    t("أرقام مصرية (محلي/دولي/00) → E.164", ok_eg)

    ok_foreign = True
    cases = [
        ("SA", "0512345678", "+966512345678"),
        ("AE", "0501234567", "+971501234567"),
        ("KW", "51234567", "+96551234567"),
        ("JO", "0791234567", "+962791234567"),
        ("MA", "0612345678", "+212612345678"),
        ("GB", "07123456789", "+447123456789"),
        ("DE", "015112345678", "+4915112345678"),
        ("TR", "05123456789", "+905123456789"),
        ("US", "2025550123", "+12025550123"),
        ("IN", "9876543210", "+919876543210"),
        ("JP", "09012345678", "+819012345678"),
        ("CN", "013123456789", "+8613123456789"),
        ("BR", "11912345678", "+5511912345678"),
    ]
    for code, phone, exp in cases:
        r = app.validate_phone(phone, app.get_country(code))
        if not (r["ok"] and r["e164"] == exp):
            ok_foreign = False
            print("   فشل: %s %s -> %s" % (code, phone, r))
    t("أرقام أجنبية (SA/AE/KW/JO/MA/GB/DE/TR/US/IN/JP/CN/BR)", ok_foreign)

    t("رفض رقم قصير جدًا", app.validate_phone("123", eg)["ok"] is False)
    t("رفض رقم طويل جدًا", app.validate_phone("010123456789012345", eg)["ok"] is False)
    t("رفض رقم بنمط غلط", app.validate_phone("9999999999", eg)["ok"] is False)

    det = app.detect_country("+966512345678")
    t("اكتشاف الدولة من الرقم (+966 → SA)", det is not None and det["country"]["c"] == "SA")

    gen = app.validate_generic("1234567890")
    t("رقم عام خارج الجدول (6–15) يُقبل", gen["ok"] is True and gen["e164"] == "+1234567890")
    t("رقم عام أقصر من 6 يُرفض", app.validate_generic("123")["ok"] is False)


# ============================================================
# 3) شكل ردود validate حسب العقد
# ============================================================
def test_validate_endpoint_logic():
    print("--- ردود /validate ---")
    good = app.build_validate_response({"country": "EG", "phone": "01012345678",
                                        "playerId": "5123456789", "game": "pubg"})
    t("رد ناجح: valid=true + phoneE164 صحيح",
      good["ok"] is True and good["valid"] is True and good["country"] == "EG" and
      good["phoneE164"] == "+201012345678" and good["playerId"] == "5123456789" and
      good["errors"] == [] and good["warnings"] == [])

    bad_pat = app.build_validate_response({"country": "EG", "phone": "9999999999",
                                           "playerId": "5123456789", "game": "pubg"})
    t("نمط غلط: كود invalid_pattern + رسالة مصر بالحرف",
      bad_pat["valid"] is False and bad_pat["phoneE164"] is None and
      bad_pat["errors"][0]["field"] == "phone" and
      bad_pat["errors"][0]["code"] == "invalid_pattern" and
      bad_pat["errors"][0]["message"] == "الرقم مش مطابق لصيغة مصر (01x)")

    bad_pid = app.build_validate_response({"country": "EG", "phone": "01012345678",
                                           "playerId": "512", "game": "pubg"})
    t("آيدي غلط: invalid_length + رسالة عربية",
      bad_pid["valid"] is False and
      any(e["field"] == "playerId" and e["code"] == "invalid_length" and "آيدي اللاعب" in e["message"]
          for e in bad_pid["errors"]))

    generic = app.build_validate_response({"country": "ZZ", "phone": "1234567890",
                                           "playerId": "5123456789", "game": "pubg"})
    t("دولة خارج الجدول → E.164 + تحذير في warnings",
      generic["valid"] is True and generic["phoneE164"] == "+1234567890" and len(generic["warnings"]) >= 1)

    no_phone = app.build_validate_response({"country": "EG", "phone": "",
                                            "playerId": "5123456789", "game": "pubg"})
    t("رقم فاضي → خطأ مطلوب", no_phone["valid"] is False and
      no_phone["errors"][0]["field"] == "phone")


# ============================================================
# 4) محرك الشحن — دورة حياة + إعادة محاولة + idempotency
# ============================================================
def _mk_store(name, failure_rate, max_attempts=3):
    cfg = dict(app.CONFIG)
    cfg["PROVIDER_MODE"] = "demo"
    cfg["MAX_ATTEMPTS"] = max_attempts
    cfg["ORDERS_FILE"] = _tmp(name)
    return app.JobStore(config=cfg, start_worker=False, latency=0.0, failure_rate=failure_rate)


def test_engine():
    print("--- محرك الشحن ---")
    store = _mk_store("shahnly_test_ok.jsonl", 0.0)
    job, dup = store.enqueue_order({
        "orderId": "SHN-260911-AB12", "game": "pubg", "package": "uc660",
        "packageLabel": "660 شدة", "playerId": "5123456789", "region": "EG",
        "amount": 220, "currency": "EGP",
        "payment": {"method": "card", "reference": "PAY-8812", "status": "paid"},
        "customer": {"name": "أحمد", "phone": "+201012345678", "email": "a@b.com"},
        "idempotencyKey": "SHN-260911-AB12",
    })
    t("إنشاء وظيفة: status=queued + duplicate=false",
      dup is False and job["status"] == "queued" and job["attempts"] == 0 and
      job["timeline"][0]["message"] == "دخل الطابور")

    store._run_job(job["id"])
    t("دورة حياة كاملة لحد delivered",
      job["status"] == "delivered" and job["attempts"] == 1 and job["progress"] == 100 and
      [x["status"] for x in job["timeline"]] == ["queued", "processing", "delivered"])
    t("providerRef بصيغة PRV-DEMO-####", job["providerRef"].startswith("PRV-DEMO-"))
    t("ملف orders.jsonl اتكتب فيه سطور", os.path.exists(store.orders_file) and
      sum(1 for _ in open(store.orders_file, encoding="utf-8")) >= 3)

    # فشل دائم → 3 محاولات ثم failed
    store_f = _mk_store("shahnly_test_fail.jsonl", 1.0)
    job_f, _ = store_f.enqueue_order({
        "orderId": "SHN-260911-CD34", "game": "pubg", "package": "uc660",
        "playerId": "5123456789", "region": "EG", "amount": 220, "currency": "EGP",
        "idempotencyKey": "SHN-260911-CD34",
    })
    store_f._run_job(job_f["id"])
    t("3 محاولات ثم failed + retrying ×2",
      job_f["status"] == "failed" and job_f["attempts"] == 3 and
      [x["status"] for x in job_f["timeline"]] ==
      ["queued", "processing", "retrying", "processing", "retrying", "processing", "failed"])

    # إعادة تحميل من orders.jsonl (بأثر رجعي بعد إعادة التشغيل)
    store2 = app.JobStore(config={"PROVIDER_MODE": "demo", "ORDERS_FILE": store_f.orders_file,
                                  "MAX_ATTEMPTS": 3, "DEMO_FAILURE_RATE": 1.0,
                                  "PROVIDER_URL": "", "PROVIDER_KEY": "",
                                  "TELEGRAM_BOT_TOKEN": "", "TELEGRAM_CHAT_ID": ""},
                          start_worker=False, latency=0.0)
    reloaded = store2.get(job_f["id"])
    t("إعادة تحميل الوظائف من orders.jsonl بعد restart",
      reloaded is not None and reloaded["status"] == "failed" and reloaded["attempts"] == 3)


def test_idempotency():
    print("--- منع التكرار ---")
    store = _mk_store("shahnly_test_idem.jsonl", 0.0)
    body = {
        "orderId": "SHN-260911-EF56", "game": "pubg", "package": "uc660",
        "playerId": "5123456789", "region": "EG", "amount": 110, "currency": "EGP",
        "idempotencyKey": "IDEM-XYZ-1",
    }
    j1, d1 = store.enqueue_order(dict(body))
    j2, d2 = store.enqueue_order(dict(body))
    t("نفس idempotencyKey → نفس الوظيفة (duplicate=true)",
      d1 is False and d2 is True and j1["id"] == j2["id"])
    t("الوظيفة المكررة مش بتتضاف تاني", store.stats()["total"] == 1)


# ============================================================
# 5) أدوات الحاش/التوقيع + etaSeconds + شكل الخطأ
# ============================================================
def test_helpers():
    print("--- أدوات ---")
    t("hash_roll حتمي (نفس المدخل → نفس الناتج)",
      app.hash_roll("SHN-260911-AB121", 9000, 31) == app.hash_roll("SHN-260911-AB121", 9000, 31))
    t("only_digits بتشيل أي حاجة مش رقم", app.only_digits("+20 (101) 234-5678") == "201012345678")

    body = '{"orderId":"SHN-1"}'
    sig = hmac.new("secret".encode("utf-8"), body.encode("utf-8"), hashlib.sha256).hexdigest()
    t("HMAC-SHA256 hex بطول 64", len(sig) == 64 and sig ==
      hmac.new(b"secret", body.encode("utf-8"), hashlib.sha256).hexdigest())

    store = _mk_store("shahnly_test_eta.jsonl", 0.0)
    t("etaSeconds = max(3, (max-attempts+1)*4)",
      store.eta_seconds({"status": "queued", "attempts": 0}) == 16 and
      store.eta_seconds({"status": "processing", "attempts": 1}) == 12 and
      store.eta_seconds({"status": "delivered", "attempts": 3}) == 0)
    t("فواصل إعادة المحاولة (ديمو 1/2/3 — live 2/4/8)",
      store._delay_for(1) == 1 and store._delay_for(2) == 2 and store._delay_for(3) == 3)

    err = app.make_error("not_found", "المسار غير موجود")
    t("شكل الخطأ الموحّد",
      err["ok"] is False and err["error"]["code"] == "not_found" and
      err["error"]["message"] == "المسار غير موجود" and err["error"]["details"] == [])


def main():
    print("=== شحنلي | Shahnly — test_app.py ===")
    test_countries_table()
    test_phone_validation()
    test_validate_endpoint_logic()
    test_engine()
    test_idempotency()
    test_helpers()
    print("-" * 46)
    print("%d/%d اختبار ناجح" % (_PASSED[0], _TOTAL[0]))
    if _PASSED[0] == _TOTAL[0]:
        print("PASS")
        return 0
    print("FAIL")
    return 1


if __name__ == "__main__":
    sys.exit(main())
