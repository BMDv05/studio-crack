import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageMeta from '../../components/PageMeta.jsx';
import { post, ApiError } from '../../api/client.js';
import { useAuth } from '../AdminApp.jsx';

export default function Login() {
  const { setMe } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const d = await post('/api/admin/login', { email, password });
      setMe({ admin: d.admin, csrf: d.csrf, unread: 0 });
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed. Try again.');
      setBusy(false);
    }
  }

  return (
    <>
      <PageMeta title="Admin sign in — Double H Studio" description="" noindex />
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--dh-ink)', padding: 20 }}>
        <form onSubmit={submit} style={{ width: 'min(400px, 100%)', background: 'var(--dh-white)', borderRadius: 'var(--dh-radius-card)', padding: 30 }}>
          <h1 style={{ marginTop: 0, fontSize: 22, color: 'var(--dh-ink)' }}>Double H Studio · Admin</h1>
          {params.get('expired') ? (
            <p style={{ color: 'var(--dh-error)', fontSize: 14 }}>Your session expired. Please sign in again.</p>
          ) : null}
          <div className="a-f">
            <label htmlFor="l-email">Email</label>
            <input id="l-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="a-f">
            <label htmlFor="l-pass">Password</label>
            <input id="l-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error ? <p role="alert" style={{ color: 'var(--dh-error)', fontSize: 14 }}>{error}</p> : null}
          <button className="a-btn" type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </>
  );
}
