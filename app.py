#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
شحنلي | Shahnly — خدمة الشحن التلقائي (Python)
================================================
تنفيذ كامل للعقد الموحّد الموجود في ARCHITECTURE.md:

  • الحالات: queued → processing → retrying → delivered | failed  (+ review)
  • 3 محاولات بفواصل تصاعدية: live 2s/4s/8s  —  demo 1s/2s/3s
  • idempotencyKey يمنع تكرار الشحن لنفس الأوردر
  • تحقق دولي للأرقام: مصر + 58 دولة (نفس جدول assets/js/countries.js)
    وأي دولة خارج الجدول تُقبل بصيغة E.164 (6–15 رقم) مع تحذير في warnings
  • المزوّد: demo (محاكاة بنسبة فشل) أو live (POST + هيدر X-Signature = HMAC-SHA256)
  • تخزين append-only في orders.jsonl (سطر JSON لكل تغيير حالة) + سجل في الذاكرة
  • إشعار تليجرام اختياري (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)

مكتبة Python القياسية فقط — بدون أي pip/npm.

التشغيل:
    python app.py --port 8787
    python app.py --selftest
"""

import os
import re
import sys
import json
import time
import hmac
import queue
import argparse
import tempfile
import hashlib
import threading
import urllib.request
import urllib.error
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SERVICE_NAME = "shahnly-topup-py"
VERSION = "1.0.0"
START_TIME = time.time()


# ============================================================
#  متغيرات البيئة (نفس جدول ARCHITECTURE.md §5)
# ============================================================
def _env_str(key, default=""):
    v = os.environ.get(key)
    if v is None:
        return default
    return v


def _env_int(key, default):
    try:
        return int(str(os.environ.get(key, default)).strip())
    except (TypeError, ValueError):
        return int(default)


def _env_float(key, default):
    try:
        return float(str(os.environ.get(key, default)).strip())
    except (TypeError, ValueError):
        return float(default)


def load_config():
    mode = _env_str("PROVIDER_MODE", "demo").strip().lower()
    if mode not in ("demo", "live"):
        mode = "demo"
    return {
        "PORT": _env_int("PORT", 8787),
        "HOST": _env_str("HOST", "127.0.0.1").strip() or "127.0.0.1",
        "PROVIDER_MODE": mode,
        "PROVIDER_URL": _env_str("PROVIDER_URL", "").strip(),
        "PROVIDER_KEY": _env_str("PROVIDER_KEY", ""),
        "DEMO_FAILURE_RATE": _env_float("DEMO_FAILURE_RATE", 0.05),
        "MAX_ATTEMPTS": max(1, _env_int("MAX_ATTEMPTS", 3)),
        "ORDERS_FILE": _env_str("ORDERS_FILE", "orders.jsonl") or "orders.jsonl",
        "TELEGRAM_BOT_TOKEN": _env_str("TELEGRAM_BOT_TOKEN", "").strip(),
        "TELEGRAM_CHAT_ID": _env_str("TELEGRAM_CHAT_ID", "").strip(),
        "QUEUE_LIMIT": _env_int("QUEUE_LIMIT", 500),
    }


CONFIG = load_config()


# ============================================================
#  أدوات عامة
# ============================================================
def now_iso():
    """وقت UTC بصيغة ISO-8601 مع لاحقة Z (زي ما الواجهة الأمامية بتتوقع)."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def only_digits(value):
    """زي digits() في countries.js — بتشيل أي حاجة مش رقم إنجليزي 0-9."""
    s = "" if value is None else str(value)
    return "".join(ch for ch in s if "0" <= ch <= "9")


def safe_json_bytes(obj):
    return json.dumps(obj, ensure_ascii=False).encode("utf-8")


def hash_roll(seed, length, base, start=0):
    """
    نفس دالة الهاش الحتمية المستخدمة في topup.js:
      n = (n * base + ord(ch)) % length   بداية من start
    """
    n = start
    for ch in seed:
        n = (n * base + ord(ch)) % length
    return n


