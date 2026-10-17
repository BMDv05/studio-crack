'use strict';
/* One-off: list videos + flag any whose local file is missing. */
const fs = require('node:fs');
const path = require('node:path');
const { db } = require('../src/db');
const { uploadRoot } = require('../src/services/storage');

async function main() {
  const root = uploadRoot();
  const vids = await db.video.findMany();
  for (const v of vids) {
    let exists = 'n/a';
    if (v.storage === 'local' && v.videoUrl) {
      const rel = v.videoUrl.replace(/^\/media\//, '');
      exists = fs.existsSync(path.join(root, rel)) ? 'OK' : 'MISSING';
    }
    console.log([v.id, v.title, v.category, v.status, v.processing, v.storage, v.videoUrl || '-', v.thumbnailUrl || '-', exists].join(' | '));
  }
  await db.$disconnect();
}
main();
