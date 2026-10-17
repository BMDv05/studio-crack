'use strict';
/* /api/admin/videos/* — portfolio manager: metadata, per-category reorder,
 * local streaming upload or signed direct-to-storage upload, thumbnails. */
const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const { db } = require('../db');
const { config } = require('../config');
const auth = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');
const { effSettings } = require('../services/settings');
const { VIDEO_MIMES, IMAGE_MIMES, uploadRoot, receiveFile, finalizeLocal, randomId } = require('../services/storage');
const { presign, s3Configured } = require('../services/s3');

const router = express.Router();
router.use(auth.requireAdmin);

const CATEGORIES = ['production', 'social'];
const PLATFORMS = ['Instagram', 'TikTok', 'YouTube Shorts', 'Facebook', 'Other'];

function cleanPlatforms(v) {
  const list = Array.isArray(v) ? v : String(v || '').split(',');
  return [...new Set(list.map((s) => String(s).trim()).filter((s) => PLATFORMS.includes(s)))];
}
function toAdminVideo(v) {
  return {
    id: v.id, title: v.title, description: v.description, category: v.category,
    status: v.status, processing: v.processing,
    video_url: v.videoUrl, thumbnail_url: v.thumbnailUrl,
    duration_sec: v.durationSec, size_bytes: Number(v.sizeBytes),
    mime: v.mime, storage: v.storage, original_name: v.originalName,
    sort_order: v.sortOrder, platforms: Array.isArray(v.platforms) ? v.platforms : [],
    client_name: v.clientName, uploaded_by: v.uploadedBy,
    created_at: v.createdAt, updated_at: v.updatedAt,
  };
}
function capFor(e, category) {
  return (category === 'social' ? e.maxUploadMbSocial : e.maxUploadMbProduction) * 1024 * 1024;
}

