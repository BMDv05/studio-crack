'use strict';
/* Public portfolio wiring: /work must load the feed renderer, and the feed
 * must only expose published + ready videos. */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_FILE = require('node:path').join(__dirname, '..', 'data', 'test-public.sqlite');
for (const f of ['test-public.sqlite', 'test-public.sqlite-wal', 'test-public.sqlite-shm']) {
  try { require('node:fs').rmSync(require('node:path').join(__dirname, '..', 'data', f), { force: true }); } catch {}
}

const app = require('../src/server');
let server;
let base;

describe('public portfolio', () => {
  before(async () => {
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    for (const f of ['test-public.sqlite', 'test-public.sqlite-wal', 'test-public.sqlite-shm']) {
      try { require('node:fs').rmSync(require('node:path').join(__dirname, '..', 'data', f), { force: true }); } catch {}
    }
  });

  it('/work has the segmented switch, both views, player and SEO', async () => {
    const html = await (await fetch(base + '/work')).text();
    assert.ok(html.includes('/work?type=production'));
    assert.ok(html.includes('/work?type=social'));
    assert.ok(html.includes('id="grid-production"'));
    assert.ok(html.includes('id="grid-social"'));
    assert.ok(html.includes('id="player"'));
    assert.ok(html.includes('id="video-ld"'));
    assert.ok(html.includes('Production films'));
    assert.ok(html.includes('/work.js'));
  });

  it('/work.js routes views, renders both layouts and updates SEO', async () => {
    const js = await (await fetch(base + '/work.js')).text();
    assert.ok(js.includes('/api/videos?category='));
    assert.ok(js.includes('viewFromUrl') && js.includes('popstate') && js.includes('pushState'));
    assert.ok(js.includes('social-grid') || js.includes('socialCard'));
    assert.ok(js.includes('document.title'));
  });

  it('feed exposes only published + ready videos', async () => {
    const feed = await (await fetch(base + '/api/videos')).json();
    assert.equal(feed.ok, true);
    assert.ok(Array.isArray(feed.videos));
    assert.ok(feed.videos.every((v) => v.status === 'published' && v.processing === 'ready' && v.video_url));
  });

  it('feed validates category, 400 otherwise', async () => {
    for (const good of ['production', 'social']) {
      const r = await fetch(base + `/api/videos?category=${good}`);
      assert.equal(r.status, 200);
      const feed = await r.json();
      assert.ok(feed.videos.every((v) => v.category === good));
    }
    const bad = await fetch(base + '/api/videos?category=bogus');
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).ok, false);
  });
});
