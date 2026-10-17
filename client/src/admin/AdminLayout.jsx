import { useEffect, useState } from 'react';
import { NavLink, Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AdminApp.jsx';
import { get } from '../api/client.js';
import { HMark } from '../components/Wordmark.jsx';

export default function AdminLayout() {
  const { me, logout } = useAuth();
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
          <span className="a-brand-badge"><HMark size={19} /></span>
          <span>Double H<br /><small>STUDIO · ADMIN</small></span>
        </Link>
        <nav className="a-nav">
          <NavLink to="/admin" end>Overview</NavLink>
          <NavLink to="/admin/requests">
            Meeting Requests
            {unread > 0 && <span className="a-badge" aria-label={`${unread} unread`}>{unread}</span>}
          </NavLink>
          <NavLink to="/admin/videos">Videos</NavLink>
          <NavLink to="/admin/settings">Settings</NavLink>
        </nav>
        <Link to="/" className="a-back">← View public site</Link>
      </aside>
      <div className="a-main">
        <div className="a-topbar">
          <button className="a-menubtn" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>☰</button>
          <span className="a-who">Signed in as <strong>{me.admin?.name || me.admin?.email}</strong></span>
          <button className="a-btn ghost" onClick={logout}>Logout</button>
        </div>
        <main className="a-content" id="main">
          <Outlet context={{ refreshUnread: () => setUnread((n) => Math.max(0, n - 1)) }} />
        </main>
      </div>
    </div>
  );
}

function NavigateLogin() {
  useEffect(() => { window.location.href = '/admin/login'; }, []);
  return <div className="a-loading" role="status">Redirecting to sign in…</div>;
}
