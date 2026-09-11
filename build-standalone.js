#!/usr/bin/env node
/* =========================================================
   شحنلي | Shahnly — بانِي «ملف واحد»
   بيحوّل index.html لملف واحد مستقل (shahnly-standalone.html)
   كل الأنماط والسكربتات بتتدمج جوه الملف نفسه، فبيفتح من أي مكان
   (موبايل · واتساب · معاينة · بدون فولدر assets) بنفس الشكل بالظبط.

   الاستخدام:
     node build-standalone.js
     node build-standalone.js --page game.html        (لأي صفحة تانية)
     node build-standalone.js --out my-file.html

   ملاحظات:
   - الخطوط من Google Fonts بتحتاج إنترنت؛ بدون إنترنت بيفتكس على خط النظام.
   - الصفحة المدمجة بتشتغل بالكامل أوفلاين (مفيش assets خارجية خالص).
   ========================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const args = process.argv.slice(2);

function argValue(flag, fallback) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const page = argValue('--page', 'index.html');
const out = argValue('--out', 'shahnly-standalone.html');

function resolveAsset(href) {
  const clean = href.split('?')[0].split('#')[0];
  return path.join(ROOT, clean);
}

function readAsset(href) {
  const file = resolveAsset(href);
  if (!fs.existsSync(file)) {
    console.warn('⚠️  مش لاقي الملف: ' + href + ' — هسيبه زي ما هو');
    return null;
  }
  return fs.readFileSync(file, 'utf8');
}

function escapeClosing(code, tag) {
  // منع كسر الـ HTML لو الكود فيه </script> أو </style>
  return code.replace(new RegExp('</' + tag, 'gi'), '<\\/' + tag);
}

const pagePath = path.join(ROOT, page);
if (!fs.existsSync(pagePath)) {
  console.error('❌ مش لاقي الصفحة: ' + page);
  process.exit(1);
}

let html = fs.readFileSync(pagePath, 'utf8');

/* 1) دمج ملفات CSS */
let cssInlined = 0;
html = html.replace(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi, (match, href) => {
  const css = readAsset(href);
  if (!css) return match;
  cssInlined++;
  return '<style>\n' + escapeClosing(css, 'style') + '\n</style>';
});

/* 2) دمج ملفات JS (مع الحفاظ على الترتيب) */
let jsInlined = 0;
html = html.replace(/<script[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (match, src) => {
  const js = readAsset(src);
  if (!js) return match;
  jsInlined++;
  return '<script>\n' + escapeClosing(js, 'script') + '\n</script>';
});

/* 3) لوجو الأيقونة بيستخدم SVG داخل data URI — بنسيبه زي ما هو */

/* 4) تعليق توضيحي في أول الملف */
const banner = '<!-- الملف ده نسخة مستقلة (single file) من ' + page + ' — كل CSS/JS مدمج جواه. -->\n';
html = html.replace(/<!DOCTYPE html>/i, '<!DOCTYPE html>\n' + banner);

const outPath = path.join(ROOT, out);
fs.writeFileSync(outPath, html, 'utf8');

const sizeKb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
console.log('✅ تم إنشاء: ' + out);
console.log('   الصفحة     : ' + page);
console.log('   ملفات CSS  : ' + cssInlined);
console.log('   ملفات JS   : ' + jsInlined);
console.log('   الحجم      : ' + sizeKb + ' KB');
console.log('   دوس عليه دبل كليك — هيفتح من أي مكان بنفس الشكل.');
