'use strict';
/* Admin video manager API (production | social categories). Upload flows:
 * local: POST metadata -> POST :id/file (multipart stream) -> auto finalize.
 * s3:    POST metadata -> POST :id/upload-url (presigned PUT) -> POST :id/finalize.
 * Reordering is saved per category and never touches the other tab. */
const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const store = require('./db');
const auth = require('./auth');
const { effSettings } = require('./admin');
const { VIDEO_MIMES, IMAGE_MIMES, uploadRoot, receiveFile, finalizeLocal, randomId } = require('./storage');
const { presign, s3Configured } = require('./s3');
const { config } = require('./config');

const router = express.Router();
router.use(auth.requireAdmin);

const CATEGORIES = ['production', 'social'];
const PLATFORMS = ['Instagram', 'TikTok', 'YouTube Shorts', 'Facebook', 'Other'];

function cleanPlatforms(v) {
  const list = Array.isArray(v) ? v : String(v || '').split(',');
  const clean = [...new Set(list.map((s) => String(s).trim()).filter((s) => PLATFORMS.includes(s)))];
  return clean;
}
function capFor(category) {
  const e = effSettings();
  return (category === 'social' ? e.maxUploadMbSocial : e.maxUploadMbProduction) * 1024 * 1024;
}
function capLabel(category) {
  const e = effSettings();
  return category === 'social' ? e.maxUploadMbSocial : e.maxUploadMbProduction;
}

router.get('/', (req, res) => {
  const category = req.query.category;
  if (category !== undefined && !CATEGORIES.includes(category)) {
    return res.status(422).json({ ok: false, errors: { category: 'Must be production or social.' } });
  }
  res.json({ ok: true, videos: store.listVideos({ category }) });
});

router.post('/', auth.requireCsrf, (req, res) => {
  const title = String(req.body?.title || '').trim().slice(0, 120);
  const category = String(req.body?.category || '');
  const errors = {};
  if (title.length < 2) errors.title = 'Title is required.';
  if (!CATEGORIES.includes(category)) errors.category = 'Choose Production or Social Media.';
  const platforms = cleanPlatforms(req.body?.platforms);
  const clientName = String(req.body?.client_name || '').trim().slice(0, 120);
  if (Object.keys(errors).length) return res.status(422).json({ ok: false, errors });
  const e = effSettings();
  const v = store.createVideo({
    id: randomId() + Date.now().toString(36),
    title,
    description: String(req.body?.description || '').trim().slice(0, 2000),
    category,
    status: req.body?.published ? 'published' : 'draft',
    processing: 'uploading',
    sort_order: store.nextVideoOrder(category),
    platforms: JSON.stringify(platforms),
    client_name: clientName,
    uploaded_by: req.admin.name || req.admin.email,
  });
  res.status(201).json({ ok: true, video: v, storageDriver: e.storageDriver });
});

// ---- Save a manual order inside one category only ----
router.post('/reorder', auth.requireCsrf, (req, res) => {
  const category = String(req.body?.category || '');
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  if (!CATEGORIES.includes(category)) return res.status(422).json({ ok: false, errors: { category: 'Must be production or social.' } });
  if (!ids.length) return res.status(422).json({ ok: false, errors: { ids: 'Empty order.' } });
  const known = store.videoIdsIn(category, ids);
  const allInCategory = store.listVideos({ category }).map((v) => v.id);
  const sameSet = ids.length === allInCategory.length && ids.every((id) => known.includes(id));
  if (!sameSet) return res.status(422).json({ ok: false, errors: { ids: 'Order must contain exactly the videos of this category.' } });
  store.reorderVideos(category, ids);
  res.json({ ok: true, videos: store.listVideos({ category }) });
});

