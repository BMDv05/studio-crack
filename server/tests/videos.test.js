'use strict';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://doubleh:doubleh@localhost:5432/doubleh_test';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { ensureTestDb, resetDb, closeDb, startServer, login } = require('./helpers');

const EMAIL = 'admin@test.example';
const PASS = 'test-admin-pass-123';
let server;
let base;
let cookie = '';
let csrf = '';
const H = (h = {}) => ({ Cookie: cookie, 'X-CSRF-Token': csrf, ...h });
const J = { 'Content-Type': 'application/json' };

describe('video categories', () => {
  before(async () => {
    ensureTestDb();
    await resetDb();
    ({ server, base } = await startServer());
    const s = await login(base, EMAIL, PASS);
    assert.equal(s.status, 200);
    cookie = s.cookie;
    csrf = s.csrf;
  });
  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closeDb();
  });

  let prodA, prodB, socA;
  it('creates per category; category required; platforms sanitized', async () => {
    const mk = (body) => fetch(base + '/api/admin/videos', { method: 'POST', headers: H(J), body: JSON.stringify(body) });
    assert.equal((await mk({ title: 'No Cat' })).status, 422);
    prodA = (await (await mk({ title: 'Prod A', category: 'production', client_name: 'Acme' })).json()).video;
    prodB = (await (await mk({ title: 'Prod B', category: 'production' })).json()).video;
    socA = (await (await mk({ title: 'Soc A', category: 'social', platforms: ['TikTok', 'Bogus'] })).json()).video;
    assert.deepEqual(socA.platforms, ['TikTok']);
    assert.equal(socA.sort_order, 0);
    assert.equal(prodB.sort_order, 1);
  });

  it('upload validates type and per-category size on the server', async () => {
    const bad = new FormData();
    bad.append('file', new Blob(['not a video'], { type: 'text/plain' }), 'note.txt');
    assert.equal((await fetch(base + `/api/admin/videos/${prodA.id}/file`, { method: 'POST', headers: H(), body: bad })).status, 415);

    await fetch(base + '/api/admin/settings', { method: 'PATCH', headers: H(J), body: JSON.stringify({ maxUploadMbProduction: 1 }) });
    const big = new FormData();
    big.append('file', new Blob([Buffer.alloc(2 * 1024 * 1024)], { type: 'video/mp4' }), 'big.mp4');
    assert.equal((await fetch(base + `/api/admin/videos/${prodA.id}/file`, { method: 'POST', headers: H(), body: big })).status, 413);
  });

  it('reorder is scoped to its category', async () => {
    const r = await fetch(base + '/api/admin/videos/reorder', {
      method: 'POST', headers: H(J), body: JSON.stringify({ category: 'production', ids: [prodB.id, prodA.id] }),
    });
    assert.deepEqual((await r.json()).videos.map((v) => v.id), [prodB.id, prodA.id]);
    const soc = await (await fetch(base + '/api/admin/videos?category=social', { headers: { Cookie: cookie } })).json();
    assert.equal(soc.videos[0].sort_order, 0);
    const short = await fetch(base + '/api/admin/videos/reorder', {
      method: 'POST', headers: H(J), body: JSON.stringify({ category: 'production', ids: [prodA.id] }),
    });
    assert.equal(short.status, 422);
  });

  it('category change moves to the end of the new order; feed stays clean', async () => {
    const moved = await (await fetch(base + `/api/admin/videos/${prodA.id}`, {
      method: 'PATCH', headers: H(J), body: JSON.stringify({ category: 'social' }),
    })).json();
    assert.equal(moved.video.category, 'social');
    assert.equal(moved.video.sort_order, 1);

    // publish one per category without files -> still excluded (not ready)
    for (const id of [prodB.id, socA.id]) {
      await fetch(base + `/api/admin/videos/${id}`, { method: 'PATCH', headers: H(J), body: JSON.stringify({ status: 'published' }) });
    }
    const all = await (await fetch(base + '/api/videos')).json();
    assert.equal(all.videos.length, 0);
    assert.equal((await fetch(base + '/api/videos?category=nope')).status, 400);

    await fetch(base + `/api/admin/videos/${prodB.id}`, { method: 'DELETE', headers: H() });
    await fetch(base + `/api/admin/videos/${socA.id}`, { method: 'DELETE', headers: H() });
    await fetch(base + `/api/admin/videos/${prodA.id}`, { method: 'DELETE', headers: H() });
  });
});
