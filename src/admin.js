'use strict';
/* Admin JSON API: /api/admin/* — every route requires a session; every
 * state-changing route additionally requires the CSRF header. */
const express = require('express');
const crypto = require('node:crypto');
const store = require('./db');
const { config } = require('./config');
const auth = require('./auth');
const { studioSubject, studioText, confirmationText, buildTransporter, sendWithRetry } = require('./email');

const router = express.Router();

// ---- Effective studio settings: DB overrides env ----
function effSettings() {
  const s = store.allSettings();
  let services = config.services;
  if (s.services) {
    try {
      const parsed = JSON.parse(s.services);
      if (Array.isArray(parsed) && parsed.length) services = parsed.map(String);
    } catch { /* keep defaults */ }
  }
  const legacyCap = s.maxUploadMb ? Number(s.maxUploadMb) : null;
  return {
    timezone: s.timezone || config.studioTimezone,
    sla: s.sla || config.responseSLA,
    services,
    maxUploadMb: legacyCap || config.uploads.maxMb,
    maxUploadMbProduction: s.maxUploadMbProduction ? Number(s.maxUploadMbProduction) : (legacyCap || config.uploads.maxMbProduction),
    maxUploadMbSocial: s.maxUploadMbSocial ? Number(s.maxUploadMbSocial) : (legacyCap || config.uploads.maxMbSocial),
    maxSocialSec: s.maxSocialSec ? Number(s.maxSocialSec) : config.uploads.maxSocialSec,
    storageDriver: (s.storageDriver || config.storage.driver || 'local').toLowerCase(),
  };
}
function validTimezone(tz) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

// ================= Auth =================
router.post('/login', async (req, res) => {
  try {
    const ip = (req.ip || 'unknown').toString();
    const email = String(req.body?.email || '').toLowerCase().trim();
    if (!auth.loginAllowed('ip:' + ip, config.loginRateLimit.maxPerIp) ||
        !auth.loginAllowed('email:' + email, config.loginRateLimit.maxPerEmail)) {
      return res.status(429).json({ ok: false, error: 'Too many attempts. Try again later.' });
    }
    // Small constant-time-ish delay against credential probing
    await new Promise((r) => setTimeout(r, 300));
    const admin = email ? store.findAdminByEmail(email) : null;
    const ok = admin && auth.checkPassword(req.body?.password || '', admin.password_hash);
    if (!ok) return res.status(401).json({ ok: false, error: 'Invalid email or password.' });
    store.pruneSessions(new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString());
    const { token, csrf } = auth.createSession(admin.id);
    const maxAge = config.sessionMinutes * 60;
    res.setHeader('Set-Cookie', [
      auth.cookieHeader('dh_admin', token, { maxAge }),
      auth.cookieHeader('dh_csrf', csrf, { maxAge, httpOnly: false }),
    ]);
    res.json({ ok: true, admin: { email: admin.email, name: admin.name }, csrf });
  } catch (err) {
    console.error('[admin login]', err);
    res.status(500).json({ ok: false, error: 'Something went wrong.' });
  }
});

router.use(auth.requireAdmin);

router.post('/logout', auth.requireCsrf, (req, res) => {
  const { dh_admin } = auth.parseCookies(req);
  if (dh_admin) store.deleteSession(auth.sha256(dh_admin));
  res.setHeader('Set-Cookie', [auth.clearCookie('dh_admin'), auth.clearCookie('dh_csrf')]);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({
    ok: true,
    admin: req.admin,
    csrf: req.csrfToken,
    sessionMinutes: config.sessionMinutes,
    unread: store.overviewStats().unread,
  });
});

router.get('/meta', (req, res) => {
  const e = effSettings();
  res.json({
    ok: true,
    services: e.services,
    statuses: ['new', 'confirmed', 'declined', 'closed'],
    meetingTypes: ['online', 'in_person'],
    timezone: e.timezone,
    sla: e.sla,
    maxUploadMb: e.maxUploadMb,
    maxUploadMbProduction: e.maxUploadMbProduction,
    maxUploadMbSocial: e.maxUploadMbSocial,
    maxSocialSec: e.maxSocialSec,
    categories: ['production', 'social'],
    platforms: require('./videos').PLATFORMS,
    storageDriver: e.storageDriver,
    storageS3: require('./s3').s3Configured(),
  });
});

// ================= Overview =================
router.get('/stats', (req, res) => {
  res.json({ ok: true, ...store.overviewStats() });
});

// ================= Meeting requests =================
const STATUSES = ['new', 'confirmed', 'declined', 'closed'];

