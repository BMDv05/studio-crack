'use strict';
/* One-off: full happy-path video upload against the live API — login, create,
 * stream a real MP4, finalize, verify ready, then delete the test row. */
const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.API_BASE || 'http://localhost:3100';
const EMAIL = process.env.ADMIN_EMAIL || 'studio-admin@example.com';
const PASS = process.env.ADMIN_PASSWORD || 'admin-studio-2026!';
const SAMPLE = path.join(__dirname, '..', '..', 'legacy', 'uploads', 'videos', 'a8d0be74c317459bmv9e5q11.mp4');

async function main() {
  if (!fs.existsSync(SAMPLE)) { console.log('no sample video'); process.exit(1); }

  // 1. login
  const lr = await fetch(BASE + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  const ld = await lr.json();
  if (!lr.ok) { console.log('login failed', lr.status, ld); process.exit(1); }
  const cookie = (lr.headers.getSetCookie() || []).map((c) => c.split(';')[0]).join('; ');
  const H = { Cookie: cookie, 'X-CSRF-Token': ld.csrf };
  console.log('login ok');

  // 2. create row (production)
  const cr = await fetch(BASE + '/api/admin/videos', {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Upload path test', category: 'production', published: false }),
  });
  const cd = await cr.json();
  if (!cr.ok) { console.log('create failed', cr.status, cd); process.exit(1); }
  const id = cd.video.id;
  console.log('created', id, 'storageDriver=' + cd.storageDriver);

  try {
    // 3. upload the file with duration
    const buf = fs.readFileSync(SAMPLE);
    const fd = new FormData();
    fd.append('file', new Blob([buf], { type: 'video/mp4' }), 'sample.mp4');
    const up = await fetch(`${BASE}/api/admin/videos/${id}/file?duration=42.5`, { method: 'POST', headers: H, body: fd });
    const ud = await up.json();
    if (!up.ok) { console.log('upload failed', up.status, ud); process.exit(1); }
    console.log('upload accepted:', up.status, 'size=' + ud.video.size_bytes, 'mime=' + ud.video.mime, 'dur=' + ud.video.duration_sec, 'proc=' + ud.video.processing);

    // 4. wait for finalize (pass-through or transcode)
    let final = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const lr2 = await fetch(`${BASE}/api/admin/videos?category=production`, { headers: { Cookie: cookie } });
      const ld2 = await lr2.json();
      final = (ld2.videos || []).find((v) => v.id === id);
      if (final && (final.processing === 'ready' || final.processing === 'failed')) break;
    }
    console.log('final:', final && final.processing, final && final.video_url);

    if (final && final.processing === 'ready') {
      // 5. media served?
      const md = await fetch(BASE + final.video_url);
      console.log('media GET:', md.status, md.headers.get('content-type'), 'bytes=' + (await md.arrayBuffer()).byteLength);
      // 6. publish -> public feed shows it
      await fetch(`${BASE}/api/admin/videos/${id}`, {
        method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'published' }),
      });
      const pub = await (await fetch(BASE + '/api/videos?category=production')).json();
      const inFeed = (pub.videos || []).some((v) => v.id === id);
      console.log('public feed contains test video:', inFeed);
    }
  } finally {
    // 7. cleanup
    const dl = await fetch(`${BASE}/api/admin/videos/${id}`, { method: 'DELETE', headers: H });
    console.log('cleanup delete:', dl.status);
  }
  process.exit(0);
}
main().catch((e) => { console.error('FAILED', e); process.exit(1); });
