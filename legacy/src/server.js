'use strict';
/* Double H Studio website + booking API + private admin dashboard.
 * Spec: Functional & Technical Specification v1.0 (Oct 2026), sections 5-17.
 * Routes: / /work /about /book /book/thank-you /privacy /sitemap.xml /robots.txt
 * API: POST /api/booking (201/422/429/500), GET /api/health, GET /api/videos
 * Admin: /admin/* (session + CSRF), /api/admin/* (session + CSRF) */
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const { config } = require('./config');
const { validateBooking } = require('./validate');
const store = require('./db');
const auth = require('./auth');
const { adminRouter, effSettings } = require('./admin');
const { videosRouter } = require('./videos');
const { uploadRoot } = require('./storage');
const { studioSubject, studioText, clientText, buildTransporter, sendWithRetry } = require('./email');

auth.seedAdmin();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Security + parsing
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: https:; media-src 'self' https: blob:; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self';"
  );
  next();
});
app.use(express.json({ limit: '64kb' }));

// ---- Rate limit: 5/hour/IP (spec 14) ----
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < config.rateLimit.windowMs);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > config.rateLimit.max;
}

// ---- Static frontend (extensionless URLs per sitemap) ----
const PUBLIC = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC, { extensions: ['html'], maxAge: '1h' }));
for (const [route, file] of [
  ['/', 'index.html'],
  ['/work', 'work.html'],
  ['/about', 'about.html'],
  ['/book', 'book.html'],
  ['/book/thank-you', 'thank-you.html'],
  ['/privacy', 'privacy.html'],
]) {
  app.get(route, (req, res) => res.sendFile(path.join(PUBLIC, file)));
}

// ---- Health ----
app.get('/api/health', (req, res) =>
  res.json({ ok: true, service: 'double-h-studio', time: new Date().toISOString() })
);