# ============================================================
#  جدول الدول والعملات — منقول بالكامل من assets/js/countries.js
#  (مصر + 58 دولة: 18 عربية + 23 أوروبية + 17 أخرى)
#  pat = نمط الرقم المحلي (يُطبَّق بعد تجريد الأصفار البادئة)
#  cur.rate = كام وحدة من العملة تساوي 1 جنيه مصري (تجريبي)
# ============================================================
COUNTRIES = [
    # ---------------- الدول العربية (18) ----------------
    {"c": "EG", "ar": "مصر", "en": "Egypt", "f": "\U0001F1EA\U0001F1EC", "dial": "20", "min": 10, "max": 10,
     "pat": r"^1[0125]\d{8}$", "ex": "01012345678", "zone": "arab", "lang": "ar",
     "cur": {"code": "EGP", "sym": "ج.م", "dec": 0, "rate": 1, "pos": "after"}},
    {"c": "SA", "ar": "السعودية", "en": "Saudi Arabia", "f": "\U0001F1F8\U0001F1E6", "dial": "966", "min": 9, "max": 9,
     "pat": r"^5\d{8}$", "ex": "0512345678", "zone": "arab", "lang": "ar",
     "cur": {"code": "SAR", "sym": "ر.س", "dec": 2, "rate": 0.0763, "pos": "after"}},
    {"c": "AE", "ar": "الإمارات", "en": "United Arab Emirates", "f": "\U0001F1E6\U0001F1EA", "dial": "971", "min": 9, "max": 9,
     "pat": r"^5[024568]\d{7}$", "ex": "0501234567", "zone": "arab", "lang": "ar",
     "cur": {"code": "AED", "sym": "د.إ", "dec": 2, "rate": 0.0746, "pos": "after"}},
    {"c": "KW", "ar": "الكويت", "en": "Kuwait", "f": "\U0001F1F0\U0001F1FC", "dial": "965", "min": 8, "max": 8,
     "pat": r"^[569]\d{7}$", "ex": "51234567", "zone": "arab", "lang": "ar",
     "cur": {"code": "KWD", "sym": "د.ك", "dec": 3, "rate": 0.0062, "pos": "after"}},
    {"c": "QA", "ar": "قطر", "en": "Qatar", "f": "\U0001F1F6\U0001F1E6", "dial": "974", "min": 8, "max": 8,
     "pat": r"^[3567]\d{7}$", "ex": "33123456", "zone": "arab", "lang": "ar",
     "cur": {"code": "QAR", "sym": "ر.ق", "dec": 2, "rate": 0.0742, "pos": "after"}},
    {"c": "BH", "ar": "البحرين", "en": "Bahrain", "f": "\U0001F1E7\U0001F1ED", "dial": "973", "min": 8, "max": 8,
     "pat": r"^[1367]\d{7}$", "ex": "36123456", "zone": "arab", "lang": "ar",
     "cur": {"code": "BHD", "sym": "د.ب", "dec": 3, "rate": 0.0077, "pos": "after"}},
    {"c": "OM", "ar": "عُمان", "en": "Oman", "f": "\U0001F1F4\U0001F1F2", "dial": "968", "min": 8, "max": 8,
     "pat": r"^[279]\d{7}$", "ex": "91234567", "zone": "arab", "lang": "ar",
     "cur": {"code": "OMR", "sym": "ر.ع", "dec": 3, "rate": 0.0078, "pos": "after"}},
    {"c": "JO", "ar": "الأردن", "en": "Jordan", "f": "\U0001F1EF\U0001F1F4", "dial": "962", "min": 9, "max": 9,
     "pat": r"^7[789]\d{7}$", "ex": "0791234567", "zone": "arab", "lang": "ar",
     "cur": {"code": "JOD", "sym": "د.أ", "dec": 2, "rate": 0.0145, "pos": "after"}},
    {"c": "LB", "ar": "لبنان", "en": "Lebanon", "f": "\U0001F1F1\U0001F1E7", "dial": "961", "min": 7, "max": 8,
     "pat": r"^[37]\d{6,7}$", "ex": "03123456", "zone": "arab", "lang": "ar",
     "cur": {"code": "LBP", "sym": "ل.ل", "dec": 0, "rate": 1815, "pos": "after"}},
    {"c": "IQ", "ar": "العراق", "en": "Iraq", "f": "\U0001F1EE\U0001F1F6", "dial": "964", "min": 10, "max": 10,
     "pat": r"^7[0-9]\d{8}$", "ex": "07701234567", "zone": "arab", "lang": "ar",
     "cur": {"code": "IQD", "sym": "د.ع", "dec": 0, "rate": 26.8, "pos": "after"}},
    {"c": "MA", "ar": "المغرب", "en": "Morocco", "f": "\U0001F1F2\U0001F1E6", "dial": "212", "min": 9, "max": 9,
     "pat": r"^[67]\d{8}$", "ex": "0612345678", "zone": "arab", "lang": "ar",
     "cur": {"code": "MAD", "sym": "د.م", "dec": 2, "rate": 0.199, "pos": "after"}},
    {"c": "DZ", "ar": "الجزائر", "en": "Algeria", "f": "\U0001F1E9\U0001F1FF", "dial": "213", "min": 9, "max": 9,
     "pat": r"^[567]\d{8}$", "ex": "0551234567", "zone": "arab", "lang": "ar",
     "cur": {"code": "DZD", "sym": "د.ج", "dec": 0, "rate": 2.72, "pos": "after"}},
    {"c": "TN", "ar": "تونس", "en": "Tunisia", "f": "\U0001F1F9\U0001F1F3", "dial": "216", "min": 8, "max": 8,
     "pat": r"^[2459]\d{7}$", "ex": "20123456", "zone": "arab", "lang": "ar",
     "cur": {"code": "TND", "sym": "د.ت", "dec": 3, "rate": 0.0605, "pos": "after"}},
    {"c": "LY", "ar": "ليبيا", "en": "Libya", "f": "\U0001F1F1\U0001F1FE", "dial": "218", "min": 9, "max": 9,
     "pat": r"^9[1-6]\d{7}$", "ex": "0912345678", "zone": "arab", "lang": "ar",
     "cur": {"code": "LYD", "sym": "د.ل", "dec": 2, "rate": 0.098, "pos": "after"}},
    {"c": "SD", "ar": "السودان", "en": "Sudan", "f": "\U0001F1F8\U0001F1E9", "dial": "249", "min": 9, "max": 9,
     "pat": r"^9\d{8}$", "ex": "0912345678", "zone": "arab", "lang": "ar",
     "cur": {"code": "SDG", "sym": "ج.س", "dec": 0, "rate": 12.3, "pos": "after"}},
    {"c": "YE", "ar": "اليمن", "en": "Yemen", "f": "\U0001F1FE\U0001F1EA", "dial": "967", "min": 9, "max": 9,
     "pat": r"^7[0-8]\d{7}$", "ex": "0712345678", "zone": "arab", "lang": "ar",
     "cur": {"code": "YER", "sym": "ر.ي", "dec": 0, "rate": 5.05, "pos": "after"}},
    {"c": "SY", "ar": "سوريا", "en": "Syria", "f": "\U0001F1F8\U0001F1FE", "dial": "963", "min": 9, "max": 9,
     "pat": r"^9\d{8}$", "ex": "0912345678", "zone": "arab", "lang": "ar",
     "cur": {"code": "SYP", "sym": "ل.س", "dec": 0, "rate": 265, "pos": "after"}},
    {"c": "PS", "ar": "فلسطين", "en": "Palestine", "f": "\U0001F1F5\U0001F1F8", "dial": "970", "min": 9, "max": 9,
     "pat": r"^5[69]\d{7}$", "ex": "0591234567", "zone": "arab", "lang": "ar",
     "cur": {"code": "ILS", "sym": "₪", "dec": 2, "rate": 0.0748, "pos": "before"}},

    # ---------------- أشهر الدول الأوروبية (23) ----------------
    {"c": "GB", "ar": "بريطانيا", "en": "United Kingdom", "f": "\U0001F1EC\U0001F1E7", "dial": "44", "min": 10, "max": 10,
     "pat": r"^7\d{9}$", "ex": "07123456789", "zone": "europe", "lang": "en",
     "cur": {"code": "GBP", "sym": "£", "dec": 2, "rate": 0.0161, "pos": "before"}},
    {"c": "IE", "ar": "أيرلندا", "en": "Ireland", "f": "\U0001F1EE\U0001F1EA", "dial": "353", "min": 9, "max": 9,
     "pat": r"^8[356789]\d{7}$", "ex": "0851234567", "zone": "europe", "lang": "en",
     "cur": {"code": "EUR", "sym": "€", "dec": 2, "rate": 0.0187, "pos": "before"}},
    {"c": "FR", "ar": "فرنسا", "en": "France", "f": "\U0001F1EB\U0001F1F7", "dial": "33", "min": 9, "max": 9,
     "pat": r"^[67]\d{8}$", "ex": "0612345678", "zone": "europe", "lang": "fr",
     "cur": {"code": "EUR", "sym": "€", "dec": 2, "rate": 0.0187, "pos": "before"}},
    {"c": "DE", "ar": "ألمانيا", "en": "Germany", "f": "\U0001F1E9\U0001F1EA", "dial": "49", "min": 10, "max": 11,
     "pat": r"^1[5-7]\d{8,9}$", "ex": "015112345678", "zone": "europe", "lang": "de",
     "cur": {"code": "EUR", "sym": "€", "dec": 2, "rate": 0.0187, "pos": "before"}},
    {"c": "ES", "ar": "إسبانيا", "en": "Spain", "f": "\U0001F1EA\U0001F1F8", "dial": "34", "min": 9, "max": 9,
     "pat": r"^[67]\d{8}$", "ex": "0612345678", "zone": "europe", "lang": "es",
     "cur": {"code": "EUR", "sym": "€", "dec": 2, "rate": 0.0187, "pos": "before"}},
    {"c": "IT", "ar": "إيطاليا", "en": "Italy", "f": "\U0001F1EE\U0001F1F9", "dial": "39", "min": 9, "max": 10,
     "pat": r"^3\d{8,9}$", "ex": "0312345678", "zone": "europe", "lang": "it",
     "cur": {"code": "EUR", "sym": "€", "dec": 2, "rate": 0.0187, "pos": "before"}},
    {"c": "PT", "ar": "البرتغال", "en": "Portugal", "f": "\U0001F1F5\U0001F1F9", "dial": "351", "min": 9, "max": 9,
     "pat": r"^9[1236]\d{7}$", "ex": "0912345678", "zone": "europe", "lang": "pt",
     "cur": {"code": "EUR", "sym": "€", "dec": 2, "rate": 0.0187, "pos": "before"}},
    {"c": "NL", "ar": "هولندا", "en": "Netherlands", "f": "\U0001F1F3\U0001F1F1", "dial": "31", "min": 9, "max": 9,
     "pat": r"^6\d{8}$", "ex": "0612345678", "zone": "europe", "lang": "en",
     "cur": {"code": "EUR", "sym": "€", "dec": 2, "rate": 0.0187, "pos": "before"}},
    {"c": "BE", "ar": "بلجيكا", "en": "Belgium", "f": "\U0001F1E7\U0001F1EA", "dial": "32", "min": 9, "max": 9,
     "pat": r"^4\d{8}$", "ex": "0470123456", "zone": "europe", "lang": "fr",
     "cur": {"code": "EUR", "sym": "€", "dec": 2, "rate": 0.0187, "pos": "before"}},
    {"c": "CH", "ar": "سويسرا", "en": "Switzerland", "f": "\U0001F1E8\U0001F1ED", "dial": "41", "min": 9, "max": 9,
     "pat": r"^7[5-9]\d{7}$", "ex": "0751234567", "zone": "europe", "lang": "de",
     "cur": {"code": "CHF", "sym": "CHF", "dec": 2, "rate": 0.0165, "pos": "before"}},
    {"c": "AT", "ar": "النمسا", "en": "Austria", "f": "\U0001F1E6\U0001F1F9", "dial": "43", "min": 10, "max": 11,
     "pat": r"^6\d{8,9}$", "ex": "06641234567", "zone": "europe", "lang": "de",
     "cur": {"code": "EUR", "sym": "€", "dec": 2, "rate": 0.0187, "pos": "before"}},
    {"c": "SE", "ar": "السويد", "en": "Sweden", "f": "\U0001F1F8\U0001F1EA", "dial": "46", "min": 9, "max": 9,
     "pat": r"^7\d{8}$", "ex": "0701234567", "zone": "europe", "lang": "en",
     "cur": {"code": "SEK", "sym": "kr", "dec": 2, "rate": 0.195, "pos": "after"}},
    {"c": "NO", "ar": "النرويج", "en": "Norway", "f": "\U0001F1F3\U0001F1F4", "dial": "47", "min": 8, "max": 8,
     "pat": r"^[49]\d{7}$", "ex": "41234567", "zone": "europe", "lang": "en",
     "cur": {"code": "NOK", "sym": "kr", "dec": 2, "rate": 0.216, "pos": "after"}},
    {"c": "DK", "ar": "الدنمارك", "en": "Denmark", "f": "\U0001F1E9\U0001F1F0", "dial": "45", "min": 8, "max": 8,
     "pat": r"^[2-9]\d{7}$", "ex": "20123456", "zone": "europe", "lang": "en",
     "cur": {"code": "DKK", "sym": "kr", "dec": 2, "rate": 0.139, "pos": "after"}},
    {"c": "FI", "ar": "فنلندا", "en": "Finland", "f": "\U0001F1EB\U0001F1EE", "dial": "358", "min": 9, "max": 10,
     "pat": r"^4\d{8,9}$", "ex": "0412345678", "zone": "europe", "lang": "en",
     "cur": {"code": "EUR", "sym": "€", "dec": 2, "rate": 0.0187, "pos": "before"}},
    {"c": "PL", "ar": "بولندا", "en": "Poland", "f": "\U0001F1F5\U0001F1F1", "dial": "48", "min": 9, "max": 9,
     "pat": r"^[5-8]\d{8}$", "ex": "512345678", "zone": "europe", "lang": "en",
     "cur": {"code": "PLN", "sym": "zł", "dec": 2, "rate": 0.0735, "pos": "after"}},
    {"c": "RO", "ar": "رومانيا", "en": "Romania", "f": "\U0001F1F7\U0001F1F4", "dial": "40", "min": 9, "max": 9,
     "pat": r"^7\d{8}$", "ex": "0712345678", "zone": "europe", "lang": "en",
     "cur": {"code": "RON", "sym": "lei", "dec": 2, "rate": 0.0935, "pos": "after"}},
    {"c": "GR", "ar": "اليونان", "en": "Greece", "f": "\U0001F1EC\U0001F1F7", "dial": "30", "min": 10, "max": 10,
     "pat": r"^69\d{8}$", "ex": "6912345678", "zone": "europe", "lang": "en",
     "cur": {"code": "EUR", "sym": "€", "dec": 2, "rate": 0.0187, "pos": "before"}},
    {"c": "CZ", "ar": "التشيك", "en": "Czechia", "f": "\U0001F1E8\U0001F1FF", "dial": "420", "min": 9, "max": 9,
     "pat": r"^[67]\d{8}$", "ex": "601123456", "zone": "europe", "lang": "en",
     "cur": {"code": "CZK", "sym": "Kč", "dec": 2, "rate": 0.445, "pos": "after"}},
    {"c": "HU", "ar": "المجر", "en": "Hungary", "f": "\U0001F1ED\U0001F1FA", "dial": "36", "min": 9, "max": 9,
     "pat": r"^[2367]\d{8}$", "ex": "0612345678", "zone": "europe", "lang": "en",
     "cur": {"code": "HUF", "sym": "Ft", "dec": 0, "rate": 7.45, "pos": "after"}},
    {"c": "UA", "ar": "أوكرانيا", "en": "Ukraine", "f": "\U0001F1FA\U0001F1E6", "dial": "380", "min": 9, "max": 9,
     "pat": r"^[3-9]\d{8}$", "ex": "0501234567", "zone": "europe", "lang": "ru",
     "cur": {"code": "UAH", "sym": "₴", "dec": 2, "rate": 0.85, "pos": "after"}},
    {"c": "RU", "ar": "روسيا", "en": "Russia", "f": "\U0001F1F7\U0001F1FA", "dial": "7", "min": 10, "max": 10,
     "pat": r"^9\d{9}$", "ex": "09123456789", "zone": "europe", "lang": "ru",
     "cur": {"code": "RUB", "sym": "₽", "dec": 2, "rate": 1.62, "pos": "after"}},
    {"c": "TR", "ar": "تركيا", "en": "Türkiye", "f": "\U0001F1F9\U0001F1F7", "dial": "90", "min": 10, "max": 10,
     "pat": r"^5\d{9}$", "ex": "05123456789", "zone": "europe", "lang": "tr",
     "cur": {"code": "TRY", "sym": "₺", "dec": 2, "rate": 0.79, "pos": "after"}},

    # ---------------- دول أخرى (17) ----------------
    {"c": "US", "ar": "أمريكا", "en": "United States", "f": "\U0001F1FA\U0001F1F8", "dial": "1", "min": 10, "max": 10,
     "pat": r"^[2-9]\d{9}$", "ex": "2025550123", "zone": "other", "lang": "en",
     "cur": {"code": "USD", "sym": "$", "dec": 2, "rate": 0.0203, "pos": "before"}},
    {"c": "CA", "ar": "كندا", "en": "Canada", "f": "\U0001F1E8\U0001F1E6", "dial": "1", "min": 10, "max": 10,
     "pat": r"^[2-9]\d{9}$", "ex": "4165550123", "zone": "other", "lang": "en",
     "cur": {"code": "CAD", "sym": "C$", "dec": 2, "rate": 0.0282, "pos": "before"}},
    {"c": "AU", "ar": "أستراليا", "en": "Australia", "f": "\U0001F1E6\U0001F1FA", "dial": "61", "min": 9, "max": 9,
     "pat": r"^4\d{8}$", "ex": "0412345678", "zone": "other", "lang": "en",
     "cur": {"code": "AUD", "sym": "A$", "dec": 2, "rate": 0.0312, "pos": "before"}},
    {"c": "IN", "ar": "الهند", "en": "India", "f": "\U0001F1EE\U0001F1F3", "dial": "91", "min": 10, "max": 10,
     "pat": r"^[6-9]\d{9}$", "ex": "9876543210", "zone": "other", "lang": "en",
     "cur": {"code": "INR", "sym": "₹", "dec": 2, "rate": 1.78, "pos": "before"}},
    {"c": "PK", "ar": "باكستان", "en": "Pakistan", "f": "\U0001F1F5\U0001F1F0", "dial": "92", "min": 10, "max": 10,
     "pat": r"^3\d{9}$", "ex": "03001234567", "zone": "other", "lang": "en",
     "cur": {"code": "PKR", "sym": "₨", "dec": 0, "rate": 5.65, "pos": "after"}},
    {"c": "NG", "ar": "نيجيريا", "en": "Nigeria", "f": "\U0001F1F3\U0001F1EC", "dial": "234", "min": 10, "max": 10,
     "pat": r"^[789]\d{9}$", "ex": "08031234567", "zone": "other", "lang": "en",
     "cur": {"code": "NGN", "sym": "₦", "dec": 0, "rate": 30.5, "pos": "before"}},
    {"c": "KE", "ar": "كينيا", "en": "Kenya", "f": "\U0001F1F0\U0001F1EA", "dial": "254", "min": 9, "max": 9,
     "pat": r"^7\d{8}$", "ex": "0712345678", "zone": "other", "lang": "en",
     "cur": {"code": "KES", "sym": "KSh", "dec": 2, "rate": 2.62, "pos": "before"}},
    {"c": "ZA", "ar": "جنوب أفريقيا", "en": "South Africa", "f": "\U0001F1FF\U0001F1E6", "dial": "27", "min": 9, "max": 9,
     "pat": r"^[6-8]\d{8}$", "ex": "0712345678", "zone": "other", "lang": "en",
     "cur": {"code": "ZAR", "sym": "R", "dec": 2, "rate": 0.375, "pos": "before"}},
    {"c": "BR", "ar": "البرازيل", "en": "Brazil", "f": "\U0001F1E7\U0001F1F7", "dial": "55", "min": 10, "max": 11,
     "pat": r"^\d{10,11}$", "ex": "11912345678", "zone": "other", "lang": "pt",
     "cur": {"code": "BRL", "sym": "R$", "dec": 2, "rate": 0.113, "pos": "before"}},
    {"c": "MX", "ar": "المكسيك", "en": "Mexico", "f": "\U0001F1F2\U0001F1FD", "dial": "52", "min": 10, "max": 10,
     "pat": r"^\d{10}$", "ex": "5512345678", "zone": "other", "lang": "es",
     "cur": {"code": "MXN", "sym": "MX$", "dec": 2, "rate": 0.375, "pos": "before"}},
    {"c": "ID", "ar": "إندونيسيا", "en": "Indonesia", "f": "\U0001F1EE\U0001F1E9", "dial": "62", "min": 9, "max": 11,
     "pat": r"^8\d{8,10}$", "ex": "08123456789", "zone": "other", "lang": "en",
     "cur": {"code": "IDR", "sym": "Rp", "dec": 0, "rate": 330, "pos": "before"}},
    {"c": "PH", "ar": "الفلبين", "en": "Philippines", "f": "\U0001F1F5\U0001F1ED", "dial": "63", "min": 10, "max": 10,
     "pat": r"^9\d{9}$", "ex": "09171234567", "zone": "other", "lang": "en",
     "cur": {"code": "PHP", "sym": "₱", "dec": 2, "rate": 1.16, "pos": "before"}},
    {"c": "MY", "ar": "ماليزيا", "en": "Malaysia", "f": "\U0001F1F2\U0001F1FE", "dial": "60", "min": 9, "max": 10,
     "pat": r"^1\d{8,9}$", "ex": "0123456789", "zone": "other", "lang": "en",
     "cur": {"code": "MYR", "sym": "RM", "dec": 2, "rate": 0.0925, "pos": "before"}},
    {"c": "SG", "ar": "سنغافورة", "en": "Singapore", "f": "\U0001F1F8\U0001F1EC", "dial": "65", "min": 8, "max": 8,
     "pat": r"^[89]\d{7}$", "ex": "81234567", "zone": "other", "lang": "en",
     "cur": {"code": "SGD", "sym": "S$", "dec": 2, "rate": 0.0272, "pos": "before"}},
    {"c": "JP", "ar": "اليابان", "en": "Japan", "f": "\U0001F1EF\U0001F1F5", "dial": "81", "min": 10, "max": 10,
     "pat": r"^[789]0\d{8}$", "ex": "09012345678", "zone": "other", "lang": "en",
     "cur": {"code": "JPY", "sym": "¥", "dec": 0, "rate": 3.05, "pos": "before"}},
    {"c": "KR", "ar": "كوريا الجنوبية", "en": "South Korea", "f": "\U0001F1F0\U0001F1F7", "dial": "82", "min": 9, "max": 10,
     "pat": r"^1\d{8,9}$", "ex": "01012345678", "zone": "other", "lang": "en",
     "cur": {"code": "KRW", "sym": "₩", "dec": 0, "rate": 27.6, "pos": "before"}},
    {"c": "CN", "ar": "الصين", "en": "China", "f": "\U0001F1E8\U0001F1F3", "dial": "86", "min": 11, "max": 11,
     "pat": r"^1[3-9]\d{9}$", "ex": "013123456789", "zone": "other", "lang": "en",
     "cur": {"code": "CNY", "sym": "¥", "dec": 2, "rate": 0.147, "pos": "before"}},
]