function listQuery(q) {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const per = 20;
  return {
    search: String(q.search || '').slice(0, 100) || undefined,
    status: STATUSES.includes(q.status) ? q.status : undefined,
    service: String(q.service || '').slice(0, 120) || undefined,
    meetingType: ['online', 'in_person'].includes(q.meeting_type) ? q.meeting_type : undefined,
    from: /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? q.from : undefined,
    to: /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? q.to : undefined,
    sort: String(q.sort || 'created_at'),
    dir: String(q.dir || 'desc'),
    limit: per,
    offset: (page - 1) * per,
    page,
    per,
  };
}

router.get('/requests', (req, res) => {
  const q = listQuery(req.query);
  const { total, rows } = store.listRequests(q);
  res.json({ ok: true, total, page: q.page, perPage: q.per, pages: Math.max(1, Math.ceil(total / q.per)), rows });
});

router.get('/requests/export', (req, res) => {
  const q = listQuery(req.query);
  q.limit = 2000;
  q.offset = 0;
  const { rows } = store.listRequests(q);
  const cols = ['id', 'created_at', 'full_name', 'email', 'phone', 'company', 'service', 'description', 'preferred_date', 'preferred_time', 'meeting_type', 'status', 'read_at', 'consent_at'];
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.join(',')].concat(rows.map((r) => cols.map((c) => cell(r[c])).join(','))).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="meeting-requests.csv"');
  res.send('﻿' + csv);
});

router.get('/requests/:id', (req, res) => {
  const row = store.findById(req.params.id);
  if (!row) return res.status(404).json({ ok: false, error: 'Not found.' });
  if (!row.read_at) store.updateRequest(row.id, { read_at: new Date().toISOString() });
  res.json({ ok: true, request: store.findById(row.id), events: store.listEvents(row.id) });
});

router.patch('/requests/:id', auth.requireCsrf, (req, res) => {
  const row = store.findById(req.params.id);
  if (!row) return res.status(404).json({ ok: false, error: 'Not found.' });
  const status = String(req.body?.status || '');
  if (!STATUSES.includes(status)) return res.status(422).json({ ok: false, errors: { status: 'Invalid status.' } });
  const now = new Date().toISOString();
  const updated = store.updateRequest(row.id, { status, status_changed_at: now });
  store.addEvent({ request_id: row.id, author: req.admin.name || req.admin.email, kind: 'status', detail: `${row.status} → ${status}` });
  res.json({ ok: true, request: updated });
});

router.post('/requests/:id/notes', auth.requireCsrf, (req, res) => {
  const row = store.findById(req.params.id);
  if (!row) return res.status(404).json({ ok: false, error: 'Not found.' });
  const text = String(req.body?.text || '').trim().slice(0, 2000);
  if (text.length < 1) return res.status(422).json({ ok: false, errors: { text: 'Note is empty.' } });
  store.addEvent({ request_id: row.id, author: req.admin.name || req.admin.email, kind: 'note', detail: text });
  res.status(201).json({ ok: true, events: store.listEvents(row.id) });
});

router.post('/requests/:id/retry-studio-email', auth.requireCsrf, async (req, res) => {
  try {
    const row = store.findById(req.params.id);
    if (!row) return res.status(404).json({ ok: false, error: 'Not found.' });
    if (row.studio_email_sent) return res.json({ ok: true, already: true });
    const e = effSettings();
    const transporter = buildTransporter(config.smtp);
    const r = await sendWithRetry(transporter, {
      kind: 'studio-retry', from: config.studioFrom, to: config.studioEmail, replyTo: row.email,
      subject: studioSubject(row), text: studioText(row, row.id, row.created_at),
    }, 3);
    if (r.delivered) {
      store.updateRequest(row.id, { studio_email_sent: 1 });
      store.addEvent({ request_id: row.id, author: req.admin.name || req.admin.email, kind: 'note', detail: 'Studio notification re-sent.' });
    }
    res.json({ ok: r.delivered, request: store.findById(row.id) });
  } catch (err) {
    console.error('[retry-studio-email]', err);
    res.status(500).json({ ok: false, error: 'Something went wrong.' });
  }
});

router.post('/requests/:id/send-confirmation', auth.requireCsrf, async (req, res) => {
  try {
    const row = store.findById(req.params.id);
    if (!row) return res.status(404).json({ ok: false, error: 'Not found.' });
    const e = effSettings();
    const transporter = buildTransporter(config.smtp);
    const r = await sendWithRetry(transporter, {
      kind: 'confirmation', from: config.studioFrom, to: row.email,
      subject: `Meeting confirmed – Double H Studio (ref ${row.id.slice(0, 8)})`,
      text: confirmationText(row, row.id, e.timezone),
    }, 3);
    if (r.delivered) {
      store.updateRequest(row.id, { confirm_email_sent: 1 });
      store.addEvent({ request_id: row.id, author: req.admin.name || req.admin.email, kind: 'note', detail: 'Confirmation email sent to client.' });
    }
    res.json({ ok: r.delivered, request: store.findById(row.id) });
  } catch (err) {
    console.error('[send-confirmation]', err);
    res.status(500).json({ ok: false, error: 'Something went wrong.' });
  }
});

