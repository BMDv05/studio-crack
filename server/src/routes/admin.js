'use strict';
/* /api/admin/* — session auth on everything; CSRF on every mutation. */
const express = require('express');
const { z } = require('zod');
const { db } = require('../db');
const { config } = require('../config');
const auth = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');
const { effSettings, validTimezone } = require('../services/settings');
const { studioSubject, studioText, confirmationText, buildTransporter, sendWithRetry } = require('../services/email');

const router = express.Router();
const STATUSES = ['new', 'confirmed', 'declined', 'closed'];

// ---------- Auth ----------
router.post('/login', asyncHandler(async (req, res) => {
  const ip = (req.ip || 'unknown').toString();
  const email = String(req.body?.email || '').toLowerCase().trim();
  if (!(await auth.loginAllowed('ip:' + ip, config.loginRateLimit.maxPerIp)) ||
      !(await auth.loginAllowed('email:' + email, config.loginRateLimit.maxPerEmail))) {
    return res.status(429).json({ ok: false, error: 'Too many attempts. Try again later.' });
  }
  await new Promise((r) => setTimeout(r, 300));
  const admin = email ? await db.admin.findUnique({ where: { email } }) : null;
  const ok = admin && await auth.checkPassword(req.body?.password || '', admin.passwordHash);
  if (!ok) return res.status(401).json({ ok: false, error: 'Invalid email or password.' });
  await db.adminSession.deleteMany({ where: { lastSeenAt: { lt: new Date(Date.now() - 7 * 24 * 3600 * 1000) } } });
  const { token, csrf } = await auth.createSession(admin.id);
  const maxAge = config.sessionMinutes * 60;
  res.setHeader('Set-Cookie', [
    auth.cookieHeader('dh_admin', token, { maxAge }),
    auth.cookieHeader('dh_csrf', csrf, { maxAge, httpOnly: false }),
  ]);
  res.json({ ok: true, admin: { email: admin.email, name: admin.name }, csrf });
}));

router.use(auth.requireAdmin);

router.post('/logout', auth.requireCsrf, asyncHandler(async (req, res) => {
  const { dh_admin } = auth.parseCookies(req);
  if (dh_admin) await db.adminSession.delete({ where: { tokenHash: auth.sha256(dh_admin) } }).catch(() => {});
  res.setHeader('Set-Cookie', [auth.clearCookie('dh_admin'), auth.clearCookie('dh_csrf')]);
  res.json({ ok: true });
}));

router.get('/me', asyncHandler(async (req, res) => {
  const unread = await db.booking.count({ where: { readAt: null } });
  res.json({ ok: true, admin: req.admin, csrf: req.csrfToken, sessionMinutes: config.sessionMinutes, unread });
}));

router.get('/meta', asyncHandler(async (req, res) => {
  const e = await effSettings();
  const { PLATFORMS } = require('./adminVideos');
  const { s3Configured } = require('../services/s3');
  res.json({
    ok: true, services: e.services, statuses: STATUSES, meetingTypes: ['online', 'in_person'],
    timezone: e.timezone, sla: e.sla, maxUploadMb: e.maxUploadMb,
    maxUploadMbProduction: e.maxUploadMbProduction, maxUploadMbSocial: e.maxUploadMbSocial,
    maxSocialSec: e.maxSocialSec, categories: ['production', 'social'], platforms: PLATFORMS,
    storageDriver: e.storageDriver, storageS3: s3Configured(),
  });
}));

// ---------- Overview ----------
router.get('/stats', asyncHandler(async (req, res) => {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [unread, thisWeek, confirmed, publishedVideos, publishedProduction, publishedSocial, draftProduction, draftSocial, latest, recentVideos] = await Promise.all([
    db.booking.count({ where: { readAt: null } }),
    db.booking.count({ where: { createdAt: { gte: weekAgo } } }),
    db.booking.count({ where: { status: 'confirmed' } }),
    db.video.count({ where: { status: 'published' } }),
    db.video.count({ where: { category: 'production', status: 'published' } }),
    db.video.count({ where: { category: 'social', status: 'published' } }),
    db.video.count({ where: { category: 'production', status: 'draft' } }),
    db.video.count({ where: { category: 'social', status: 'draft' } }),
    db.booking.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
    db.video.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
  ]);
  res.json({
    ok: true, unread, thisWeek, confirmed, publishedVideos,
    publishedProduction, publishedSocial, draftProduction, draftSocial,
    latest: latest.map(toAdminBooking), recentVideos: recentVideos.map(toAdminVideo),
  });
}));