// ---- Booking API (spec 12) ----
const seenKeys = new Set();
app.post('/api/booking', async (req, res) => {
  try {
    const ip = (req.ip || req.socket.remoteAddress || 'unknown').toString();

    // Honeypot: bots fill hidden `website`; pretend success, save nothing.
    if (req.body && typeof req.body.website === 'string' && req.body.website.trim() !== '') {
      return res.status(201).json({ ok: true, reference: 'received' });
    }
    if (rateLimited(ip)) {
      res.setHeader('Retry-After', '3600');
      return res.status(429).json({ ok: false, error: 'Too many requests. Please try again later.' });
    }

    const submissionKey =
      typeof req.body?.submissionKey === 'string' && req.body.submissionKey.length >= 8
        ? req.body.submissionKey.slice(0, 64)
        : null;
    if (submissionKey) {
      if (seenKeys.has(submissionKey)) {
        const existing = store.findBySubmissionKey(submissionKey);
        if (existing) return res.status(201).json({ ok: true, reference: existing.id, deduped: true });
      }
      seenKeys.add(submissionKey);
      if (seenKeys.size > 5000) seenKeys.clear();
    }

    const { errors, cleaned } = validateBooking(req.body || {}, {
      services: effSettings().services,
      timeZone: effSettings().timezone,
      minFillSeconds: config.minFillSeconds,
    });
    if (Object.keys(errors).length) {
      const fieldErrors = { ...errors };
      delete fieldErrors._spam;
      if (errors._spam && !Object.keys(fieldErrors).length)
        return res.status(422).json({ ok: false, errors: { description: errors._spam } });
      return res.status(422).json({ ok: false, errors: fieldErrors });
    }

    // 3. Save FIRST so a mail failure never loses the request.
    const id = crypto.randomUUID();
    const consentAt = new Date().toISOString();
    let saved;
    try {
      const { consent: _consent, ...fields } = cleaned; // consent stored as consent_at only
      saved = store.saveBooking({ id, ...fields, consent_at: consentAt, submission_key: submissionKey });
    } catch (err) {
      if (submissionKey && /UNIQUE/i.test(String(err.message))) {
        const existing = store.findBySubmissionKey(submissionKey);
        return res.status(201).json({ ok: true, reference: existing ? existing.id : id, deduped: true });
      }
      throw err;
    }

    // 4-5. Emails (retry inside). Failure keeps the record with sent=false.
    const transporter = buildTransporter(config.smtp);
    const receivedAt = new Date().toISOString();
    const studioMail = {
      kind: 'studio',
      from: config.studioFrom,
      to: config.studioEmail,
      replyTo: saved.email,
      subject: studioSubject(saved),
      text: studioText(saved, saved.id, receivedAt),
    };
    const studioResult = await sendWithRetry(transporter, studioMail, 3);
    if (studioResult.delivered) store.markStudioSent(saved.id);

    const clientMail = {
      kind: 'client',
      from: config.studioFrom,
      to: saved.email,
      subject: 'We received your meeting request – Double H Studio',
      text: clientText(saved, saved.id, effSettings().sla),
    };
    const clientResult = await sendWithRetry(transporter, clientMail, 2);
    if (clientResult.delivered) store.markClientSent(saved.id);

    // 6. Success only after the request is safely saved.
    return res.status(201).json({ ok: true, reference: saved.id });
  } catch (err) {
    console.error('[POST /api/booking]', err);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
});

// ---- Public portfolio feed (published videos; categories: production | social) ----
app.get('/api/videos', (req, res) => {
  const category = req.query.category;
  if (category !== undefined && !['production', 'social'].includes(category)) {
    return res.status(400).json({ ok: false, error: 'Unknown category. Use production or social.' });
  }
  res.json({ ok: true, videos: store.listVideos({ publishedOnly: true, category }) });
});

// ---- Private admin dashboard (session + CSRF, noindex) ----
const PRIVATE = path.join(__dirname, '..', 'private', 'admin');
const noindex = (req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  next();
};
app.get('/admin/login', (req, res) => {
  if (auth.sessionFromRequest(req)) return res.redirect('/admin');
  noindex(req, res, () => res.sendFile(path.join(PRIVATE, 'login.html')));
});
app.use('/api/admin/videos', videosRouter);
app.use('/api/admin', adminRouter);
app.get('/admin', auth.requireAdmin, (req, res) =>
  noindex(req, res, () => res.sendFile(path.join(PRIVATE, 'overview.html')))
);
// Admin CSS/JS contain no data, so they stay public (the login page needs
// them before a session exists). Every HTML page and API route stays gated.
// Admin HTML/JS are tiny and change often: always revalidate, never serve stale UI.
app.use('/admin/assets', noindex, express.static(path.join(PRIVATE, 'assets'), { maxAge: 0 }));
app.use('/admin', auth.requireAdmin, noindex, express.static(PRIVATE, { extensions: ['html'], maxAge: 0 }));

// ---- Uploaded media (unguessable file names; drafts stay unpublished) ----
app.use('/media', express.static(uploadRoot(), { maxAge: '7d' }));

// ---- 404 ----
app.use((req, res, next) => {
  if ((req.originalUrl || '').split('?')[0].startsWith('/api/')) return res.status(404).json({ ok: false, error: 'Not found.' });
  res.status(404).sendFile(path.join(PUBLIC, '404.html'));
});

// ---- Safety net: never hang, never leak internals ----
app.use((err, req, res, next) => {
  console.error('[unhandled]', err && err.message ? err.message : err);
  if ((req.originalUrl || '').split('?')[0].startsWith('/api/')) return res.status(500).json({ ok: false, error: 'Something went wrong.' });
  next(err);
});

if (require.main === module) {
  // Background retry for unsent studio notifications (every 5 min).
  setInterval(async () => {
    try {
      const pending = store.unsentStudio();
      if (!pending.length) return;
      const transporter = buildTransporter(config.smtp);
      if (!transporter) return; // file-log mode already persisted
      const { studioSubject: subj, studioText: txt } = require('./email');
      for (const b of pending.slice(0, 5)) {
        const r = await sendWithRetry(transporter, {
          kind: 'studio-retry',
          from: config.studioFrom,
          to: config.studioEmail,
          replyTo: b.email,
          subject: subj(b),
          text: txt(b, b.id, b.created_at),
        }, 1);
        if (r.delivered) store.markStudioSent(b.id);
      }
    } catch (e) {
      console.error('[retry]', e.message);
    }
  }, 5 * 60 * 1000).unref();

  app.listen(config.port, () => {
    console.log(`Double H Studio listening on http://localhost:${config.port}`);
    console.log(`Studio inbox: ${config.studioEmail} (set STUDIO_EMAIL to change)`);
  });
}

module.exports = app;
