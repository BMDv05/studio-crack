'use strict';
/* One-off: verify a booking by email exists with expected fields. */
const { db } = require('../src/db');

async function main() {
  const email = process.argv[2] || 'browsertest@example.com';
  const b = await db.booking.findFirst({ where: { email } });
  if (!b) { console.log('NOT FOUND'); process.exit(1); }
  console.log([b.id, b.fullName, b.service, b.preferredDate, b.preferredTime, b.meetingType, b.status, `studio=${b.studioEmailSent}`, `client=${b.clientEmailSent}`, b.consentAt ? 'consent=ok' : 'consent=MISSING'].join(' | '));
  console.log('description:', b.description.slice(0, 60));
  await db.$disconnect();
}
main();
