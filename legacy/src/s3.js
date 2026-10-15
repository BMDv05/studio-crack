'use strict';
/* Minimal AWS SigV4 presigner for S3-compatible object storage (AWS, R2, …).
 * Used to hand the browser a signed PUT URL so large video files upload
 * directly to object storage instead of through the app server. */
const crypto = require('node:crypto');

function hmac(key, data, hex = false) {
  const h = crypto.createHmac('sha256', key).update(data);
  return hex ? h.digest('hex') : h.digest();
}
function hashHex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}
function amzDates(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  return { amz: stamp, day: stamp.slice(0, 8) };
}

/** Build a presigned URL. method: PUT (upload) or HEAD (verify). */
function presign({ endpoint, region, bucket, key, accessKey, secretKey, method = 'PUT', contentType = '', expiresSec = 900 }) {
  const u = new URL(endpoint);
  const host = `${bucket}.${u.hostname}`; // virtual-hosted style (AWS + R2)
  const path = `/${key}`;
  const { amz, day } = amzDates();
  const scope = `${day}/${region}/s3/aws4_request`;
  const signedHeaders = contentType ? 'content-type;host' : 'host';
  const canonicalHeaders = contentType
    ? `content-type:${contentType}\nhost:${host}\n`
    : `host:${host}\n`;
  const params = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKey}/${scope}`,
    'X-Amz-Date': amz,
    'X-Amz-Expires': String(expiresSec),
    'X-Amz-SignedHeaders': signedHeaders,
  });
  const canonical = [method, path, '', params.toString().replace(/\+/g, '%20'), canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amz, scope, hashHex(canonical)].join('\n');
  const k = hmac(hmac(hmac(hmac('AWS4' + secretKey, day), region), 's3'), 'aws4_request');
  const sig = hmac(k, toSign, true);
  params.set('X-Amz-Signature', sig);
  return `${u.protocol}//${host}${path}?${params.toString()}`;
}

function s3Configured() {
  const s = require('./config').config.storage;
  return !!(s.endpoint && s.bucket && s.accessKey && s.secretKey);
}

module.exports = { presign, s3Configured };
