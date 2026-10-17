'use strict';
/* Effective studio settings: DB rows override environment defaults. */
const { db } = require('../db');
const { config } = require('../config');

async function effSettings() {
  const rows = await db.setting.findMany();
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  let services = config.services;
  if (s.services) {
    try {
      const parsed = JSON.parse(s.services);
      if (Array.isArray(parsed) && parsed.length) services = parsed.map(String);
    } catch { /* keep defaults */ }
  }
  const legacyCap = s.maxUploadMb ? Number(s.maxUploadMb) : null;
  return {
    timezone: s.timezone || config.studioTimezone,
    sla: s.sla || config.responseSLA,
    services,
    maxUploadMb: legacyCap || config.uploads.maxMbProduction,
    maxUploadMbProduction: s.maxUploadMbProduction ? Number(s.maxUploadMbProduction) : (legacyCap || config.uploads.maxMbProduction),
    maxUploadMbSocial: s.maxUploadMbSocial ? Number(s.maxUploadMbSocial) : (legacyCap || config.uploads.maxMbSocial),
    maxSocialSec: s.maxSocialSec ? Number(s.maxSocialSec) : config.uploads.maxSocialSec,
    storageDriver: (s.storageDriver || config.storage.driver || 'local').toLowerCase(),
    studioEmail: s.studioEmail || config.studioEmail,
    ackEnabled: s.ackEnabled !== 'false',
  };
}

function validTimezone(tz) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function todayInTimezone(timeZone) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

module.exports = { effSettings, validTimezone, todayInTimezone };
