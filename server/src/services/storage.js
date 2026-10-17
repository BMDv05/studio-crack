'use strict';
/* Video file handling: local streaming upload (busboy, magic-byte checked),
 * ffmpeg-optional finalize (transcode + poster when available, pass-through
 * otherwise). S3 mode is coordinated in routes/adminVideos.js. */
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const Busboy = require('busboy');
const { db } = require('../db');
const { config } = require('../config');

const VIDEO_MIMES = { 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm' };
const IMAGE_MIMES = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

function sniff(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    return buf.toString('ascii', 8, 12).startsWith('qt') ? 'video/quicktime' : 'video/mp4';
  }
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'video/webm';
  return null;
}

function uploadRoot() {
  const dir = path.isAbsolute(config.uploads.dir)
    ? config.uploads.dir : path.join(__dirname, '..', '..', config.uploads.dir);
  fs.mkdirSync(path.join(dir, 'videos'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'posters'), { recursive: true });
  return dir;
}
function ffmpegAvailable() {
  return new Promise((resolve) => {
    execFile('ffmpeg', ['-version'], { timeout: 8000 }, (err) => resolve(!err));
  });
}

function receiveFile(req, { fieldName, allowed, maxBytes, dest }) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: maxBytes } });
    let done = false;
    let fileInfo = null;
    let tooBig = false;
    let badType = null;
    const finish = (result) => {
      if (done) return;
      done = true;
      try { req.unpipe(bb); } catch { /* noop */ }
      resolve(result);
    };
    bb.on('file', (name, stream, info) => {
      if (name !== fieldName) { stream.resume(); return; }
      fileInfo = { declared: (info.mimeType || '').toLowerCase(), filename: info.filename || 'upload' };
      const out = fs.createWriteStream(dest);
      let bytes = 0;
      let head = Buffer.alloc(0);
      let sniffed = null;
      stream.on('data', (chunk) => {
        bytes += chunk.length;
        if (head.length < 64) {
          head = Buffer.concat([head, chunk]).subarray(0, 64);
          sniffed = sniff(head);
          if (!sniffed || !allowed[sniffed]) {
            badType = sniffed || 'unknown';
            stream.unpipe(out);
            stream.resume();
          }
        }
        if (!badType && !out.destroyed) {
          if (!out.write(chunk)) stream.pause();
          out.once('drain', () => stream.resume());
        }
      });
      stream.on('limit', () => { tooBig = true; });
      stream.on('end', () => {
        out.end(() => {
          fileInfo.bytes = bytes;
          fileInfo.sniffed = sniffed;
          fileInfo.tooBig = tooBig;
          fileInfo.badType = badType;
          finish({ fileInfo });
        });
      });
      stream.on('error', (err) => { try { out.destroy(); } catch { /* noop */ } reject(err); });
    });
    bb.on('error', reject);
    bb.on('finish', () => { if (!fileInfo) finish({ fileInfo: null }); });
    req.pipe(bb);
  });
}

async function finalizeLocal(videoId) {
  const fail = async (why) => {
    await db.video.update({ where: { id: videoId }, data: { processing: 'failed' } }).catch(() => {});
    console.error(`[videos] finalize ${videoId} failed: ${why}`);
  };
  const root = uploadRoot();
  const raw = path.join(root, 'videos', videoId + '.raw');
  const web = path.join(root, 'videos', videoId + '.mp4');
  const poster = path.join(root, 'posters', videoId + '.jpg');
  if (!fs.existsSync(raw)) return fail('uploaded file missing');
  if (!(await ffmpegAvailable())) {
    fs.renameSync(raw, web);
    await db.video.update({ where: { id: videoId }, data: { processing: 'ready', videoUrl: `/media/videos/${videoId}.mp4`, storage: 'local' } });
    console.log(`[videos] ${videoId} ready (pass-through, no ffmpeg)`);
    return;
  }
  await db.video.update({ where: { id: videoId }, data: { processing: 'processing' } });
  const run = (args) => new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { timeout: 20 * 60 * 1000 }, (err, stdout, stderr) => (err ? reject(new Error(String(stderr).slice(-500))) : resolve(stdout)));
  });
  try {
    await run(['-y', '-i', raw, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-movflags', '+faststart', web]);
    try {
      await run(['-y', '-i', web, '-ss', '00:00:01', '-frames:v', '1', '-q:v', '4', poster]);
      await db.video.update({ where: { id: videoId }, data: { processing: 'ready', videoUrl: `/media/videos/${videoId}.mp4`, thumbnailUrl: `/media/posters/${videoId}.jpg`, storage: 'local' } });
    } catch {
      await db.video.update({ where: { id: videoId }, data: { processing: 'ready', videoUrl: `/media/videos/${videoId}.mp4`, storage: 'local' } });
    }
    fs.rmSync(raw, { force: true });
    console.log(`[videos] ${videoId} ready (transcoded)`);
  } catch (err) {
    fail(err.message);
  }
}

function randomId() {
  return crypto.randomBytes(8).toString('hex');
}

module.exports = { VIDEO_MIMES, IMAGE_MIMES, sniff, uploadRoot, ffmpegAvailable, receiveFile, finalizeLocal, randomId };
