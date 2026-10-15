'use strict';
/* Video categories: per-tab isolation, reorder scoping, category moves,
 * drafts exclusion, per-category settings. */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const TEST_DB = path.join(__dirname, '..', 'data', 'test-cats.sqlite');
process.env.DB_FILE = TEST_DB;
process.env.UPLOAD_DIR = path.join(__dirname, '..', 'test-uploads-cats');
process.env.ADMIN_EMAIL = 'cats@test.example';
process.env.ADMIN_PASSWORD = 'test-cats-pass-123';
process.env.ADMIN_NAME = 'Cats Admin';
for (const f of [TEST_DB, TEST_DB + '-wal', TEST_DB + '-shm']) {
  try { fs.rmSync(f, { force: true }); } catch {}
}
try { fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true }); } catch {}

const app = require('../src/server');
let server;
let base;
let adminCookie = '';
let csrf = '';
const H = (h = {}) => ({ Cookie: adminCookie, 'X-CSRF-Token': csrf, ...h });
const J = { 'Content-Type': 'application/json' };

describe('video categories', () => {
  before(async () => {
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    const r = await fetch(base + '/api/admin/login', {
      method: 'POST', headers: J,
      body: JSON.stringify({ email: 'cats@test.example', password: 'test-cats-pass-123' }),
    });
    assert.equal(r.status, 200);
    csrf = (await r.json()).csrf;
    adminCookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  });
  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    for (const f of [TEST_DB, TEST_DB + '-wal', TEST_DB + '-shm']) {
      try { fs.rmSync(f, { force: true }); } catch {}
    }
    try { fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true }); } catch {}
  });

  let prodA, prodB, socA;
  it('creates production and social videos; category required', async () => {
    const mk = async (body) => fetch(base + '/api/admin/videos', { method: 'POST', headers: H(J), body: JSON.stringify(body) });
    assert.equal((await mk({ title: 'No Cat' })).status, 422);
    assert.equal((await mk({ title: 'Bad Cat', category: 'movies' })).status, 422);
    prodA = (await (await mk({ title: 'Prod A', category: 'production', client_name: 'Acme' })).json()).video;
    prodB = (await (await mk({ title: 'Prod B', category: 'production' })).json()).video;
    socA = (await (await mk({ title: 'Soc A', category: 'social', platforms: ['TikTok', 'Bogus'], client_name: 'Shop' })).json()).video;
    assert.equal(prodA.category, 'production');
    assert.equal(socA.platforms.join(','), 'TikTok'); // allowlist sanitized
    assert.equal(socA.sort_order, 0); // independent order per category
    assert.equal(prodB.sort_order, 1);
  });

  it('list filters per category; invalid rejected', async () => {
    const only = async (q) => (await (await fetch(base + '/api/admin/videos' + q, { headers: { Cookie: adminCookie } })).json()).videos;
    assert.equal((await only('?category=production')).length, 2);
    assert.equal((await only('?category=social')).length, 1);
    assert.equal((await only('')).length, 3);
    const bad = await fetch(base + '/api/admin/videos?category=nope', { headers: { Cookie: adminCookie } });
    assert.equal(bad.status, 422);
  });

  it('reordering one tab never touches the other', async () => {
    const r = await fetch(base + '/api/admin/videos/reorder', {
      method: 'POST', headers: H(J),
      body: JSON.stringify({ category: 'production', ids: [prodB.id, prodA.id] }),
    });
    assert.equal(r.status, 200);
    const order = (await r.json()).videos.map((v) => v.id);
    assert.deepEqual(order, [prodB.id, prodA.id]);
    const soc = await (await fetch(base + '/api/admin/videos?category=social', { headers: { Cookie: adminCookie } })).json();
    assert.equal(soc.videos[0].sort_order, 0); // untouched
    // Partial/wrong-category order rejected
    const short = await fetch(base + '/api/admin/videos/reorder', {
      method: 'POST', headers: H(J),
      body: JSON.stringify({ category: 'production', ids: [prodA.id] }),
    });
    assert.equal(short.status, 422);
    const cross = await fetch(base + '/api/admin/videos/reorder', {
      method: 'POST', headers: H(J),
      body: JSON.stringify({ category: 'production', ids: [prodA.id, socA.id] }),
    });
    assert.equal(cross.status, 422);
  });

  it('changing category moves the video to the end of the new order', async () => {
    const r = await fetch(base + `/api/admin/videos/${prodA.id}`, {
      method: 'PATCH', headers: H(J), body: JSON.stringify({ category: 'social' }),
    });
    assert.equal(r.status, 200);
    const moved = (await r.json()).video;
    assert.equal(moved.category, 'social');
    assert.equal(moved.sort_order, 1); // after Soc A (0)
    const prod = await (await fetch(base + '/api/admin/videos?category=production', { headers: { Cookie: adminCookie } })).json();
    assert.ok(!prod.videos.some((v) => v.id === prodA.id));
  });

  it('public feed: drafts excluded, categories isolated', async () => {
    // publish one per category; leave the rest draft
    for (const [id] of [[prodB.id], [socA.id]]) {
      await fetch(base + `/api/admin/videos/${id}`, { method: 'PATCH', headers: H(J), body: JSON.stringify({ status: 'published' }) });
    }
    // Not ready (no file) -> still excluded
    const all = await (await fetch(base + '/api/videos')).json();
    assert.equal(all.videos.length, 0);
    const bad = await fetch(base + '/api/videos?category=tv');
    assert.equal(bad.status, 400);
  });

  it('per-category settings validate and persist', async () => {
    const bad = await fetch(base + '/api/admin/settings', {
      method: 'PATCH', headers: H(J), body: JSON.stringify({ maxUploadMbSocial: 99999 }),
    });
    assert.equal(bad.status, 422);
    const ok = await fetch(base + '/api/admin/settings', {
      method: 'PATCH', headers: H(J),
      body: JSON.stringify({ maxUploadMbProduction: 500, maxUploadMbSocial: 200, maxSocialSec: 90 }),
    });
    assert.equal(ok.status, 200);
    const s = await (await fetch(base + '/api/admin/settings', { headers: { Cookie: adminCookie } })).json();
    assert.equal(s.settings.maxUploadMbSocial, 200);
    assert.equal(s.settings.maxSocialSec, 90);
  });
});
