'use strict';
/* Central configuration. Everything secret or site-specific comes from the
 * environment (see .env.example). Settings stored in the DB override the
 * studio/upload defaults at runtime. */
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });

function parseList(value, fallback) {
  const raw = (value ?? '').toString().trim();
  if (!raw) return fallback;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

const DEFAULT_SERVICES = [
  'Brand Identity & Logo',
  'Architectural Visualization',
  'Interior & Spatial Design',
  'Cinematic Video & Showreel',
  'Web & Digital Presence',
];

const config = {
  port: Number(process.env.PORT || 3100),
  clientOrigin: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').replace(/\/$/, ''),
  databaseUrl: process.env.DATABASE_URL || '',
  adminSeed: {
    email: (process.env.ADMIN_EMAIL || '').toLowerCase().trim(),
    password: process.env.ADMIN_PASSWORD || '',
    name: process.env.ADMIN_NAME || 'Studio Admin',
  },
  sessionMinutes: Number(process.env.ADMIN_SESSION_MINUTES || 30),
  loginRateLimit: { windowMs: 10 * 60 * 1000, maxPerIp: 10, maxPerEmail: 5 },
  secureCookies: String(process.env.SECURE_COOKIES || '').toLowerCase() === 'true',
  studioEmail: process.env.STUDIO_EMAIL || 'studio@doubleh.example',
  studioFrom: process.env.STUDIO_REPLY_FROM || 'Double H Studio <no-reply@doubleh.example>',
  studioTimezone: process.env.STUDIO_TIMEZONE || 'Asia/Amman',
  services: parseList(process.env.STUDIO_SERVICES, DEFAULT_SERVICES),
  responseSLA: process.env.STUDIO_RESPONSE_SLA || 'within 2 working days',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
  },
  uploads: {
    maxMbProduction: Number(process.env.MAX_UPLOAD_MB_PRODUCTION || process.env.MAX_UPLOAD_MB || 500),
    maxMbSocial: Number(process.env.MAX_UPLOAD_MB_SOCIAL || 200),
    maxSocialSec: Number(process.env.MAX_SOCIAL_SEC || 90),
    dir: process.env.UPLOAD_DIR || 'uploads',
  },
  storage: {
    driver: (process.env.STORAGE_DRIVER || 'local').toLowerCase(),
    endpoint: (process.env.S3_ENDPOINT || '').replace(/\/$/, ''),
    region: process.env.S3_REGION || 'auto',
    bucket: process.env.S3_BUCKET || '',
    accessKey: process.env.S3_ACCESS_KEY || '',
    secretKey: process.env.S3_SECRET_KEY || '',
    publicBase: (process.env.S3_PUBLIC_BASE || '').replace(/\/$/, ''),
  },
  rateLimit: { windowMs: 60 * 60 * 1000, max: 5 },
  minFillSeconds: 2,
};

module.exports = { config, DEFAULT_SERVICES };
