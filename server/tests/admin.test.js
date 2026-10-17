'use strict';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://doubleh:doubleh@localhost:5432/doubleh_test';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { ensureTestDb, resetDb, closeDb, startServer, login } = require('./helpers');

const EMAIL = 'admin@test.example';
const PASS = 'test-admin-pass-123';
let server;
let base;
let db;
let cookie = '';
let csrf = '';
const H = (h = {}) => ({ Cookie: cookie, 'X-CSRF-Token': csrf, ...h });
const J = { 'Content-Type': 'application/json' };

describe('admin dashboard', () => {
  before(async () => {
    ensureTestDb();
    db = await resetDb();
    ({ server, base } = await startServer());
  });
  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closeDb();
  });

  it('auth: rejects bad credentials, signs in with cookies + CSRF', async () => {
    const bad = await login(base, EMAIL, 'wrong');
    assert.equal(bad.status, 401);
    const me0 = await fetch(base + '/api/admin/me');
    assert.equal(me0.status, 401);
    const good = await login(base, EMAIL, PASS);
    assert.equal(good.status, 200);
    assert.ok(good.csrf);
    cookie = good.cookie;
    csrf = good.csrf;
    const raw = await fetch(base + '/api/admin/login', {
      method: 'POST', headers: J, body: JSON.stringify({ email: EMAIL, password: PASS }),
    });
    assert.ok(/httponly/i.test(raw.headers.getSetCookie().join('; ')));
    const me = await (await fetch(base + '/api/admin/me', { headers: { Cookie: cookie } })).json();
    assert.equal(me.admin.email, EMAIL);
  });

  it('auth: mutations require the CSRF header', async () => {
    const r = await fetch(base + '/api/admin/requests/x/notes', {
      method: 'POST', headers: { Cookie: cookie, ...J }, body: JSON.stringify({ text: 'hi' }),
    });
    assert.equal(r.status, 403);
  });

  let requestId;
  it('requests: full lifecycle with events, confirm, export, delete', async () => {
    const created = await fetch(base + '/api/booking', {
      method: 'POST', headers: J,
      body: JSON.stringify({
        full_name: 'Admin Case', email: 'case@example.com', company: 'CaseCo',
        service: 'Brand Identity & Logo', description: 'A dashboard test project with enough detail.',
        preferred_date: '2099-08-01', preferred_time: '09:30', meeting_type: 'in_person',
        consent: true, loadedAt: Date.now() - 5000, submissionKey: 'adm-' + Date.now(),
      }),
    });
    assert.equal(created.status, 201);
    requestId = (await created.json()).reference;

    const stats = await (await fetch(base + '/api/admin/stats', { headers: { Cookie: cookie } })).json();
    assert.equal(stats.unread, 1);

    const list = await (await fetch(base + '/api/admin/requests?search=caseco', { headers: { Cookie: cookie } })).json();
    assert.equal(list.total, 1);
    assert.equal(list.rows[0].unread, true);

    const detail = await (await fetch(base + `/api/admin/requests/${requestId}`, { headers: { Cookie: cookie } })).json();
    assert.equal(detail.request.meeting_type, 'in_person');
    assert.ok(detail.request.consent_at);

    const patched = await fetch(base + `/api/admin/requests/${requestId}`, {
      method: 'PATCH', headers: H(J), body: JSON.stringify({ status: 'confirmed' }),
    });
    assert.equal((await patched.json()).request.status, 'confirmed');

    const noted = await fetch(base + `/api/admin/requests/${requestId}/notes`, {
      method: 'POST', headers: H(J), body: JSON.stringify({ text: 'VIP client.' }),
    });
    assert.equal(noted.status, 201);
    const events = (await noted.json()).events;
    assert.ok(events.some((e) => e.kind === 'status'));
    assert.ok(events.some((e) => e.kind === 'note'));

    const conf = await fetch(base + `/api/admin/requests/${requestId}/send-confirmation`, { method: 'POST', headers: H() });
    assert.equal((await conf.json()).request.confirm_email_sent, true);

    const csv = await fetch(base + '/api/admin/requests/export?status=confirmed', { headers: { Cookie: cookie } });
    assert.equal(csv.status, 200);
    assert.match(await csv.text(), /Admin Case/);

    const del = await fetch(base + `/api/admin/requests/${requestId}`, { method: 'DELETE', headers: H() });
    assert.equal(del.status, 200);
    assert.equal((await fetch(base + `/api/admin/requests/${requestId}`, { headers: { Cookie: cookie } })).status, 404);
  });

  it('settings: read, validate, persist + password change + logout', async () => {
    const s0 = await (await fetch(base + '/api/admin/settings', { headers: { Cookie: cookie } })).json();
    assert.equal(s0.settings.timezone, 'Asia/Amman');
    const bad = await fetch(base + '/api/admin/settings', {
      method: 'PATCH', headers: H(J), body: JSON.stringify({ timezone: 'Mars/Olympus' }),
    });
    assert.equal(bad.status, 422);
    await fetch(base + '/api/admin/settings', {
      method: 'PATCH', headers: H(J), body: JSON.stringify({ sla: 'within 1 working day' }),
    });
    const s1 = await (await fetch(base + '/api/admin/settings', { headers: { Cookie: cookie } })).json();
    assert.equal(s1.settings.sla, 'within 1 working day');

    const pwBad = await fetch(base + '/api/admin/password', {
      method: 'POST', headers: H(J), body: JSON.stringify({ current: 'nope', next: 'new-password-123' }),
    });
    assert.equal(pwBad.status, 401);
    const pw = await fetch(base + '/api/admin/password', {
      method: 'POST', headers: H(J), body: JSON.stringify({ current: PASS, next: 'new-password-123' }),
    });
    assert.equal(pw.status, 200);

    const out = await fetch(base + '/api/admin/logout', { method: 'POST', headers: H() });
    assert.equal(out.status, 200);
    assert.equal((await fetch(base + '/api/admin/me', { headers: { Cookie: cookie } })).status, 401);
  });
});
