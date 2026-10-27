'use strict';
/* Studio emails: notification, acknowledgment, confirmation.
 * SMTP when configured, otherwise logged to server/emails/ + console so local
 * review never depends on external mail. Retries built into sendWithRetry. */
const fs = require('node:fs');
const path = require('node:path');

let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch {
  nodemailer = null;
}

function studioSubject(b) {
  return `New meeting request – ${b.fullName} – ${b.service} (${b.preferredDate})`;
}

function studioText(b, reference, receivedAt, tz) {
  return [
    'New meeting request — Double H Studio',
    '',
    `Reference: ${reference}`,
    `Received: ${receivedAt}`,
    '',
    `Name: ${b.fullName}`,
    `Email: ${b.email}`,
    `Phone: ${b.phone || '—'}`,
    `Company / Brand: ${b.company || '—'}`,
    `Service: ${b.service}`,
    `Preferred date: ${b.preferredDate}`,
    `Preferred time: ${b.preferredTime} (${tz})`,
    `Meeting type: ${b.meetingType === 'in_person' ? 'In-person' : 'Online'}`,
    '',
    'Project description:',
    b.description,
    '',
    '— Reply directly to the client to confirm the appointment.',
  ].join('\n');
}

function clientText(b, reference, sla) {
  return [
    `Hello ${b.fullName},`,
    '',
    'We received your meeting request – Double H Studio.',
    '',
    `Reference: ${reference}`,
    `Service: ${b.service}`,
    `Preferred: ${b.preferredDate} at ${b.preferredTime} (${b.meetingType === 'in_person' ? 'In-person' : 'Online'})`,
    '',
    'Important: the meeting is not yet confirmed. The studio will reply by email',
    `${sla}. If the time does not suit us we will suggest alternatives.`,
    '',
    'Thank you for considering Double H Studio.',
  ].join('\n');
}

function confirmationText(b, reference, tz) {
  return [
    `Hello ${b.fullName},`,
    '',
    'Good news — your meeting with Double H Studio is confirmed.',
    '',
    `Reference: ${reference}`,
    `Service: ${b.service}`,
    `When: ${b.preferredDate} at ${b.preferredTime} (${tz})`,
    `Where: ${b.meetingType === 'in_person' ? 'In person — the studio will share directions' : 'Online — the studio will share a link'}`,
    '',
    'If anything changes, reply to this email and we will rearrange.',
    '',
    'Thank you,',
    'Double H Studio',
  ].join('\n');
}

function buildTransporter(smtp) {
  if (process.env.WORKER_RUNTIME === 'true' && smtp.pass) {
    return { sendMail: mail => require('./cloudStorage').broker('mail', { mail, smtpPassword: smtp.pass }) };
  }
  if (!smtp.host || !nodemailer) return null;
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  });
}

function logToFile(kind, mail) {
  const dir = path.join(__dirname, '..', '..', 'emails');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}-${kind}-${Math.random().toString(36).slice(2, 8)}.json`);
  fs.writeFileSync(file, JSON.stringify({ kind, at: new Date().toISOString(), ...mail }, null, 2));
  return file;
}

async function sendWithRetry(transporter, mail, attempts = 3) {
  if (process.env.WORKER_RUNTIME === 'true' && !transporter) {
    const { db } = require('../db');
    await db.emailOutbox.create({ data: { kind: mail.kind, payload: mail } });
    return { delivered: false, queued: true };
  }
  let lastErr = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      if (!transporter) {
        const file = logToFile(mail.kind, mail);
        console.log(`[email:${mail.kind}] file-logged (no SMTP): ${file}`);
        return { delivered: true, fileLogged: true, file };
      }
      await transporter.sendMail({
        from: mail.from,
        to: mail.to,
        replyTo: mail.replyTo,
        subject: mail.subject,
        text: mail.text,
        messageId: mail.bookingId ? `<${mail.bookingId}.${mail.kind.replace('studio-retry', 'studio')}@double-h-studio.com>` : undefined,
      });
      return { delivered: true, fileLogged: false };
    } catch (err) {
      lastErr = err;
      console.error(`[email:${mail.kind}] attempt ${i}/${attempts} failed: ${err.message}`);
      await new Promise((r) => setTimeout(r, 400 * i));
    }
  }
  if (process.env.WORKER_RUNTIME === 'true') {
    const { db } = require('../db');
    await db.emailOutbox.create({ data: { kind: mail.kind, payload: mail, attempts } });
    return { delivered: false, queued: true };
  }
  const file = logToFile(`${mail.kind}-FAILED`, { ...mail, error: String(lastErr) });
  return { delivered: false, fileLogged: true, file, error: String(lastErr) };
}

async function drainOutbox(smtp) {
  const { db } = require('../db');
  const transport = buildTransporter(smtp);
  if (!transport) return;
  await db.emailOutbox.updateMany({
    where: { status: 'sending', updatedAt: { lt: new Date(Date.now() - 15 * 60000) } },
    data: { status: 'pending' },
  });
  const rows = await db.emailOutbox.findMany({ where: { status: 'pending', attempts: { lt: 5 } }, orderBy: { createdAt: 'asc' }, take: 10 });
  for (const row of rows) {
    const claimed = await db.emailOutbox.updateMany({ where: { id: row.id, status: 'pending' }, data: { status: 'sending', attempts: { increment: 1 } } });
    if (!claimed.count) continue;
    const mail = row.payload;
    try {
      await transport.sendMail({
        from: mail.from, to: mail.to, replyTo: mail.replyTo, subject: mail.subject, text: mail.text,
        messageId: mail.bookingId ? `<${mail.bookingId}.${mail.kind.replace('studio-retry', 'studio')}@double-h-studio.com>` : undefined,
      });
      await db.emailOutbox.update({ where: { id: row.id }, data: { status: 'sent' } });
      if (mail.bookingId) {
        const field = mail.kind.startsWith('studio') ? 'studioEmailSent' : mail.kind === 'client' ? 'clientEmailSent' : 'confirmEmailSent';
        await db.booking.updateMany({ where: { id: mail.bookingId }, data: { [field]: true } });
      }
    } catch {
      await db.emailOutbox.update({ where: { id: row.id }, data: { status: row.attempts >= 4 ? 'failed' : 'pending' } });
      console.error('Queued email delivery failed; a retry will follow if attempts remain.');
    }
  }
}

module.exports = { studioSubject, studioText, clientText, confirmationText, buildTransporter, sendWithRetry, drainOutbox };
