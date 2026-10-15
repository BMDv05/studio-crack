'use strict';
/* Server-side validation for POST /api/booking (spec sections 5, 12, 14).
 * Never trust the browser: every field is trimmed, length-limited and checked
 * here even though the frontend also validates. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const PHONE_RE = /^[+\d][\d\s().-]{5,30}$/;

const LIMITS = {
  fullName: [2, 100],
  email: [5, 254],
  phone: [0, 32],
  company: [0, 120],
  description: [10, 5000],
};

/** Current date (YYYY-MM-DD) in the studio timezone. */
function todayInTimezone(timeZone) {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return fmt.format(new Date()); // en-CA yields YYYY-MM-DD
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function cleanString(v, max) {
  let s = (v ?? '').toString().replace(/\r/g, '').trim();
  // Strip control chars except \n \t to stop header/log injection.
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  if (max && s.length > max) s = s.slice(0, max);
  return s;
}

function validateBooking(body, opts) {
  const errors = {};
  const services = opts.services || [];
  const timeZone = opts.timeZone || 'UTC';

  const fullName = cleanString(body.full_name ?? body.fullName, LIMITS.fullName[1]);
  const email = cleanString(body.email, LIMITS.email[1]).toLowerCase();
  const phone = cleanString(body.phone, LIMITS.phone[1]);
  const company = cleanString(body.company, LIMITS.company[1]);
  const service = cleanString(body.service, 120);
  const description = cleanString(body.description, LIMITS.description[1]).trim();
  const preferredDate = cleanString(body.preferred_date ?? body.preferredDate, 10);
  const preferredTime = cleanString(body.preferred_time ?? body.preferredTime, 5);
  const meetingTypeRaw = cleanString(body.meeting_type ?? body.meetingType, 20).toLowerCase();
  const meetingType = meetingTypeRaw === 'in-person' ? 'in_person' : meetingTypeRaw;
  const consent = body.consent === true || body.consent === 'true' || body.consent === 'on';

  if (fullName.length < LIMITS.fullName[0]) errors.full_name = 'Please enter your full name.';
  if (!EMAIL_RE.test(email)) errors.email = 'Please enter a valid email address.';
  if (phone && !PHONE_RE.test(phone)) errors.phone = 'Please enter a valid phone number.';
  if (!services.includes(service)) errors.service = 'Please choose one of the available services.';
  if (description.length < LIMITS.description[0])
    errors.description = 'Please describe your project (at least 10 characters).';
  if (description.length > LIMITS.description[1])
    errors.description = 'Description is too long (max 5000 characters).';

  if (!DATE_RE.test(preferredDate)) {
    errors.preferred_date = 'Please choose a valid date (YYYY-MM-DD).';
  } else {
    const today = todayInTimezone(timeZone);
    if (preferredDate < today) errors.preferred_date = 'Preferred date must not be in the past.';
  }
  if (!TIME_RE.test(preferredTime)) errors.preferred_time = 'Please choose a valid time (HH:MM).';
  if (!['online', 'in_person'].includes(meetingType))
    errors.meeting_type = 'Please choose Online or In-person.';
  if (!consent) errors.consent = 'Please accept the privacy notice.';

  // Anti-spam companion: form must have been visible for a minimum time.
  const loadedAt = Number(body.loadedAt || body.loaded_at || 0);
  if (loadedAt) {
    const elapsed = Date.now() - loadedAt;
    if (elapsed < (opts.minFillSeconds ?? 2) * 1000)
      errors._spam = 'Form completed too quickly. Please take a moment and try again.';
  }

  const cleaned = {
    full_name: fullName,
    email,
    phone,
    company,
    service,
    description,
    preferred_date: preferredDate,
    preferred_time: preferredTime,
    meeting_type: meetingType,
    consent,
  };
  return { errors, cleaned };
}

module.exports = { validateBooking, todayInTimezone, EMAIL_RE, DATE_RE, TIME_RE };