COUNTRY_BY_CODE = {c["c"]: c for c in COUNTRIES}


def country_count():
    return len(COUNTRIES)


# ============================================================
#  التحقق الدولي من الأرقام — منقول بالحرف من منطق countries.js
# ============================================================
def get_country(code):
    if not code:
        return None
    return COUNTRY_BY_CODE.get(str(code).strip().upper())


def to_e164(value, country):
    """يحوّل أي إدخال (محلي أو دولي) إلى صيغة E.164 — نفس toE164() في JS."""
    c = country if country else COUNTRY_BY_CODE.get("EG")
    d = only_digits(value)
    if not d:
        return ""
    if d[:2] == "00":
        d = d[2:]
    if d[:1] == "+":
        d = d[1:]
    if d.startswith(c["dial"]) and len(d) > len(c["dial"]) + 4:
        return "+" + d
    if d[:1] == "0":
        return "+" + c["dial"] + d.lstrip("0")
    if re.match(c["pat"], d):
        return "+" + c["dial"] + d
    return "+" + d


def validate_phone(value, country):
    """يرجّع {ok, reason, e164, country} — نفس validate() في countries.js."""
    c = country
    if isinstance(c, str):
        c = get_country(c)
    if not c:
        c = COUNTRY_BY_CODE.get("EG")
    d = only_digits(value)
    if not d:
        return {"ok": False, "reason": "empty", "e164": "", "country": c}
    e164 = to_e164(d, c)
    nat = d[2:] if d.startswith("00") else d
    if nat.startswith(c["dial"]) and len(nat) > len(c["dial"]) + 4:
        nat = nat[len(c["dial"]):]
    nat = nat.lstrip("0")
    if len(nat) < c["min"]:
        return {"ok": False, "reason": "short", "e164": e164, "country": c}
    if len(nat) > c["max"]:
        return {"ok": False, "reason": "long", "e164": e164, "country": c}
    if not re.match(c["pat"], nat):
        return {"ok": False, "reason": "pattern", "e164": e164, "country": c}
    return {"ok": True, "reason": "ok", "e164": e164, "country": c}


