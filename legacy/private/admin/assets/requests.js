'use strict';
(function () {
  const { api, esc, fmtWhen, initShell, toast } = window.Admin;
  let page = 1, pages = 1, tz = 'UTC', debounce;

  async function boot() {
    await initShell('requests');
    const meta = await api('/api/admin/meta');
    tz = meta.timezone;
    const st = document.getElementById('f-status');
    meta.statuses.forEach((s) => { const o = document.createElement('option'); o.value = s; o.textContent = s[0].toUpperCase() + s.slice(1); st.appendChild(o); });
    const sv = document.getElementById('f-service');
    meta.services.forEach((s) => { const o = document.createElement('option'); o.value = s; o.textContent = s; sv.appendChild(o); });
    ['q', 'f-status', 'f-service', 'f-type', 'f-from', 'f-to', 'f-sort'].forEach((id) => {
      document.getElementById(id).addEventListener(id === 'q' ? 'input' : 'change', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => { page = 1; load(); }, id === 'q' ? 350 : 0);
      });
    });
    document.getElementById('prev').onclick = () => { if (page > 1) { page--; load(); } };
    document.getElementById('next').onclick = () => { if (page < pages) { page++; load(); } };
    document.getElementById('export').onclick = () => {
      const qs = query(false);
      location.href = '/api/admin/requests/export' + (qs ? '?' + qs : '');
      toast('Exporting filtered list as CSV.', 'ok');
    };
    load();
  }

  function query(withPage = true) {
    const [sort, dir] = document.getElementById('f-sort').value.split('-');
    const p = new URLSearchParams();
    const v = (id) => document.getElementById(id).value.trim();
    if (v('q')) p.set('search', v('q'));
    if (v('f-status')) p.set('status', v('f-status'));
    if (v('f-service')) p.set('service', v('f-service'));
    if (v('f-type')) p.set('meeting_type', v('f-type'));
    if (v('f-from')) p.set('from', v('f-from'));
    if (v('f-to')) p.set('to', v('f-to'));
    p.set('sort', sort); p.set('dir', dir);
    if (withPage) p.set('page', page);
    return p.toString();
  }

  function pill(s) { return `<span class="pill ${s}">${s}</span>`; }

  async function load() {
    const tb = document.getElementById('rows');
    try {
      const d = await api('/api/admin/requests?' + query());
      pages = d.pages;
      document.getElementById('count').textContent = `${d.total} request${d.total === 1 ? '' : 's'}`;
      document.getElementById('pageinfo').textContent = `Page ${d.page} of ${d.pages}`;
      if (!d.rows.length) {
        tb.innerHTML = '<tr><td colspan="6"><div class="empty">No requests match these filters.</div></td></tr>';
        return;
      }
      tb.innerHTML = d.rows.map((r) => `<tr class="rowlink${r.unread ? ' unread' : ''}" data-id="${esc(r.id)}" tabindex="0" role="link" aria-label="Open ${esc(r.full_name)}">
        <td data-label="Status">${pill(r.status)}${r.unread ? ' <span class="pill new">New</span>' : ''}</td>
        <td data-label="Name">${esc(r.full_name)}<br><small style="color:var(--muted)">${esc(r.email)}</small></td>
        <td data-label="Service">${esc(r.service)}</td>
        <td data-label="Preferred">${esc(r.preferred_date)} · ${esc(r.preferred_time)}</td>
        <td data-label="Type">${r.meeting_type === 'in_person' ? 'In-person' : 'Online'}</td>
        <td data-label="Received">${esc(fmtWhen(r.created_at, tz))}</td>
      </tr>`).join('');
      tb.querySelectorAll('tr.rowlink').forEach((tr) => {
        const go = () => { location.href = '/admin/request?id=' + encodeURIComponent(tr.dataset.id); };
        tr.onclick = go;
        tr.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
      });
    } catch (e) {
      toast('Could not load requests.', 'err');
    }
  }

  boot();
})();