// ---- Local: stream the file through the server (dev/small deploys) ----
router.post('/:id/file', auth.requireCsrf, async (req, res) => {
  const v = store.findVideo(req.params.id);
  if (!v) return res.status(404).json({ ok: false, error: 'Not found.' });
  const e = effSettings();
  if (e.storageDriver === 's3' && s3Configured()) {
    return res.status(409).json({ ok: false, error: 'Storage mode is object storage — use the signed upload URL.' });
  }
  const maxBytes = capFor(v.category);
  const root = uploadRoot();
  const raw = path.join(root, 'videos', v.id + '.raw');
  try {
    const { fileInfo } = await receiveFile(req, { fieldName: 'file', allowed: VIDEO_MIMES, maxBytes, dest: raw });
    if (!fileInfo) return res.status(400).json({ ok: false, error: 'No file field in upload.' });
    if (fileInfo.tooBig) {
      fs.rmSync(raw, { force: true });
      return res.status(413).json({ ok: false, error: `File exceeds the ${capLabel(v.category)} MB limit.` });
    }
    if (fileInfo.badType) {
      fs.rmSync(raw, { force: true });
      return res.status(415).json({ ok: false, error: 'Only MP4, MOV and WebM are accepted.' });
    }
    const duration = Number(req.query.duration) || null;
    store.updateVideo(v.id, {
      processing: 'processing', size_bytes: fileInfo.bytes, mime: fileInfo.sniffed,
      original_name: fileInfo.filename.slice(0, 160), storage: 'local',
      ...(Number.isFinite(duration) && duration > 0 ? { duration_sec: Math.round(duration * 10) / 10 } : {}),
    });
    finalizeLocal(store.findVideo(v.id)); // async, status flips to ready/failed
    res.json({ ok: true, video: store.findVideo(v.id) });
  } catch (err) {
    console.error('[video upload]', err.message);
    fs.rmSync(raw, { force: true });
    res.status(500).json({ ok: false, error: 'Upload failed. Try again.' });
  }
});

// ---- S3: presigned PUT so the browser uploads directly to object storage ----
router.post('/:id/upload-url', auth.requireCsrf, (req, res) => {
  const v = store.findVideo(req.params.id);
  if (!v) return res.status(404).json({ ok: false, error: 'Not found.' });
  if (!s3Configured()) return res.status(409).json({ ok: false, error: 'Object storage is not configured.' });
  const mime = String(req.body?.mime || '').toLowerCase();
  if (!VIDEO_MIMES[mime]) return res.status(415).json({ ok: false, error: 'Only MP4, MOV and WebM are accepted.' });
  const s = config.storage;
  const key = `videos/${v.id}${VIDEO_MIMES[mime]}`;
  const url = presign({ endpoint: s.endpoint, region: s.region, bucket: s.bucket, key, accessKey: s.accessKey, secretKey: s.secretKey, method: 'PUT', contentType: mime });
  store.updateVideo(v.id, { mime, original_name: String(req.body?.filename || '').slice(0, 160), storage: 's3' });
  res.json({ ok: true, url, key, method: 'PUT', headers: { 'Content-Type': mime } });
});

router.post('/:id/finalize', auth.requireCsrf, async (req, res) => {
  const v = store.findVideo(req.params.id);
  if (!v) return res.status(404).json({ ok: false, error: 'Not found.' });
  const maxBytes = capFor(v.category);
  if (v.storage === 's3' || (effSettings().storageDriver === 's3' && s3Configured())) {
    const s = config.storage;
    const key = String(req.body?.key || '');
    if (!key.startsWith(`videos/${v.id}`)) return res.status(422).json({ ok: false, error: 'Unknown object key.' });
    try {
      const headUrl = presign({ endpoint: s.endpoint, region: s.region, bucket: s.bucket, key, accessKey: s.accessKey, secretKey: s.secretKey, method: 'HEAD', expiresSec: 60 });
      const head = await fetch(headUrl, { method: 'HEAD' });
      if (!head.ok) return res.status(422).json({ ok: false, error: 'Object not found in storage yet.' });
      const size = Number(head.headers.get('content-length') || 0);
      if (size > maxBytes) return res.status(413).json({ ok: false, error: `File exceeds the ${capLabel(v.category)} MB limit.` });
      const base = s.publicBase || `${s.endpoint}/${s.bucket}`;
      store.updateVideo(v.id, {
        processing: 'ready', video_url: `${base}/${key}`, size_bytes: size,
        duration_sec: Number(req.body?.duration) > 0 ? Math.round(Number(req.body.duration) * 10) / 10 : v.duration_sec,
      });
      return res.json({ ok: true, video: store.findVideo(v.id) });
    } catch (err) {
      return res.status(502).json({ ok: false, error: 'Could not verify the stored object.' });
    }
  }
  // Local driver without a file yet — nothing to finalize.
  return res.status(409).json({ ok: false, error: 'No uploaded file to finalize.' });
});

// ---- Replace file: resets to uploading ----
router.post('/:id/replace', auth.requireCsrf, (req, res) => {
  const v = store.findVideo(req.params.id);
  if (!v) return res.status(404).json({ ok: false, error: 'Not found.' });
  try {
    const root = uploadRoot();
    fs.rmSync(path.join(root, 'videos', v.id + '.mp4'), { force: true });
    fs.rmSync(path.join(root, 'videos', v.id + '.raw'), { force: true });
  } catch { /* noop */ }
  res.json({ ok: true, video: store.updateVideo(v.id, { processing: 'uploading', video_url: '', size_bytes: 0 }) });
});

