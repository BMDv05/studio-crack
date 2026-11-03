'use strict';
/* List, create or reset a Studio admin account in any database.
 *
 *   DATABASE_URL='postgresql://...' node scripts/set-admin.cjs --list
 *   DATABASE_URL='postgresql://...' node scripts/set-admin.cjs <email> <password> [name]
 *
 * Exists because a deployment never seeds an admin: `seedAdmin` runs in the
 * local Node boot (src/index.js) and in `npm run seed`, but the production
 * Worker has no boot step, so a fresh database has zero admins and every
 * sign-in is refused with "Invalid email or password".
 *
 * The row is created when the email is unknown and its password replaced when
 * it is known, so one command covers both a missing account and a forgotten
 * password. Every existing session for that account is dropped afterwards.
 *
 * DATABASE_URL is taken from the environment first, then from server/.env, so a
 * local run keeps working while a production run is a single inline override. */
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const bcrypt = require('bcryptjs');
const { createDb } = require('../src/db');

const COST = 12; // must match hashPassword() in src/middleware/auth.js
const MIN_PASSWORD = 10; // must match the rule seedAdmin() enforces

/* Host/database only: the connection string carries the password. */
function describeTarget(raw) {
  try {
    const url = new URL(raw);
    return `${url.hostname}:${url.port || 5432}${url.pathname}`;
  } catch {
    return '(unreadable DATABASE_URL)';
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[admin] DATABASE_URL is not set. Pass the database you want to change, e.g.');
    console.error("[admin]   DATABASE_URL='postgresql://...' npm --prefix server run admin:set -- info@double-h-studio.com 'new-password'");
    process.exit(1);
  }

  const [emailArg, password, nameArg] = process.argv.slice(2);
  const db = createDb(url);
  try {
    const admins = await db.admin.findMany({
      orderBy: { createdAt: 'asc' },
      select: { email: true, name: true, createdAt: true },
    });
    console.log(`[admin] ${describeTarget(url)} holds ${admins.length} account(s)`);
    for (const a of admins) {
      console.log(`[admin]   ${a.email} — ${a.name || '(no name)'} — created ${a.createdAt.toISOString().slice(0, 10)}`);
    }

    if (!emailArg || emailArg === '--list') {
      if (!admins.length) console.log('[admin] no admin exists here: sign-in is impossible until one is created.');
      return;
    }

    const email = emailArg.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`"${emailArg}" is not an email address.`);
    if (!password || password.length < MIN_PASSWORD) {
      throw new Error(`Password must be at least ${MIN_PASSWORD} characters.`);
    }

    const passwordHash = bcrypt.hashSync(password, COST);
    const existing = admins.some((a) => a.email === email);
    const admin = existing
      ? await db.admin.update({
        where: { email },
        data: { passwordHash, name: nameArg || undefined },
      })
      : await db.admin.create({
        data: { email, name: nameArg || 'Studio Admin', passwordHash },
      });
    const sessions = await db.adminSession.deleteMany({ where: { adminId: admin.id } });

    if (!bcrypt.compareSync(password, admin.passwordHash)) {
      throw new Error('The stored hash does not verify against the password given.');
    }
    console.log(`[admin] ${existing ? 'password reset for' : 'created'} ${admin.email} (${sessions.count} existing session(s) dropped)`);
    console.log('[admin] sign in, then change the password under Settings → Change password.');
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error('[admin] failed:', err.message);
  if (err.code === 'P1001') console.error('[admin] cannot reach that database — check the host and port, and that the project is not paused.');
  if (err.code === 'P1000') console.error('[admin] authentication failed — check the user and password inside DATABASE_URL.');
  if (/did not initialize|@prisma\/client.*not found/i.test(String(err.message))) {
    console.error('[admin] run `npm --prefix server run generate` first (prisma generate).');
  }
  process.exit(1);
});