def validate_generic(value):
    """أي دولة خارج الجدول: 6–15 رقم بصيغة E.164 — نفس validateGeneric() في JS."""
    d = only_digits(value)
    if d.startswith("00"):
        d = d[2:]
    if 6 <= len(d) <= 15:
        return {"ok": True, "reason": "generic", "e164": "+" + d, "country": None}
    return {"ok": False, "reason": "short" if len(d) < 6 else "long", "e164": "", "country": None}


def detect_country(value):
    """يكتشف الدولة من الرقم لوحده — نفس detect() في JS (الأطول مفتاحًا أولًا)."""
    d = only_digits(value)
    if not d:
        return None
    for c in sorted(COUNTRIES, key=lambda x: len(x["dial"]), reverse=True):
        if not d.startswith(c["dial"]):
            continue
        r = validate_phone(d, c)
        if r["ok"]:
            return {"country": c, "e164": r["e164"]}
    return None


def phone_reason_code(reason):
    if reason == "empty":
        return "required"
    if reason in ("short", "long"):
        return "invalid_length"
    if reason == "pattern":
        return "invalid_pattern"
    return "invalid"


def phone_error_message(country, reason):
    """رسالة عربية لمطابقة العقد بالحرف (مثال مصر: 01x)."""
    if reason == "empty":
        return "رقم الهاتف مطلوب"
    if reason in ("short", "long"):
        return "عدد أرقام الرقم لازم من %d لـ %d" % (country["min"], country["max"])
    if country["c"] == "EG":
        return "الرقم مش مطابق لصيغة مصر (01x)"
    return "الرقم مش مطابق لصيغة %s (%s)" % (country["ar"], country["dial"])


# ============================================================
#  قواعد آيدي/يوزر اللاعب حسب اللعبة (مرآة assets/js/data.js)
# ============================================================
DEFAULT_PLAYER_RULE = {"type": "digits", "min": 8, "max": 12}
GAME_PLAYER_RULES = {
    "pubg": {"type": "digits", "min": 8, "max": 12},
    "freefire": {"type": "digits", "min": 8, "max": 12},
    "ff": {"type": "digits", "min": 8, "max": 12},
    "cod": {"type": "digits", "min": 8, "max": 12},
    "genshin": {"type": "digits", "min": 7, "max": 12},
    "roblox": {"type": "text", "min": 3, "max": 20},
}


def validate_player_id(player_id, game):
    """يرجّع (ok, error_obj_or_None)."""
    rule = GAME_PLAYER_RULES.get(str(game or "").strip().lower(), DEFAULT_PLAYER_RULE)
    raw = "" if player_id is None else str(player_id)
    if rule["type"] == "digits":
        d = only_digits(raw)
        if len(d) < rule["min"] or len(d) > rule["max"]:
            return False, {
                "field": "playerId",
                "code": "invalid_length",
                "message": "آيدي اللاعب لازم من %d لـ %d رقم" % (rule["min"], rule["max"]),
            }
    else:
        t = raw.strip()
        if len(t) < rule["min"] or len(t) > rule["max"]:
            return False, {
                "field": "playerId",
                "code": "invalid_length",
                "message": "اسم اللاعب لازم من %d لـ %d حرف" % (rule["min"], rule["max"]),
            }
    return True, None


