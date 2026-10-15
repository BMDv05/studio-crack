'use strict';
/* SQLite persistence via built-in node:sqlite (Node 22+).
 * Table matches spec section 11 (booking_requests). Every request is saved
 * BEFORE any email is attempted, so a failed email never loses a booking. */
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'bookings.sqlite');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL;');
db.exec(`
CREATE TABLE IF NOT EXISTS booking_requests (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  service TEXT NOT NULL,
  description TEXT NOT NULL,
  preferred_date TEXT NOT NULL,
  preferred_time TEXT NOT NULL,
  meeting_type TEXT NOT NULL CHECK (meeting_type IN ('online','in_person')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','confirmed','declined','closed')),
  studio_email_sent INTEGER NOT NULL DEFAULT 0,
  client_email_sent INTEGER NOT NULL DEFAULT 0,
  consent_at TEXT,
  submission_key TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_booking_created ON booking_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_booking_status ON booking_requests(status);
`);

function colExists(table, col) {
  return !!db.prepare('SELECT 1 FROM pragma_table_info(?) WHERE name = ?').get(table, col);
}
function renameCol(table, from, to) {
  if (colExists(table, from) && !colExists(table, to)) db.exec(`ALTER TABLE ${table} RENAME COLUMN ${from} TO ${to}`);
}

// ---- Admin dashboard migration: extra columns on existing installs ----
for (const [col, ddl] of [
  ['read_at', 'TEXT'],
  ['updated_at', 'TEXT'],
  ['confirm_email_sent', 'INTEGER NOT NULL DEFAULT 0'],
  ['status_changed_at', 'TEXT'],
]) {
  if (!colExists('booking_requests', col)) db.exec(`ALTER TABLE booking_requests ADD COLUMN ${col} ${ddl}`);
}

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_admin ON admin_sessions(admin_id);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'production' CHECK (category IN ('production','social')),
  video_url TEXT NOT NULL DEFAULT '',
  thumbnail_url TEXT NOT NULL DEFAULT '',
  duration_sec REAL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  mime TEXT NOT NULL DEFAULT '',
  storage TEXT NOT NULL DEFAULT 'local',
  original_name TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  platforms TEXT NOT NULL DEFAULT '[]',
  client_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  processing TEXT NOT NULL DEFAULT 'uploading' CHECK (processing IN ('uploading','processing','ready','failed')),
  uploaded_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT
);
`);

// ---- Video categories migration: rename columns to the category schema,
// add category/platforms/client_name, backfill existing rows to production ----
renameCol('videos', 'src_url', 'video_url');
renameCol('videos', 'poster_url', 'thumbnail_url');
renameCol('videos', 'order_index', 'sort_order');
for (const [col, ddl] of [
  ['category', "TEXT NOT NULL DEFAULT 'production'"],
  ['platforms', "TEXT NOT NULL DEFAULT '[]'"],
  ['client_name', "TEXT NOT NULL DEFAULT ''"],
]) {
  if (!colExists('videos', col)) db.exec(`ALTER TABLE videos ADD COLUMN ${col} ${ddl}`);
}
db.exec(`UPDATE videos SET category = 'production' WHERE category IS NULL OR category = ''`);
db.exec(`UPDATE videos SET platforms = '[]' WHERE platforms IS NULL OR platforms = ''`);
db.exec(`UPDATE videos SET client_name = '' WHERE client_name IS NULL`);
db.exec(`DROP INDEX IF EXISTS idx_videos_order`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_videos_cat ON videos(category, status, sort_order)`);

db.exec(`
CREATE TABLE IF NOT EXISTS request_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  author TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('status','note')),
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_events_request ON request_events(request_id, id);
`);

const insertStmt = db.prepare(`
INSERT INTO booking_requests
(id, full_name, email, phone, company, service, description, preferred_date, preferred_time, meeting_type, status, consent_at, submission_key)
VALUES (@id, @full_name, @email, @phone, @company, @service, @description, @preferred_date, @preferred_time, @meeting_type, 'new', @consent_at, @submission_key)
`);
const findByKeyStmt = db.prepare('SELECT * FROM booking_requests WHERE submission_key = ?');
const findByIdStmt = db.prepare('SELECT * FROM booking_requests WHERE id = ?');
const markStudioSentStmt = db.prepare('UPDATE booking_requests SET studio_email_sent = 1 WHERE id = ?');
const markClientSentStmt = db.prepare('UPDATE booking_requests SET client_email_sent = 1 WHERE id = ?');
const unsentStmt = db.prepare("SELECT * FROM booking_requests WHERE studio_email_sent = 0 AND status = 'new' ORDER BY created_at ASC LIMIT 50");

function saveBooking(row) {
  insertStmt.run(row);
  return findByIdStmt.get(row.id);
}
function findById(id) {
  return rowToApi(findByIdStmt.get(id));
}

function rowToApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    created_at: row.created_at,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    service: row.service,
    description: row.description,
    preferred_date: row.preferred_date,
    preferred_time: row.preferred_time,
    meeting_type: row.meeting_type,
    status: row.status,
    studio_email_sent: !!row.studio_email_sent,
    client_email_sent: !!row.client_email_sent,
    consent_at: row.consent_at,
    read_at: row.read_at || null,
    unread: !row.read_at,
    updated_at: row.updated_at || null,
    confirm_email_sent: !!row.confirm_email_sent,
    status_changed_at: row.status_changed_at || null,
  };
}

// ---- Admin: requests ----
function listRequests({ search, status, service, meetingType, from, to, sort, dir, limit, offset }) {
  const where = [];
  const params = [];
  if (status) { where.push('status = ?'); params.push(status); }
  if (service) { where.push('service = ?'); params.push(service); }
  if (meetingType) { where.push('meeting_type = ?'); params.push(meetingType); }
  if (from) { where.push('preferred_date >= ?'); params.push(from); }
  if (to) { where.push('preferred_date <= ?'); params.push(to); }
  if (search) {
    where.push('(full_name LIKE ? ESCAPE \'\\\' OR email LIKE ? ESCAPE \'\\\' OR company LIKE ? ESCAPE \'\\\')');
    const like = '%' + String(search).replace(/[\\%_]/g, (c) => '\\' + c) + '%';
    params.push(like, like, like);
  }
  const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const sortable = { created_at: 'created_at', preferred_date: 'preferred_date', full_name: 'full_name', status: 'status' };
  const col = sortable[sort] || 'created_at';
  const direction = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const total = db.prepare(`SELECT COUNT(*) v FROM booking_requests ${clause}`).get(...params).v;
  const rows = db
    .prepare(`SELECT * FROM booking_requests ${clause} ORDER BY ${col} ${direction}, created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);
  return { total, rows: rows.map(rowToApi) };
}

// ---- Admin: settings KV ----
const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSettingStmt = db.prepare(
  "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now')) " +
  "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
);
function getSetting(key, fallback = '') {
  const r = getSettingStmt.get(key);
  return r ? r.value : fallback;
}
function setSetting(key, value) {
  setSettingStmt.run(key, String(value ?? ''));
}
function allSettings() {
  return Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value]));
}

// ---- Admin: admins & sessions ----
function findAdminByEmail(email) {
  return db.prepare('SELECT * FROM admins WHERE email = ?').get(String(email).toLowerCase()) || null;
}
function createAdmin({ id, email, name, password_hash }) {
  db.prepare('INSERT INTO admins (id, email, name, password_hash) VALUES (?, ?, ?, ?)').run(id, email, name, password_hash);
}
function updateAdminPassword(id, hash) {
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hash, id);
}
function adminCount() {
  return db.prepare('SELECT COUNT(*) v FROM admins').get().v;
}
function createSession({ token_hash, admin_id, csrf }) {
  db.prepare('INSERT INTO admin_sessions (token_hash, admin_id, csrf) VALUES (?, ?, ?)').run(token_hash, admin_id, csrf);
}
function findSession(token_hash) {
  return (
    db.prepare(
      'SELECT s.*, a.email AS admin_email, a.name AS admin_name FROM admin_sessions s JOIN admins a ON a.id = s.admin_id WHERE s.token_hash = ?'
    ).get(token_hash) || null
  );
}
function touchSession(token_hash) {
  db.prepare("UPDATE admin_sessions SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE token_hash = ?").run(token_hash);
}
function deleteSession(token_hash) {
  db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(token_hash);
}
function pruneSessions(olderThanIso) {
  db.prepare('DELETE FROM admin_sessions WHERE last_seen_at < ?').run(olderThanIso);
}

// ---- Admin: request events (status history + internal notes) ----
function addEvent({ request_id, author, kind, detail }) {
  db.prepare('INSERT INTO request_events (request_id, author, kind, detail) VALUES (?, ?, ?, ?)').run(request_id, author, kind, detail);
}
function listEvents(request_id) {
  return db.prepare('SELECT id, at, author, kind, detail FROM request_events WHERE request_id = ? ORDER BY id ASC').all(request_id);
}
function updateRequest(id, patch) {
  const allowed = ['status', 'read_at', 'confirm_email_sent', 'studio_email_sent', 'status_changed_at'];
  const sets = [];
  const params = [];
  for (const k of allowed) {
    if (patch[k] !== undefined) { sets.push(`${k} = ?`); params.push(patch[k]); }
  }
  if (!sets.length) return findById(id);
  sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");
  db.prepare(`UPDATE booking_requests SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
  return findById(id);
}
function deleteRequest(id) {
  db.prepare('DELETE FROM request_events WHERE request_id = ?').run(id);
  db.prepare('DELETE FROM booking_requests WHERE id = ?').run(id);
}

// ---- Admin: videos (production | social categories) ----
const CATEGORIES = ['production', 'social'];
function parsePlatforms(s) {
  try {
    const a = JSON.parse(s || '[]');
    return Array.isArray(a) ? a.map(String) : [];
  } catch {
    return [];
  }
}
function videoRow(r) {
  if (!r) return null;
  return {
    id: r.id, title: r.title, description: r.description, category: r.category || 'production',
    status: r.status, processing: r.processing,
    video_url: r.video_url, thumbnail_url: r.thumbnail_url, duration_sec: r.duration_sec, size_bytes: r.size_bytes,
    mime: r.mime, storage: r.storage, original_name: r.original_name, sort_order: r.sort_order ?? 0,
    platforms: parsePlatforms(r.platforms), client_name: r.client_name || '',
    uploaded_by: r.uploaded_by, created_at: r.created_at, updated_at: r.updated_at || null,
  };
}
function listVideos({ publishedOnly = false, category } = {}) {
  const where = [];
  const params = [];
  if (publishedOnly) where.push("status = 'published'", "processing = 'ready'");
  if (category) { where.push('category = ?'); params.push(category); }
  const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rows = db.prepare(`SELECT * FROM videos ${clause} ORDER BY sort_order ASC, created_at DESC`).all(...params);
  return rows.map(videoRow);
}
function countVideos(category, status) {
  return db.prepare('SELECT COUNT(*) v FROM videos WHERE category = ? AND status = ?').get(category, status).v;
}
function findVideo(id) {
  return videoRow(db.prepare('SELECT * FROM videos WHERE id = ?').get(id));
}
function createVideo(row) {
  db.prepare(
    'INSERT INTO videos (id, title, description, category, status, processing, sort_order, platforms, client_name, uploaded_by) VALUES (@id, @title, @description, @category, @status, @processing, @sort_order, @platforms, @client_name, @uploaded_by)'
  ).run(row);
  return findVideo(row.id);
}
function updateVideo(id, patch) {
  const allowed = ['title', 'description', 'category', 'status', 'processing', 'video_url', 'thumbnail_url', 'duration_sec', 'size_bytes', 'mime', 'storage', 'original_name', 'sort_order', 'platforms', 'client_name'];
  const sets = [];
  const params = [];
  for (const k of allowed) {
    if (patch[k] !== undefined) { sets.push(`${k} = ?`); params.push(patch[k]); }
  }
  if (!sets.length) return findVideo(id);
  sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");
  db.prepare(`UPDATE videos SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
  return findVideo(id);
}
function deleteVideo(id) {
  db.prepare('DELETE FROM videos WHERE id = ?').run(id);
}
function nextVideoOrder(category) {
  const r = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 v FROM videos WHERE category = ?').get(category);
  return r.v || 0;
}
/** Save a per-category manual order. Only ids of that category are touched. */
function reorderVideos(category, ids) {
  const stmt = db.prepare('UPDATE videos SET sort_order = ? WHERE id = ? AND category = ?');
  ids.forEach((vid, i) => stmt.run(i, vid, category));
}
function videoIdsIn(category, ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(`SELECT id FROM videos WHERE category = ? AND id IN (${placeholders})`).all(category, ...ids).map((r) => r.id);
}

// ---- Overview stats ----
function overviewStats() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  return {
    unread: db.prepare('SELECT COUNT(*) v FROM booking_requests WHERE read_at IS NULL').get().v,
    thisWeek: db.prepare('SELECT COUNT(*) v FROM booking_requests WHERE created_at >= ?').get(weekAgo).v,
    confirmed: db.prepare("SELECT COUNT(*) v FROM booking_requests WHERE status = 'confirmed'").get().v,
    publishedVideos: db.prepare("SELECT COUNT(*) v FROM videos WHERE status = 'published'").get().v,
    publishedProduction: countVideos('production', 'published'),
    publishedSocial: countVideos('social', 'published'),
    draftProduction: countVideos('production', 'draft'),
    draftSocial: countVideos('social', 'draft'),
    latest: db.prepare('SELECT * FROM booking_requests ORDER BY created_at DESC LIMIT 5').all().map(rowToApi),
    recentVideos: db.prepare('SELECT * FROM videos ORDER BY created_at DESC LIMIT 5').all().map(videoRow),
  };
}

module.exports = {
  db,
  DB_FILE,
  saveBooking,
  findBySubmissionKey: (k) => (k ? rowToApi(findByKeyStmt.get(k)) : null),
  findById,
  markStudioSent: (id) => markStudioSentStmt.run(id),
  markClientSent: (id) => markClientSentStmt.run(id),
  unsentStudio: () => unsentStmt.all().map(rowToApi),
  allForExport: () =>
    db.prepare('SELECT * FROM booking_requests ORDER BY created_at DESC LIMIT 2000').all(),
  listRequests,
  updateRequest,
  deleteRequest,
  addEvent,
  listEvents,
  getSetting,
  setSetting,
  allSettings,
  findAdminByEmail,
  createAdmin,
  updateAdminPassword,
  adminCount,
  createSession,
  findSession,
  touchSession,
  deleteSession,
  pruneSessions,
  listVideos,
  countVideos,
  findVideo,
  createVideo,
  updateVideo,
  deleteVideo,
  nextVideoOrder,
  reorderVideos,
  videoIdsIn,
  overviewStats,
};
