'use strict';
// Integration checks create and remove only their own clearly named test records.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const base = process.env.DEPLOYMENT_URL;
const password = process.env.STUDIO_ADMIN_PASSWORD;
if (!base || !password) throw new Error('Set DEPLOYMENT_URL and STUDIO_ADMIN_PASSWORD.');
let cookie = '', csrf = '', bookingId, videoId;
async function request(path, { method = 'GET', body, authenticated = true, expected = 200, headers = {} } = {}) {
  if (authenticated && cookie) headers.Cookie = cookie;
  if (authenticated && csrf && method !== 'GET') headers['X-CSRF-Token'] = csrf;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  const data = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  return { response, data };
}
async function main() {
  assert.equal((await request('/api/health')).data.ok, true);
  const meta = (await request('/api/meta')).data;
  assert.ok(meta.services.length);
  console.log('PASS health and database-backed public options');
  const login = await request('/api/admin/login', { method: 'POST', body: { email: 'info@double-h-studio.com', password } });
  cookie = login.response.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
  csrf = login.data.csrf;
  assert.ok(csrf);
  await request('/api/admin/me');
  await request('/api/admin/requests', { authenticated: false, expected: 401 });
  await request('/api/admin/settings', { method: 'PATCH', body: {}, authenticated: false, headers: { Cookie: cookie }, expected: 403 });
  console.log('PASS admin login, session, anonymous denial and CSRF protection');
  const body = {
    full_name: 'Deployment verification', email: 'info@double-h-studio.com',
    service: meta.services[0], description: 'Automatic deployment verification. This test request is removed after the checks.',
    preferred_date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), preferred_time: '12:00',
    meeting_type: 'online', consent: true, loadedAt: Date.now() - 10000,
    submissionKey: `deployment-${crypto.randomUUID()}`,
  };
  const booking = (await request('/api/booking', { method: 'POST', authenticated: false, body, expected: 201 })).data;
  bookingId = booking.reference;
  const repeated = (await request('/api/booking', { method: 'POST', authenticated: false, body, expected: 201 })).data;
  assert.equal(repeated.reference, bookingId);
  assert.equal(repeated.deduped, true);
  const detail = (await request(`/api/admin/requests/${bookingId}`)).data;
  assert.equal(detail.request.full_name, body.full_name);
  console.log(`PASS booking save, idempotency and admin retrieval (studio email: ${detail.request.studio_email_sent}, client email: ${detail.request.client_email_sent})`);
  const created = (await request('/api/admin/videos', { method: 'POST', expected: 201, body: { title: 'Deployment verification', category: 'production', published: false } })).data;
  videoId = created.video.id;
  const file = fs.readFileSync(require('node:path').join(__dirname, '../../client/public/video/studio-build.mp4'));
  const signed = (await request(`/api/admin/videos/${videoId}/upload-url`, { method: 'POST', body: { mime: 'video/mp4', filename: 'deployment-test.mp4', size: file.length, duration: 1 } })).data;
  const upload = await fetch(signed.url, { method: signed.method, headers: signed.headers, body: file, signal: AbortSignal.timeout(90000) });
  assert.ok(upload.ok, `Signed upload failed: ${upload.status}`);
  const finalized = (await request(`/api/admin/videos/${videoId}/finalize`, { method: 'POST', body: { key: signed.key, duration: 1 } })).data.video;
  assert.equal(finalized.processing, 'ready');
  const hidden = await fetch(base + finalized.video_url);
  assert.equal(hidden.status, 404, 'Draft must remain private');
  await request(`/api/admin/videos/${videoId}`, { method: 'PATCH', body: { status: 'published' } });
  const publicVideos = (await request('/api/videos', { authenticated: false })).data.videos;
  assert.ok(publicVideos.some(v => v.id === videoId));
  const media = await fetch(base + finalized.video_url, { headers: { Range: 'bytes=0-15' } });
  assert.equal(media.status, 206, 'Video must support streaming ranges');
  assert.equal((await media.arrayBuffer()).byteLength, 16);
  console.log('PASS signed upload, file validation, private drafts, publishing and video streaming');
}
main().finally(async () => {
  if (videoId) await request(`/api/admin/videos/${videoId}`, { method: 'DELETE' });
  if (bookingId) await request(`/api/admin/requests/${bookingId}`, { method: 'DELETE' });
  if (cookie) await request('/api/admin/logout', { method: 'POST', body: {} });
  console.log('Test records and session cleaned up.');
}).catch(error => { console.error(error.message); process.exitCode = 1; });
