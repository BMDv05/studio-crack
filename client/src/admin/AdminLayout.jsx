import { useEffect, useState } from 'react';
import { NavLink, Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AdminApp.jsx';
import { get } from '../api/client.js';
import { Wordmark } from '../components/Wordmark.jsx';
import LanguageSwitcher from '../components/LanguageSwitcher.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';

export default function AdminLayout() {
  const { me, logout } = useAuth();
  const { t } = useLang();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const loc = useLocation();

  useEffect(() => {
    if (!me) return;
    let alive = true;
    const load = () => get('/api/admin/me').then((d) => { if (alive) setUnread(d.unread || 0); }).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [me, loc.pathname]);

  useEffect(() => setOpen(false), [loc.pathname]);

  if (!me) return <NavigateLogin />;

  return (
    <div className="a-shell">
      <aside className={`a-side ${open ? 'open' : ''}`} aria-label="Admin navigation">
        <Link to="/admin" className="a-brand">
          <Wordmark height={28} title="Double H Studio" />
          <span className="a-brand-admin">ADMIN</span>
        </Link>
        <nav className="a-nav">
          <NavLink to="/admin" end>{t('admin.nav.overview')}</NavLink>
          <NavLink to="/admin/requests">
            {t('admin.nav.requests')}
            {unread > 0 && <span className="a-badge" aria-label={`${unread} unread`}>{unread}</span>}
          </NavLink>
          <NavLink to="/admin/videos">{t('admin.nav.videos')}</NavLink>
          <NavLink to="/admin/settings">{t('admin.nav.settings')}</NavLink>
        </nav>
        <Link to="/" className="a-back">← {t('admin.viewPublicSite')}</Link>
      </aside>
      <div className="a-main">
        <div className="a-topbar">
          <button className="a-menubtn" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>☰</button>
          <span className="a-who">{t('admin.signedInAs')} <strong>{me.admin?.name || me.admin?.email}</strong></span>
          <LanguageSwitcher theme="light" />
          <button className="a-btn ghost" onClick={logout}>{t('admin.logout')}</button>
        </div>
        <main className="a-content" id="main">
          <Outlet context={{ refreshUnread: () => setUnread((n) => Math.max(0, n - 1)) }} />
        </main>
      </div>
    </div>
  );
}

function NavigateLogin() {
  const { t } = useLang();
  useEffect(() => { window.location.href = '/admin/login'; }, []);
  return <div className="a-loading" role="status">{t('admin.redirecting')}</div>;
}
