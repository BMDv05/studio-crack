'use strict';
/* Email delivery (spec section 13). Uses Nodemailer SMTP when SMTP_HOST is set;
 * otherwise writes the rendered message to ./emails/ + console so local review
 * and acceptance tests never depend on external mail. Retries 3 attempts. */
const fs = require('node:fs');
const path = require('node:path');

let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch {
  nodemailer = null; // optional: file-log mode still works
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function studioSubject(b) {
  return `New meeting request – ${b.full_name} – ${b.service} (${b.preferred_date})`;
}

function studioText(b, reference, receivedAt) {
  return [
    'New meeting request — Double H Studio',
    '',
    `Reference: ${reference}`,
    `Received: ${receivedAt}`,
    '',
    `Name: ${b.full_name}`,
    `Email: ${b.email}`,
    `Phone: ${b.phone || '—'}`,
    `Company / Brand: ${b.company || '—'}`,
    `Service: ${b.service}`,
    `Preferred date: ${b.preferred_date}`,
    `Preferred time: ${b.preferred_time} (${process.env.STUDIO_TIMEZONE || 'Asia/Amman'})`,
    `Meeting type: ${b.meeting_type === 'in_person' ? 'In-person' : 'Online'}`,
    '',
    'Project description:',
    b.description,
    '',
    '— Reply directly to the client to confirm the appointment.',
  ].join('\n');
}

function clientText(b, reference, sla) {
  return [
    `Hello ${b.full_name},`,
    '',
    'We received your meeting request – Double H Studio.',
    '',
    `Reference: ${reference}`,
    `Service: ${b.service}`,
    `Preferred: ${b.preferred_date} at ${b.preferred_time} (${b.meeting_type === 'in_person' ? 'In-person' : 'Online'})`,
    '',
    'Important: the meeting is not yet confirmed. The studio will reply by email',
    `${sla}. If the time does not suit us we will suggest alternatives.`,
    '',
    'Thank you for considering Double H Studio.',
  ].join('\n');
}

function confirmationText(b, reference, tz) {
  return [
    `Hello ${b.full_name},`,
    '',
    'Good news — your meeting with Double H Studio is confirmed.',
    '',
    `Reference: ${reference}`,
    `Service: ${b.service}`,
    `When: ${b.preferred_date} at ${b.preferred_time} (${tz})`,
    `Where: ${b.meeting_type === 'in_person' ? 'In person — the studio will share directions' : 'Online — the studio will share a link'}`,
    '',
    'If anything changes, reply to this email and we will rearrange.',
    '',
    'Thank you,',
    'Double H Studio',
  ].join('\n');
}

function buildTransporter(smtp) {
  if (!smtp.host || !nodemailer) return null;
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  });
}

function logToFile(kind, mail) {
  const dir = path.join(__dirname, '..', 'emails');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}-${kind}-${Math.random().toString(36).slice(2, 8)}.json`);
  fs.writeFileSync(file, JSON.stringify({ kind, at: new Date().toISOString(), ...mail }, null, 2));
  return file;
}

async function sendWithRetry(transporter, mail, attempts = 3) {
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
      });
      return { delivered: true, fileLogged: false };
    } catch (err) {
      lastErr = err;
      console.error(`[email:${mail.kind}] attempt ${i}/${attempts} failed: ${err.message}`);
      await new Promise((r) => setTimeout(r, 400 * i));
    }
  }
  // Persist unsent for manual retry even after failure.
  const file = logToFile(`${mail.kind}-FAILED`, { ...mail, error: String(lastErr) });
  return { delivered: false, fileLogged: true, file, error: String(lastErr) };
}

module.exports = { esc, studioSubject, studioText, clientText, confirmationText, buildTransporter, sendWithRetry };