def build_validate_response(body):
    """يبني رد POST /api/v1/validate بنفس شكل العقد §3.3."""
    country_code = str(body.get("country") or "").strip().upper()
    phone = body.get("phone") or ""
    player_id = "" if body.get("playerId") is None else str(body.get("playerId"))
    game = str(body.get("game") or "").strip().lower()

    errors = []
    warnings = []
    phone_e164 = None
    out_country = country_code

    if not only_digits(phone):
        errors.append({"field": "phone", "code": "required", "message": "رقم الهاتف مطلوب"})
    else:
        c = get_country(country_code)
        if c:
            r = validate_phone(phone, c)
            if r["ok"]:
                phone_e164 = r["e164"]
                out_country = c["c"]
            else:
                errors.append({
                    "field": "phone",
                    "code": phone_reason_code(r["reason"]),
                    "message": phone_error_message(c, r["reason"]),
                })
        else:
            det = detect_country(phone)
            if det:
                out_country = det["country"]["c"]
                phone_e164 = det["e164"]
                warnings.append("تم اكتشاف الدولة من الرقم: %s" % det["country"]["en"])
            else:
                g = validate_generic(phone)
                if g["ok"]:
                    phone_e164 = g["e164"]
                    warnings.append("الدولة مش في الجدول — تم قبول الرقم بصيغة E.164 دولية")
                else:
                    errors.append({
                        "field": "phone",
                        "code": phone_reason_code(g["reason"]),
                        "message": "الرقم لازم من 6 لـ 15 رقم بصيغة E.164 دولية",
                    })

    pok, perr = validate_player_id(player_id, game)
    if not pok:
        errors.append(perr)

    return {
        "ok": True,
        "valid": len(errors) == 0,
        "country": out_country or "",
        "phoneE164": phone_e164,
        "playerId": player_id,
        "errors": errors,
        "warnings": warnings,
    }


def country_pattern_display(c):
    """
    النمط المعروض للمستخدم (الشكل المحلي) — نحوله من نمط المطابقة الداخلي.
    ملاحظة: ARCHITECTURE.md §3.2 يكتب نمط مصر ^01[0125][0-9]{8}$ كنمط محلي،
    بينما countries.js يخزّن ^1[0125]\\d{8}$ للمطابقة بعد تجريد الأصفار.
    بنصدّر الاتنين: pattern (داخلي/مطابقة) + patternLocal (محلي للعرض) + pat (الخام).
    """
    internal = c["pat"]
    if c["ex"].startswith("0") and internal.startswith("^"):
        local = "^0" + internal[1:]
    else:
        local = internal
    return local.replace(r"\d", "[0-9]")


def build_countries_response():
    """يبني رد GET /api/v1/countries بنفس شكل العقد §3.2 (+ مرآة حقول countries.js)."""
    out = []
    for c in COUNTRIES:
        out.append({
            "code": c["c"],
            "name": c["ar"],
            "nameEn": c["en"],
            "flag": c["f"],
            "dial": c["dial"],
            "minDigits": c["min"],
            "maxDigits": c["max"],
            "pattern": c["pat"].replace(r"\d", "[0-9]"),
            "patternLocal": country_pattern_display(c),
            "pat": c["pat"],
            "example": c["ex"],
            "zone": c["zone"],
            "lang": c["lang"],
            "min": c["min"],
            "max": c["max"],
            "currency": c["cur"],
        })
    return {"ok": True, "count": len(out), "countries": out}


# ============================================================
#  محرّك الشحن التلقائي — طابور + thread + إعادة محاولة + timeline
# ============================================================
PROGRESS = {"queued": 5, "processing": 55, "retrying": 70, "delivered": 100, "failed": 100, "review": 0}
TERMINAL_STATES = ("delivered", "failed")


