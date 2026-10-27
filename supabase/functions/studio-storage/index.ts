// Private backend-to-backend storage gateway. The service key never leaves Supabase.
import nodemailer from 'npm:nodemailer@10.2.1';
const root = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
const bucket = 'studio-media';
const reply = (body: unknown, status = 200) => Response.json(body, { status });
async function storage(path: string, init: RequestInit = {}) {
  return fetch(`${root}/storage/v1${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
}
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
  if (!/^[a-f0-9]{64}$/.test(token)) return reply({ error: 'Unauthorized' }, 401);
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map(x => x.toString(16).padStart(2, '0')).join('');
  const config = await fetch(`${root}/rest/v1/settings?key=eq.storageBrokerTokenHash&select=value`, { headers });
  if (!config.ok) return reply({ error: 'Authorization unavailable' }, 503);
  const values = await config.json();
  if (values[0]?.value !== hash) return reply({ error: 'Unauthorized' }, 401);
  try {
    const body = await req.json();
    if (body.action === 'mail' || body.action === 'mailVerify') {
      if (typeof body.smtpPassword !== 'string' || !body.smtpPassword) return reply({ error: 'Mailbox is not configured' }, 400);
      const transport = nodemailer.createTransport({
        host: 'smtp.hostinger.com', port: 465, secure: true,
        auth: { user: 'info@double-h-studio.com', pass: body.smtpPassword },
        connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
      });
      try {
        if (body.action === 'mailVerify') { await transport.verify(); return reply({ ok: true }); }
        const mail = body.mail || {};
        const result = await transport.sendMail({
          from: 'Double H Studio <info@double-h-studio.com>',
          to: mail.to, replyTo: mail.replyTo, subject: mail.subject,
          text: mail.text, messageId: mail.messageId,
          disableFileAccess: true, disableUrlAccess: true,
        });
        return reply({ ok: true, messageId: result.messageId });
      } catch (error) {
        console.error('Hostinger mail delivery failed:', error.code || 'SMTP_ERROR');
        return reply({ error: 'Mailbox delivery unavailable' }, 502);
      } finally { transport.close(); }
    }
    if (body.action === 'bootstrap') {
      const existing = await storage(`/bucket/${bucket}`);
      if (!existing.ok) {
        const created = await storage('/bucket', { method: 'POST', body: JSON.stringify({
          id: bucket, name: bucket, public: false, file_size_limit: 52428800,
          allowed_mime_types: ['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png', 'image/webp'],
        }) });
        if (!created.ok) return reply({ error: 'Bucket creation failed' }, 502);
      }
      return reply({ ok: true });
    }
    const key = String(body.key || '');
    if (!/^(videos|posters)\/[a-z0-9-]+\.(mp4|mov|webm|jpg|png|webp)$/.test(key)) return reply({ error: 'Invalid key' }, 400);
    if (body.action === 'upload') {
      const result = await storage(`/object/upload/sign/${bucket}/${key}`, { method: 'POST', body: '{}' });
      const data = await result.json();
      if (!result.ok) return reply({ error: 'Could not sign upload' }, 502);
      return reply({ url: `${root}/storage/v1${data.url}`, key });
    }
    if (body.action === 'verify') {
      const head = await storage(`/object/${bucket}/${key}`, { method: 'HEAD' });
      if (!head.ok) return reply({ error: 'Object not found' }, 404);
      const size = Number(head.headers.get('content-length'));
      const sample = await storage(`/object/${bucket}/${key}`, { headers: { Range: 'bytes=0-63' } });
      if (!sample.ok) return reply({ error: 'Object not readable' }, 502);
      // Stop after the header even if an upstream ignores the Range header.
      const reader = sample.body!.getReader();
      const first = await reader.read();
      await reader.cancel();
      return reply({ size, mime: head.headers.get('content-type'), head: [...(first.value || []).slice(0, 64)] });
    }
    if (body.action === 'read') {
      const result = await storage(`/object/sign/${bucket}/${key}`, { method: 'POST', body: JSON.stringify({ expiresIn: 120 }) });
      const data = await result.json();
      if (!result.ok) return reply({ error: 'Object not found' }, 404);
      return reply({ url: `${root}/storage/v1${data.signedURL}` });
    }
    if (body.action === 'delete') {
      const result = await storage(`/object/${bucket}`, { method: 'DELETE', body: JSON.stringify({ prefixes: [key] }) });
      return reply({ ok: result.ok }, result.ok ? 200 : 502);
    }
    return reply({ error: 'Unknown action' }, 400);
  } catch {
    return reply({ error: 'Storage operation failed' }, 502);
  }
});
