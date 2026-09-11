/* =========================================================
   شحنلي | Shahnly — فورم التواصل
   التحقق ثم إرسال الرسالة على واتساب (ونسخة بريد كبديل)
   ========================================================= */
(function () {
  'use strict';
  var S = window.SHN;
  var CFG = S.CFG;
  var send = document.getElementById('cn-send');
  if (!send) return;

  var nameEl = document.getElementById('cn-name');
  var phoneEl = document.getElementById('cn-phone');
  var emailEl = document.getElementById('cn-email');
  var subjEl = document.getElementById('cn-subject');
  var msgEl = document.getElementById('cn-msg');

  function subjectLabel() {
    var opt = subjEl.options[subjEl.selectedIndex];
    return opt ? opt.textContent : '';
  }

  function compose() {
    return [
      S.T('cn.msgTitle'),
      '',
      S.T('ck.name') + ': ' + nameEl.value.trim(),
      S.T('cn.phoneOpt') + ': ' + (phoneEl.value.trim() || '—'),
      'Email: ' + (emailEl.value.trim() || '—'),
      S.T('cn.subject') + ': ' + subjectLabel(),
      '',
      msgEl.value.trim(),
      '',
      '— ' + (CFG.brand.name || '') + ' · ' + (CFG.brand.nameEn || '')
    ].join('\n');
  }

  function mailtoHref() {
    return 'mailto:' + (CFG.brand.email || '') +
      '?subject=' + encodeURIComponent('[Shahnly] ' + subjectLabel()) +
      '&body=' + encodeURIComponent(compose());
  }

  /* رابط البريد في الكارت الجانبي */
  var mailto = document.getElementById('cn-mailto');
  if (mailto) mailto.setAttribute('href', 'mailto:' + (CFG.brand.email || ''));

  function validate() {
    var good = true;

    if (nameEl.value.trim().length < 2) { S.markError(nameEl, true, S.T('ck.err.name')); good = false; } else S.markError(nameEl, false);

    var ev = emailEl.value.trim();
    if (!ev || !S.validEmail(ev)) { S.markError(emailEl, true, S.T('ck.err.email')); good = false; } else S.markError(emailEl, false);

    var pv = phoneEl.value.trim();
    if (pv) {
      var r = window.COUNTRIES ? COUNTRIES.validate(pv, COUNTRIES.active().c) : { ok: true };
      if (!r.ok) { S.markError(phoneEl, true, S.T('ck.err.phone', { ex: COUNTRIES.active().ex, dial: '+' + COUNTRIES.active().dial })); good = false; }
      else S.markError(phoneEl, false);
    } else S.markError(phoneEl, false);

    if (msgEl.value.trim().length < 10) { S.markError(msgEl, true, S.T('cn.err.msg')); good = false; } else S.markError(msgEl, false);

    return good;
  }

  send.addEventListener('click', function () {
    if (!validate()) { S.toast(S.T('gp.toast.review'), 'err'); return; }
    var text = compose();
    var url = 'https://wa.me/' + (CFG.brand.whatsapp || '') + '?text=' + encodeURIComponent(text);

    /* نسخة للنسخ اليدوي لو المتصفح منع فتح النافذة */
    S.copyText(text, S.T('cn.copied'));

    var win = window.open(url, '_blank', 'noopener');
    if (!win) {
      S.toast(S.T('cn.blocked'), 'info');
      var link = document.getElementById('cn-fallback');
      if (link) { link.setAttribute('href', url); link.classList.remove('hidden'); }
    }
    S.toast(S.T('cn.sent'), 'ok');

    document.getElementById('cn-form-ok') && document.getElementById('cn-form-ok').remove();
    var note = document.createElement('div');
    note.className = 'notice notice-accent';
    note.id = 'cn-form-ok';
    note.style.marginTop = '16px';
    note.innerHTML = '<strong>' + S.esc(S.T('cn.sentT')) + '</strong>' +
      S.esc(S.T('cn.sentD')) +
      '<div class="row" style="margin-top:10px">' +
        '<a class="btn btn-ghost btn-sm" href="' + url + '" target="_blank" rel="noopener" id="cn-fallback">' + S.esc(S.T('cn.openWa')) + '</a>' +
        '<a class="btn btn-ghost btn-sm" href="' + mailtoHref() + '">' + S.esc(S.T('cn.sendMail')) + '</a>' +
      '</div>';
    send.parentNode.insertBefore(note, send.nextSibling);
  });
})();