router.get('/', asyncHandler(async (req, res) => {
  const { category } = req.query;
  if (category !== undefined && !CATEGORIES.includes(category)) {
    return res.status(422).json({ ok: false, errors: { category: 'Must be production or social.' } });
  }
  const videos = await db.video.findMany({
    where: category ? { category } : {},
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
  res.json({ ok: true, videos: videos.map(toAdminVideo) });
}));

router.post('/', auth.requireCsrf, asyncHandler(async (req, res) => {
  const title = String(req.body?.title || '').trim().slice(0, 120);
  const category = String(req.body?.category || '');
  const errors = {};
  if (title.length < 2) errors.title = 'Title is required.';
  if (!CATEGORIES.includes(category)) errors.category = 'Choose Production or Social Media.';
  if (Object.keys(errors).length) return res.status(422).json({ ok: false, errors });
  const e = await effSettings();
  const maxSort = await db.video.aggregate({ where: { category }, _max: { sortOrder: true } });
  const v = await db.video.create({
    data: {
      id: randomId() + Date.now().toString(36),
      title,
      description: String(req.body?.description || '').trim().slice(0, 2000),
      category,
      status: req.body?.published ? 'published' : 'draft',
      processing: 'uploading',
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      platforms: cleanPlatforms(req.body?.platforms),
      clientName: String(req.body?.client_name || '').trim().slice(0, 120),
      uploadedBy: req.admin.name || req.admin.email,
    },
  });
  res.status(201).json({ ok: true, video: toAdminVideo(v), storageDriver: e.storageDriver });
}));

router.post('/reorder', auth.requireCsrf, asyncHandler(async (req, res) => {
  const category = String(req.body?.category || '');
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  if (!CATEGORIES.includes(category)) return res.status(422).json({ ok: false, errors: { category: 'Must be production or social.' } });
  if (!ids.length) return res.status(422).json({ ok: false, errors: { ids: 'Empty order.' } });
  const inCat = await db.video.findMany({ where: { category }, select: { id: true } });
  const known = new Set(inCat.map((v) => v.id));
  if (ids.length !== inCat.length || !ids.every((id) => known.has(id))) {
    return res.status(422).json({ ok: false, errors: { ids: 'Order must contain exactly the videos of this category.' } });
  }
  await db.$transaction(ids.map((id, i) => db.video.update({ where: { id }, data: { sortOrder: i } })));
  const videos = await db.video.findMany({ where: { category }, orderBy: [{ sortOrder: 'asc' }] });
  res.json({ ok: true, videos: videos.map(toAdminVideo) });
}));

router.post('/:id/file', auth.requireCsrf, asyncHandler(async (req, res) => {
  const v = await db.video.findUnique({ where: { id: req.params.id } });
  if (!v) return res.status(404).json({ ok: false, error: 'Not found.' });
  const e = await effSettings();
  if (e.storageDriver === 's3' && s3Configured()) {
    return res.status(409).json({ ok: false, error: 'Storage mode is object storage — use the signed upload URL.' });
  }
  const maxBytes = capFor(e, v.category);
  const root = uploadRoot();
  const raw = path.join(root, 'videos', v.id + '.raw');
  const { fileInfo } = await receiveFile(req, { fieldName: 'file', allowed: VIDEO_MIMES, maxBytes, dest: raw });
  if (!fileInfo) return res.status(400).json({ ok: false, error: 'No file field in upload.' });
  if (fileInfo.tooBig) {
    fs.rmSync(raw, { force: true });
    return res.status(413).json({ ok: false, error: `File exceeds the ${Math.round(maxBytes / 1048576)} MB limit.` });
  }
  if (fileInfo.badType) {
    fs.rmSync(raw, { force: true });
    return res.status(415).json({ ok: false, error: 'Only MP4, MOV and WebM are accepted.' });
  }
  const duration = Number(req.query.duration) || null;
  await db.video.update({
    where: { id: v.id },
    data: {
      processing: 'processing', sizeBytes: BigInt(fileInfo.bytes), mime: fileInfo.sniffed,
      originalName: fileInfo.filename.slice(0, 160), storage: 'local',
      ...(Number.isFinite(duration) && duration > 0 ? { durationSec: Math.round(duration * 10) / 10 } : {}),
    },
  });
  finalizeLocal(v.id);
  const fresh = await db.video.findUnique({ where: { id: v.id } });
  res.json({ ok: true, video: toAdminVideo(fresh) });
}));

router.post('/:id/upload-url', auth.requireCsrf, asyncHandler(async (req, res) => {
  const v = await db.video.findUnique({ where: { id: req.params.id } });
  if (!v) return res.status(404).json({ ok: false, error: 'Not found.' });
  if (!s3Configured()) return res.status(409).json({ ok: false, error: 'Object storage is not configured.' });
  const mime = String(req.body?.mime || '').toLowerCase();
  if (!VIDEO_MIMES[mime]) return res.status(415).json({ ok: false, error: 'Only MP4, MOV and WebM are accepted.' });
  const s = config.storage;
  const key = `videos/${v.id}${VIDEO_MIMES[mime]}`;
  const url = presign({ endpoint: s.endpoint, region: s.region, bucket: s.bucket, key, accessKey: s.accessKey, secretKey: s.secretKey, method: 'PUT', contentType: mime });
  await db.video.update({ where: { id: v.id }, data: { mime, originalName: String(req.body?.filename || '').slice(0, 160), storage: 's3' } });
  res.json({ ok: true, url, key, method: 'PUT', headers: { 'Content-Type': mime } });
}));

router.post('/:id/finalize', auth.requireCsrf, asyncHandler(async (req, res) => {
  const v = await db.video.findUnique({ where: { id: req.params.id } });
  if (!v) return res.status(404).json({ ok: false, error: 'Not found.' });
  const e = await effSettings();
  const maxBytes = capFor(e, v.category);
  if (v.storage === 's3' || (e.storageDriver === 's3' && s3Configured())) {
    const s = config.storage;
    const key = String(req.body?.key || '');
    if (!key.startsWith(`videos/${v.id}`)) return res.status(422).json({ ok: false, error: 'Unknown object key.' });
    const headUrl = presign({ endpoint: s.endpoint, region: s.region, bucket: s.bucket, key, accessKey: s.accessKey, secretKey: s.secretKey, method: 'HEAD', expiresSec: 60 });
    const head = await fetch(headUrl, { method: 'HEAD' });
    if (!head.ok) return res.status(422).json({ ok: false, error: 'Object not found in storage yet.' });
    const size = Number(head.headers.get('content-length') || 0);
    if (size > maxBytes) return res.status(413).json({ ok: false, error: `File exceeds the ${Math.round(maxBytes / 1048576)} MB limit.` });
    const base = s.publicBase || `${s.endpoint}/${s.bucket}`;
    const updated = await db.video.update({
      where: { id: v.id },
      data: {
        processing: 'ready', videoUrl: `${base}/${key}`, sizeBytes: BigInt(size),
        durationSec: Number(req.body?.duration) > 0 ? Math.round(Number(req.body.duration) * 10) / 10 : v.durationSec,
      },
    });
    return res.json({ ok: true, video: toAdminVideo(updated) });
  }
  return res.status(409).json({ ok: false, error: 'No uploaded file to finalize.' });
}));

router.post('/:id/replace', auth.requireCsrf, asyncHandler(async (req, res) => {
  const v = await db.video.findUnique({ where: { id: req.params.id } });
  if (!v) return res.status(404).json({ ok: false, error: 'Not found.' });
  try {
    const root = uploadRoot();
    fs.rmSync(path.join(root, 'videos', v.id + '.mp4'), { force: true });
    fs.rmSync(path.join(root, 'videos', v.id + '.raw'), { force: true });
  } catch { /* noop */ }
  const updated = await db.video.update({ where: { id: v.id }, data: { processing: 'uploading', videoUrl: '', sizeBytes: BigInt(0) } });
  res.json({ ok: true, video: toAdminVideo(updated) });
}));

router.post('/:id/thumbnail', auth.requireCsrf, asyncHandler(async (req, res) => {
  const v = await db.video.findUnique({ where: { id: req.params.id } });
  if (!v) return res.status(404).json({ ok: false, error: 'Not found.' });
  const root = uploadRoot();
  const dest = path.join(root, 'posters', v.id + '.upload');
  const { fileInfo } = await receiveFile(req, { fieldName: 'thumbnail', allowed: IMAGE_MIMES, maxBytes: 8 * 1024 * 1024, dest });
  if (!fileInfo) return res.status(400).json({ ok: false, error: 'No image in upload.' });
  if (fileInfo.badType || fileInfo.tooBig) {
    fs.rmSync(dest, { force: true });
    return res.status(fileInfo.tooBig ? 413 : 415).json({ ok: false, error: 'Thumbnail must be PNG, JPEG or WebP under 8 MB.' });
  }
  const ext = IMAGE_MIMES[fileInfo.sniffed];
  fs.renameSync(dest, path.join(root, 'posters', v.id + ext));
  const updated = await db.video.update({ where: { id: v.id }, data: { thumbnailUrl: `/media/posters/${v.id}${ext}` } });
  res.json({ ok: true, video: toAdminVideo(updated) });
}));

router.post('/:id/auto-thumbnail', auth.requireCsrf, asyncHandler(async (req, res) => {
  const v = await db.video.findUnique({ where: { id: req.params.id } });
  if (!v) return res.status(404).json({ ok: false, error: 'Not found.' });
  const { ffmpegAvailable } = require('../services/storage');
  if (!(await ffmpegAvailable())) {
    return res.status(501).json({ ok: false, error: 'Automatic frames need ffmpeg on the server. Upload an image instead.' });
  }
  res.json({ ok: true, video: toAdminVideo(v) });
}));

router.patch('/:id', auth.requireCsrf, asyncHandler(async (req, res) => {
  const v = await db.video.findUnique({ where: { id: req.params.id } });
  if (!v) return res.status(404).json({ ok: false, error: 'Not found.' });
  const b = req.body || {};
  const errors = {};
  if (b.title !== undefined && String(b.title).trim().length < 2) errors.title = 'Title is required.';
  if (b.status !== undefined && !['draft', 'published'].includes(b.status)) errors.status = 'Invalid status.';
  if (b.category !== undefined && !CATEGORIES.includes(b.category)) errors.category = 'Must be production or social.';
  if (b.sort_order !== undefined && !Number.isInteger(b.sort_order)) errors.sort_order = 'Must be an integer.';
  if (Object.keys(errors).length) return res.status(422).json({ ok: false, errors });
  const patch = {};
  if (b.title !== undefined) patch.title = String(b.title).trim().slice(0, 120);
  if (b.description !== undefined) patch.description = String(b.description).trim().slice(0, 2000);
  if (b.status !== undefined) patch.status = b.status;
  if (b.client_name !== undefined) patch.clientName = String(b.client_name).trim().slice(0, 120);
  if (b.platforms !== undefined) patch.platforms = cleanPlatforms(b.platforms);
  if (b.category !== undefined && b.category !== v.category) {
    patch.category = b.category;
    const maxSort = await db.video.aggregate({ where: { category: b.category }, _max: { sortOrder: true } });
    patch.sortOrder = (maxSort._max.sortOrder ?? -1) + 1;
  } else if (b.sort_order !== undefined) {
    patch.sortOrder = b.sort_order;
  }
  const updated = await db.video.update({ where: { id: v.id }, data: patch });
  res.json({ ok: true, video: toAdminVideo(updated) });
}));

router.delete('/:id', auth.requireCsrf, asyncHandler(async (req, res) => {
  const v = await db.video.findUnique({ where: { id: req.params.id } });
  if (!v) return res.status(404).json({ ok: false, error: 'Not found.' });
  try {
    const root = uploadRoot();
    for (const f of [`videos/${v.id}.mp4`, `videos/${v.id}.raw`, `posters/${v.id}.jpg`, `posters/${v.id}.png`, `posters/${v.id}.webp`]) {
      fs.rmSync(path.join(root, f), { force: true });
    }
  } catch { /* noop */ }
  await db.video.delete({ where: { id: v.id } });
  res.json({ ok: true });
}));

module.exports = { videosRouter: router, toAdminVideo, CATEGORIES, PLATFORMS };
