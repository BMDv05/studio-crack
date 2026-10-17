'use strict';
/* One-shot import from the frozen legacy site (legacy/data/bookings.sqlite
 * + legacy/uploads) into PostgreSQL. Idempotent on unique keys.
 * Usage: npm run import:legacy (server/.env must point at the target DB) */
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { db } = require('../src/db');

const LEGACY = path.join(__dirname, '..', '..', 'legacy');
const SQLITE = path.join(LEGACY, 'data', 'bookings.sqlite');

function iso(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function main() {
  if (!fs.existsSync(SQLITE)) {
    console.log('[import] no legacy database found at', SQLITE);
    await db.$disconnect();
    return;
  }
  const lite = new DatabaseSync(SQLITE);

  // Admins (bcrypt hashes are portable)
  for (const a of lite.prepare('SELECT * FROM admins').all()) {
    await db.admin.upsert({
      where: { email: a.email },
      update: {},
      create: { email: a.email, name: a.name || '', passwordHash: a.password_hash },
    });
  }

  // Settings overrides
  for (const s of lite.prepare('SELECT key, value FROM settings').all()) {
    await db.setting.upsert({ where: { key: s.key }, update: { value: s.value }, create: { key: s.key, value: s.value } });
  }

  // Bookings + events
  let bookings = 0;
  for (const r of lite.prepare('SELECT * FROM booking_requests').all()) {
    await db.booking.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id: r.id,
        createdAt: iso(r.created_at) || new Date(),
        fullName: r.full_name, email: r.email, phone: r.phone || '', company: r.company || '',
        service: r.service, description: r.description,
        preferredDate: r.preferred_date, preferredTime: r.preferred_time,
        meetingType: r.meeting_type === 'in_person' ? 'in_person' : 'online',
        status: ['new', 'confirmed', 'declined', 'closed'].includes(r.status) ? r.status : 'new',
        statusChangedAt: iso(r.status_changed_at),
        studioEmailSent: !!r.studio_email_sent, clientEmailSent: !!r.client_email_sent,
        confirmEmailSent: !!r.confirm_email_sent, consentAt: iso(r.consent_at),
        readAt: iso(r.read_at), submissionKey: r.submission_key,
      },
    });
    bookings++;
    for (const e of lite.prepare('SELECT * FROM request_events WHERE request_id = ? ORDER BY id').all(r.id)) {
      await db.bookingEvent.create({
        data: { bookingId: r.id, at: iso(e.at) || new Date(), author: e.author || '', kind: e.kind, detail: e.detail || '' },
      });
    }
  }

  // Videos
  let videos = 0;
  const cols = lite.prepare("SELECT name FROM pragma_table_info('videos')").all().map((c) => c.name);
  for (const r of lite.prepare('SELECT * FROM videos').all()) {
    let platforms = [];
    try { platforms = JSON.parse(r.platforms || '[]'); } catch { platforms = []; }
    const processing = ['uploading', 'processing', 'ready', 'failed'].includes(r.processing) ? r.processing : 'failed';
    // A "ready" local video whose file is missing would 404 on /work — mark failed instead.
    let finalProcessing = processing;
    if (processing === 'ready' && (r.storage || 'local') === 'local' && r.video_url) {
      const rel = String(r.video_url).replace(/^\/media\//, '');
      if (!fs.existsSync(path.join(__dirname, '..', 'uploads', rel))) finalProcessing = 'failed';
    }
    await db.video.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id: r.id, title: r.title, description: r.description || '',
        category: r.category === 'social' ? 'social' : 'production',
        videoUrl: r.video_url || '', thumbnailUrl: r.thumbnail_url || '',
        durationSec: r.duration_sec ?? null, sizeBytes: BigInt(r.size_bytes || 0),
        mime: r.mime || '', storage: r.storage || 'local', originalName: r.original_name || '',
        sortOrder: r.sort_order ?? 0, platforms, clientName: cols.includes('client_name') ? (r.client_name || '') : '',
        status: r.status === 'published' ? 'published' : 'draft',
        processing: finalProcessing,
        uploadedBy: r.uploaded_by || '',
        createdAt: iso(r.created_at) || new Date(),
      },
    });
    videos++;
  }

  // Media files
  let files = 0;
  const copyDir = (name) => {
    const from = path.join(LEGACY, 'uploads', name);
    const to = path.join(__dirname, '..', 'uploads', name);
    if (!fs.existsSync(from)) return;
    fs.mkdirSync(to, { recursive: true });
    for (const f of fs.readdirSync(from)) {
      const src = path.join(from, f);
      if (fs.statSync(src).isFile() && !fs.existsSync(path.join(to, f))) {
        fs.copyFileSync(src, path.join(to, f));
        files++;
      }
    }
  };
  copyDir('videos');
  copyDir('posters');

  console.log(`[import] admins, settings, ${bookings} bookings (+events), ${videos} videos, ${files} media files`);
  lite.close();
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error('[import] failed:', err.message);
  await db.$disconnect();
  process.exit(1);
});
