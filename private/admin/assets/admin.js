'use strict';
/* Shared admin helpers: JSON API with CSRF, toasts, confirm modal, idle logout. */
(function () {
  const csrf = () => window.__CSRF || '';

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function api(path, { method = 'GET', body } = {}) {
    const headers = {};
    const opts = { method, headers, credentials: 'same-origin' };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    if (method !== 'GET' && method !== 'HEAD') headers['X-CSRF-Token'] = csrf();
    const r = await fetch(path, opts);
    if (r.status === 401) { location.href = '/admin/login?expired=1'; throw new Error('signed out'); }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = new Error(data.error || 'Request failed');
      err.status = r.status;
      err.errors = data.errors || {};
      throw err;
    }
    return data;
  }

  function toast(msg, kind = '') {
    let box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }

  function confirmDialog({ title, body, okLabel = 'Confirm', danger = false }) {
    return new Promise((resolve) => {
      const back = document.createElement('div');
      back.className = 'modalback';
      back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <h2>${esc(title)}</h2><p>${esc(body)}</p>
        <div class="row"><button class="btn ghost small" data-x>Cancel</button>
        <button class="btn small ${danger ? 'danger' : ''}" data-ok>${esc(okLabel)}</button></div></div>`;
      document.body.appendChild(back);
      const done = (v) => { back.remove(); resolve(v); };
      back.querySelector('[data-x]').onclick = () => done(false);
      back.querySelector('[data-ok]').onclick = () => done(true);
      back.addEventListener('click', (e) => { if (e.target === back) done(false); });
      back.querySelector('[data-ok]').focus();
    });
  }

  function fmtWhen(iso, tz) {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: tz || 'UTC', year: 'numeric', month: 'short', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      }).format(new Date(iso));
    } catch { return String(iso); }
  }

  async function initShell(active) {
    // Sidebar active link
    document.querySelectorAll('.navlink[data-nav]').forEach((a) => {
      if (a.dataset.nav === active) a.setAttribute('aria-current', 'page');
    });
    // Mobile menu
    const btn = document.querySelector('[data-menu]');
    const side = document.querySelector('[data-side]');
    const scrim = document.querySelector('[data-scrim]');
    if (btn && side) {
      btn.onclick = () => { side.classList.toggle('open'); if (scrim) scrim.classList.toggle('show', side.classList.contains('open')); };
      if (scrim) scrim.onclick = () => { side.classList.remove('open'); scrim.classList.remove('show'); };
    }
    // Session: name, CSRF, unread badge, idle timer
    try {
      const me = await api('/api/admin/me');
      window.__CSRF = me.csrf;
      document.querySelectorAll('[data-admin-name]').forEach((el) => { el.textContent = me.admin.name || me.admin.email; });
      const badge = document.querySelector('[data-unread]');
      if (badge) {
        if (me.unread > 0) { badge.textContent = me.unread; badge.hidden = false; }
        else badge.hidden = true;
      }
      startIdle(me.sessionMinutes || 30);
    } catch { /* redirected on 401 */ }
    // Logout
    document.querySelectorAll('[data-logout]').forEach((b) => {
      b.onclick = async () => {
        try { await api('/api/admin/logout', { method: 'POST' }); } catch { /* noop */ }
        location.href = '/admin/login';
      };
    });
  }

  function startIdle(minutes) {
    let t;
    const reset = () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        try { await api('/api/admin/logout', { method: 'POST' }); } catch { /* noop */ }
        location.href = '/admin/login?expired=1';
      }, minutes * 60 * 1000);
    };
    ['pointerdown', 'keydown'].forEach((ev) => addEventListener(ev, reset, { passive: true }));
    reset();
  }

  window.Admin = { api, toast, confirmDialog, esc, fmtWhen, initShell };
})();
