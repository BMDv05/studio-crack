import { httpServerHandler } from 'cloudflare:node';
import { createServer } from 'node:http';
import app from './src/app.js';
import database from './src/db.js';
import runtime from './src/runtime.js';
import storage from './src/services/cloudStorage.js';
import auth from './src/middleware/auth.js';

const server = createServer(app);
server.listen(3100);
const handler = httpServerHandler({ port: 3100 });

export default {
  async scheduled(_event, env, ctx) {
    const db = database.createDb(env.HYPERDRIVE?.connectionString || env.DATABASE_URL);
    try {
      await runtime.requestContext.run({ db, env }, async () => {
        await (await import('./src/services/email.js')).default.drainOutbox({ pass: env.SMTP_PASS });
        await db.$executeRaw`DELETE FROM public.rate_limits WHERE window_start < ${new Date(Date.now() - 2 * 86400000)}`;
      });
    } finally { ctx.waitUntil(db.$disconnect()); }
  },
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const origin = request.headers.get('Origin');
      if (origin && origin !== new URL(request.url).origin) return Response.json({ ok: false, error: 'Invalid request origin.' }, { status: 403 });
    }
    if (!path.startsWith('/api/') && !path.startsWith('/media/')) return env.ASSETS.fetch(request);
    if ((!env.HYPERDRIVE && !env.DATABASE_URL) || !env.STORAGE_BROKER_TOKEN) return Response.json({ ok: false, error: 'Service setup is incomplete.' }, { status: 503 });
    const db = database.createDb(env.HYPERDRIVE?.connectionString || env.DATABASE_URL);
    try {
      return await runtime.requestContext.run({ db, env }, async () => {
        if (path.startsWith('/media/')) {
          const key = decodeURIComponent(path.slice('/media/'.length));
          const video = await db.video.findFirst({ where: { OR: [{ videoUrl: path }, { thumbnailUrl: path }] } });
          if (!video) return new Response('Not found', { status: 404 });
          if (video.status !== 'published' || video.processing !== 'ready') {
            const session = await auth.sessionFromRequest({ headers: { cookie: request.headers.get('cookie') || '' } });
            if (!session) return new Response('Not found', { status: 404 });
          }
          const signed = await storage.broker('read', { key });
          const headers = new Headers();
          for (const name of ['range', 'if-none-match', 'if-modified-since']) {
            if (request.headers.has(name)) headers.set(name, request.headers.get(name));
          }
          const result = await fetch(signed.url, { method: request.method === 'HEAD' ? 'HEAD' : 'GET', headers });
          const outgoing = new Headers(result.headers);
          outgoing.set('Cache-Control', 'private, no-cache');
          outgoing.set('X-Content-Type-Options', 'nosniff');
          return new Response(result.body, { status: result.status, headers: outgoing });
        }
        // Use Cloudflare's trusted client IP, ignoring caller-supplied forwarding headers.
        const headers = new Headers(request.headers);
        headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '127.0.0.1');
        return handler.fetch(new Request(request, { headers }), env, ctx);
      });
    } catch (error) {
      console.error('Worker request failed:', error.message);
      return Response.json({ ok: false, error: 'Something went wrong.' }, { status: 500 });
    } finally {
      ctx.waitUntil(db.$disconnect());
    }
  },
};
