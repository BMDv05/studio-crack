'use strict';
/* POST /api/booking — meeting requests. Same fields, order, wording and
 * rules as the legacy form. Save FIRST, then email; success only after save. */
const express = require('express');
const crypto = require('node:crypto');
const { z } = require('zod');
const { db } = require('../db');
const { config } = require('../config');
const { asyncHandler } = require('../middleware/asyncHandler');
const { cleanString } = require('../lib/sanitize');
const { effSettings, todayInTimezone } = require('../services/settings');
const { studioSubject, studioText, clientText, buildTransporter, sendWithRetry } = require('../services/email');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const PHONE_RE = /^[+\d][\d\s().-]{5,30}$/;

const bookingSchema = z.object({
  full_name: z.string().min(2, 'Please enter your full name.').max(100),
  email: z.string().max(254).refine((v) => EMAIL_RE.test(v.trim().toLowerCase()), 'Please enter a valid email address.'),
  phone: z.string().max(32).optional().default(''),
  company: z.string().max(120).optional().default(''),
  service: z.string().min(1, 'Please choose one of the available services.').max(120),
  description: z.string().min(10, 'Please describe your project (at least 10 characters).').max(5000, 'Description is too long (max 5000 characters).'),
  preferred_date: z.string().regex(DATE_RE, 'Please choose a valid date (YYYY-MM-DD).'),
  preferred_time: z.string().regex(TIME_RE, 'Please choose a valid time (HH:MM).'),
  meeting_type: z.string().transform((v) => v.toLowerCase().replace('in-person', 'in_person'))
    .refine((v) => ['online', 'in_person'].includes(v), 'Please choose Online or In-person.'),
  consent: z.union([z.boolean(), z.string()]).refine((v) => v === true || v === 'true' || v === 'on', 'Please accept the privacy notice.'),
  website: z.string().optional().default(''),
  submissionKey: z.string().max(64).optional(),
  loadedAt: z.number().optional(),
});

// In-memory rate limit: 5 requests/hour/IP + idempotency keys.
const hits = new Map();
const seenKeys = new Set();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < config.rateLimit.windowMs);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > config.rateLimit.max;
}

router.post('/', asyncHandler(async (req, res) => {
  const ip = (req.ip || req.socket.remoteAddress || 'unknown').toString();
  const body = req.body || {};

  // Honeypot: bots fill hidden `website`; pretend success, save nothing.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return res.status(201).json({ ok: true, reference: 'received' });
  }
  if (rateLimited(ip)) {
    res.setHeader('Retry-After', '3600');
    return res.status(429).json({ ok: false, error: 'Too many requests. Please try again later.' });
  }

  const key = typeof body.submissionKey === 'string' && body.submissionKey.length >= 8
    ? body.submissionKey.slice(0, 64) : null;
  if (key) {
    if (seenKeys.has(key)) {
      const existing = await db.booking.findFirst({ where: { submissionKey: key } });
      if (existing) return res.status(201).json({ ok: true, reference: existing.id, deduped: true });
    }
    seenKeys.add(key);
    if (seenKeys.size > 5000) seenKeys.clear();
  }

  const e = await effSettings();
  const parsed = bookingSchema.safeParse(body);
  const errors = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const k = issue.path[0] !== undefined ? String(issue.path[0]) : '_';
      if (!errors[k]) errors[k] = issue.message;
    }
  }
  // Dynamic checks run on the raw values, gated only per-field, so one bad
  // field never hides another field's error (legacy behavior).
  const v = parsed.success ? parsed.data : {};
  const rawService = cleanString(body.service, 120);
  const rawDate = cleanString(body.preferred_date, 10);
  const rawPhone = cleanString(body.phone, 32);
  if (!errors.service && rawService && !e.services.includes(rawService)) {
    errors.service = 'Please choose one of the available services.';
  }
  if (!errors.preferred_date && DATE_RE.test(rawDate) && rawDate < todayInTimezone(e.timezone)) {
    errors.preferred_date = 'Preferred date must not be in the past.';
  }
  if (rawPhone && !PHONE_RE.test(rawPhone)) {
    errors.phone = 'Please enter a valid phone number.';
  }
  const loadedAt = Number(body.loadedAt || 0);
  if (loadedAt && Date.now() - loadedAt < config.minFillSeconds * 1000) {
    return res.status(422).json({ ok: false, errors: { description: 'Form completed too quickly. Please take a moment and try again.' } });
  }
  if (Object.keys(errors).length) return res.status(422).json({ ok: false, errors });

  // Save FIRST so a mail failure never loses the request.
  const cleaned = {
    fullName: cleanString(v.full_name, 100),
    email: cleanString(v.email, 254).toLowerCase(),
    phone: cleanString(v.phone, 32),
    company: cleanString(v.company, 120),
    service: cleanString(v.service, 120),
    description: cleanString(v.description, 5000),
    preferredDate: cleanString(v.preferred_date, 10),
    preferredTime: cleanString(v.preferred_time, 5),
    meetingType: v.meeting_type,
    consentAt: new Date(),
    submissionKey: key,
  };
  let saved;
  try {
    saved = await db.booking.create({ data: cleaned });
  } catch (err) {
    if (key && String(err.message).includes('Unique constraint')) {
      const existing = await db.booking.findFirst({ where: { submissionKey: key } });
      return res.status(201).json({ ok: true, reference: existing ? existing.id : key, deduped: true });
    }
    throw err;
  }

  const transporter = buildTransporter(config.smtp);
  const receivedAt = new Date().toISOString();
  const api = toApi(saved);
  const studioResult = await sendWithRetry(transporter, {
    kind: 'studio', from: config.studioFrom, to: e.studioEmail, replyTo: api.email,
    subject: studioSubject(api), text: studioText(api, api.id, receivedAt, e.timezone),
  }, 3);
  if (studioResult.delivered) await db.booking.update({ where: { id: saved.id }, data: { studioEmailSent: true } });
  // Client acknowledgment is optional (Settings → acknowledgment on/off).
  if (e.ackEnabled) {
    const clientResult = await sendWithRetry(transporter, {
      kind: 'client', from: config.studioFrom, to: api.email,
      subject: 'We received your meeting request – Double H Studio',
      text: clientText(api, api.id, e.sla),
    }, 2);
    if (clientResult.delivered) await db.booking.update({ where: { id: saved.id }, data: { clientEmailSent: true } });
  }

  return res.status(201).json({ ok: true, reference: saved.id });
}));

function toApi(b) {
  return {
    id: b.id, fullName: b.fullName, email: b.email, phone: b.phone, company: b.company,
    service: b.service, description: b.description, preferredDate: b.preferredDate,
    preferredTime: b.preferredTime, meetingType: b.meetingType,
  };
}

module.exports = { bookingRouter: router, toApi };
