#!/usr/bin/env bash
# =========================================================
# شحنلي | Shahnly — بناء خدمة الشحن بلغة C++ (Linux / macOS)
# الاستخدام:
#   chmod +x build.sh
#   ./build.sh            # بناء فقط
#   ./build.sh --run      # بناء + تشغيل على المنفذ 8788
#   ./build.sh --selftest # بناء + اختبار ذاتي (بدون شبكة)
# =========================================================
set -euo pipefail

cd "$(dirname "$0")"

SRC="topup_server.cpp"
OUT="topup_server"

if ! command -v g++ >/dev/null 2>&1; then
  echo "❌ مش لاقي g++ — نزّل g++ (build-essential على Ubuntu، أو Xcode CLT على macOS)." >&2
  exit 1
fi

echo "🔨 جاري البناء ..."
g++ -std=c++17 -O2 -pthread -o "$OUT" "$SRC"
echo "✅ تم البناء: $OUT"

case "${1:-}" in
  --selftest) echo "🧪 اختبار ذاتي ..."; exec "./$OUT" --selftest ;;
  --run)      echo "🚀 تشغيل على المنفذ 8788 ..."; exec "./$OUT" --port 8788 ;;
  *)          exit 0 ;;
esac
