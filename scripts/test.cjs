'use strict';
/*
 * `npm test` for this copy: point the test suite at this copy's isolated
 * database (server/.env → port 5434) instead of the default localhost:5432
 * used by the original project.
 *
 * The test database is derived from DATABASE_URL by swapping the database
 * name for "doubleh_test", exactly like server/scripts/ensure-test-db.cjs.
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ENV_FILE = path.join(ROOT, 'server', '.env');

function databaseUrl() {
  try {
    const line = fs
      .readFileSync(ENV_FILE, 'utf8')
      .split(/\r?\n/)
      .find((l) => /^\s*DATABASE_URL\s*=/.test(l));
    if (!line) return null;
    return line
      .slice(line.indexOf('=') + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  } catch {
    return null;
  }
}

const base = process.env.DATABASE_URL || databaseUrl();
const env = { ...process.env };
if (!process.env.TEST_DATABASE_URL && base) {
  env.TEST_DATABASE_URL = base.replace(/\/[^/]*$/, '/doubleh_test');
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const child = spawn(npm, ['--prefix', 'server', 'test'], {
  cwd: ROOT,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (error) => {
  console.error(String(error));
  process.exit(1);
});
