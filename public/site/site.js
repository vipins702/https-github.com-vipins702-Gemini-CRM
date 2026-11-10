// Demo form and the "Sign in / Open app" link. Plain script, no build step.
(function () {
  try {
    if (localStorage.getItem('flowcrm_session')) {
      document.querySelectorAll('[data-app-link]').forEach(function (a) { a.textContent = 'Open app'; a.setAttribute('href', '/app'); });
    }
  } catch (e) {}

  var form = document.querySelector('[data-demo-form]');
  if (!form) return;
  var status = form.querySelector('.form-status');
  var button = form.querySelector('button[type="submit"]');
  var say = function (text, kind) { status.textContent = text; status.className = 'form-status ' + (kind || ''); };

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = String(v).trim(); });
    var bad = null;
    form.querySelectorAll('[aria-invalid]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
    if (!data.name) bad = form.querySelector('#d-name');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) bad = form.querySelector('#d-email');
    if (bad) { bad.setAttribute('aria-invalid', 'true'); bad.focus(); say(bad.id === 'd-name' ? 'Add your name.' : 'Add a valid work e-mail.', 'err'); return; }
    Object.keys(data).forEach(function (k) { if (data[k] === '' && k !== 'website') delete data[k]; });
    button.disabled = true; say('Sending…');
    fetch('/api/public/demo-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok) { form.reset(); say('Thanks. We will reply within one working day.', 'ok'); }
        else say((res.j.details && res.j.details[0]) || res.j.error || 'That did not go through. Try again in a moment.', 'err');
      })
      .catch(function () { say('No connection. Check your internet and try again.', 'err'); })
      .then(function () { button.disabled = false; });
  });
})();
