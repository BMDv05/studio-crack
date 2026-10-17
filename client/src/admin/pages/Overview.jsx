import { Link } from 'react-router-dom';
import PageMeta from '../../components/PageMeta.jsx';
import { useApi } from '../../hooks/useApi.js';
import { get } from '../../api/client.js';

function fmt(v, tz) {
  if (!v) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v));
  } catch {
    return String(v);
  }
}

export default function Overview() {
  const { data, loading } = useApi(() => get('/api/admin/stats'));
  const { data: s } = useApi(() => get('/api/admin/settings'));
  const tz = s?.settings?.timezone || 'UTC';

  if (loading || !data) return <div className="a-loading" role="status">Loading overview…</div>;

  const stats = [
    { n: data.unread, label: 'Unread requests', hot: data.unread > 0, to: '/admin/requests?status=new' },
    { n: data.thisWeek, label: 'This week', to: '/admin/requests' },
    { n: data.confirmed, label: 'Confirmed', to: '/admin/requests?status=confirmed' },
    { n: data.publishedVideos, label: 'Published videos', to: '/admin/videos' },
  ];

  return (
    <>
      <PageMeta title="Overview — Double H Studio admin" description="" noindex />
      <div className="a-pagehead">
        <div>
          <h1>Overview</h1>
          <p>Studio inbox at a glance — times shown in {tz}.</p>
        </div>
        <Link className="a-btn" to="/admin/requests">Open meeting requests</Link>
      </div>

      <div className="a-grid3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginBottom: 20 }}>
        {stats.map((s2) => (
          <Link key={s2.label} to={s2.to} style={{ textDecoration: 'none' }}>
            <div className={`a-stat ${s2.hot ? 'hot' : ''}`}>
              <b>{s2.n}</b><span>{s2.label}</span>
            </div>
          </Link>
        ))}
      </div>

      <div className="a-grid2">
        <div className="a-card">
          <h2>Latest meeting requests</h2>
          {data.latest.length === 0 ? (
            <div className="a-empty">No requests yet.</div>
          ) : (
            <div className="a-tablewrap">
              <table className="a-table">
                <thead><tr><th>Client</th><th>Service</th><th>Preferred</th><th>Status</th></tr></thead>
                <tbody>
                  {data.latest.map((r) => (
                    <tr key={r.id} className={r.unread ? 'unread' : ''}>
                      <td><Link to={`/admin/requests/${r.id}`}>{r.full_name}</Link></td>
                      <td>{r.service}</td>
                      <td>{r.preferred_date} {r.preferred_time}</td>
                      <td><span className={`a-pill ${r.status}`}>{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="a-card">
          <h2>Recent videos</h2>
          {data.recentVideos.length === 0 ? (
            <div className="a-empty">No videos yet.</div>
          ) : (
            <div className="a-tablewrap">
              <table className="a-table">
                <thead><tr><th>Title</th><th>Category</th><th>Status</th><th>Processing</th></tr></thead>
                <tbody>
                  {data.recentVideos.map((v) => (
                    <tr key={v.id}>
                      <td><Link to="/admin/videos">{v.title}</Link></td>
                      <td>{v.category === 'social' ? 'Social' : 'Production'}</td>
                      <td><span className={`a-pill ${v.status}`}>{v.status}</span></td>
                      <td><span className={`a-pill ${v.processing}`}>{v.processing}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
