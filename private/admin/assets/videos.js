'use strict';
/* Videos manager: Production / Social Media tabs, search + status filter,
 * drag-and-drop reorder per tab, adaptive upload form, full edit modal. */
(function () {
  const { api, esc, fmtWhen, initShell, toast, confirmDialog } = window.Admin;
  const ACCEPT = ['video/mp4', 'video/quicktime', 'video/webm'];
  const CATS = { production: 'Production', social: 'Social Media' };
  let tab = localStorage.getItem('dh_vtab') || 'production';
  if (!CATS[tab]) tab = 'production';
  let all = [];
  let meta = { maxUploadMbProduction: 500, maxUploadMbSocial: 200, maxSocialSec: 90, platforms: [], storageDriver: 'local', storageS3: false, timezone: 'UTC' };
  let dragId = null;

  function capFor(cat) { return cat === 'social' ? meta.maxUploadMbSocial : meta.maxUploadMbProduction; }
  function dur(s) {
    if (s == null) return '—';
    const m = Math.floor(s / 60), sec = Math.round(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  }
  function mb(b) { return b ? (b / 1048576).toFixed(1) + ' MB' : '—'; }

  function setTab(cat) {
    tab = cat;
    localStorage.setItem('dh_vtab', cat);
    document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === cat)));
    render();
  }

  function filtered() {
    const q = document.getElementById('v-q').value.trim().toLowerCase();
    const st = document.getElementById('v-status').value;
    return all
      .filter((v) => v.category === tab)
      .filter((v) => !st || v.status === st)
      .filter((v) => !q || v.title.toLowerCase().includes(q) || (v.client_name || '').toLowerCase().includes(q))
      .sort((a, b) => a.sort_order - b.sort_order);
  }

  function thumbFor(v) {
    if (v.thumbnail_url) return `<img src="${esc(v.thumbnail_url)}" alt="" loading="lazy" draggable="false">`;
    if (v.video_url && v.processing === 'ready') return `<video src="${esc(v.video_url)}" preload="none" muted draggable="false"></video>`;
    return 'No preview yet';
  }

  function render() {
    const counts = { production: 0, social: 0 };
    all.forEach((v) => { if (counts[v.category] !== undefined) counts[v.category]++; });
    document.querySelectorAll('[data-count]').forEach((el) => { el.textContent = counts[el.dataset.count]; });
    const grid = document.getElementById('grid');
    const list = filtered();
    document.getElementById('sub').textContent =
      `${CATS[tab]} · max ${capFor(tab)} MB per file${tab === 'social' ? ` · max ${meta.maxSocialSec}s` : ''} · storage: ${meta.storageDriver}.`;
    if (!list.length) {
      grid.innerHTML = `<div class="empty">No ${CATS[tab]} videos ${document.getElementById('v-q').value || document.getElementById('v-status').value ? 'match this filter' : 'yet'}.</div>`;
      return;
    }
    grid.innerHTML = list.map((v) => {
      const plats = (v.platforms || []).map((p) => `<span class="pill">${esc(p)}</span>`).join('');
      return `<article class="vcard${v.category === 'social' ? ' vertical' : ''}" data-id="${esc(v.id)}" draggable="true">
        <div class="thumb">${thumbFor(v)}</div>
        <div class="body">
          <h3>${esc(v.title)}</h3>
          <div class="meta"><span class="pill ${v.status}">${v.status}</span><span class="pill ${v.processing}">${v.processing}</span><span>${dur(v.duration_sec)}</span><span>${mb(v.size_bytes)}</span></div>
          ${v.client_name ? `<div class="meta">Client: ${esc(v.client_name)}</div>` : ''}
          ${plats ? `<div class="meta">${plats}</div>` : ''}
          <div class="meta">Order ${v.sort_order} · ${esc(fmtWhen(v.created_at, meta.timezone))}</div>
          <div class="actions">
            ${v.video_url ? `<a class="btn ghost small" href="${esc(v.video_url)}" target="_blank" rel="noopener">Preview</a>` : ''}
            <button class="btn ghost small" data-act="toggle">${v.status === 'published' ? 'Unpublish' : 'Publish'}</button>
            <button class="btn ghost small" data-act="edit">Edit</button>
            <button class="btn ghost small" data-act="file">Replace file</button>
            <button class="btn danger small" data-act="del">Delete</button>
          </div>
        </div>
      </article>`;
    }).join('');
    grid.querySelectorAll('.vcard').forEach(wire);
  }

  function wire(card) {
    const id = card.dataset.id;
    card.querySelector('[data-act="toggle"]').onclick = async (e) => {
      e.stopPropagation();
      const v = all.find((x) => x.id === id);
      try {
        await api(`/api/admin/videos/${id}`, { method: 'PATCH', body: { status: v.status === 'published' ? 'draft' : 'published' } });
        toast('Status updated.', 'ok'); await reload(false);
      } catch { toast('Update failed.', 'err'); }
    };
    card.querySelector('[data-act="edit"]').onclick = () => editDialog(id);
    card.querySelector('[data-act="file"]').onclick = () => uploadDialog(true, id);
    card.querySelector('[data-act="del"]').onclick = async () => {
      if (!(await confirmDialog({ title: 'Delete this video?', body: 'The metadata and stored files are removed.', okLabel: 'Delete', danger: true }))) return;
      try { await api(`/api/admin/videos/${id}`, { method: 'DELETE' }); toast('Video deleted.', 'ok'); await reload(false); }
      catch { toast('Delete failed.', 'err'); }
    };
    // Drag-and-drop reorder inside the active tab
    card.addEventListener('dragstart', (e) => { dragId = id; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    card.addEventListener('dragend', () => { card.classList.remove('dragging'); });
    card.addEventListener('dragover', (e) => { if (dragId && dragId !== id) e.preventDefault(); });
    card.addEventListener('drop', async (e) => {
      e.preventDefault();
      if (!dragId || dragId === id) return;
      const order = filtered().map((v) => v.id);
      const from = order.indexOf(dragId);
      const to = order.indexOf(id);
      order.splice(to, 0, order.splice(from, 1)[0]);
      dragId = null;
      try {
        const d = await api('/api/admin/videos/reorder', { method: 'POST', body: { category: tab, ids: order } });
        all = all.map((v) => d.videos.find((u) => u.id === v.id) || v);
        render();
        toast('Order saved.', 'ok');
      } catch { toast('Could not save order.', 'err'); await reload(false); }
    });
  }

  async function reload(resetTab) {
    const d = await api('/api/admin/videos');
    all = d.videos;
    render();
  }

  // ---------- Edit modal ----------
  async function editDialog(id) {
    const d = (await api('/api/admin/videos')).videos.find((v) => v.id === id);
    const back = document.createElement('div');
    back.className = 'modalback';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Edit video" style="max-width:520px">
      <h2>Edit video</h2>
      <div class="f"><label for="ed-cat">Category *</label><select id="ed-cat">
        <option value="production"${d.category === 'production' ? ' selected' : ''}>Production (16:9)</option>
        <option value="social"${d.category === 'social' ? ' selected' : ''}>Social Media (9:16)</option>
      </select></div>
      <div class="f"><label for="ed-title">Title *</label><input type="text" id="ed-title" maxlength="120" value="${esc(d.title)}"></div>
      <div class="f"><label for="ed-desc">${d.category === 'social' ? 'Short caption' : 'Description'}</label><textarea id="ed-desc" rows="2" maxlength="2000">${esc(d.description || '')}</textarea></div>
      <div class="f"><label for="ed-client">Client name (optional)</label><input type="text" id="ed-client" maxlength="120" value="${esc(d.client_name || '')}"></div>
      <div class="f" data-ed-social><label>Platforms (social only)</label><div id="ed-plats" style="display:flex;gap:12px;flex-wrap:wrap">${meta.platforms.map((p) => `<label class="switch" style="font-size:14px"><input type="checkbox" value="${esc(p)}"${(d.platforms || []).includes(p) ? ' checked' : ''}> ${esc(p)}</label>`).join('')}</div></div>
      <div class="f"><label for="ed-order">Display order</label><input type="number" id="ed-order" step="1" value="${d.sort_order}"></div>
      <div class="f"><label for="ed-thumb">Thumbnail (PNG, JPEG or WebP, max 8 MB)</label><input type="file" id="ed-thumb" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" style="height:auto;padding:12px 16px"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
        <button class="btn ghost small" data-auto>Pick frame automatically</button>
      </div>
      <p class="err" data-err role="alert" style="color:var(--red);min-height:1.2em"></p>
      <div class="row"><button class="btn ghost small" data-x>Cancel</button>
      <button class="btn small" data-save>Save</button></div></div>`;
    document.body.appendChild(back);
    const err = back.querySelector('[data-err]');
    back.querySelector('[data-x]').onclick = () => back.remove();
    back.querySelector('#ed-cat').onchange = (e) => {
      const social = e.target.value === 'social';
      back.querySelector('label[for="ed-desc"]').textContent = social ? 'Short caption' : 'Description';
      back.querySelector('[data-ed-social]').hidden = !social;
    };
    back.querySelector('[data-ed-social]').hidden = back.querySelector('#ed-cat').value !== 'social';
    back.querySelector('[data-auto]').onclick = async () => {
      err.textContent = '';
      try {
        await api(`/api/admin/videos/${id}/auto-thumbnail`, { method: 'POST' });
        toast('Frame picked.', 'ok'); back.remove(); await reload();
      } catch (e) { err.textContent = e.error || 'Auto frame failed.'; }
    };
    back.querySelector('[data-save]').onclick = async () => {
      err.textContent = '';
      const order = parseInt(back.querySelector('#ed-order').value, 10);
      const plats = [...back.querySelectorAll('#ed-plats input:checked')].map((c) => c.value);
      try {
        await api(`/api/admin/videos/${id}`, { method: 'PATCH', body: {
          title: back.querySelector('#ed-title').value,
          description: back.querySelector('#ed-desc').value,
          category: back.querySelector('#ed-cat').value,
          client_name: back.querySelector('#ed-client').value,
          platforms: plats,
          sort_order: order,
        } });
        const thumb = back.querySelector('#ed-thumb').files[0];
        if (thumb) {
          const fd = new FormData();
          fd.append('thumbnail', thumb, thumb.name);
          const r = await fetch(`/api/admin/videos/${id}/thumbnail`, {
            method: 'POST', headers: { 'X-CSRF-Token': window.__CSRF || '' }, body: fd,
          });
          if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Thumbnail failed.'); }
        }
        toast('Saved.', 'ok'); back.remove(); await reload();
      } catch (e) { err.textContent = e.errors?.title || e.errors?.sort_order || e.errors?.category || e.message || 'Save failed.'; }
    };
  }

  // ---------- Upload flow ----------
  function uploadDialog(isReplace, videoId) {
    const defCat = isReplace ? (all.find((v) => v.id === videoId) || {}).category || tab : tab;
    const back = document.createElement('div');
    back.className = 'modalback';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Upload video" style="max-width:520px">
      <h2>${isReplace ? 'Replace video file' : 'Upload video'}</h2>
      ${isReplace ? '<p>MP4, MOV or WebM. Large files go straight to object storage when configured.</p>' : `
      <div class="f"><label for="up-cat">Category *</label><select id="up-cat">
        <option value="production">Production — cinematic 16:9</option>
        <option value="social">Social Media — vertical 9:16</option>
      </select></div>
      <div class="f"><label for="up-title">Title *</label><input type="text" id="up-title" maxlength="120"></div>
      <div class="f"><label for="up-desc" id="up-desc-lbl">Description</label><textarea id="up-desc" rows="2" maxlength="2000"></textarea></div>
      <div class="f" data-social-only hidden><label>Platforms</label><div id="up-plats" style="display:flex;gap:12px;flex-wrap:wrap">${meta.platforms.map((p) => `<label class="switch" style="font-size:14px"><input type="checkbox" value="${esc(p)}"> ${esc(p)}</label>`).join('')}</div></div>
      <div class="f"><label for="up-client">Client name (optional)</label><input type="text" id="up-client" maxlength="120"></div>
      <label class="switch"><input type="checkbox" id="up-pub"> Published (visible in portfolio feed)</label>`}
      <div class="drop" id="up-drop" style="margin-top:16px">Drag &amp; drop a video here, or click to choose<input type="file" id="up-file" accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm" hidden></div>
      <div class="progress" id="up-prog" hidden style="margin-top:16px"><i></i></div>
      <p id="up-warn" style="color:var(--gold);font-size:13px;min-height:1.2em"></p>
      <p class="err" id="up-err" role="alert" style="color:var(--red);min-height:1.2em"></p>
      <div class="row"><button class="btn ghost small" data-x>Cancel</button>
      <button class="btn small" data-go disabled>${isReplace ? 'Replace' : 'Create & upload'}</button></div></div>`;
    document.body.appendChild(back);
    const close = () => { try { xhr?.abort(); } catch { /* noop */ } back.remove(); };
    back.querySelector('[data-x]').onclick = close;
    const drop = back.querySelector('#up-drop');
    const picker = back.querySelector('#up-file');
    const go = back.querySelector('[data-go]');
    const err = back.querySelector('#up-err');
    const warn = back.querySelector('#up-warn');
    const bar = back.querySelector('#up-prog');
    const catSel = back.querySelector('#up-cat');
    let file = null, xhr = null, fileMeta = {};
    if (catSel) {
      catSel.value = defCat;
      const adapt = () => {
        const social = catSel.value === 'social';
        back.querySelectorAll('[data-social-only]').forEach((el) => { el.hidden = !social; });
        const lbl = back.querySelector('#up-desc-lbl');
        if (lbl) lbl.textContent = social ? 'Short caption' : 'Description';
        go.disabled = !file || (!isReplace && !back.querySelector('#up-title').value.trim());
        warn.textContent = '';
      };
      catSel.onchange = adapt;
      adapt();
    }
    drop.onclick = (e) => { if (e.target !== picker) picker.click(); };
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); pick(e.dataTransfer.files[0]); };
    picker.onchange = () => pick(picker.files[0]);
    function pick(f) {
      err.textContent = '';
      warn.textContent = '';
      if (!f) return;
      const cat = catSel ? catSel.value : defCat;
      if (!ACCEPT.includes(f.type)) { err.textContent = 'Only MP4, MOV and WebM are accepted.'; return; }
      if (f.size > capFor(cat) * 1048576) { err.textContent = `File exceeds the ${capFor(cat)} MB limit for ${CATS[cat]}.`; return; }
      file = f;
      drop.firstChild.textContent = `${f.name} (${(f.size / 1048576).toFixed(1)} MB) — click to change`;
      readVideoMeta(f).then((m) => {
        fileMeta = m;
        const tips = [];
        if (m.width && m.height) {
          const ratio = m.width / m.height;
          if (cat === 'production' && Math.abs(ratio - 16 / 9) > 0.08) tips.push(`Aspect ${m.width}×${m.height} is not 16:9 — recommended for Production.`);
          if (cat === 'social' && Math.abs(ratio - 9 / 16) > 0.08) tips.push(`Aspect ${m.width}×${m.height} is not 9:16 — recommended for Social Media.`);
        }
        if (cat === 'social' && m.duration && m.duration > meta.maxSocialSec) tips.push(`Duration ${Math.round(m.duration)}s exceeds the ${meta.maxSocialSec}s recommendation for Social Media.`);
        warn.textContent = tips.join(' ');
      }).catch(() => {});
      go.disabled = isReplace ? false : !back.querySelector('#up-title').value.trim();
    }
    if (!isReplace) back.querySelector('#up-title').oninput = (e) => { go.disabled = !file || !e.target.value.trim(); };
    go.onclick = async () => {
      err.textContent = '';
      go.disabled = true;
      try {
        let vid = videoId;
        let driver = 'local';
        const cat = catSel ? catSel.value : defCat;
        if (!isReplace) {
          const created = await api('/api/admin/videos', { method: 'POST', body: {
            title: back.querySelector('#up-title').value.trim(),
            description: back.querySelector('#up-desc').value.trim(),
            category: cat,
            client_name: back.querySelector('#up-client').value.trim(),
            platforms: [...back.querySelectorAll('#up-plats input:checked')].map((c) => c.value),
            published: back.querySelector('#up-pub').checked,
          } });
          vid = created.video.id;
          driver = created.storageDriver;
        } else {
          await api(`/api/admin/videos/${vid}/replace`, { method: 'POST' });
          const m = await api('/api/admin/meta');
          driver = m.storageDriver;
        }
        if (driver === 's3') await s3Upload(vid, file, fileMeta.duration, bar);
        else await localUpload(vid, file, fileMeta.duration, bar, (x) => { xhr = x; });
        back.remove();
        toast('Upload complete — processing.', 'ok');
        setTab(cat);
        await reload();
        setTimeout(reload, 8000); // pick up ready state
      } catch (e) {
        err.textContent = e.message || 'Upload failed.';
        go.disabled = false;
      }
    };
  }

  function readVideoMeta(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => {
        const m = { duration: v.duration, width: v.videoWidth, height: v.videoHeight };
        URL.revokeObjectURL(url);
        resolve(m);
      };
      v.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
      v.src = url;
    });
  }

  function localUpload(vid, file, duration, bar, saveXhr) {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append('file', file, file.name);
      const x = new XMLHttpRequest();
      saveXhr(x);
      bar.hidden = false;
      const fill = bar.querySelector('i');
      x.upload.onprogress = (e) => { if (e.lengthComputable) fill.style.width = Math.round((e.loaded / e.total) * 100) + '%'; };
      x.onload = () => {
        if (x.status >= 200 && x.status < 300) resolve();
        else {
          let msg = 'Upload failed.';
          try { msg = JSON.parse(x.responseText).error || msg; } catch { /* noop */ }
          reject(new Error(msg));
        }
      };
      x.onerror = () => reject(new Error('Network error during upload.'));
      x.onabort = () => reject(new Error('Upload cancelled.'));
      x.open('POST', `/api/admin/videos/${encodeURIComponent(vid)}/file${duration ? '?duration=' + duration : ''}`);
      x.setRequestHeader('X-CSRF-Token', window.__CSRF || '');
      x.send(fd);
    });
  }

  async function s3Upload(vid, file, duration, bar) {
    const u = await api(`/api/admin/videos/${encodeURIComponent(vid)}/upload-url`, { method: 'POST', body: { mime: file.type, filename: file.name } });
    await new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      bar.hidden = false;
      const fill = bar.querySelector('i');
      x.upload.onprogress = (e) => { if (e.lengthComputable) fill.style.width = Math.round((e.loaded / e.total) * 100) + '%'; };
      x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error('Object storage upload failed.')));
      x.onerror = () => reject(new Error('Network error during upload.'));
      x.onabort = () => reject(new Error('Upload cancelled.'));
      x.open('PUT', u.url);
      x.setRequestHeader('Content-Type', file.type);
      x.send(file);
    });
    await api(`/api/admin/videos/${encodeURIComponent(vid)}/finalize`, { method: 'POST', body: { key: u.key, duration } });
  }

  (async () => {
    await initShell('videos');
    const m = await api('/api/admin/meta');
    meta = m;
    document.getElementById('upload-btn').onclick = () => uploadDialog(false);
    document.querySelectorAll('.tab').forEach((t) => { t.onclick = () => setTab(t.dataset.tab); });
    ['v-q', 'v-status'].forEach((id) => {
      document.getElementById(id).addEventListener(id === 'v-q' ? 'input' : 'change', render);
    });
    setTab(tab);
    await reload();
  })();
})();
