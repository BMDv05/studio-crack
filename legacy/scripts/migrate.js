'use strict';
/* Video categories migration report.
 * The migration itself runs automatically on boot (see src/db.js): old
 * columns are renamed, category/platforms/client_name are added, and every
 * pre-existing video is backfilled to category = 'production'.
 * Usage: npm run migrate */
const path = require('node:path');

process.env.DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'bookings.sqlite');

// Requiring db executes the full migration chain.
const store = require('../src/db');
const { db } = store;

const cols = db.prepare("SELECT name FROM pragma_table_info('videos')").all().map((c) => c.name);
const required = ['id', 'title', 'description', 'category', 'video_url', 'thumbnail_url', 'duration_sec',
  'size_bytes', 'mime', 'storage', 'original_name', 'sort_order', 'platforms', 'client_name',
  'status', 'processing', 'uploaded_by', 'created_at', 'updated_at'];
const missing = required.filter((c) => !cols.includes(c));
const legacy = ['src_url', 'poster_url', 'order_index'].filter((c) => cols.includes(c));

console.log(`database: ${process.env.DB_FILE}`);
console.log(`videos columns: ${cols.join(',')}`);
console.log(missing.length ? `MISSING: ${missing.join(',')}` : 'schema: OK (all category fields present)');
console.log(legacy.length ? `LEGACY COLUMNS STILL PRESENT: ${legacy.join(',')}` : 'legacy columns: none (renamed)');
const counts = db.prepare('SELECT category, status, COUNT(*) n FROM videos GROUP BY category, status').all();
if (!counts.length) console.log('videos: none yet');
for (const r of counts) console.log(`videos: category=${r.category} status=${r.status} count=${r.n}`);
const bad = db.prepare("SELECT COUNT(*) n FROM videos WHERE category NOT IN ('production','social')").get().n;
console.log(bad ? `ORPHANS (needs attention): ${bad}` : 'backfill: OK (every video is production or social)');
if (missing.length || legacy.length || bad) process.exitCode = 1;
