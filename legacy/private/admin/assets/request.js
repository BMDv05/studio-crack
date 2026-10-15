'use strict';
(function () {
  const { api, esc, fmtWhen, initShell, toast, confirmDialog } = window.Admin;
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { location.href = '/admin/requests'; return; }
  let tz = 'UTC', req = null;

  const flag = (v) => (v ? '<span class="pill confirmed">sent</span>' : '<span class="pill draft">not sent</span>');

  function render() {
    document.getElementById('title').textContent = req.full_name;
    const mailto = `mailto:${encodeURIComponent(req.email)}?subject=${encodeURIComponent(`Re: Meeting request ${req.id.slice(0, 8)} — Double H Studio`)}&body=${encodeURIComponent(`Hello ${req.full_name},\n\nThank you for your meeting request (ref ${req.id}).\n\n`)}}`;
    document.getElementById('body').innerHTML = `
      <div class="grid two">
        <div class="card"><h2>Client &amp; project</h2>
          <dl class="kv">
            <dt>Status</dt><dd><span class="pill ${req.status}">${req.status}</span>${req.unread ? ' <span class="pill new">New</span>' : ''}</dd>
            <dt>Full name</dt><dd>${esc(req.full_name)}</dd>
            <dt>Email</dt><dd><a href="mailto:${esc(req.email)}">${esc(req.email)}</a></dd>
            <dt>Phone</dt><dd>${esc(req.phone || '—')}</dd>
            <dt>Company</dt><dd>${esc(req.company || '—')}</dd>
            <dt>Service</dt><dd>${esc(req.service)}</dd>
            <dt>Preferred</dt><dd>${esc(req.preferred_date)} at ${esc(req.preferred_time)} (${esc(tz)})</dd>
            <dt>Meeting type</dt><dd>${req.meeting_type === 'in_person' ? 'In-person' : 'Online'}</dd>
          </dl>
          <h2 style="margin-top:24px">Project description</h2>
          <div class="desc">${esc(req.description)}</div>
        </div>
        <div>
          <div class="card"><h2>Record</h2>
            <dl class="kv">
              <dt>Reference</dt><dd><code>${esc(req.id)}</code></dd>
              <dt>Received</dt><dd>${esc(fmtWhen(req.created_at, tz))}</dd>
              <dt>Consent</dt><dd>${esc(fmtWhen(req.consent_at, tz))}</dd>
              <dt>Status changed</dt><dd>${esc(req.status_changed_at ? fmtWhen(req.status_changed_at, tz) : '—')}</dd>
              <dt>Studio email</dt><dd>${flag(req.studio_email_sent)}</dd>
              <dt>Client receipt</dt><dd>${flag(req.client_email_sent)}</dd>
              <dt>Confirmation</dt><dd>${flag(req.confirm_email_sent)}</dd>
            </dl>
          </div>
          <div class="card" style="margin-top:16px"><h2>Actions</h2>
            <p style="color:var(--muted);font-size:14px;margin-top:0">Confirming is manual — nothing is booked automatically. Change the status, then tell the client by email.</p>
            <div class="f"><label for="status">Status</label>
              <select id="status">${['new', 'confirmed', 'declined', 'closed'].map((s) => `<option value="${s}"${s === req.status ? ' selected' : ''}>${s}</option>`).join('')}</select>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <a class="btn small" href="${mailto}">Reply by email</a>
              <button class="btn ghost small" id="confirm-mail">Send confirmation email</button>
              ${req.studio_email_sent ? '' : '<button class="btn ghost small" id="retry">Retry studio notification</button>'}
            </div>
          </div>
          <div class="card" style="margin-top:16px"><h2>Internal notes</h2>
            <p style="color:var(--muted);font-size:13px;margin-top:0">Private to the studio team — never visible to the client.</p>
            <div class="timeline" id="events"></div>
            <div class="f" style="margin-top:16px"><label for="note">Add a note</label><textarea id="note" rows="3" maxlength="2000"></textarea></div>
            <button class="btn small" id="add-note">Add note</button>
          </div>
        </div>
      </div>`;
    renderEvents(window.__events || []);
    document.getElementById('status').onchange = changeStatus;
    document.getElementById('confirm-mail').onclick = sendConfirmation;
    const retry = document.getElementById('retry');
    if (retry) retry.onclick = retryStudio;
    document.getElementById('add-note').onclick = addNote;
  }

  function renderEvents(events) {
    const box = document.getElementById('events');
    if (!box) return;
    box.innerHTML = events.length
      ? events.map((e) => `<div class="event ${e.kind}"><div class="meta">${esc(fmtWhen(e.at, tz))} · ${esc(e.author)} · ${e.kind === 'status' ? 'status change' : 'note'}</div><div class="body">${esc(e.detail)}</div></div>`).join('')
      : '<div class="empty">No history yet.</div>';
  }

  async function changeStatus(e) {
    try {
      const d = await api(`/api/admin/requests/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status: e.target.value } });
      req = d.request;
      const full = await api(`/api/admin/requests/${encodeURIComponent(id)}`);
      window.__events = full.events;
      render();
      toast(`Status changed to ${d.request.status}.`, 'ok');
    } catch (err) { toast(err.errors?.status || 'Could not change status.', 'err'); }
  }
  async function addNote() {
    const ta = document.getElementById('note');
    if (!ta.value.trim()) { toast('Note is empty.', 'err'); return; }
    try {
      const d = await api(`/api/admin/requests/${encodeURIComponent(id)}/notes`, { method: 'POST', body: { text: ta.value } });
      window.__events = d.events;
      renderEvents(d.events);
      toast('Note saved.', 'ok');
    } catch { toast('Could not save note.', 'err'); }
  }
  async function sendConfirmation() {
    if (!(await confirmDialog({ title: 'Send confirmation email?', body: 'This emails the client that the meeting is confirmed. The booking itself stays manual.' }))) return;
    try {
      const d = await api(`/api/admin/requests/${encodeURIComponent(id)}/send-confirmation`, { method: 'POST' });
      if (d.ok) { req = d.request; toast('Confirmation email sent.', 'ok'); render(); }
      else toast('Email failed. The request is still saved.', 'err');
    } catch { toast('Email failed. The request is still saved.', 'err'); }
  }
  async function retryStudio() {
    try {
      const d = await api(`/api/admin/requests/${encodeURIComponent(id)}/retry-studio-email`, { method: 'POST' });
      req = d.request; render();
      toast(d.already ? 'Already delivered.' : 'Studio notification re-sent.', 'ok');
    } catch { toast('Retry failed.', 'err'); }
  }

  (async () => {
    await initShell('requests');
    try {
      const [meta, full] = await Promise.all([api('/api/admin/meta'), api(`/api/admin/requests/${encodeURIComponent(id)}`)]);
      tz = meta.timezone;
      req = full.request;
      window.__events = full.events;
      render();
    } catch { toast('Request not found.', 'err'); }
  })();

  document.getElementById('del').onclick = async () => {
    if (!(await confirmDialog({ title: 'Delete this request?', body: 'This permanently removes the request and its history.', okLabel: 'Delete', danger: true }))) return;
    try {
      await api(`/api/admin/requests/${encodeURIComponent(id)}`, { method: 'DELETE' });
      location.href = '/admin/requests';
    } catch { toast('Could not delete.', 'err'); }
  };
})();