// ---------- Meeting requests ----------
function listQuery(q) {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const per = 20;
  const where = {};
  if (STATUSES.includes(q.status)) where.status = q.status;
  if (q.service) where.service = String(q.service).slice(0, 120);
  if (['online', 'in_person'].includes(q.meeting_type)) where.meetingType = q.meeting_type;
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.from || '') || /^\d{4}-\d{2}-\d{2}$/.test(q.to || '')) {
    where.preferredDate = {};
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.from || '')) where.preferredDate.gte = q.from;
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.to || '')) where.preferredDate.lte = q.to;
  }
  if (q.search) {
    const s = String(q.search).slice(0, 100);
    where.OR = [
      { fullName: { contains: s, mode: 'insensitive' } },
      { email: { contains: s, mode: 'insensitive' } },
      { company: { contains: s, mode: 'insensitive' } },
    ];
  }
  const sortable = { created_at: 'createdAt', preferred_date: 'preferredDate', full_name: 'fullName', status: 'status' };
  const orderBy = {};
  orderBy[sortable[q.sort] || 'createdAt'] = String(q.dir).toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { where, orderBy, page, per, skip: (page - 1) * per };
}

function toAdminBooking(b) {
  return {
    id: b.id, created_at: b.createdAt, full_name: b.fullName, email: b.email,
    phone: b.phone, company: b.company, service: b.service, description: b.description,
    preferred_date: b.preferredDate, preferred_time: b.preferredTime, meeting_type: b.meetingType,
    status: b.status, studio_email_sent: b.studioEmailSent, client_email_sent: b.clientEmailSent,
    consent_at: b.consentAt, read_at: b.readAt, unread: !b.readAt, updated_at: b.updatedAt,
    confirm_email_sent: b.confirmEmailSent, status_changed_at: b.statusChangedAt,
  };
}
function toAdminVideo(v) {
  const { toAdminVideo: same } = require('./adminVideos');
  return same(v);
}

router.get('/requests', asyncHandler(async (req, res) => {
  const q = listQuery(req.query);
  const [total, rows] = await Promise.all([
    db.booking.count({ where: q.where }),
    db.booking.findMany({ where: q.where, orderBy: q.orderBy, take: q.per, skip: q.skip }),
  ]);
  res.json({ ok: true, total, page: q.page, perPage: q.per, pages: Math.max(1, Math.ceil(total / q.per)), rows: rows.map(toAdminBooking) });
}));

router.get('/requests/export', asyncHandler(async (req, res) => {
  const q = listQuery(req.query);
  const rows = await db.booking.findMany({ where: q.where, orderBy: q.orderBy, take: 2000 });
  const cols = ['id', 'created_at', 'full_name', 'email', 'phone', 'company', 'service', 'description', 'preferred_date', 'preferred_time', 'meeting_type', 'status', 'read_at', 'consent_at'];
  /* Booking fields come from the public form. A cell starting with = + - @
     (or a tab/CR that Excel strips first) is run as a formula when the export
     is opened in a spreadsheet, so prefix those with ' to keep them as text.
     Phone numbers are exempt: validation limits them to digits, spaces and
     + ( ) . - so they cannot hold a formula, and "+963…" must stay readable. */
  const cell = (v, col) => {
    let s = String(v ?? '');
    if (col !== 'phone' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv = [cols.join(',')].concat(rows.map((r) => cols.map((c) => cell(toAdminBooking(r)[c], c)).join(','))).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="meeting-requests.csv"');
  res.send('﻿' + csv);
}));

router.get('/requests/:id', asyncHandler(async (req, res) => {
  const row = await db.booking.findUnique({ where: { id: req.params.id }, include: { events: { orderBy: { id: 'asc' } } } });
  if (!row) return res.status(404).json({ ok: false, error: 'Not found.' });
  if (!row.readAt) await db.booking.update({ where: { id: row.id }, data: { readAt: new Date() } });
  const fresh = await db.booking.findUnique({ where: { id: row.id }, include: { events: { orderBy: { id: 'asc' } } } });
  res.json({
    ok: true, request: toAdminBooking(fresh),
    events: fresh.events.map((e) => ({ id: e.id, at: e.at, author: e.author, kind: e.kind, detail: e.detail })),
  });
}));

router.patch('/requests/:id', auth.requireCsrf, asyncHandler(async (req, res) => {
  const row = await db.booking.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ ok: false, error: 'Not found.' });
  const status = String(req.body?.status || '');
  if (!STATUSES.includes(status)) return res.status(422).json({ ok: false, errors: { status: 'Invalid status.' } });
  const updated = await db.booking.update({
    where: { id: row.id },
    data: { status, statusChangedAt: new Date() },
  });
  await db.bookingEvent.create({
    data: { bookingId: row.id, author: req.admin.name || req.admin.email, kind: 'status', detail: `${row.status} → ${status}` },
  });
  res.json({ ok: true, request: toAdminBooking(updated) });
}));

