'use strict';
/* Admin dashboard integration tests: auth, requests workflow, videos, settings.
 * Isolated DB + upload dir so dev data is untouched. */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const TEST_DB = path.join(__dirname, '..', 'data', 'test-admin.sqlite');
const TEST_UPLOADS = path.join(__dirname, '..', 'test-uploads');
process.env.DB_FILE = TEST_DB;
process.env.UPLOAD_DIR = TEST_UPLOADS;
process.env.ADMIN_EMAIL = 'admin@test.example';
process.env.ADMIN_PASSWORD = 'test-admin-pass-123';
process.env.ADMIN_NAME = 'Test Admin';
for (const f of [TEST_DB, TEST_DB + '-wal', TEST_DB + '-shm']) {
  try { fs.rmSync(f, { force: true }); } catch {}
}
try { fs.rmSync(TEST_UPLOADS, { recursive: true, force: true }); } catch {}

const app = require('../src/server');
let server;
let base;
let adminCookie = '';
let csrf = '';

function authHeaders(extra = {}) {
  return { Cookie: adminCookie, 'X-CSRF-Token': csrf, ...extra };
}

describe('admin dashboard', () => {
  before(async () => {
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    for (const f of [TEST_DB, TEST_DB + '-wal', TEST_DB + '-shm']) {
      try { fs.rmSync(f, { force: true }); } catch {}
    }
    try { fs.rmSync(TEST_UPLOADS, { recursive: true, force: true }); } catch {}
  });

  it('login page is public with noindex; /admin redirects when signed out', async () => {
    const login = await fetch(base + '/admin/login');
    assert.equal(login.status, 200);
    assert.match(login.headers.get('x-robots-tag') || '', /noindex/);
    const dash = await fetch(base + '/admin', { redirect: 'manual' });
    assert.equal(dash.status, 302);
    const me = await fetch(base + '/api/admin/me');
    assert.equal(me.status, 401);
  });

  it('rejects bad credentials; rate-limit shape is generic', async () => {
    const r = await fetch(base + '/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.example', password: 'wrong' }),
    });
    assert.equal(r.status, 401);
  });

  it('signs in with seeded admin and sets httpOnly + CSRF cookies', async () => {
    const r = await fetch(base + '/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.example', password: 'test-admin-pass-123' }),
    });
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.equal(data.ok, true);
    assert.ok(data.csrf);
    csrf = data.csrf;
    const setCookies = r.headers.getSetCookie();
    const sid = setCookies.find((c) => c.startsWith('dh_admin='));
    const csr = setCookies.find((c) => c.startsWith('dh_csrf='));
    assert.ok(sid && /httponly/i.test(sid));
    assert.ok(csr);
    adminCookie = setCookies.map((c) => c.split(';')[0]).join('; ');
    const me = await fetch(base + '/api/admin/me', { headers: { Cookie: adminCookie } });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).admin.email, 'admin@test.example');
  });

  it('blocks state-changing API without CSRF token', async () => {
    const r = await fetch(base + '/api/admin/requests/x/notes', {
      method: 'POST', headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hi' }),
    });
    assert.equal(r.status, 403);
  });

  let requestId;
  it('booking flow feeds the dashboard; stats + list + read + status + notes', async () => {
    const created = await fetch(base + '/api/booking', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Admin Case', email: 'case@example.com', company: 'CaseCo',
        service: 'Brand Identity & Logo', description: 'A dashboard test project with enough detail.',
        preferred_date: '2099-08-01', preferred_time: '09:30', meeting_type: 'in_person',
        consent: true, loadedAt: Date.now() - 5000, submissionKey: 'adm-' + Date.now(),
      }),
    });
    assert.equal(created.status, 201);
    requestId = (await created.json()).reference;

    const stats = await (await fetch(base + '/api/admin/stats', { headers: { Cookie: adminCookie } })).json();
    assert.equal(stats.unread, 1);

    const list = await (await fetch(base + '/api/admin/requests?search=caseco', { headers: { Cookie: adminCookie } })).json();
    assert.equal(list.total, 1);
    assert.equal(list.rows[0].unread, true);

    const detail = await (await fetch(base + `/api/admin/requests/${requestId}`, { headers: { Cookie: adminCookie } })).json();
    assert.equal(detail.request.email, 'case@example.com');
    assert.equal(detail.request.meeting_type, 'in_person');

    const stats2 = await (await fetch(base + '/api/admin/stats', { headers: { Cookie: adminCookie } })).json();
    assert.equal(stats2.unread, 0); // opening marks read

    const patched = await fetch(base + `/api/admin/requests/${requestId}`, {
      method: 'PATCH', headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status: 'confirmed' }),
    });
    assert.equal(patched.status, 200);
    assert.equal((await patched.json()).request.status, 'confirmed');

    const noted = await fetch(base + `/api/admin/requests/${requestId}/notes`, {
      method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ text: 'VIP client — call before emailing.' }),
    });
    assert.equal(noted.status, 201);
    const events = (await noted.json()).events;
    assert.ok(events.some((e) => e.kind === 'status' && e.detail.includes('confirmed')));
    assert.ok(events.some((e) => e.kind === 'note' && e.detail.includes('VIP')));
  });

  it('sends confirmation email and exports CSV, then deletes', async () => {
    const conf = await fetch(base + `/api/admin/requests/${requestId}/send-confirmation`, {
      method: 'POST', headers: authHeaders(),
    });
    assert.equal(conf.status, 200);
    assert.equal((await conf.json()).request.confirm_email_sent, true);

    const csv = await fetch(base + '/api/admin/requests/export?status=confirmed', { headers: { Cookie: adminCookie } });
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    assert.match(await csv.text(), /Admin Case/);

    const del = await fetch(base + `/api/admin/requests/${requestId}`, { method: 'DELETE', headers: authHeaders() });
    assert.equal(del.status, 200);
    const gone = await fetch(base + `/api/admin/requests/${requestId}`, { headers: { Cookie: adminCookie } });
    assert.equal(gone.status, 404);
  });

  it('videos: create, reject bad type, enforce size cap, toggle, delete', async () => {
    const created = await fetch(base + '/api/admin/videos', {
      method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ title: 'Test Reel', description: 'desc', category: 'production' }),
    });
    assert.equal(created.status, 201);
    const vid = (await created.json()).video.id;

    const bad = new FormData();
    bad.append('file', new Blob(['not a video'], { type: 'text/plain' }), 'note.txt');
    const badRes = await fetch(base + `/api/admin/videos/${vid}/file`, {
      method: 'POST', headers: authHeaders(), body: bad,
    });
    assert.equal(badRes.status, 415);

    await fetch(base + '/api/admin/settings', {
      method: 'PATCH', headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ maxUploadMbProduction: 1 }),
    });
    const big = new FormData();
    big.append('file', new Blob([Buffer.alloc(2 * 1024 * 1024)], { type: 'video/mp4' }), 'big.mp4');
    const bigRes = await fetch(base + `/api/admin/videos/${vid}/file`, {
      method: 'POST', headers: authHeaders(), body: big,
    });
    assert.equal(bigRes.status, 413);

    const pub = await fetch(base + `/api/admin/videos/${vid}`, {
      method: 'PATCH', headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status: 'published' }),
    });
    assert.equal(pub.status, 200);

    const feed = await (await fetch(base + '/api/videos')).json();
    assert.ok(!feed.videos.some((v) => v.id === vid)); // not ready -> excluded

    const del = await fetch(base + `/api/admin/videos/${vid}`, { method: 'DELETE', headers: authHeaders() });
    assert.equal(del.status, 200);
  });

  it('settings: read, validate, persist', async () => {
    const before = await (await fetch(base + '/api/admin/settings', { headers: { Cookie: adminCookie } })).json();
    assert.ok(before.settings.timezone);

    const bad = await fetch(base + '/api/admin/settings', {
      method: 'PATCH', headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ timezone: 'Mars/Olympus' }),
    });
    assert.equal(bad.status, 422);

    const ok = await fetch(base + '/api/admin/settings', {
      method: 'PATCH', headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ sla: 'within 1 working day' }),
    });
    assert.equal(ok.status, 200);
    const after = await (await fetch(base + '/api/admin/settings', { headers: { Cookie: adminCookie } })).json();
    assert.equal(after.settings.sla, 'within 1 working day');
  });

  it('logout destroys the session', async () => {
    const out = await fetch(base + '/api/admin/logout', { method: 'POST', headers: authHeaders() });
    assert.equal(out.status, 200);
    const me = await fetch(base + '/api/admin/me', { headers: { Cookie: adminCookie } });
    assert.equal(me.status, 401);
  });
});