class JobStore(object):
    """سجل الوظائف: في الذاكرة + append-only في orders.jsonl."""

    def __init__(self, config=None, start_worker=True, latency=0.7, failure_rate=None):
        self.cfg = config or CONFIG
        self.mode = self.cfg.get("PROVIDER_MODE", "demo")
        self.provider_url = self.cfg.get("PROVIDER_URL", "")
        self.provider_key = self.cfg.get("PROVIDER_KEY", "")
        self.max_attempts = int(self.cfg.get("MAX_ATTEMPTS", 3))
        self.orders_file = self.cfg.get("ORDERS_FILE", "orders.jsonl")
        self.telegram_token = self.cfg.get("TELEGRAM_BOT_TOKEN", "")
        self.telegram_chat_id = self.cfg.get("TELEGRAM_CHAT_ID", "")
        self.failure_rate = self.cfg.get("DEMO_FAILURE_RATE", 0.05) if failure_rate is None else failure_rate
        self.latency = latency

        self.lock = threading.RLock()
        self.jobs = {}
        self.idem_index = {}
        self.counters = {}
        self.q = queue.Queue()
        self.worker = None
        self.worker_started = False

        # مرآة SQL (اختيارية): تتفعّل لما SHN_SQL=1 أو DB_PATH يكون مظبوط
        # مهم: لو حصل أي فشل، الخدمة بتفضل شغالة عادي على orders.jsonl
        self.sql = None
        self.sql_error = ""
        self._init_sql()

        self._load_existing()
        if start_worker:
            self.start()

    # ---------- تخزين ----------
    def _append_log(self, job):
        # المرآة على قاعدة SQL (بتشتغل حتى لو مفيش ملف JSONL)
        self._sql_mirror(job)
        if not self.orders_file:
            return
        rec = {
            "at": job["updatedAt"],
            "jobId": job["id"],
            "orderId": job["orderId"],
            "game": job["game"],
            "package": job["package"],
            "packageLabel": job["packageLabel"],
            "playerId": job["playerId"],
            "region": job["region"],
            "amount": job["amount"],
            "currency": job["currency"],
            "status": job["status"],
            "attempts": job["attempts"],
            "progress": job["progress"],
            "providerRef": job["providerRef"],
            "message": job["message"],
            "idempotencyKey": job["idempotencyKey"],
            "createdAt": job["createdAt"],
        }
        line = json.dumps(rec, ensure_ascii=False)
        with self.lock:
            try:
                with open(self.orders_file, "a", encoding="utf-8") as fh:
                    fh.write(line + "\n")
            except OSError:
                pass

    # ---------- مرآة SQL (اختيارية) ----------
    def _init_sql(self):
        """تفتح قاعدة SQL لو SHN_SQL=1 أو DB_PATH مظبوط. أي فشل ما بيأثرش على الخدمة."""
        if os.environ.get("SHN_SQL", "").lower() not in ("1", "true", "yes") and not os.environ.get("DB_PATH"):
            return
        sql_db = None
        try:
            import db as sql_db          # نفس المجلد
        except ImportError:
            try:
                from backend.python import db as sql_db  # تشغيل من جذر المشروع
            except Exception as exc:
                self.sql_error = "import_failed: %s" % exc
                return
        try:
            self.sql = sql_db.SqlStore(db_path=os.environ.get("DB_PATH") or None,
                                       url=os.environ.get("DB_URL") or "")
            self.sql.migrate()
            if not (self.sql.stats().get("countries") or 0):
                self.sql.seed_from_js()
        except Exception as exc:
            self.sql_error = "init_failed: %s" % exc
            self.sql = None

    def _sql_mirror(self, job):
        """بيكتب كل تغيير حالة في SQL: jobs + job_events + تحديث حالة الأوردر."""
        if not self.sql:
            return
        try:
            order_id = job.get("orderId")
            job_id = job.get("id")
            status = job.get("status")
            exists = self.sql.query("SELECT job_id FROM jobs WHERE job_id = ? LIMIT 1", (job_id,))
            if not exists:
                self.sql.create_job({
                    "jobId": job_id, "orderId": order_id, "status": status or "queued",
                    "attempts": job.get("attempts") or 0, "maxAttempts": self.max_attempts,
                    "progress": job.get("progress") or 0, "mode": self.mode,
                    "idempotencyKey": job.get("idempotencyKey") or order_id,
                    "createdAt": job.get("createdAt"),
                })
            self.sql.update_job(job_id, status, job.get("attempts"), job.get("progress"),
                                job.get("providerRef") or None,
                                job.get("message") if status == "failed" else None)
            self.sql.add_event(job_id, status or "processing", job.get("message") or "")
            order_status = {"queued": "paid", "processing": "processing", "retrying": "processing",
                            "delivered": "delivered", "failed": "failed"}.get(status)
            if order_id and order_status:
                self.sql.update_order_status(order_id, order_status, {
                    "status": status, "attempts": job.get("attempts"),
                    "progress": job.get("progress"), "providerRef": job.get("providerRef"),
                })
        except Exception as exc:
            self.sql_error = "mirror_failed: %s" % exc

    def _load_existing(self):
        path = self.orders_file
        if not path or not os.path.exists(path):
            return
        try:
            with open(path, "r", encoding="utf-8") as fh:
                for raw in fh:
                    raw = raw.strip()
                    if not raw:
                        continue
                    try:
                        rec = json.loads(raw)
                    except ValueError:
                        continue
                    jid = rec.get("jobId")
                    if not jid:
                        continue
                    job = self.jobs.get(jid)
                    if job is None:
                        job = {
                            "id": jid,
                            "orderId": rec.get("orderId", ""),
                            "game": rec.get("game", ""),
                            "package": rec.get("package", ""),
                            "packageLabel": rec.get("packageLabel", ""),
                            "playerId": rec.get("playerId", ""),
                            "region": rec.get("region", ""),
                            "amount": rec.get("amount", 0),
                            "currency": rec.get("currency", "EGP"),
                            "payment": None,
                            "customer": None,
                            "status": rec.get("status", "queued"),
                            "attempts": rec.get("attempts", 0),
                            "progress": rec.get("progress", 0),
                            "providerRef": rec.get("providerRef", ""),
                            "message": rec.get("message", ""),
                            "idempotencyKey": rec.get("idempotencyKey", ""),
                            "createdAt": rec.get("createdAt", rec.get("at", "")),
                            "createdAtMs": 0,
                            "updatedAt": rec.get("at", ""),
                            "timeline": [],
                        }
                        self.jobs[jid] = job
                        key = job["idempotencyKey"]
                        if key:
                            self.idem_index[key] = jid
                        parts = jid.split("-")
                        if len(parts) >= 3 and parts[1].isdigit() and parts[-1].isdigit():
                            self.counters[parts[1]] = max(self.counters.get(parts[1], 0), int(parts[-1]))
                    else:
                        job["status"] = rec.get("status", job["status"])
                        job["attempts"] = rec.get("attempts", job["attempts"])
                        job["progress"] = rec.get("progress", job["progress"])
                        job["providerRef"] = rec.get("providerRef", job["providerRef"])
                        job["message"] = rec.get("message", job["message"])
                        job["updatedAt"] = rec.get("at", job["updatedAt"])
                    job["timeline"].append({
                        "status": rec.get("status", "queued"),
                        "at": rec.get("at", ""),
                        "message": rec.get("message", ""),
                    })
        except OSError:
            pass

    # ---------- معرّفات ----------
    def _next_job_id(self):
        day = datetime.now().strftime("%y%m%d")
        with self.lock:
            n = self.counters.get(day, 0)
            while True:
                n += 1
                jid = "JOB-%s-%04d" % (day, n)
                if jid not in self.jobs:
                    break
            self.counters[day] = n
        return jid

    def _provider_ref(self, job):
        seed = "%s%d" % (job["orderId"], job["attempts"])
        n = hash_roll(seed, 9000, 31)
        tag = "LIVE" if self.mode == "live" else "DEMO"
        return "PRV-%s-%d" % (tag, 1000 + n)

    def _delay_for(self, attempt):
        base = [1, 2, 3] if self.mode == "demo" else [2, 4, 8]
        idx = max(0, min(int(attempt) - 1, len(base) - 1))
        return base[idx]

    def eta_seconds(self, job):
        if not job:
            return 0
        if job["status"] in TERMINAL_STATES:
            return 0
        left = self.max_attempts - int(job.get("attempts") or 0) + 1
        return max(3, left * 4)

    # ---------- المزوّد ----------
    def _call_provider(self, job):
        if self.mode == "live" and self.provider_url:
            return self._call_provider_live(job)
        return self._call_provider_demo(job)

    def _call_provider_demo(self, job):
        seed = "%s:%d" % (job["orderId"], job["attempts"])
        roll = hash_roll(seed, 1000, 17) / 1000.0
        if self.latency > 0:
            time.sleep(self.latency)
        ok = roll >= self.failure_rate
        ref = self._provider_ref(job)
        if ok:
            msg = "تم تنفيذ الشحن على المزود (محاكاة)"
        else:
            msg = "المزود رجع خطأ مؤقت (محاكاة)"
        return {"ok": ok, "ref": ref, "message": msg}

    def _call_provider_live(self, job):
        body = json.dumps({
            "orderId": job["orderId"],
            "game": job["game"],
            "package": job["package"],
            "playerId": job["playerId"],
            "region": job["region"],
            "attempt": job["attempts"],
        }, ensure_ascii=False)
        sig = hmac.new(self.provider_key.encode("utf-8"),
                       body.encode("utf-8"), hashlib.sha256).hexdigest()
        url = self.provider_url.rstrip("/") + "/topup/execute"
        req = urllib.request.Request(
            url, data=body.encode("utf-8"), method="POST",
            headers={"Content-Type": "application/json; charset=utf-8", "X-Signature": sig},
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                raw = resp.read().decode("utf-8", "replace")
            res = json.loads(raw) if raw else {}
            ref = res.get("providerRef") or self._provider_ref(job)
            return {"ok": res.get("ok", True) is not False,
                    "ref": ref, "message": res.get("message") or ""}
        except urllib.error.HTTPError as e:
            return {"ok": False, "ref": self._provider_ref(job),
                    "message": "provider_http_%d" % e.code}
        except Exception as e:
            return {"ok": False, "ref": self._provider_ref(job),
                    "message": "provider_error: %s" % e}

    # ---------- الإشعارات (اختياري) ----------
    def _notify(self, job):
        if not self.telegram_token or not self.telegram_chat_id:
            return
        text = ("شحنلي | Shahnly\n%s\nالأوردر: %s\nالحالة: %s\nالمحاولات: %d\nالمرجع: %s"
                % (job["id"], job["orderId"], job["status"], job["attempts"],
                   job["providerRef"] or "-"))
        payload = json.dumps({"chat_id": self.telegram_chat_id, "text": text},
                             ensure_ascii=False).encode("utf-8")
        url = "https://api.telegram.org/bot%s/sendMessage" % self.telegram_token
        try:
            req = urllib.request.Request(url, data=payload, method="POST",
                                         headers={"Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=10).read()
        except Exception:
            pass

    # ---------- تحديث الحالة ----------
    def _push(self, job, status, message):
        job["status"] = status
        job["message"] = message or ""
        job["updatedAt"] = now_iso()
        job["progress"] = PROGRESS.get(status, 0)
        job["timeline"].append({"status": status, "at": job["updatedAt"], "message": job["message"]})
        self._append_log(job)

    # ---------- التنفيذ ----------
    def _create_job(self, body, idem):
        jid = self._next_job_id()
        order_id = str(body.get("orderId") or "").strip()
        created = now_iso()
        return {
            "id": jid,
            "orderId": order_id,
            "game": str(body.get("game") or "").strip(),
            "package": str(body.get("package") or "").strip(),
            "packageLabel": str(body.get("packageLabel") or "").strip(),
            "playerId": str(body.get("playerId") or "").strip(),
            "region": str(body.get("region") or "").strip(),
            "amount": body.get("amount") or 0,
            "currency": str(body.get("currency") or "EGP").strip() or "EGP",
            "payment": body.get("payment") or None,
            "customer": body.get("customer") or None,
            "status": "queued",
            "attempts": 0,
            "progress": PROGRESS["queued"],
            "providerRef": "",
            "message": "دخل الطابور",
            "idempotencyKey": idem or order_id,
            "createdAt": created,
            "createdAtMs": int(time.time() * 1000),
            "updatedAt": created,
            "timeline": [{"status": "queued", "at": created, "message": "دخل الطابور"}],
        }

    def enqueue_order(self, body):
        """يرجّع (job, duplicate). نفس منطق منع التكرار بـ idempotencyKey."""
        idem = str(body.get("idempotencyKey") or body.get("orderId") or "").strip()
        with self.lock:
            if idem and idem in self.idem_index:
                existing = self.jobs.get(self.idem_index[idem])
                if existing is not None:
                    return existing, True
            job = self._create_job(body, idem)
            self.jobs[job["id"]] = job
            if idem:
                self.idem_index[idem] = job["id"]
        self._append_log(job)
        if self.worker_started:
            self.q.put(job["id"])
        return job, False

    def _run_job(self, job_id):
        job = self.get(job_id)
        if not job:
            return
        while True:
            if job["status"] in TERMINAL_STATES:
                return
            job["attempts"] = int(job.get("attempts") or 0) + 1
            self._push(job, "processing", "محاولة %d" % job["attempts"])
            res = self._call_provider(job)
            if res["ok"]:
                job["providerRef"] = res["ref"]
                self._push(job, "delivered", res["message"] or "تم الشحن بنجاح")
                self._notify(job)
                return
            if job["attempts"] >= self.max_attempts:
                job["providerRef"] = res["ref"]
                self._push(job, "failed", res["message"] or "فشل بعد كل المحاولات")
                self._notify(job)
                return
            self._push(job, "retrying", res["message"] or "فشل مؤقت — إعادة المحاولة")
            time.sleep(self._delay_for(job["attempts"]))

    # ---------- الاستعلام ----------
    def get(self, job_id):
        with self.lock:
            return self.jobs.get(str(job_id or "").strip())

    def find_by_idem(self, key):
        with self.lock:
            jid = self.idem_index.get(str(key or "").strip())
            return self.jobs.get(jid) if jid else None

    def list_jobs(self):
        with self.lock:
            jobs = list(self.jobs.values())
        jobs.sort(key=lambda j: j.get("createdAtMs") or 0, reverse=True)
        return jobs

    def pending_count(self):
        with self.lock:
            return sum(1 for j in self.jobs.values()
                       if j["status"] in ("queued", "processing", "retrying"))

    def stats(self):
        with self.lock:
            jobs = list(self.jobs.values())
        counts = {"total": len(jobs), "queued": 0, "processing": 0,
                  "retrying": 0, "delivered": 0, "failed": 0, "review": 0}
        for j in jobs:
            s = j["status"]
            if s in counts:
                counts[s] += 1
        return counts

    # ---------- الـ worker ----------
    def start(self):
        if self.worker_started:
            return
        self.worker_started = True
        self.worker = threading.Thread(target=self._worker_loop, name="topup-worker", daemon=True)
        self.worker.start()

    def stop(self):
        if not self.worker_started:
            return
        self.worker_started = False
        self.q.put(None)

    def _worker_loop(self):
        while True:
            job_id = self.q.get()
            if job_id is None:
                self.q.task_done()
                break
            try:
                self._run_job(job_id)
            except Exception:
                pass
            finally:
                self.q.task_done()


# ============================================================
#  خادم HTTP (مكتبة قياسية فقط)
# ============================================================
STORE = None  # يُضبط في main()
API_BASE = "/api/v1"


def make_error(code, message, details=None):
    return {"ok": False, "error": {"code": code, "message": message, "details": details or []}}


class TopupHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "ShahnlyTopUpPy/" + VERSION

    def log_message(self, fmt, *args):
        try:
            sys.stderr.write("[%s] %s\n" % (now_iso(), fmt % args))
        except Exception:
            pass

    # ---------- مرافق ----------
    def _send_json(self, http_code, payload):
        data = safe_json_bytes(payload)
        self.send_response(http_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Signature")
        self.end_headers()
        self.wfile.write(data)

    def _send_error_json(self, http_code, code, message, details=None):
        self._send_json(http_code, make_error(code, message, details))

    def _read_json(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except (TypeError, ValueError):
            length = 0
        raw = self.rfile.read(length) if length > 0 else b""
        if not raw:
            return {}
        try:
            return json.loads(raw.decode("utf-8", "replace"))
        except ValueError:
            return None

    def _path(self):
        p = self.path or "/"
        if "?" in p:
            p = p.split("?", 1)[0]
        if len(p) > 1 and p.endswith("/"):
            p = p.rstrip("/") or "/"
        return p

    # ---------- OPTIONS (CORS) ----------
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Signature")
        self.send_header("Content-Length", "0")
        self.end_headers()

    # ---------- GET ----------
    def do_GET(self):
        try:
            self._route_get()
        except Exception as e:
            self._safe_500(e)

    def _route_get(self):
        path = self._path()
        if path in (API_BASE + "/health", "/health"):
            return self._handle_health()
        if path == API_BASE + "/countries":
            return self._handle_countries()
        prefix = API_BASE + "/topup/"
        if path.startswith(prefix):
            return self._handle_job(path[len(prefix):])
        return self._send_error_json(404, "not_found", "المسار غير موجود")

    # ---------- POST ----------
    def do_POST(self):
        try:
            self._route_post()
        except Exception as e:
            self._safe_500(e)

    def _route_post(self):
        path = self._path()
        if path == API_BASE + "/validate":
            return self._handle_validate()
        if path == API_BASE + "/topup":
            return self._handle_topup()
        return self._send_error_json(404, "not_found", "المسار غير موجود")

    def _safe_500(self, exc):
        try:
            self._send_error_json(500, "provider_error", "خطأ داخلي: %s" % exc)
        except Exception:
            pass

    # ---------- المنطق ----------
    def _handle_health(self):
        stats = STORE.stats()
        payload = {
            "ok": True,
            "service": SERVICE_NAME,
            "version": VERSION,
            "uptimeSec": int(time.time() - START_TIME),
            "mode": CONFIG["PROVIDER_MODE"],
            "jobs": {
                "total": stats["total"],
                "queued": stats["queued"],
                "processing": stats["processing"],
                "delivered": stats["delivered"],
                "failed": stats["failed"],
            },
        }
        self._send_json(200, payload)

    def _handle_countries(self):
        self._send_json(200, build_countries_response())

    def _handle_validate(self):
        body = self._read_json()
        if body is None:
            return self._send_error_json(400, "invalid_json", "الجسم مش JSON صحيح")
        if not isinstance(body, dict):
            return self._send_error_json(400, "invalid_input", "حقول ناقصة (orderId/game/playerId)")
        self._send_json(200, build_validate_response(body))

    def _handle_topup(self):
        body = self._read_json()
        if body is None:
            return self._send_error_json(400, "invalid_json", "الجسم مش JSON صحيح")
        if not isinstance(body, dict):
            return self._send_error_json(400, "invalid_input", "حقول ناقصة (orderId/game/playerId)")
        order_id = str(body.get("orderId") or "").strip()
        game = str(body.get("game") or "").strip()
        player_id = str(body.get("playerId") or "").strip()
        if not order_id or not game or not player_id:
            return self._send_error_json(400, "invalid_input", "حقول ناقصة (orderId/game/playerId)")
        if STORE.pending_count() >= CONFIG["QUEUE_LIMIT"]:
            return self._send_error_json(503, "engine_busy", "الطابور ممتلي — جرّب تاني بعد شوية")
        job, duplicate = STORE.enqueue_order(body)
        payload = {
            "ok": True,
            "jobId": job["id"],
            "orderId": job["orderId"],
            "status": job["status"],
            "attempts": job["attempts"],
            "etaSeconds": STORE.eta_seconds(job),
            "duplicate": bool(duplicate),
        }
        self._send_json(200 if duplicate else 202, payload)

    def _handle_job(self, job_id):
        job = STORE.get(job_id)
        if not job:
            return self._send_error_json(404, "job_not_found", "الوظيفة مش موجودة")
        payload = {
            "ok": True,
            "jobId": job["id"],
            "orderId": job["orderId"],
            "status": job["status"],
            "attempts": job["attempts"],
            "progress": job["progress"],
            "providerRef": job["providerRef"] or "",
            "message": job["message"] or "",
            "createdAt": job["createdAt"],
            "updatedAt": job["updatedAt"],
            "timeline": job["timeline"],
        }
        self._send_json(200, payload)


# ============================================================
#  الاختبارات الذاتية — بدون شبكة، تطبع PASS/FAIL
# ============================================================
def run_selftest():
    results = []

    def check(name, ok):
        results.append((name, bool(ok)))
        print(("[PASS] " if ok else "[FAIL] ") + name)

    print("=== شحنلي | Shahnly — Python selftest ===")
    print("عدد الدول في الجدول: %d" % country_count())

    # 1) أرقام مصرية (محلي + دولي)
    eg_ok = True
    for phone, expected in [
        ("01012345678", "+201012345678"),
        ("01123456789", "+201123456789"),
        ("01212345678", "+201212345678"),
        ("01512345678", "+201512345678"),
        ("+201012345678", "+201012345678"),
        ("00201012345678", "+201012345678"),
    ]:
        r = validate_phone(phone, COUNTRY_BY_CODE["EG"])
        if not (r["ok"] and r["e164"] == expected):
            eg_ok = False
            print("   فشل مصري: %s -> %s" % (phone, r))
    check("تحقق أرقام مصرية (محلي ودولي)", eg_ok)

    # 2) أرقام أجنبية من الجدول
    foreign_ok = True
    for code, phone, expected in [
        ("SA", "0512345678", "+966512345678"),
        ("AE", "0501234567", "+971501234567"),
        ("US", "2025550123", "+12025550123"),
        ("GB", "07123456789", "+447123456789"),
        ("IN", "9876543210", "+919876543210"),
        ("TR", "05123456789", "+905123456789"),
        ("JP", "09012345678", "+819012345678"),
        ("CN", "013123456789", "+8613123456789"),
    ]:
        r = validate_phone(phone, COUNTRY_BY_CODE[code])
        if not (r["ok"] and r["e164"] == expected):
            foreign_ok = False
            print("   فشل أجنبي: %s %s -> %s" % (code, phone, r))
    check("تحقق أرقام أجنبية (SA/AE/US/GB/IN/TR/JP/CN)", foreign_ok)

    # 3) رفض رقم غلط + الرسالة العربية حسب العقد
    bad_short = validate_phone("123", COUNTRY_BY_CODE["EG"])
    check("رفض رقم غلط (قصير جدًا)", bad_short["ok"] is False and bad_short["reason"] == "short")
    bad_pat = build_validate_response({"country": "EG", "phone": "9999999999",
                                       "playerId": "5123456789", "game": "pubg"})
    check("رفض رقم بنمط غلط + رسالة مصر العربية",
          bad_pat["valid"] is False and
          bad_pat["errors"][0]["code"] == "invalid_pattern" and
          bad_pat["errors"][0]["message"] == "الرقم مش مطابق لصيغة مصر (01x)")

    # 4) آيدي لاعب غلط + رسالة عربية
    bad_pid = build_validate_response({"country": "EG", "phone": "01012345678",
                                       "playerId": "512", "game": "pubg"})
    check("رفض آيدي لاعب (512) + رسالة عربية",
          bad_pid["valid"] is False and
          bad_pid["errors"][0]["code"] == "invalid_length" and
          "آيدي اللاعب" in bad_pid["errors"][0]["message"])

    # 5) رد ناجح كامل (نفس شكل العقد)
    good = build_validate_response({"country": "EG", "phone": "01012345678",
                                    "playerId": "5123456789", "game": "pubg"})
    check("رد تحقق ناجح بالشكل المطلوب",
          good["ok"] is True and good["valid"] is True and
          good["country"] == "EG" and good["phoneE164"] == "+201012345678" and
          good["errors"] == [])

    # 6) دولة خارج الجدول → E.164 + تحذير
    generic = build_validate_response({"country": "ZZ", "phone": "1234567890",
                                       "playerId": "5123456789", "game": "pubg"})
    check("دولة خارج الجدول تُقبل بصيغة E.164 مع تحذير",
          generic["valid"] is True and generic["phoneE164"] == "+1234567890" and
          len(generic["warnings"]) >= 1)

    # 7) جدول الدول (عدد + حقول العقد)
    cresp = build_countries_response()
    need = ("code", "name", "nameEn", "flag", "dial", "minDigits", "maxDigits", "pattern", "example")
    check("جدول الدول >= 58 وبه حقول العقد",
          cresp["count"] >= 58 and
          all(k in cresp["countries"][0] for k in need) and
          cresp["countries"][0]["code"] == "EG")

    # ------- محرك الشحن (offline تمامًا) -------
    tmp_file = os.path.join(tempfile.gettempdir(), "shahnly_selftest_orders.jsonl")
    try:
        if os.path.exists(tmp_file):
            os.remove(tmp_file)
    except OSError:
        pass
    cfg = dict(CONFIG)
    cfg["PROVIDER_MODE"] = "demo"
    cfg["MAX_ATTEMPTS"] = 3
    cfg["ORDERS_FILE"] = tmp_file

    # 8) دورة حياة كاملة لحد delivered
    store = JobStore(config=cfg, start_worker=False, latency=0.0, failure_rate=0.0)
    job, dup = store.enqueue_order({
        "orderId": "SHN-260911-AB12", "game": "pubg", "package": "uc660",
        "packageLabel": "660 شدة", "playerId": "5123456789", "region": "EG",
        "amount": 220, "currency": "EGP",
        "payment": {"method": "card", "reference": "PAY-8812", "status": "paid"},
        "customer": {"name": "أحمد", "phone": "+201012345678", "email": "a@b.com"},
        "idempotencyKey": "SHN-260911-AB12",
    })
    store._run_job(job["id"])
    statuses = [t["status"] for t in job["timeline"]]
    check("دورة حياة كاملة لحد delivered",
          dup is False and job["status"] == "delivered" and job["attempts"] == 1 and
          statuses == ["queued", "processing", "delivered"] and
          job["providerRef"].startswith("PRV-DEMO-") and job["progress"] == 100)

    # 9) إعادة المحاولة 3 محاولات ثم failed (failure_rate = 1)
    cfg_fail = dict(cfg)
    cfg_fail["ORDERS_FILE"] = os.path.join(tempfile.gettempdir(), "shahnly_selftest_fail.jsonl")
    store_fail = JobStore(config=cfg_fail, start_worker=False, latency=0.0, failure_rate=1.0)
    job_f, _ = store_fail.enqueue_order({
        "orderId": "SHN-260911-CD34", "game": "pubg", "package": "uc660",
        "playerId": "5123456789", "region": "EG", "amount": 220, "currency": "EGP",
        "idempotencyKey": "SHN-260911-CD34",
    })
    store_fail._run_job(job_f["id"])
    fstat = [t["status"] for t in job_f["timeline"]]
    check("3 محاولات ثم failed (retrying ×2)",
          job_f["status"] == "failed" and job_f["attempts"] == 3 and
          fstat == ["queued", "processing", "retrying", "processing", "retrying", "processing", "failed"])

    # 10) منع التكرار بـ idempotencyKey
    j1, d1 = store.enqueue_order({
        "orderId": "SHN-260911-EF56", "game": "pubg", "package": "uc660",
        "playerId": "5123456789", "region": "EG", "amount": 110, "currency": "EGP",
        "idempotencyKey": "IDEM-XYZ-1",
    })
    j2, d2 = store.enqueue_order({
        "orderId": "SHN-260911-EF56", "game": "pubg", "package": "uc660",
        "playerId": "5123456789", "region": "EG", "amount": 110, "currency": "EGP",
        "idempotencyKey": "IDEM-XYZ-1",
    })
    check("منع التكرار بـ idempotencyKey", d1 is False and d2 is True and j1["id"] == j2["id"])

    # 11) الإحصاءات + etaSeconds
    stats = store_fail.stats()
    check("إحصاءات الحالات + etaSeconds",
          stats["total"] == 1 and stats["failed"] == 1 and
          store.eta_seconds({"status": "processing", "attempts": 1}) == 12 and
          store.eta_seconds({"status": "delivered", "attempts": 1}) == 0)

    passed = sum(1 for _, ok in results if ok)
    total = len(results)
    print("-" * 46)
    print("النتيجة: %d/%d PASS" % (passed, total))
    print("PASS" if passed == total else "FAIL")
    return 0 if passed == total else 1


# ============================================================
#  نقطة الدخول
# ============================================================
def build_server(host, port, store):
    global STORE
    STORE = store
    httpd = ThreadingHTTPServer((host, port), TopupHandler)
    return httpd


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="شحنلي | Shahnly — خدمة الشحن التلقائي (Python، مكتبة قياسية فقط)")
    parser.add_argument("--port", type=int, default=CONFIG["PORT"])
    parser.add_argument("--host", default=CONFIG["HOST"])
    parser.add_argument("--selftest", action="store_true",
                        help="اختبارات ذاتية بدون شبكة (تطبع PASS/FAIL)")
    args = parser.parse_args(argv)

    # ضبط ترميز المخرجات لعرض العربي على Windows بدون كسر
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

    if args.selftest:
        return run_selftest()

    global STORE
    STORE = JobStore(CONFIG, start_worker=True)
    httpd = ThreadingHTTPServer((args.host, args.port), TopupHandler)

    print("شحنلي | %s v%s" % (SERVICE_NAME, VERSION))
    print("mode=%s | port=%d | countries=%d | max_attempts=%d | orders_file=%s"
          % (CONFIG["PROVIDER_MODE"], args.port, country_count(),
             CONFIG["MAX_ATTEMPTS"], CONFIG["ORDERS_FILE"]))
    print("GET  http://%s:%d%s/health" % (args.host, args.port, API_BASE))
    print("GET  http://%s:%d%s/countries" % (args.host, args.port, API_BASE))
    print("POST http://%s:%d%s/validate" % (args.host, args.port, API_BASE))
    print("POST http://%s:%d%s/topup" % (args.host, args.port, API_BASE))
    print("GET  http://%s:%d%s/topup/{jobId}" % (args.host, args.port, API_BASE))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nإيقاف الخدمة...")
    finally:
        httpd.server_close()
        try:
            STORE.stop()
        except Exception:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