router.post('/requests/:id/notes', auth.requireCsrf, asyncHandler(async (req, res) => {
  const row = await db.booking.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ ok: false, error: 'Not found.' });
  const text = String(req.body?.text || '').trim().slice(0, 2000);
  if (!text) return res.status(422).json({ ok: false, errors: { text: 'Note is empty.' } });
  await db.bookingEvent.create({
    data: { bookingId: row.id, author: req.admin.name || req.admin.email, kind: 'note', detail: text },
  });
  const events = await db.bookingEvent.findMany({ where: { bookingId: row.id }, orderBy: { id: 'asc' } });
  res.status(201).json({ ok: true, events: events.map((e) => ({ id: e.id, at: e.at, author: e.author, kind: e.kind, detail: e.detail })) });
}));

router.post('/requests/:id/retry-studio-email', auth.requireCsrf, asyncHandler(async (req, res) => {
  const row = await db.booking.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ ok: false, error: 'Not found.' });
  if (row.studioEmailSent) return res.json({ ok: true, already: true });
  const e = await effSettings();
  const api = {
    id: row.id, fullName: row.fullName, email: row.email, phone: row.phone, company: row.company,
    service: row.service, description: row.description, preferredDate: row.preferredDate,
    preferredTime: row.preferredTime, meetingType: row.meetingType,
  };
  const transporter = buildTransporter(config.smtp);
  const r = await sendWithRetry(transporter, {
    kind: 'studio-retry', bookingId: row.id, from: config.studioFrom, to: e.studioEmail, replyTo: api.email,
    subject: studioSubject(api), text: studioText(api, api.id, row.createdAt.toISOString(), e.timezone),
  }, 3);
  if (r.delivered) {
    await db.booking.update({ where: { id: row.id }, data: { studioEmailSent: true } });
    await db.bookingEvent.create({ data: { bookingId: row.id, author: req.admin.name || req.admin.email, kind: 'note', detail: 'Studio notification re-sent.' } });
  }
  const fresh = await db.booking.findUnique({ where: { id: row.id } });
  res.json({ ok: r.delivered, request: toAdminBooking(fresh) });
}));

router.post('/requests/:id/send-confirmation', auth.requireCsrf, asyncHandler(async (req, res) => {
  const row = await db.booking.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ ok: false, error: 'Not found.' });
  const e = await effSettings();
  const api = {
    id: row.id, fullName: row.fullName, email: row.email, phone: row.phone, company: row.company,
    service: row.service, description: row.description, preferredDate: row.preferredDate,
    preferredTime: row.preferredTime, meetingType: row.meetingType,
  };
  const transporter = buildTransporter(config.smtp);
  const r = await sendWithRetry(transporter, {
    kind: 'confirmation', bookingId: row.id, from: config.studioFrom, to: api.email,
    subject: `Meeting confirmed – Double H Studio (ref ${api.id.slice(0, 8)})`,
    text: confirmationText(api, api.id, e.timezone),
  }, 3);
  if (r.delivered) {
    await db.booking.update({ where: { id: row.id }, data: { confirmEmailSent: true } });
    await db.bookingEvent.create({ data: { bookingId: row.id, author: req.admin.name || req.admin.email, kind: 'note', detail: 'Confirmation email sent to client.' } });
  }
  const fresh = await db.booking.findUnique({ where: { id: row.id } });
  res.json({ ok: r.delivered, request: toAdminBooking(fresh) });
}));

router.delete('/requests/:id', auth.requireCsrf, asyncHandler(async (req, res) => {
  const row = await db.booking.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ ok: false, error: 'Not found.' });
  await db.booking.delete({ where: { id: row.id } }); // events cascade
  res.json({ ok: true });
}));

// ---------- Settings ----------
router.get('/settings', asyncHandler(async (req, res) => {
  const e = await effSettings();
  const { s3Configured } = require('../services/s3');
  res.json({
    ok: true,
    settings: {
      timezone: e.timezone, sla: e.sla, services: e.services,
      maxUploadMb: e.maxUploadMb, maxUploadMbProduction: e.maxUploadMbProduction,
      maxUploadMbSocial: e.maxUploadMbSocial, maxSocialSec: e.maxSocialSec,
      storageDriver: e.storageDriver, storageS3: s3Configured(),
      studioEmail: e.studioEmail, ackEnabled: e.ackEnabled, sessionMinutes: config.sessionMinutes,
    },
  });
}));

