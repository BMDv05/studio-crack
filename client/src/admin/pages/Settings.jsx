import { useEffect, useState } from 'react';
import PageMeta from '../../components/PageMeta.jsx';
import { useApi } from '../../hooks/useApi.js';
import { get, patch, post, ApiError } from '../../api/client.js';
import { toast } from '../toast.js';

export default function Settings() {
  const { data, reload } = useApi(() => get('/api/admin/settings'));
  const s = data?.settings;

  const [profile, setProfile] = useState(null);
  const [uploads, setUploads] = useState(null);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!s) return;
    setProfile({ timezone: s.timezone, sla: s.sla, services: (s.services || []).join('\n'), studioEmail: s.studioEmail, ackEnabled: s.ackEnabled });
    setUploads({
      maxUploadMbProduction: s.maxUploadMbProduction,
      maxUploadMbSocial: s.maxUploadMbSocial,
      maxSocialSec: s.maxSocialSec,
      storageDriver: s.storageDriver,
    });
  }, [s]);

  if (!s || !profile || !uploads) return <div className="a-loading" role="status">Loading settings…</div>;

  const save = async (path, body, okMsg) => {
    if (busy) return false;
    setBusy(true);
    setErrors({});
    try {
      await patch(path, body);
      toast(okMsg);
      return true;
    } catch (e) {
      setErrors(e instanceof ApiError ? e.errors || {} : {});
      toast(e instanceof ApiError ? e.message : 'Save failed.', 'err');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    const ok = await save('/api/admin/settings', {
      timezone: profile.timezone.trim(),
      sla: profile.sla.trim(),
      services: profile.services.split('\n').map((x) => x.trim()).filter(Boolean),
      studioEmail: profile.studioEmail.trim(),
      ackEnabled: profile.ackEnabled,
    }, 'Profile saved.');
    if (ok) reload();
  };

  const saveUploads = async () => {
    const ok = await save('/api/admin/settings', {
      maxUploadMbProduction: Number(uploads.maxUploadMbProduction),
      maxUploadMbSocial: Number(uploads.maxUploadMbSocial),
      maxSocialSec: Number(uploads.maxSocialSec),
      storageDriver: uploads.storageDriver,
    }, 'Upload settings saved.');
    if (ok) reload();
  };

  const changePassword = async () => {
    if (busy) return;
    setBusy(true);
    setErrors({});
    try {
      await post('/api/admin/password', { current: pw.current, next: pw.next });
      toast('Password changed.');
      setPw({ current: '', next: '' });
    } catch (e) {
      if (e instanceof ApiError && e.errors && e.errors.next) setErrors({ next: e.errors.next });
      toast(e instanceof ApiError ? e.message : 'Password change failed.', 'err');
    }
    setBusy(false);
  };

  return (
    <>
      <PageMeta title="Settings — Double H Studio admin" description="" noindex />
      <div className="a-pagehead">
        <div>
          <h1>Settings</h1>
          <p>Studio preferences. Changes apply immediately.</p>
        </div>
      </div>

      <div className="a-grid2">
        <div className="a-stack">
          <div className="a-card">
            <h2>Studio profile</h2>
            <div className="a-f">
              <label htmlFor="s-tz">Studio time zone</label>
              <input id="s-tz" placeholder="Asia/Amman" value={profile.timezone} onChange={(e) => setProfile((p) => ({ ...p, timezone: e.target.value }))} />
              <span className="a-err">{errors.timezone || ''}</span>
            </div>
            <div className="a-f">
              <label htmlFor="s-sla">Response promise (shown to clients)</label>
              <input id="s-sla" maxLength={120} placeholder="within 2 working days" value={profile.sla} onChange={(e) => setProfile((p) => ({ ...p, sla: e.target.value }))} />
              <span className="a-err">{errors.sla || ''}</span>
            </div>
            <div className="a-f">
              <label htmlFor="s-inbox">Notification email (booking inbox)</label>
              <input id="s-inbox" type="email" value={profile.studioEmail} onChange={(e) => setProfile((p) => ({ ...p, studioEmail: e.target.value }))} />
              <span className="a-err">{errors.studioEmail || ''}</span>
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginBottom: 12 }}>
              <input type="checkbox" checked={profile.ackEnabled} onChange={(e) => setProfile((p) => ({ ...p, ackEnabled: e.target.checked }))} />
              Send automatic acknowledgment email to the client
            </label>
            <div className="a-f">
              <label htmlFor="s-services">Services (one per line — booking dropdown)</label>
              <textarea id="s-services" rows={5} value={profile.services} onChange={(e) => setProfile((p) => ({ ...p, services: e.target.value }))} />
              <span className="a-err">{errors.services || ''}</span>
            </div>
            <button className="a-btn small" disabled={busy} onClick={saveProfile}>Save profile</button>
          </div>

          <div className="a-card">
            <h2>Change password</h2>
            <div className="a-f">
              <label htmlFor="p-cur">Current password</label>
              <input id="p-cur" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} />
              <span className="a-err">{errors.current || ''}</span>
            </div>
            <div className="a-f">
              <label htmlFor="p-next">New password (min 10 characters)</label>
              <input id="p-next" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} />
              <span className="a-err">{errors.next || ''}</span>
            </div>
            <button className="a-btn small" disabled={busy || !pw.current || !pw.next} onClick={changePassword}>Change password</button>
          </div>
        </div>

        <div className="a-card">
          <h2>Uploads &amp; storage</h2>
          <div className="a-f">
            <label htmlFor="s-max-prod">Max Production video size (MB, 1–4000)</label>
            <input id="s-max-prod" type="number" min={1} max={4000} step={1} value={uploads.maxUploadMbProduction} onChange={(e) => setUploads((p) => ({ ...p, maxUploadMbProduction: e.target.value }))} />
            <span className="a-err">{errors.maxUploadMbProduction || ''}</span>
          </div>
          <div className="a-f">
            <label htmlFor="s-max-social">Max Social video size (MB, 1–4000)</label>
            <input id="s-max-social" type="number" min={1} max={4000} step={1} value={uploads.maxUploadMbSocial} onChange={(e) => setUploads((p) => ({ ...p, maxUploadMbSocial: e.target.value }))} />
            <span className="a-err">{errors.maxUploadMbSocial || ''}</span>
          </div>
          <div className="a-f">
            <label htmlFor="s-max-sec">Max Social duration (seconds, 15–600)</label>
            <input id="s-max-sec" type="number" min={15} max={600} step={1} value={uploads.maxSocialSec} onChange={(e) => setUploads((p) => ({ ...p, maxSocialSec: e.target.value }))} />
            <span className="a-err">{errors.maxSocialSec || ''}</span>
          </div>
          <div className="a-f">
            <label htmlFor="s-driver">Storage driver</label>
            <select id="s-driver" value={uploads.storageDriver} disabled={s.storageDriver === 'supabase'} onChange={(e) => setUploads((p) => ({ ...p, storageDriver: e.target.value }))}>
              <option value="supabase">Supabase Storage</option>
              <option value="local">Local disk (dev)</option>
              <option value="s3">Object storage — signed URLs (S3 / R2)</option>
            </select>
            <span className="a-err">{errors.storageDriver || ''}</span>
          </div>
          <p className="a-hint">
            {uploads.storageDriver === 'supabase' ? 'Private cloud storage. Videos appear publicly when published. Maximum file size: 50 MB.' : uploads.storageDriver === 's3'
              ? (s.storageS3 ? 'Object storage: configured ✓ — uploads go direct via signed URLs.' : 'Object storage selected but S3_* env vars are missing — set them in server/.env.')
              : 'Local disk: files are streamed to server/uploads and served from /media.'}
          </p>
          <p className="a-hint">Sessions expire after {s.sessionMinutes} minutes of inactivity.</p>
          <button className="a-btn small" disabled={busy} onClick={saveUploads}>Save uploads</button>
        </div>
      </div>
    </>
  );
}
