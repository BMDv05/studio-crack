'use strict';
const app = require('./app');
const { config } = require('./config');
const { seedAdmin } = require('./middleware/auth');
const { db } = require('./db');
const { buildTransporter, sendWithRetry, studioSubject, studioText } = require('./services/email');
const { effSettings } = require('./services/settings');

async function main() {
  await seedAdmin();
  app.listen(config.port, () => {
    console.log(`Double H Studio API listening on http://localhost:${config.port}`);
    console.log(`CORS origin: ${config.clientOrigin}`);
  });
  // Retry unsent studio notifications (saved requests are never lost).
  setInterval(async () => {
    try {
      const pending = await db.booking.findMany({
        where: { studioEmailSent: false, status: 'new' },
        orderBy: { createdAt: 'asc' }, take: 5,
      });
      if (!pending.length) return;
      const transporter = buildTransporter(config.smtp);
      if (!transporter) return; // file-log mode already persisted
      const e = await effSettings();
      for (const b of pending) {
        const r = await sendWithRetry(transporter, {
          kind: 'studio-retry', from: config.studioFrom, to: e.studioEmail, replyTo: b.email,
          subject: studioSubject(b), text: studioText(b, b.id, b.createdAt.toISOString(), e.timezone),
        }, 1);
        if (r.delivered) await db.booking.update({ where: { id: b.id }, data: { studioEmailSent: true } });
      }
    } catch (err) {
      console.error('[retry]', err.message);
    }
  }, 5 * 60 * 1000).unref();
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
