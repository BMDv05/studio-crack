'use strict';
/* Test helpers: migrate a scratch database, truncate + seed per file.
 * Each test file runs in its own process; set DATABASE_URL before requiring. */
const path = require('node:path');

const SERVER = path.join(__dirname, '..');
const TEST_URL = process.env.TEST_DATABASE_URL || 'postgresql://doubleh:doubleh@localhost:5432/doubleh_test';

function ensureTestDb() {
  // No-op: `npm run pretest` migrates the shared test database serially.
  // Tests only truncate + seed (see resetDb) so files can run in parallel.
}

async function resetDb() {
  const { db } = require('../src/db');
  await db.bookingEvent.deleteMany();
  await db.booking.deleteMany();
  await db.video.deleteMany();
  await db.adminSession.deleteMany();
  await db.admin.deleteMany();
  await db.setting.deleteMany();
  const { hashPassword } = require('../src/middleware/auth');
  await db.admin.create({
    data: {
      email: process.env.TEST_ADMIN_EMAIL || 'admin@test.example',
      name: 'Test Admin',
      passwordHash: hashPassword(process.env.TEST_ADMIN_PASSWORD || 'test-admin-pass-123'),
    },
  });
  return db;
}

async function closeDb() {
  const { db } = require('../src/db');
  await db.$disconnect();
}

async function startServer() {
  const app = require('../src/app');
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function login(base, email, password) {
  const r = await fetch(base + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await r.json();
  const cookie = (r.headers.getSetCookie() || []).map((c) => c.split(';')[0]).join('; ');
  return { status: r.status, data, cookie, csrf: data.csrf };
}

module.exports = { TEST_URL, ensureTestDb, resetDb, closeDb, startServer, login };
