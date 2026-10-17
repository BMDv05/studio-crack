import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PageMeta from '../../components/PageMeta.jsx';
import { get } from '../../api/client.js';

const SORTS = {
  created_at: 'Newest first',
  preferred_date: 'Preferred date',
  full_name: 'Client name',
  status: 'Status',
};

export default function Requests() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState({
    search: params.get('search') || '',
    status: params.get('status') || '',
    service: params.get('service') || '',
    meeting_type: params.get('meeting_type') || '',
    from: params.get('from') || '',
    to: params.get('to') || '',
    sort: params.get('sort') || 'created_at',
    dir: params.get('dir') || 'desc',
    page: parseInt(params.get('page'), 10) || 1,
  });
  const [data, setData] = useState(null);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  // URL is the source of truth (back/forward works); local state edits push here.
  useEffect(() => {
    const next = {};
    for (const [k, v] of Object.entries(q)) {
      const def = k === 'sort' ? 'created_at' : k === 'dir' ? 'desc' : k === 'page' ? '1' : '';
      if (String(v) !== def && String(v) !== '') next[k] = String(v);
    }
    setParams(next, { replace: true });
    let alive = true;
    setLoading(true);
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== '' && v != null) qs.set(k, String(v));
    get('/api/admin/requests?' + qs.toString())
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => { if (alive) { setData({ rows: [], total: 0, pages: 1, page: 1 }); setLoading(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    get('/api/admin/settings').then((d) => setServices(d.settings?.services || [])).catch(() => {});
  }, []);

  const set = (k) => (e) => setQ((prev) => ({ ...prev, [k]: e.target.value, page: 1 }));
  const exportUrl = useMemo(() => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== '' && v != null && k !== 'page') qs.set(k, String(v));
    return '/api/admin/requests/export?' + qs.toString();
  }, [q]);

  const rows = data?.rows || [];

  return (
    <>
      <PageMeta title="Meeting Requests — Double H Studio admin" description="" noindex />
      <div className="a-pagehead">
        <div>
          <h1>Meeting Requests</h1>
          <p>{data ? `${data.total} request${data.total === 1 ? '' : 's'}` : 'Loading…'} · 20 per page</p>
        </div>
        <a className="a-btn ghost" href={exportUrl}>Export CSV</a>
      </div>

      <div className="a-filters">
        <div className="a-f">
          <label htmlFor="f-search">Search</label>
          <input id="f-search" type="search" placeholder="Name, email or company" value={q.search} onChange={set('search')} />
        </div>
        <div className="a-f">
          <label htmlFor="f-status">Status</label>
          <select id="f-status" value={q.status} onChange={set('status')}>
            <option value="">All</option>
            <option value="new">New</option>
            <option value="confirmed">Confirmed</option>
            <option value="declined">Declined</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <div className="a-f">
          <label htmlFor="f-service">Service</label>
          <select id="f-service" value={q.service} onChange={set('service')}>
            <option value="">All</option>
            {services.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="a-f">
          <label htmlFor="f-type">Meeting type</label>
          <select id="f-type" value={q.meeting_type} onChange={set('meeting_type')}>
            <option value="">All</option>
            <option value="online">Online</option>
            <option value="in_person">In-person</option>
          </select>
        </div>
        <div className="a-f">
          <label htmlFor="f-from">Preferred from</label>
          <input id="f-from" type="date" value={q.from} onChange={set('from')} />
        </div>
        <div className="a-f">
          <label htmlFor="f-to">Preferred to</label>
          <input id="f-to" type="date" value={q.to} onChange={set('to')} />
        </div>
        <div className="a-f">
          <label htmlFor="f-sort">Sort</label>
          <select id="f-sort" value={q.sort} onChange={set('sort')}>
            {Object.entries(SORTS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        <div className="a-f">
          <label htmlFor="f-dir">Direction</label>
          <select id="f-dir" value={q.dir} onChange={set('dir')}>
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="a-loading" role="status">Loading requests…</div>
      ) : rows.length === 0 ? (
        <div className="a-empty">No meeting requests match these filters.</div>
      ) : (
        <div className="a-tablewrap">
          <table className="a-table">
            <thead>
              <tr><th>Client</th><th>Service</th><th>Preferred</th><th>Type</th><th>Status</th><th>Received</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.unread ? 'unread' : ''}>
                  <td>
                    <Link to={`/admin/requests/${r.id}`}>{r.full_name}</Link>
                    <div style={{ color: 'var(--dh-sage)', fontSize: 13 }}>{r.email}</div>
                    {r.company ? <div style={{ color: 'var(--dh-sage)', fontSize: 13 }}>{r.company}</div> : null}
                    {r.unread ? <span className="a-pill new" style={{ marginTop: 4 }}>Unread</span> : null}
                  </td>
                  <td>{r.service}</td>
                  <td>{r.preferred_date} · {r.preferred_time}</td>
                  <td>{r.meeting_type === 'in_person' ? 'In-person' : 'Online'}</td>
                  <td><span className={`a-pill ${r.status}`}>{r.status}</span></td>
                  <td>{r.created_at ? new Date(r.created_at).toISOString().slice(0, 16).replace('T', ' ') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.pages > 1 ? (
        <div className="a-pager">
          <span>Page {data.page} of {data.pages}</span>
          <nav aria-label="Pagination">
            <button className="a-btn ghost small" disabled={data.page <= 1} onClick={() => setQ((p) => ({ ...p, page: p.page - 1 }))}>← Previous</button>
            <button className="a-btn ghost small" disabled={data.page >= data.pages} onClick={() => setQ((p) => ({ ...p, page: p.page + 1 }))}>Next →</button>
          </nav>
        </div>
      ) : null}
    </>
  );
}