const settingsSchema = z.object({
  timezone: z.string().optional(),
  sla: z.string().max(120).optional(),
  services: z.union([z.array(z.string()), z.string()]).optional(),
  maxUploadMb: z.number().optional(),
  maxUploadMbProduction: z.number().optional(),
  maxUploadMbSocial: z.number().optional(),
  maxSocialSec: z.number().optional(),
  storageDriver: z.string().optional(),
  studioEmail: z.string().optional(),
  ackEnabled: z.union([z.boolean(), z.string()]).optional(),
});

router.patch('/settings', auth.requireCsrf, asyncHandler(async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(422).json({ ok: false, errors: { _: 'Invalid settings.' } });
  const b = parsed.data;
  const errors = {};
  if (b.timezone !== undefined && !validTimezone(String(b.timezone))) errors.timezone = 'Unknown time zone.';
  if (b.services !== undefined) {
    const list = (Array.isArray(b.services) ? b.services : String(b.services).split('\n')).map((s) => String(s).trim()).filter(Boolean);
    if (!list.length) errors.services = 'At least one service is required.';
    if (list.some((s) => s.length > 80)) errors.services = 'Each service max 80 characters.';
    b._services = list;
  }
  for (const k of ['maxUploadMb', 'maxUploadMbProduction', 'maxUploadMbSocial']) {
    if (b[k] !== undefined && (!Number.isInteger(b[k]) || b[k] < 1 || b[k] > 4000)) errors[k] = 'Must be 1–4000 MB.';
  }
  if (b.maxSocialSec !== undefined && (!Number.isInteger(b.maxSocialSec) || b.maxSocialSec < 15 || b.maxSocialSec > 600)) {
    errors.maxSocialSec = 'Must be 15–600 seconds.';
  }
  if (b.storageDriver !== undefined && !['local', 's3', 'supabase'].includes(b.storageDriver)) errors.storageDriver = 'Invalid storage provider.';
  if (process.env.WORKER_RUNTIME === 'true' && b.storageDriver && b.storageDriver !== 'supabase') errors.storageDriver = 'This deployment uses Supabase Storage.';
  if (process.env.WORKER_RUNTIME === 'true') {
    for (const key of ['maxUploadMb', 'maxUploadMbProduction', 'maxUploadMbSocial']) {
      if (b[key] > 50) errors[key] = 'This storage plan supports files up to 50 MB.';
    }
  }
  if (b.studioEmail !== undefined && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(String(b.studioEmail).trim())) {
    errors.studioEmail = 'Enter a valid email address.';
  }
  if (b.ackEnabled !== undefined) b._ack = b.ackEnabled === true || b.ackEnabled === 'true';
  if (Object.keys(errors).length) return res.status(422).json({ ok: false, errors });
  const save = async (key, value) => db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  if (b.timezone !== undefined) await save('timezone', String(b.timezone));
  if (b.sla !== undefined) await save('sla', String(b.sla).trim());
  if (b._services) await save('services', JSON.stringify(b._services));
  for (const k of ['maxUploadMb', 'maxUploadMbProduction', 'maxUploadMbSocial', 'maxSocialSec']) {
    if (b[k] !== undefined) await save(k, String(b[k]));
  }
  if (b.storageDriver !== undefined) await save('storageDriver', b.storageDriver);
  if (b.studioEmail !== undefined) await save('studioEmail', String(b.studioEmail).trim().toLowerCase());
  if (b._ack !== undefined) await save('ackEnabled', String(b._ack));
  res.json({ ok: true });
}));

router.post('/password', auth.requireCsrf, asyncHandler(async (req, res) => {
  const admin = await db.admin.findUnique({ where: { email: req.admin.email } });
  if (!admin || !(await auth.checkPassword(String(req.body?.current || ''), admin.passwordHash))) {
    return res.status(401).json({ ok: false, error: 'Current password is incorrect.' });
  }
  const next = String(req.body?.next || '');
  if (next.length < 10) return res.status(422).json({ ok: false, errors: { next: 'At least 10 characters.' } });
  await db.admin.update({ where: { id: admin.id }, data: { passwordHash: await auth.hashPassword(next) } });
  res.json({ ok: true });
}));

module.exports = { adminRouter: router };
