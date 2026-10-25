'use strict';
const express = require('express');
const crypto = require('node:crypto');
const { db } = require('../db');
const auth = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');
const { broker } = require('../services/cloudStorage');
const { effSettings } = require('../services/settings');
const { sniff, VIDEO_MIMES } = require('../services/storage');
const router = express.Router();
const guarded = [asyncHandler(auth.requireAdmin), auth.requireCsrf];

router.post('/:id/upload-url', ...guarded, asyncHandler(async (req, res) => {
  const video = await db.video.findUnique({ where: { id: req.params.id } });
  if (!video) return res.status(404).json({ ok: false, error: 'Not found.' });
  const mime = String(req.body?.mime || '');
  const size = Number(req.body?.size);
  const e = await effSettings();
  const cap = Math.min(50, video.category === 'social' ? e.maxUploadMbSocial : e.maxUploadMbProduction) * 1048576;
  if (!VIDEO_MIMES[mime]) return res.status(415).json({ ok: false, error: 'Only MP4, MOV and WebM are accepted.' });
  if (!Number.isFinite(size) || size < 12 || size > cap) return res.status(413).json({ ok: false, error: `File must be under ${cap / 1048576} MB.` });
  const duration = Number(req.body?.duration);
  if (video.category === 'social' && duration > e.maxSocialSec) return res.status(422).json({ ok: false, error: 'Social video exceeds the duration limit.' });
  const key = `videos/${video.id}-${crypto.randomBytes(8).toString('hex')}${VIDEO_MIMES[mime]}`;
  const signed = await broker('upload', { key });
  await db.video.update({ where: { id: video.id }, data: {
    videoUrl: `/media/${key}`, processing: 'uploading', mime, storage: 'supabase',
    originalName: String(req.body?.filename || '').slice(0, 160),
  } });
  res.json({ ok: true, url: signed.url, key, method: 'PUT', headers: { 'Content-Type': mime } });
}));

router.post('/:id/finalize', ...guarded, asyncHandler(async (req, res) => {
  const video = await db.video.findUnique({ where: { id: req.params.id } });
  const key = String(req.body?.key || '');
  if (!video || video.videoUrl !== `/media/${key}` || video.storage !== 'supabase') return res.status(422).json({ ok: false, error: 'Unknown upload.' });
  const file = await broker('verify', { key });
  const e = await effSettings();
  const cap = Math.min(50, video.category === 'social' ? e.maxUploadMbSocial : e.maxUploadMbProduction) * 1048576;
  const duration = Number(req.body?.duration);
  if (file.size < 12 || file.size > cap || sniff(Buffer.from(file.head)) !== video.mime || (video.category === 'social' && duration > e.maxSocialSec)) {
    await broker('delete', { key });
    await db.video.update({ where: { id: video.id }, data: { processing: 'failed' } });
    return res.status(415).json({ ok: false, error: 'Uploaded video failed validation.' });
  }
  const updated = await db.video.update({ where: { id: video.id }, data: {
    processing: 'ready', sizeBytes: BigInt(file.size),
    ...(Number.isFinite(duration) && duration > 0 ? { durationSec: duration } : {}),
  } });
  res.json({ ok: true, video: require('./adminVideos').toAdminVideo(updated) });
}));

router.post('/:id/replace', ...guarded, asyncHandler(async (req, res) => {
  const video = await db.video.findUnique({ where: { id: req.params.id } });
  if (!video) return res.status(404).json({ ok: false, error: 'Not found.' });
  if (video.videoUrl.startsWith('/media/')) await broker('delete', { key: video.videoUrl.slice(7) });
  await db.video.update({ where: { id: video.id }, data: { processing: 'uploading', videoUrl: '', sizeBytes: 0n } });
  res.json({ ok: true });
}));

router.delete('/:id', ...guarded, asyncHandler(async (req, res) => {
  const video = await db.video.findUnique({ where: { id: req.params.id } });
  if (!video) return res.status(404).json({ ok: false, error: 'Not found.' });
  for (const path of [video.videoUrl, video.thumbnailUrl]) {
    if (path.startsWith('/media/')) await broker('delete', { key: path.slice(7) });
  }
  await db.video.delete({ where: { id: video.id } });
  res.json({ ok: true });
}));

router.post('/:id/thumbnail', ...guarded, asyncHandler(async (req, res) => {
  const video = await db.video.findUnique({ where: { id: req.params.id } });
  if (!video) return res.status(404).json({ ok: false, error: 'Not found.' });
  const Busboy = require('busboy');
  const file = await new Promise((resolve, reject) => {
    const parser = Busboy({ headers: req.headers, limits: { files: 1, fileSize: 8 * 1048576 } });
    let output;
    parser.on('file', (name, stream) => {
      if (name !== 'thumbnail') { stream.resume(); return; }
      const chunks = [];
      let tooBig = false;
      stream.on('limit', () => { tooBig = true; });
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => { output = { buffer: Buffer.concat(chunks), tooBig }; });
      stream.on('error', reject);
    });
    parser.on('finish', () => resolve(output));
    parser.on('error', reject);
    req.pipe(parser);
  });
  const mime = file && sniff(file.buffer.subarray(0, 64));
  const extensions = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
  if (!file || file.tooBig || !extensions[mime]) return res.status(415).json({ ok: false, error: 'Thumbnail must be PNG, JPEG or WebP under 8 MB.' });
  const key = `posters/${video.id}-${crypto.randomBytes(8).toString('hex')}${extensions[mime]}`;
  const signed = await broker('upload', { key });
  const uploaded = await fetch(signed.url, { method: 'PUT', headers: { 'Content-Type': mime }, body: file.buffer });
  if (!uploaded.ok) throw new Error('Thumbnail upload failed');
  const updated = await db.video.update({ where: { id: video.id }, data: { thumbnailUrl: `/media/${key}` } });
  if (video.thumbnailUrl.startsWith('/media/')) await broker('delete', { key: video.thumbnailUrl.slice(7) });
  res.json({ ok: true, video: require('./adminVideos').toAdminVideo(updated) });
}));

router.post('/:id/auto-thumbnail', ...guarded, (_req, res) => res.status(501).json({ ok: false, error: 'Upload a thumbnail image for this video.' }));
router.post('/:id/file', ...guarded, (_req, res) => res.status(409).json({ ok: false, error: 'Use a signed upload URL.' }));
module.exports = { router };
