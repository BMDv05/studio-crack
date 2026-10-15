'use strict';
(function () {
  if (new URLSearchParams(location.search).get('expired')) {
    document.getElementById('expired').hidden = false;
  }
  const form = document.getElementById('login');
  const err = document.getElementById('formerr');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    err.textContent = '';
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      const r = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email.value.trim(),
          password: form.password.value,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        err.textContent = r.status === 429
          ? 'Too many attempts. Try again later.'
          : (data.error || 'Sign-in failed.');
        return;
      }
      location.href = '/admin';
    } catch {
      err.textContent = 'Network error. Try again.';
    } finally {
      btn.disabled = false;
    }
  });
})();
