'use strict';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://doubleh:doubleh@localhost:5432/doubleh_test';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { ensureTestDb, resetDb, closeDb, startServer } = require('./helpers');

let server;
let base;
let db;

function payload(over = {}) {
  return {
    full_name: 'Sara Haddad', email: 'sara@example.com', phone: '+962790000000', company: 'Acme',
    service: 'Brand Identity & Logo', description: 'A launch brand plus landing page before December.',
    preferred_date: '2099-02-10', preferred_time: '10:30', meeting_type: 'online', consent: true,
    website: '', submissionKey: 'bk-' + Math.random().toString(36).slice(2), loadedAt: Date.now() - 5000,
    ...over,
  };
}
const post = (body) => fetch(base + '/api/booking', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('booking flow', () => {
  before(async () => {
    ensureTestDb();
    db = await resetDb();
    ({ server, base } = await startServer());
  });
  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closeDb();
  });

  it('health is ok', async () => {
    const r = await fetch(base + '/api/health');
    assert.equal(r.status, 200);
  });

  it('valid booking saves and returns a reference', async () => {
    const r = await post(payload());
    assert.equal(r.status, 201);
    const data = await r.json();
    assert.equal(data.ok, true);
    assert.ok(data.reference);
    assert.equal(await db.booking.count(), 1);
  });

  it('invalid data is rejected field by field and saves nothing', async () => {
    const before = await db.booking.count();
    const r = await post(payload({
      email: 'bad', service: 'Nope', preferred_date: '2000-01-01',
      preferred_time: '99:99', consent: false, submissionKey: 'bad-' + Date.now(),
    }));
    assert.equal(r.status, 422);
    const data = await r.json();
    for (const f of ['email', 'service', 'preferred_date', 'preferred_time', 'consent']) {
      assert.ok(data.errors[f], f);
    }
    assert.equal(await db.booking.count(), before);
  });

  it('honeypot is silently accepted', async () => {
    const r = await post(payload({ website: 'http://spam.example' }));
    assert.equal(r.status, 201);
  });

  it('duplicate submission keys are deduped', async () => {
    const key = 'dup-' + Date.now();
    const a = await (await post(payload({ submissionKey: key }))).json();
    const b = await (await post(payload({ submissionKey: key }))).json();
    assert.equal(a.reference, b.reference);
    assert.equal(b.deduped, true);
  });
});