// ---- Thumbnail: upload image or auto frame (ffmpeg only) ----
router.post('/:id/thumbnail', auth.requireCsrf, async (req, res) => {
  const v = store.findVideo(req.params.id);
  if (!v) return res.status(404).json({ ok: false, error: 'Not found.' });
  const root = uploadRoot();
  const dest = path.join(root, 'posters', v.id + '.upload');
  try {
    const { fileInfo } = await receiveFile(req, { fieldName: 'thumbnail', allowed: IMAGE_MIMES, maxBytes: 8 * 1024 * 1024, dest });
    if (!fileInfo) return res.status(400).json({ ok: false, error: 'No image in upload.' });
    if (fileInfo.badType || fileInfo.tooBig) {
      fs.rmSync(dest, { force: true });
      return res.status(fileInfo.tooBig ? 413 : 415).json({ ok: false, error: 'Thumbnail must be PNG, JPEG or WebP under 8 MB.' });
    }
    const ext = IMAGE_MIMES[fileInfo.sniffed];
    fs.renameSync(dest, path.join(root, 'posters', v.id + ext));
    res.json({ ok: true, video: store.updateVideo(v.id, { thumbnail_url: `/media/posters/${v.id}${ext}` }) });
  } catch (err) {
    fs.rmSync(dest, { force: true });
    res.status(500).json({ ok: false, error: 'Thumbnail upload failed.' });
  }
});

router.post('/:id/auto-thumbnail', auth.requireCsrf, async (req, res) => {
  try {
    const v = store.findVideo(req.params.id);
    if (!v) return res.status(404).json({ ok: false, error: 'Not found.' });
    const { ffmpegAvailable } = require('./storage');
    if (!(await ffmpegAvailable())) {
      return res.status(501).json({ ok: false, error: 'Automatic frames need ffmpeg on the server. Upload an image instead.' });
    }
    res.json({ ok: true, video: v });
  } catch (err) {
    console.error('[auto-thumbnail]', err);
    res.status(500).json({ ok: false, error: 'Something went wrong.' });
  }
});

// ---- Edit / publish toggle / delete ----
router.patch('/:id', auth.requireCsrf, (req, res) => {
  const v = store.findVideo(req.params.id);
  if (!v) return res.status(404).json({ ok: false, error: 'Not found.' });
  const b = req.body || {};
  const errors = {};
  if (b.title !== undefined && String(b.title).trim().length < 2) errors.title = 'Title is required.';
  if (b.status !== undefined && !['draft', 'published'].includes(b.status)) errors.status = 'Invalid status.';
  if (b.category !== undefined && !CATEGORIES.includes(b.category)) errors.category = 'Must be production or social.';
  if (b.sort_order !== undefined && !Number.isInteger(b.sort_order)) errors.sort_order = 'Must be an integer.';
  if (b.order_index !== undefined && !Number.isInteger(b.order_index)) errors.order_index = 'Must be an integer.';
  if (Object.keys(errors).length) return res.status(422).json({ ok: false, errors });
  const patch = {};
  if (b.title !== undefined) patch.title = String(b.title).trim().slice(0, 120);
  if (b.description !== undefined) patch.description = String(b.description).trim().slice(0, 2000);
  if (b.status !== undefined) patch.status = b.status;
  if (b.client_name !== undefined) patch.client_name = String(b.client_name).trim().slice(0, 120);
  if (b.platforms !== undefined) patch.platforms = JSON.stringify(cleanPlatforms(b.platforms));
  if (b.category !== undefined && b.category !== v.category) {
    // Category change moves the video to the end of the new category's order.
    patch.category = b.category;
    patch.sort_order = store.nextVideoOrder(b.category);
  } else if (b.sort_order !== undefined) {
    patch.sort_order = b.sort_order;
  } else if (b.order_index !== undefined) {
    patch.sort_order = b.order_index; // legacy alias
  }
  res.json({ ok: true, video: store.updateVideo(v.id, patch) });
});

router.delete('/:id', auth.requireCsrf, (req, res) => {
  const v = store.findVideo(req.params.id);
  if (!v) return res.status(404).json({ ok: false, error: 'Not found.' });
  try {
    const root = uploadRoot();
    for (const f of [`videos/${v.id}.mp4`, `videos/${v.id}.raw`, `posters/${v.id}.jpg`, `posters/${v.id}.png`, `posters/${v.id}.webp`]) {
      fs.rmSync(path.join(root, f), { force: true });
    }
  } catch { /* noop */ }
  store.deleteVideo(v.id);
  res.json({ ok: true });
});

module.exports = { videosRouter: router, CATEGORIES, PLATFORMS };
