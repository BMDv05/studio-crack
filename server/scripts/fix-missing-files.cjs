'use strict';
/* One-off repair: mark local "ready" videos whose file is missing as failed
 * (they would 404 on the public /work grid). Safe to re-run. */
const fs = require('node:fs');
const path = require('node:path');
const { db } = require('../src/db');
const { uploadRoot } = require('../src/services/storage');

async function main() {
  const root = uploadRoot();
  const vids = await db.video.findMany({ where: { storage: 'local', processing: 'ready' } });
  let fixed = 0;
  for (const v of vids) {
    const rel = String(v.videoUrl || '').replace(/^\/media\//, '');
    if (!rel || !fs.existsSync(path.join(root, rel))) {
      await db.video.update({ where: { id: v.id }, data: { processing: 'failed' } });
      console.log(`[fix] ${v.id} "${v.title}" — file missing, marked failed`);
      fixed++;
    }
  }
  console.log(`[fix] ${fixed} video(s) repaired of ${vids.length} checked`);
  await db.$disconnect();
}
main();
