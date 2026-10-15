'use strict';
/* Admin authentication: bcrypt passwords, DB-backed sessions in httpOnly
 * cookies, double-submit CSRF tokens, login rate limiting. */
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const store = require('./db');
const { config } = require('./config');

const SESSION_MS = () => config.sessionMinutes * 60 * 1000;

function hashPassword(plain) {
  return bcrypt.hashSync(String(plain), 12);
}
function checkPassword(plain, hash) {
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
function seedAdmin() {
  if (store.adminCount() > 0) return { seeded: false };
  const { email, password, name } = config.adminSeed;
  if (!email || !password) {
    console.log('[admin] no admins exist and ADMIN_EMAIL/ADMIN_PASSWORD are not set — /admin login is disabled until they are.');
    return { seeded: false };
  }
  if (password.length < 10) {
    console.log('[admin] ADMIN_PASSWORD must be at least 10 characters — seed refused.');
    return { seeded: false };
  }
  store.createAdmin({ id: crypto.randomUUID(), email, name, password_hash: hashPassword(password) });
  console.log(`[admin] seeded admin account ${email}`);
  return { seeded: true };
}

// ---- Minimal cookie parsing (no dependency) ----
function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function cookieHeader(name, value, { maxAge, httpOnly = true, path = '/' } = {}) {
  let s = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=Lax`;
  if (maxAge !== undefined) s += `; Max-Age=${maxAge}`;
  if (httpOnly) s += '; HttpOnly';
  const secure = config.secureCookies || String(config.siteBaseUrl).startsWith('https://');
  if (secure) s += '; Secure';
  return s;
}
function clearCookie(name) {
  return `${name}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly`;
}

// ---- Sessions ----
function createSession(adminId) {
  const token = randHex(32);
  const csrf = randHex(24);
  store.createSession({ token_hash: sha256(token), admin_id: adminId, csrf });
  return { token, csrf };
}
function sessionFromRequest(req) {
  const cookies = parseCookies(req);
  const token = cookies.dh_admin;
  if (!token || token.length < 32) return null;
  const sess = store.findSession(sha256(token));
  if (!sess) return null;
  const age = Date.now() - new Date(sess.last_seen_at + (sess.last_seen_at.endsWith('Z') ? '' : 'Z')).getTime();
  if (Number.isFinite(age) && age > SESSION_MS()) {
    store.deleteSession(sha256(token)); // idle timeout — auto logout
    return null;
  }
  store.touchSession(sha256(token)); // sliding window
  return sess;
}
function isApiRequest(req) {
  // req.path is stripped inside mounted routers — originalUrl never is.
  const p = (req.originalUrl || req.url || '').split('?')[0];
  return p.startsWith('/api/');
}
function requireAdmin(req, res, next) {
  const sess = sessionFromRequest(req);
  if (!sess) {
    if (isApiRequest(req)) return res.status(401).json({ ok: false, error: 'Not signed in.' });
    return res.redirect('/admin/login');
  }
  req.admin = { id: sess.admin_id, email: sess.admin_email, name: sess.admin_name };
  req.csrfToken = sess.csrf;
  next();
}
// State-changing API calls must present the double-submit CSRF token.
function requireCsrf(req, res, next) {
  const cookies = parseCookies(req);
  const header = req.headers['x-csrf-token'];
  if (!header || !cookies.dh_csrf || header !== cookies.dh_csrf || header !== req.csrfToken) {
    return res.status(403).json({ ok: false, error: 'Invalid CSRF token. Reload and try again.' });
  }
  next();
}

// ---- Login rate limiting (per IP + per email) ----
const loginHits = new Map(); // key -> timestamps
function loginAllowed(key, max) {
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
