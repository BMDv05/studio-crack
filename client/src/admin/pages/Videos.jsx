import { useCallback, useEffect, useRef, useState } from 'react';
import PageMeta from '../../components/PageMeta.jsx';
import { useApi } from '../../hooks/useApi.js';
import { get, post, patch, del, ApiError } from '../../api/client.js';
import { toast } from '../toast.js';

const EXT_OK = ['.mp4', '.mov', '.webm'];
const MIMES = { 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm' };

function fmtSize(bytes) {
  if (!bytes) return '—';
  const mb = bytes / 1048576;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${bytes} B`;
}

/* Read duration client-side so the server can store it with the upload. */
function readDuration(file) {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(isFinite(v.duration) ? v.duration : null); };
      v.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      v.src = url;
    } catch { resolve(null); }
  });
}

/* POST multipart with progress (fetch has no upload progress events). */
function uploadWithProgress(url, file, onProgress, csrf) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    if (csrf) xhr.setRequestHeader('X-CSRF-Token', csrf);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* non-JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(xhr.status, data));
    };
    xhr.onerror = () => reject(new ApiError(0, { error: 'Network error during upload.' }));
    const fd = new FormData();
    fd.append('file', file);
    xhr.send(fd);
  });
}

export default function Videos() {
  const [cat, setCat] = useState(() => {
    try { return localStorage.getItem('dh_video_tab') === 'social' ? 'social' : 'production'; } catch { return 'production'; }
  });
  const meta = useApi(() => get('/api/admin/meta'));
  const [videos, setVideos] = useState(null);
  const [dragId, setDragId] = useState(null);
  const dragRef = useRef(null); // survives same-tick drops before re-render
  const [reordering, setReordering] = useState(false);
  const csrf = useRef('');
  useEffect(() => {
    const m = document.cookie.match(/(?:^|;\s*)dh_csrf=([^;]*)/);
    csrf.current = m ? decodeURIComponent(m[1]) : '';
  }, []);

  const counts = useApi(() => get('/api/admin/videos'));
  const load = useCallback((category) => {
    get(`/api/admin/videos?category=${category}`).then((d) => setVideos(d.videos)).catch(() => setVideos([]));
  }, []);
  useEffect(() => {
    load(cat);
    try { localStorage.setItem('dh_video_tab', cat); } catch { /* private mode */ }
  }, [cat, load]);

  // Poll while anything is mid-processing so rows flip to Ready on their own.
  useEffect(() => {
    if (!videos || !videos.some((v) => v.processing === 'processing' || v.processing === 'uploading')) return;
    const t = setInterval(() => load(cat), 4000);
    return () => clearInterval(t);
  }, [videos, cat, load]);

  const settings = meta.data || {};
  const capMb = cat === 'social' ? (settings.maxUploadMbSocial || 200) : (settings.maxUploadMbProduction || 500);

  const switchTab = (next) => () => setCat(next);

  const onDrop = async (targetId) => {
    const fromId = dragRef.current || dragId;
    if (!fromId || fromId === targetId || reordering) return;
    const ids = videos.map((v) => v.id);
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setReordering(true);
    try {
      const d = await post('/api/admin/videos/reorder', { category: cat, ids });
      setVideos(d.videos);
      toast('Order saved.');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Reorder failed.', 'err');
      load(cat);
    }
    setReordering(false);
    setDragId(null);
    dragRef.current = null;
  };

  const patchVideo = async (id, body, okMsg) => {
    try {
      const d = await patch(`/api/admin/videos/${id}`, body);
      setVideos((prev) => prev.map((v) => (v.id === id ? d.video : v)));
      if (okMsg) toast(okMsg);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Update failed.', 'err');
    }
  };

  const removeVideo = async (v) => {
    if (!window.confirm(`Delete "${v.title}"? The file is removed too. This cannot be undone.`)) return;
    try {
      await del(`/api/admin/videos/${v.id}`);
      setVideos((prev) => prev.filter((x) => x.id !== v.id));
      counts.reload();
      toast('Video deleted.');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Delete failed.', 'err');
    }
  };

  return (
    <>
      <PageMeta title="Videos — Double H Studio admin" description="" noindex />
      <div className="a-pagehead">
        <div>
          <h1>Videos</h1>
          <p>Per-category order, publish state and files. Drag rows to reorder within a tab.</p>
        </div>
      </div>

      <div className="a-tabs" role="tablist" aria-label="Video categories">
        <button role="tab" aria-selected={cat === 'production'} onClick={switchTab('production')}>
          Production <span className="count">{counts.data ? (counts.data.videos || []).filter((v) => v.category === 'production').length : '…'}</span>
        </button>
        <button role="tab" aria-selected={cat === 'social'} onClick={switchTab('social')}>
          Social Media <span className="count">{counts.data ? (counts.data.videos || []).filter((v) => v.category === 'social').length : '…'}</span>
        </button>
      </div>

      <AddVideo
        cat={cat} capMb={capMb} maxSocialSec={settings.maxSocialSec}
        platforms={settings.platforms || []}
        onAdded={(v) => { setVideos((prev) => [...prev, v]); counts.reload(); }}
        csrf={csrf.current}
      />

      <div className="a-stack" style={{ marginTop: 18 }} role="tabpanel" aria-label={cat === 'social' ? 'Social videos' : 'Production videos'}>
        {videos === null ? (
          <div className="a-loading" role="status">Loading videos…</div>
        ) : videos.length === 0 ? (
          <div className="a-empty">No {cat === 'social' ? 'social videos' : 'production films'} yet — add the first one above.</div>
        ) : videos.map((v) => (
          <VideoRow
            key={v.id} v={v} cat={cat} capMb={capMb} maxSocialSec={settings.maxSocialSec}
            platforms={settings.platforms || []}
            draggable={!reordering}
            onDragStart={() => { dragRef.current = v.id; setDragId(v.id); }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(v.id)}
            dimmed={dragId === v.id}
            onPatch={patchVideo}
            onDelete={removeVideo}
            onReplace={async (file, duration) => {
              await replaceFile(v.id, file, duration, csrf.current);
              load(cat);
              counts.reload();
            }}
            csrf={csrf.current}
          />
        ))}
      </div>
      {reordering ? <p className="a-hint" role="status">Saving new order…</p> : null}
    </>
  );
}

async function replaceFile(id, file, duration, csrf) {
  await post(`/api/admin/videos/${id}/replace`, {});
  await uploadFile(id, file, duration, csrf);
}

async function uploadFile(id, file, duration, csrf) {
  const qs = duration ? `?duration=${Math.round(duration * 10) / 10}` : '';
  return uploadWithProgress(`/api/admin/videos/${id}/file${qs}`, file, () => {}, csrf);
}

function AddVideo({ cat, capMb, maxSocialSec, platforms, onAdded, csrf }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [client, setClient] = useState('');
  const [plats, setPlats] = useState([]);
  const [published, setPublished] = useState(false);
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [progress, setProgress] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [duration, setDuration] = useState(null);

  const pick = async (e) => {
    const f = e.target.files && e.target.files[0];
    setErrors((p) => ({ ...p, file: '' }));
    if (!f) { setFile(null); setDuration(null); return; }
    const ext = '.' + (f.name.split('.').pop() || '').toLowerCase();
    if (!EXT_OK.includes(ext) || !MIMES[f.type]) {
      setErrors((p) => ({ ...p, file: 'Only MP4, MOV and WebM are accepted.' }));
      setFile(null); setDuration(null); return;
    }
    if (f.size > capMb * 1048576) {
      setErrors((p) => ({ ...p, file: `File is ${(f.size / 1048576).toFixed(0)} MB — the ${cat === 'social' ? 'Social' : 'Production'} limit is ${capMb} MB.` }));
      setFile(null); setDuration(null); return;
    }
    setFile(f);
    const d = await readDuration(f);
    setDuration(d);
    if (cat === 'social' && d && maxSocialSec && d > maxSocialSec) {
      setErrors((p) => ({ ...p, file: `This clip is ${Math.round(d)}s — the social limit is ${maxSocialSec}s. Trim it first.` }));
      setFile(null);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const errs = {};
    if (title.trim().length < 2) errs.title = 'Title is required.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setProgress(0);
    try {
      const created = await post('/api/admin/videos', {
        title, description, category: cat, client_name: client,
        platforms: plats, published,
      });
      let video = created.video;
      if (file) {
        await uploadFile(video.id, file, duration, csrf);
        // Server finalizes async; fetch the fresh row (may still be processing).
        const list = await get(`/api/admin/videos?category=${cat}`);
        video = (list.videos || []).find((x) => x.id === video.id) || video;
      }
      onAdded(video);
      toast(file ? 'Video uploaded — processing will finish shortly.' : 'Video added.');
      setTitle(''); setDescription(''); setClient(''); setPlats([]); setPublished(false); setFile(null); setDuration(null);
      setOpen(false); setProgress(-1);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Upload failed.', 'err');
      setProgress(-1);
    }
    setBusy(false);
  };

  if (!open) {
    return <button className="a-btn" onClick={() => setOpen(true)}>+ Add {cat === 'social' ? 'social video' : 'production film'}</button>;
  }

  return (
    <form className="a-card" onSubmit={submit}>
      <h2>New {cat === 'social' ? 'social video' : 'production film'}</h2>
      <div className="a-grid2">
        <div>
          <div className="a-f">
            <label htmlFor="v-title">Title *</label>
            <input id="v-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
            <span className="a-err">{errors.title || ''}</span>
          </div>
          <div className="a-f">
            <label htmlFor="v-desc">Description</label>
            <textarea id="v-desc" rows={3} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="a-f">
            <label htmlFor="v-client">Client / Brand</label>
            <input id="v-client" value={client} maxLength={120} onChange={(e) => setClient(e.target.value)} />
          </div>
          {cat === 'social' ? (
            <fieldset className="a-f" style={{ border: 0, padding: 0, margin: '0 0 12px' }}>
              <legend style={{ fontSize: 14, fontWeight: 600, padding: 0 }}>Platforms</legend>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {platforms.map((p) => (
                  <label key={p} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14 }}>
                    <input type="checkbox" checked={plats.includes(p)} onChange={(e) => setPlats((prev) => (e.target.checked ? [...prev, p] : prev.filter((x) => x !== p)))} />
                    {p}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginBottom: 12 }}>
            <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
            Publish immediately (visible on /work once ready)
          </label>
        </div>
        <div>
          <div className="a-f">
            <label htmlFor="v-file">Video file (MP4 · MOV · WebM, max {capMb} MB)</label>
            <input id="v-file" type="file" accept="video/mp4,video/quicktime,video/webm" onChange={pick} />
            <span className="a-err">{errors.file || ''}</span>
          </div>
          {file ? <p className="a-hint">{file.name} · {fmtSize(file.size)}{duration ? ` · ${Math.round(duration)}s` : ''}</p> : null}
          <p className="a-hint">
            Files over ~{capMb} MB can take longer than 90 seconds — keep this tab open until it finishes.
            The browser uploads directly; nothing is published until processing completes.
          </p>
          {progress >= 0 && busy ? (
            <div style={{ marginBottom: 12 }}>
              <div style={{ height: 8, background: '#e2e9e8', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progress}%`, background: 'var(--dh-green)', transition: 'width 300ms ease-out' }} />
              </div>
              <span className="a-hint">{progress < 100 ? `Uploading… ${progress}%` : 'Processing on the server…'}</span>
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="a-btn" type="submit" disabled={busy}>{busy ? 'Uploading…' : 'Create'}</button>
            <button className="a-btn ghost" type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      </div>
    </form>
  );
}

