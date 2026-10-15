'use strict';
/* Seed the first admin + default studio settings. Idempotent.
 * Usage: npm run seed (requires DATABASE_URL + ADMIN_* in server/.env) */
const { db } = require('../src/db');
const { config } = require('../src/config');
const { seedAdmin } = require('../src/middleware/auth');

async function main() {
  await seedAdmin();
  const defaults = {
    timezone: config.studioTimezone,
    sla: config.responseSLA,
    services: JSON.stringify(config.services),
    maxUploadMbProduction: String(config.uploads.maxMbProduction),
    maxUploadMbSocial: String(config.uploads.maxMbSocial),
    maxSocialSec: String(config.uploads.maxSocialSec),
    storageDriver: config.storage.driver,
  };
  for (const [key, value] of Object.entries(defaults)) {
    await db.setting.upsert({ where: { key }, update: {}, create: { key, value } });
  }
  console.log('[seed] default settings ensured');
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error('[seed] failed:', err.message);
  await db.$disconnect();
  process.exit(1);
});
