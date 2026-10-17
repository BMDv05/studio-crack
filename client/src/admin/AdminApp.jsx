import { createContext, useContext, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { get, post } from '../api/client.js';
import AdminLayout from './AdminLayout.jsx';
import Login from './pages/Login.jsx';
import Overview from './pages/Overview.jsx';
import Requests from './pages/Requests.jsx';
import RequestDetail from './pages/RequestDetail.jsx';
import Videos from './pages/Videos.jsx';
import Settings from './pages/Settings.jsx';
import './admin.css';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export default function AdminApp() {
  const [me, setMe] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Never probe the session on the login page itself: an unauthenticated
    // /me would 401-redirect to this same URL and cause a reload loop.
    if (window.location.pathname.startsWith('/admin/login')) {
      setMe(null);
      setChecking(false);
      return;
    }
    let alive = true;
    get('/api/admin/me')
      .then((d) => { if (alive) { setMe(d); setChecking(false); } })
      .catch(() => { if (alive) { setMe(null); setChecking(false); } });
    return () => { alive = false; };
  }, []);

  const logout = async () => {
    try { await post('/api/admin/logout'); } catch { /* cookie may be gone */ }
    setMe(null);
  };

  if (checking) {
    return <div className="a-loading" role="status">Checking session…</div>;
  }

  return (
    <AuthCtx.Provider value={{ me, setMe, logout }}>
      <Routes>
        <Route path="login" element={me ? <Navigate to="/admin" replace /> : <Login />} />
        <Route element={<AdminLayout />}>
          <Route index element={<Overview />} />
          <Route path="requests" element={<Requests />} />
          <Route path="requests/:id" element={<RequestDetail />} />
          <Route path="videos" element={<Videos />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </AuthCtx.Provider>
  );
}
