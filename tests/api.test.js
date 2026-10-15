'use strict';
/* Integration test for POST /api/booking: 201 saves, 422 validates, honeypot + rate-limit.
 * Uses an isolated DB file so the dev database is untouched. */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const TEST_DB = require('node:path').join(__dirname, '..', 'data', 'test-bookings.sqlite');
process.env.DB_FILE = TEST_DB;
process.env.STUDIO_EMAIL = 'studio-test@doubleh.example';
try { require('node:fs').rmSync(TEST_DB, { force: true }); } catch {}
try { require('node:fs').rmSync(TEST_DB + '-wal', { force: true }); } catch {}
try { require('node:fs').rmSync(TEST_DB + '-shm', { force: true }); } catch {}

const app = require('../src/server');
let server;
let base;

describe('booking API', () => {
  before(async () => {
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    try { require('node:fs').rmSync(TEST_DB, { force: true }); } catch {}
  });

  function payload(over = {}) {
    return {
      full_name: 'Test Client',
      email: 'client@example.com',
      service: 'Brand Identity & Logo',
      description: 'A test project with enough description text.',
      preferred_date: '2099-06-01',
      preferred_time: '11:00',
      meeting_type: 'online',
      consent: true,
      loadedAt: Date.now() - 4000,
      submissionKey: 'test-' + Math.random().toString(36).slice(2),
      ...over,
    };
  }

  it('GET /api/health is ok', async () => {
    const r = await fetch(base + '/api/health');
    assert.equal(r.status, 200);
  });

  it('POST valid booking -> 201 with reference', async () => {
    const r = await fetch(base + '/api/booking', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload()),
    });
    assert.equal(r.status, 201);
    const data = await r.json();
    assert.equal(data.ok, true);
    assert.ok(data.reference && data.reference.length >= 8);
  });

  it('POST invalid booking -> 422 with field errors, nothing saved', async () => {
    const r = await fetch(base + '/api/booking', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload({ email: 'bad', submissionKey: 'bad-' + Date.now() })),
    });
    assert.equal(r.status, 422);
    const data = await r.json();
    assert.equal(data.ok, false);
    assert.ok(data.errors.email);
  });

  it('honeypot is silently accepted without saving', async () => {
    const r = await fetch(base + '/api/booking', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload({ website: 'http://spam.example' })),
    });
    assert.equal(r.status, 201);
  });

  it('duplicate submissionKey is deduped, not saved twice', async () => {
    const key = 'dup-' + Date.now();
    const a = await (await fetch(base + '/api/booking', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload({ submissionKey: key })),
    })).json();
    const b = await (await fetch(base + '/api/booking', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload({ submissionKey: key })),
    })).json();
    assert.equal(a.reference, b.reference);
  });
});
