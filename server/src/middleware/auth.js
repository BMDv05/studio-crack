'use strict';
/* Admin authentication: bcrypt passwords, DB-backed sessions in httpOnly
 * cookies, double-submit CSRF tokens, login rate limiting. */
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { config } = require('../config');

function hashPassword(plain) {
  if (process.env.WORKER_RUNTIME === 'true') {
    return db.$queryRaw`select extensions.crypt(${String(plain)}, extensions.gen_salt('bf', 12)) as hash`.then(rows => rows[0].hash);
  }
  return bcrypt.hashSync(String(plain), 12);
}
function checkPassword(plain, hash) {
  if (process.env.WORKER_RUNTIME === 'true') {
    return db.$queryRaw`select extensions.crypt(${String(plain)}, ${hash}) = ${hash} as valid`.then(rows => rows[0].valid);
  }
  try {
    return bcrypt.compareSync(String(plain), hash);
  } catch {
    return false;
  }
}
function randHex(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}
function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

// ---- Seed the first admin from env (no public sign-up) ----
async function seedAdmin() {
  if (await db.admin.count() > 0) return { seeded: false };
  const { email, password, name } = config.adminSeed;
  if (!email || !password) {
    console.log('[admin] no admins exist and ADMIN_EMAIL/ADMIN_PASSWORD are not set — login is disabled until they are.');
    return { seeded: false };
  }
  if (password.length < 10) {
    console.log('[admin] ADMIN_PASSWORD must be at least 10 characters — seed refused.');
    return { seeded: false };
  }
  await db.admin.create({ data: { email, name, passwordHash: await hashPassword(password) } });
  console.log(`[admin] seeded admin account ${email}`);
  return { seeded: true };
}

// ---- Minimal cookie handling (no dependency) ----
function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[part.slice(0, i).trim()] = '';
    }
  }
  return out;
}
function cookieHeader(name, value, { maxAge, httpOnly = true, path = '/' } = {}) {
  let s = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=Lax`;
  if (maxAge !== undefined) s += `; Max-Age=${maxAge}`;
  if (httpOnly) s += '; HttpOnly';
  if (config.secureCookies) s += '; Secure';
  return s;
}
function clearCookie(name) {
  return `${name}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly`;
}

// ---- Sessions (sliding idle window) ----
async function createSession(adminId) {
  const token = randHex(32);
  const csrf = randHex(24);
  await db.adminSession.create({ data: { tokenHash: sha256(token), adminId, csrf } });
  return { token, csrf };
}
async function sessionFromRequest(req) {
  const { dh_admin: token } = parseCookies(req);
  if (!token || token.length < 32) return null;
  const sess = await db.adminSession.findUnique({
    where: { tokenHash: sha256(token) },
    include: { admin: true },
  });
  if (!sess) return null;
  if (Date.now() - sess.lastSeenAt.getTime() > config.sessionMinutes * 60 * 1000) {
    await db.adminSession.delete({ where: { tokenHash: sess.tokenHash } }).catch(() => {});
    return null; // idle timeout — auto logout
  }
  await db.adminSession.update({
    where: { tokenHash: sess.tokenHash },
    data: { lastSeenAt: new Date() },
  });
  return sess;
}
async function requireAdmin(req, res, next) {
  const sess = await sessionFromRequest(req);
  if (!sess) return res.status(401).json({ ok: false, error: 'Not signed in.' });
  req.admin = { id: sess.admin.id, email: sess.admin.email, name: sess.admin.name };
  req.csrfToken = sess.csrf;
  next();
}
// State-changing calls must present the double-submit CSRF token.
function requireCsrf(req, res, next) {
  const cookies = parseCookies(req);
  const header = req.headers['x-csrf-token'];
  if (!header || !cookies.dh_csrf || header !== cookies.dh_csrf || header !== req.csrfToken) {
    return res.status(403).json({ ok: false, error: 'Invalid CSRF token. Reload and try again.' });
  }
  next();
}

// ---- Login rate limiting (per IP + per email, in-memory) ----
const loginHits = new Map();
function loginAllowed(key, max) {
  if (process.env.WORKER_RUNTIME === 'true') return require('../services/rateLimit').allowed(`login:${sha256(key)}`, max, config.loginRateLimit.windowMs);
  const now = Date.now();
  const arr = (loginHits.get(key) || []).filter((t) => now - t < config.loginRateLimit.windowMs);
  arr.push(now);
  loginHits.set(key, arr);
  if (loginHits.size > 2000) loginHits.clear();
  return arr.length <= max;
}

module.exports = {
  hashPassword,
  checkPassword,
  seedAdmin,
  parseCookies,
  cookieHeader,
  clearCookie,
  createSession,
  sessionFromRequest,
  requireAdmin,
  requireCsrf,
  loginAllowed,
  randHex,
  sha256,
};
