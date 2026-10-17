import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageMeta from '../../components/PageMeta.jsx';
import { get, post, patch, del, ApiError } from '../../api/client.js';
import { toast } from '../toast.js';

const STATUSES = ['new', 'confirmed', 'declined', 'closed'];

function fmt(v, tz) {
  if (!v) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v));
  } catch {
    return String(v);
  }
}

export default function RequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [tz, setTz] = useState('UTC');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => get(`/api/admin/requests/${id}`).then(setData).catch(() => setData({ missing: true }));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    get('/api/admin/settings').then((d) => setTz(d.settings?.timezone || 'UTC')).catch(() => {});
  }, []);

  if (!data) return <div className="a-loading" role="status">Loading request…</div>;
  if (data.missing) {
    return (
      <>
        <PageMeta title="Request not found — Double H Studio admin" description="" noindex />
        <div className="a-empty">This request no longer exists. <Link to="/admin/requests">Back to the list</Link>.</div>
      </>
    );
  }

  const r = data.request;
  const fields = [
    ['Full name', r.full_name],
    ['Email', r.email],
    ['Phone', r.phone || '—'],
    ['Company / Brand', r.company || '—'],
    ['Service', r.service],
    ['Preferred date', r.preferred_date],
    ['Preferred time', `${r.preferred_time} (${tz})`],
    ['Meeting type', r.meeting_type === 'in_person' ? 'In-person' : 'Online'],
    ['Status', <span className={`a-pill ${r.status}`} key="s">{r.status}</span>],
    ['Status changed', fmt(r.status_changed_at, tz)],
    ['Received', fmt(r.created_at, tz)],
    ['Consent recorded', fmt(r.consent_at, tz)],
    ['Studio notified', r.studio_email_sent ? 'Yes' : 'No — retry below'],
    ['Client acknowledged', r.client_email_sent ? 'Yes' : 'No'],
    ['Confirmation sent', r.confirm_email_sent ? 'Yes' : 'No'],
  ];

  const run = async (fn, okMsg) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      if (okMsg) toast(okMsg);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Action failed.', 'err');
    }
    setBusy(false);
  };

  const changeStatus = (status) => run(async () => {
    await patch(`/api/admin/requests/${id}`, { status });
    await load();
  }, `Status → ${status}`);

  const addNote = () => run(async () => {
    await post(`/api/admin/requests/${id}/notes`, { text: note });
    setNote('');
    await load();
  }, 'Note added.');

  const retryStudio = () => run(async () => {
    const d = await post(`/api/admin/requests/${id}/retry-studio-email`);
    toast(d.already ? 'Already delivered.' : 'Studio notification re-sent.');
    await load();
  });

  const sendConfirmation = () => run(async () => {
    await post(`/api/admin/requests/${id}/send-confirmation`);
    toast('Confirmation email sent.');
    await load();
  });

  const remove = () => {
    if (!window.confirm(`Delete the request from ${r.full_name}? This cannot be undone.`)) return;
    run(async () => {
      await del(`/api/admin/requests/${id}`);
      toast('Request deleted.');
      navigate('/admin/requests');
    });
  };

  return (
    <>
      <PageMeta title={`${r.full_name} — Meeting request`} description="" noindex />
      <div className="a-pagehead">
        <div>
          <p style={{ margin: 0 }}><Link to="/admin/requests">← Meeting Requests</Link></p>
          <h1>{r.full_name} {r.unread ? <span className="a-pill new">Unread</span> : null}</h1>
          <p>Reference {r.id} · received {fmt(r.created_at, tz)}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a className="a-btn" href={`mailto:${encodeURIComponent(r.email)}?subject=${encodeURIComponent(`Your meeting request — Double H Studio (${r.service})`)}&body=${encodeURIComponent(`Hello ${r.full_name},\n\nThank you for your meeting request…\n`)}`}>Reply by email</a>
          <button className="a-btn ghost" disabled={busy} onClick={sendConfirmation}>Send confirmation email</button>
          <button className="a-btn danger" disabled={busy} onClick={remove}>Delete</button>
        </div>
      </div>

      <div className="a-grid2">
        <div className="a-stack">
          <div className="a-card">
            <h2>Request details</h2>
            <dl className="a-detail-grid">
              {fields.map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          </div>
          <div className="a-card">
            <h2>Project description</h2>
            <p style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 15 }}>{r.description}</p>
          </div>
          <div className="a-card">
            <h2>Status</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {STATUSES.map((s) => (
                <button key={s} className={`a-btn small ${s === r.status ? '' : 'ghost'}`} disabled={busy || s === r.status} onClick={() => changeStatus(s)}>
                  Mark {s}
                </button>
              ))}
            </div>
            {r.status_changed_at ? <p className="a-hint" style={{ marginTop: 10 }}>Last changed {fmt(r.status_changed_at, tz)}.</p> : null}
            {!r.studio_email_sent ? (
              <div style={{ marginTop: 12 }}>
                <button className="a-btn ghost small" disabled={busy} onClick={retryStudio}>Retry studio notification</button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="a-card">
          <h2>History &amp; internal notes</h2>
          <ul className="a-events">
            <li>
              <time>{fmt(r.created_at, tz)}</time>
              Request received (consent recorded{r.consent_at ? ` ${fmt(r.consent_at, tz)}` : ''}).
            </li>
            {data.events.map((e) => (
              <li key={e.id} className={e.kind === 'note' ? 'note' : ''}>
                <time>{fmt(e.at, tz)} · {e.author || 'system'}</time>
                {e.kind === 'status' ? `Status changed: ${e.detail}` : e.detail}
              </li>
            ))}
          </ul>
          <div className="a-f" style={{ marginTop: 14 }}>
            <label htmlFor="note">Add internal note</label>
            <textarea id="note" rows={3} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder="Only the studio sees this." />
          </div>
          <button className="a-btn small" disabled={busy || !note.trim()} onClick={addNote}>Save note</button>
        </div>
      </div>
    </>
  );
}