router.delete('/requests/:id', auth.requireCsrf, (req, res) => {
  const row = store.findById(req.params.id);
  if (!row) return res.status(404).json({ ok: false, error: 'Not found.' });
  store.deleteRequest(row.id);
  res.json({ ok: true });
});

// ================= Settings =================
router.get('/settings', (req, res) => {
  const e = effSettings();
  res.json({
    ok: true,
    settings: {
      timezone: e.timezone, sla: e.sla, services: e.services,
      maxUploadMb: e.maxUploadMb,
      maxUploadMbProduction: e.maxUploadMbProduction,
      maxUploadMbSocial: e.maxUploadMbSocial,
      maxSocialSec: e.maxSocialSec,
      storageDriver: e.storageDriver,
      storageS3: require('./s3').s3Configured(),
      studioEmail: config.studioEmail, sessionMinutes: config.sessionMinutes,
    },
  });
});

router.patch('/settings', auth.requireCsrf, (req, res) => {
  const b = req.body || {};
  const errors = {};
  if (b.timezone !== undefined && !validTimezone(String(b.timezone))) errors.timezone = 'Unknown time zone.';
  if (b.sla !== undefined && String(b.sla).length > 120) errors.sla = 'Too long (max 120).';
  if (b.services !== undefined) {
    const list = Array.isArray(b.services) ? b.services : String(b.services).split('\n');
    const clean = list.map((s) => String(s).trim()).filter(Boolean);
    if (!clean.length) errors.services = 'At least one service is required.';
    if (clean.some((s) => s.length > 80)) errors.services = 'Each service max 80 characters.';
  }
  if (b.maxUploadMb !== undefined) {
    const n = Number(b.maxUploadMb);
    if (!Number.isInteger(n) || n < 1 || n > 4000) errors.maxUploadMb = 'Must be 1–4000 MB.';
  }
  for (const k of ['maxUploadMbProduction', 'maxUploadMbSocial']) {
    if (b[k] !== undefined) {
      const n = Number(b[k]);
      if (!Number.isInteger(n) || n < 1 || n > 4000) errors[k] = 'Must be 1–4000 MB.';
    }
  }
  if (b.maxSocialSec !== undefined) {
    const n = Number(b.maxSocialSec);
    if (!Number.isInteger(n) || n < 15 || n > 600) errors.maxSocialSec = 'Must be 15–600 seconds.';
  }
  if (b.storageDriver !== undefined && !['local', 's3'].includes(b.storageDriver)) errors.storageDriver = 'Must be local or s3.';
  if (Object.keys(errors).length) return res.status(422).json({ ok: false, errors });
  if (b.timezone !== undefined) store.setSetting('timezone', String(b.timezone));
  if (b.sla !== undefined) store.setSetting('sla', String(b.sla).trim());
  if (b.services !== undefined) {
    const list = (Array.isArray(b.services) ? b.services : String(b.services).split('\n')).map((s) => String(s).trim()).filter(Boolean);
    store.setSetting('services', JSON.stringify(list));
  }
  if (b.maxUploadMb !== undefined) store.setSetting('maxUploadMb', String(Number(b.maxUploadMb)));
  if (b.maxUploadMbProduction !== undefined) store.setSetting('maxUploadMbProduction', String(Number(b.maxUploadMbProduction)));
  if (b.maxUploadMbSocial !== undefined) store.setSetting('maxUploadMbSocial', String(Number(b.maxUploadMbSocial)));
  if (b.maxSocialSec !== undefined) store.setSetting('maxSocialSec', String(Number(b.maxSocialSec)));
  if (b.storageDriver !== undefined) store.setSetting('storageDriver', b.storageDriver);
  res.json({ ok: true });
});

router.post('/password', auth.requireCsrf, (req, res) => {
  const admin = store.findAdminByEmail(req.admin.email);
  if (!admin || !auth.checkPassword(String(req.body?.current || ''), admin.password_hash)) {
    return res.status(401).json({ ok: false, error: 'Current password is incorrect.' });
  }
  const next = String(req.body?.next || '');
  if (next.length < 10) return res.status(422).json({ ok: false, errors: { next: 'At least 10 characters.' } });
  store.updateAdminPassword(admin.id, auth.hashPassword(next));
  res.json({ ok: true });
});

module.exports = { adminRouter: router, effSettings };
