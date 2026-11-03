import { Link } from 'react-router-dom';
import PageMeta from '../../components/PageMeta.jsx';
import { useApi } from '../../hooks/useApi.js';
import { get } from '../../api/client.js';
import { useLang } from '../../i18n/LanguageContext.jsx';

function fmt(v, tz) {
  if (!v) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v));
  } catch {
    return String(v);
  }
}

export default function Overview() {
  const { data, loading, error, reload } = useApi(() => get('/api/admin/stats'));
  const { data: s } = useApi(() => get('/api/admin/settings'));
  const { t, lang } = useLang();
  const tz = s?.settings?.timezone || 'UTC';

  if (loading && !data) {
    return <div className="a-loading" role="status">{t('admin.overview.loading') || 'Loading overview…'}</div>;
  }

  if (error) {
    return (
      <div className="a-empty" style={{ margin: '40px auto', maxWidth: 460 }}>
        <p style={{ color: 'var(--dh-error)', fontWeight: 600, marginBottom: 12 }}>{error}</p>
        <button className="a-btn small" onClick={reload}>Retry</button>
      </div>
    );
  }

  if (!data) return null;

  const stats = [
    { n: data.unread, label: t('admin.overview.unreadRequests'), hot: data.unread > 0, to: '/admin/requests?status=new' },
    { n: data.thisWeek, label: t('admin.overview.thisWeek'), to: '/admin/requests' },
    { n: data.confirmed, label: t('admin.overview.confirmed'), to: '/admin/requests?status=confirmed' },
    { n: data.publishedVideos, label: t('admin.overview.publishedVideos'), to: '/admin/videos' },
  ];

  return (
    <>
      <PageMeta title={`${t('admin.overview.title')} — Double H Studio admin`} description="" noindex />
      <div className="a-pagehead">
        <div>
          <h1>{t('admin.overview.title')}</h1>
          <p>{t('admin.overview.subtitle', { tz })}</p>
        </div>
        <Link className="a-btn" to="/admin/requests">{t('admin.overview.openRequests')}</Link>
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
          <h2>{t('admin.overview.latestRequests')}</h2>
          {data.latest.length === 0 ? (
            <div className="a-empty">{t('admin.overview.noRequests')}</div>
          ) : (
            <div className="a-tablewrap">
              <table className="a-table">
                <thead><tr><th>{t('admin.requests.client')}</th><th>{t('admin.requests.service')}</th><th>{t('admin.requests.date')}</th><th>{t('admin.requests.status')}</th></tr></thead>
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
          <h2>{t('admin.overview.recentUploads')}</h2>
          {data.recentVideos.length === 0 ? (
            <div className="a-empty">{t('admin.overview.noVideos')}</div>
          ) : (
            <div className="a-tablewrap">
              <table className="a-table">
                <thead><tr><th>Title</th><th>Category</th><th>Status</th><th>Processing</th></tr></thead>
                <tbody>
                  {data.recentVideos.map((v) => (
                    <tr key={v.id}>
                      <td><Link to="/admin/videos">{(lang === 'ar' && v.title_ar) ? v.title_ar : v.title}</Link></td>
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
