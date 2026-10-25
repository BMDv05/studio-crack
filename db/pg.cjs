#!/usr/bin/env node
'use strict';

/*
 * Isolated PostgreSQL 17 instance for this copy of Double H Studio.
 *
 *   address: postgresql://doubleh:doubleh@127.0.0.1:5434/doubleh
 *   data:    db/data
 *   binaries:db/pgsql
 *   logs:    db/logs/postgres.log
 *
 * Usage:
 *   node db/pg.cjs up       start (no-op if already running)
 *   node db/pg.cjs down     fast, clean shutdown
 *   node db/pg.cjs status   show pid / port
 *
 * pg_ctl daemonises the server, so it keeps running after this script exits
 * without leaving a terminal window open. Two Windows details matter here:
 *   - the log lives outside db/data; a file held open inside the data directory
 *     makes crash recovery stall with a sharing violation;
 *   - the server is started with a minimal environment. Inheriting the full
 *     shell environment makes Windows fail to initialise backend processes
 *     (exception 0xC0000142) on the first connection.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const ROOT = __dirname;
const BIN = path.join(ROOT, 'pgsql', 'bin');
const DATA = path.join(ROOT, 'data');
const LOGS = path.join(ROOT, 'logs');
const LOG = path.join(LOGS, 'postgres.log');
const PID_FILE = path.join(DATA, 'postmaster.pid');
const HOST = '127.0.0.1';
const PORT = 5434;

const PG_CTL = path.join(BIN, 'pg_ctl.exe');

/* pg_ctl and the postmaster only need the Windows basics. Passing the full
 * shell environment is what breaks backend creation on this machine. */
const serverEnv = {};
for (const key of ['SystemRoot', 'SystemDrive', 'windir', 'TEMP', 'TMP', 'ComSpec']) {
  if (process.env[key]) serverEnv[key] = process.env[key];
}
serverEnv.LC_MESSAGES = 'en_US.UTF-8';

function readPid() {
  try {
    const first = fs.readFileSync(PID_FILE, 'utf8').split(/\r?\n/)[0].trim();
    const pid = Number(first);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function alive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function probe(host, port, timeout = 900) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(timeout, () => finish(false));
  });
}

function tail(file, lines = 14) {
  try {
    return fs
      .readFileSync(file, 'utf8')
      .trim()
      .split(/\r?\n/)
      .slice(-lines)
      .join('\n');
  } catch {
    return '(no log yet)';
  }
}

async function up() {
  if (!fs.existsSync(PG_CTL)) {
    console.error('Missing PostgreSQL binary: ' + PG_CTL);
    process.exitCode = 1;
    return;
  }

  const pid = readPid();
  if (await probe(HOST, PORT)) {
    if (pid && alive(pid)) {
      console.log('PostgreSQL already running (pid ' + pid + ') on ' + HOST + ':' + PORT);
      return;
    }
    console.error('Port ' + PORT + ' is already in use by another process.');
    console.error('Stop it first (netstat -ano | findstr :' + PORT + '), then retry.');
    process.exitCode = 1;
    return;
  }

  // A dead pid file is left behind after a crash; pg_ctl refuses to start then.
  if (pid && !alive(pid)) {
    try {
      fs.rmSync(PID_FILE, { force: true });
    } catch {
      /* ignore */
    }
  }

  fs.mkdirSync(LOGS, { recursive: true });

  const result = spawnSync(
    PG_CTL,
    [
      'start',
      '-D',
      DATA,
      '-l',
      LOG,
      '-o',
      '-p ' + PORT + ' -c listen_addresses=' + HOST,
      '-w',
      '-t',
      '90',
    ],
    { stdio: 'ignore', windowsHide: true, env: serverEnv },
  );

  if (result.error) {
    console.error(String(result.error));
    process.exitCode = 1;
    return;
  }
  if (result.status !== 0) {
    console.error('PostgreSQL failed to start (pg_ctl exit ' + result.status + '). Log tail:');
    console.error(tail(LOG));
    process.exitCode = 1;
    return;
  }

  if (!(await probe(HOST, PORT))) {
    console.error('pg_ctl reported success but the server is not accepting connections. Log tail:');
    console.error(tail(LOG));
    process.exitCode = 1;
    return;
  }

  const started = readPid();
  console.log(
    'PostgreSQL is ready on ' + HOST + ':' + PORT + (started ? ' (pid ' + started + ')' : ''),
  );
  console.log('DATABASE_URL="postgresql://doubleh:doubleh@' + HOST + ':' + PORT + '/doubleh"');
}

function down() {
  const pid = readPid();
  if (!pid || !alive(pid)) {
    console.log('PostgreSQL is already stopped.');
    return;
  }

  const result = spawnSync(PG_CTL, ['stop', '-D', DATA, '-m', 'fast', '-w', '-t', '90'], {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) {
    console.error(String(result.error));
    process.exitCode = 1;
    return;
  }
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

async function status() {
  const pid = readPid();
  const running = pid && alive(pid);
  if (running && (await probe(HOST, PORT))) {
    console.log('PostgreSQL running (pid ' + pid + ') on ' + HOST + ':' + PORT);
    console.log('database "doubleh", user "doubleh"');
    return;
  }
  if (running) {
    console.log('PostgreSQL process ' + pid + ' is up but not accepting connections on ' + PORT + '.');
    return;
  }
  console.log('PostgreSQL is stopped.');
}

const command = process.argv[2];

(async () => {
  if (command === 'up') await up();
  else if (command === 'down') down();
  else if (command === 'status') await status();
  else {
    console.log('Usage: node db/pg.cjs up|down|status');
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