function VideoRow({ v, cat, capMb, maxSocialSec, platforms, onPatch, onDelete, onReplace, ...drag }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(v.title);
  const [description, setDescription] = useState(v.description || '');
  const [client, setClient] = useState(v.client_name || '');
  const [plats, setPlats] = useState(v.platforms || []);
  const fileRef = useRef(null);

  return (
    <div
      className="a-card"
      draggable={drag.draggable}
      onDragStart={drag.onDragStart}
      onDragOver={drag.onDragOver}
      onDrop={drag.onDrop}
      style={{ opacity: drag.dimmed ? 0.4 : 1, cursor: 'grab', transition: 'opacity 300ms ease-out' }}
    >
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ width: 150, flex: '0 0 auto' }}>
          <video
            src={v.video_url || undefined}
            poster={v.thumbnail_url || undefined}
            muted playsInline preload="metadata"
            style={{ width: '100%', borderRadius: 12, aspectRatio: cat === 'social' ? '9/16' : '16/9', objectFit: 'cover', background: 'var(--dh-ink)' }}
          />
        </div>
        <div style={{ flex: '1 1 260px', minWidth: 220 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 16 }}>{v.title}</strong>
            <span className={`a-pill ${v.status}`}>{v.status}</span>
            <span className={`a-pill ${v.processing}`}>{v.processing}</span>
            <span className="a-hint" style={{ margin: 0 }}>#{v.sort_order + 1} in {cat === 'social' ? 'Social' : 'Production'} · {fmtSize(v.size_bytes)}{v.duration_sec ? ` · ${Math.round(v.duration_sec)}s` : ''}</span>
          </div>
          {v.description ? <p className="a-hint" style={{ margin: '6px 0' }}>{v.description}</p> : null}
          {(v.platforms || []).length ? (
            <p className="a-hint" style={{ margin: '0 0 6px' }}>{v.platforms.join(' · ')}</p>
          ) : null}
          {v.processing === 'failed' ? (
            <p className="a-err" style={{ color: 'var(--dh-error)', fontSize: 13, margin: '0 0 6px' }}>
              Processing failed — try replacing the file.
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <button className="a-btn ghost small" onClick={() => onPatch(v.id, { status: v.status === 'published' ? 'draft' : 'published' }, v.status === 'published' ? 'Unpublished.' : 'Published.')}>
              {v.status === 'published' ? 'Unpublish' : 'Publish'}
            </button>
            <button className="a-btn ghost small" onClick={() => setEditing((s) => !s)}>{editing ? 'Close editor' : 'Edit'}</button>
            <button className="a-btn ghost small" onClick={() => fileRef.current && fileRef.current.click()}>Replace file</button>
            {cat === 'social' ? (
              <button className="a-btn ghost small" onClick={() => onPatch(v.id, { category: 'production' }, 'Moved to Production (now last).')}>Move to Production</button>
            ) : (
              <button className="a-btn ghost small" onClick={() => onPatch(v.id, { category: 'social' }, 'Moved to Social Media (now last).')}>Move to Social</button>
            )}
            <button className="a-btn danger small" onClick={() => onDelete(v)}>Delete</button>
            <input
              ref={fileRef} type="file" accept="video/mp4,video/quicktime,video/webm" hidden
              onChange={async (e) => {
                const f = e.target.files && e.target.files[0];
                e.target.value = '';
                if (!f) return;
                const ext = '.' + (f.name.split('.').pop() || '').toLowerCase();
                if (!EXT_OK.includes(ext)) { toast('Only MP4, MOV and WebM are accepted.', 'err'); return; }
                if (f.size > capMb * 1048576) { toast(`Over the ${capMb} MB limit for this category.`, 'err'); return; }
                const d = await readDuration(f);
                if (cat === 'social' && d && maxSocialSec && d > maxSocialSec) { toast(`Over the ${maxSocialSec}s social limit.`, 'err'); return; }
                try {
                  await onReplace(f, d);
                  toast('Replacement uploaded — processing…');
                } catch (err) {
                  toast(err instanceof ApiError ? err.message : 'Replace failed.', 'err');
                }
              }}
            />
          </div>
          {editing ? (
            <div className="a-grid2" style={{ marginTop: 14 }}>
              <div className="a-f"><label>Title</label><input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></div>
              <div className="a-f"><label>Client / Brand</label><input value={client} maxLength={120} onChange={(e) => setClient(e.target.value)} /></div>
              <div className="a-f" style={{ gridColumn: '1 / -1' }}>
                <label>Description</label>
                <textarea rows={2} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
              </div>
              {cat === 'social' ? (
                <fieldset className="a-f" style={{ gridColumn: '1 / -1', border: 0, padding: 0, margin: 0 }}>
                  <legend style={{ fontSize: 14, fontWeight: 600, padding: 0 }}>Platforms</legend>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {platforms.map((p) => (
                      <label key={p} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14 }}>
                        <input type="checkbox" checked={plats.includes(p)} onChange={(e) => setPlats((prev) => (e.target.checked ? [...prev, p] : prev.filter((x) => x !== p)))} />
                        {p}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
              <div>
                <button className="a-btn small" onClick={async () => {
                  await onPatch(v.id, { title, description, client_name: client, platforms: plats }, 'Saved.');
                  setEditing(false);
                }}>Save changes</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
