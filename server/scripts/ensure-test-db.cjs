'use strict';
/* One-time test database setup (runs serially via npm pretest):
 * creates doubleh_test if missing, then applies all migrations. */
const { execSync } = require('node:child_process');
const path = require('node:path');

const SERVER = path.join(__dirname, '..');
const TEST_URL = process.env.TEST_DATABASE_URL || 'postgresql://doubleh:doubleh@localhost:5432/doubleh_test';
const MAINT_URL = TEST_URL.replace(/\/[^/]*$/, '/postgres');

async function main() {
  const { PrismaClient } = require('@prisma/client');
  const admin = new PrismaClient({ datasourceUrl: MAINT_URL });
  try {
    await admin.$queryRawUnsafe('CREATE DATABASE "doubleh_test"');
    console.log('[test-db] created doubleh_test');
  } catch (err) {
    if (!String(err.message).includes('already exists')) throw err;
    console.log('[test-db] doubleh_test already exists');
  } finally {
    await admin.$disconnect();
  }
  execSync('npx prisma migrate deploy', {
    cwd: SERVER,
    env: { ...process.env, DATABASE_URL: TEST_URL },
    stdio: 'inherit',
  });
  console.log('[test-db] migrations applied');
}

main().catch((err) => {
  console.error('[test-db] failed:', err.message);
  process.exit(1);
});
