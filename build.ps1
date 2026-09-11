# =========================================================
# شحنلي | Shahnly — بناء خدمة الشحن بلغة C++ (Windows / PowerShell)
# الاستخدام:
#   powershell -ExecutionPolicy Bypass -File build.ps1
#   powershell -ExecutionPolicy Bypass -File build.ps1 -Run        # بناء + تشغيل
#   powershell -ExecutionPolicy Bypass -File build.ps1 -Selftest   # بناء + اختبار ذاتي
# =========================================================
param(
  [switch]$Run,
  [switch]$Selftest,
  [int]$Port = 8788
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

$script = 'topup_server.cpp'
$out    = if ($IsWindows -or $env:OS -eq 'Windows_NT') { 'topup_server.exe' } else { 'topup_server' }

# 1) التأكد من وجود المترجم
$gxx = Get-Command g++ -ErrorAction SilentlyContinue
if (-not $gxx) {
  Write-Host "❌ مش لاقي g++ على الجهاز." -ForegroundColor Red
  Write-Host "   نزّل MinGW-w64 أو MSYS2 وأضف مسار bin لمتغير PATH، وبعدها شغّل السكربت تاني." -ForegroundColor Yellow
  Write-Host "   بديل: استخدم cl.exe من Visual Studio بهذا الأمر:" -ForegroundColor Yellow
  Write-Host "   cl /std:c++17 /EHsc /O2 topup_server.cpp ws2_32.lib" -ForegroundColor DarkGray
  exit 1
}

Write-Host "🔨 جاري البناء بـ $($gxx.Source) ..." -ForegroundColor Cyan
& g++ -std=c++17 -O2 -pthread -o $out $script -lws2_32
if ($LASTEXITCODE -ne 0) { Write-Host "❌ فشل البناء." -ForegroundColor Red; exit $LASTEXITCODE }
Write-Host "✅ تم البناء: $out" -ForegroundColor Green

if ($Selftest) {
  Write-Host "🧪 اختبار ذاتي..." -ForegroundColor Cyan
  & ".\$out" --selftest
  exit $LASTEXITCODE
}
if ($Run) {
  Write-Host "🚀 تشغيل على المنفذ $Port ..." -ForegroundColor Cyan
  & ".\$out" --port $Port
}
