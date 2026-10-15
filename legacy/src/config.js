'use strict';
/* Central configuration. Env overrides defaults so the studio can confirm
 * services list, inbox, timezone and SLA without code changes (spec section 18). */

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
  siteBaseUrl: (process.env.SITE_BASE_URL || 'http://localhost:3100').replace(/\/$/, ''),
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
  adminToken: process.env.ADMIN_TOKEN || 'change-me',
  rateLimit: { windowMs: 60 * 60 * 1000, max: 5 }, // 5 requests / hour / IP (spec 14)
  minFillSeconds: 2, // honeypot companion: reject instant bot fills
  // ---- Admin dashboard ----
  adminSeed: {
    email: (process.env.ADMIN_EMAIL || '').toLowerCase().trim(),
    password: process.env.ADMIN_PASSWORD || '',
    name: process.env.ADMIN_NAME || 'Studio Admin',
  },
  sessionMinutes: Number(process.env.ADMIN_SESSION_MINUTES || 30), // sliding idle timeout
  loginRateLimit: { windowMs: 10 * 60 * 1000, maxPerIp: 10, maxPerEmail: 5 },
  secureCookies: String(process.env.SECURE_COOKIES || '').toLowerCase() === 'true',
  uploads: {
    maxMb: Number(process.env.MAX_UPLOAD_MB || 500),
    maxMbProduction: Number(process.env.MAX_UPLOAD_MB_PRODUCTION || process.env.MAX_UPLOAD_MB || 500),
    maxMbSocial: Number(process.env.MAX_UPLOAD_MB_SOCIAL || 200),
    maxSocialSec: Number(process.env.MAX_SOCIAL_SEC || 90),
    dir: process.env.UPLOAD_DIR || 'uploads',
  },
  storage: {
    driver: (process.env.STORAGE_DRIVER || 'local').toLowerCase(), // local | s3
    endpoint: (process.env.S3_ENDPOINT || '').replace(/\/$/, ''),
    region: process.env.S3_REGION || 'auto',
    bucket: process.env.S3_BUCKET || '',
    accessKey: process.env.S3_ACCESS_KEY || '',
    secretKey: process.env.S3_SECRET_KEY || '',
    publicBase: (process.env.S3_PUBLIC_BASE || '').replace(/\/$/, ''), // e.g. https://cdn.example.com/studio
  },
};

module.exports = { config, DEFAULT_SERVICES };
