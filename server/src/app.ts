import { existsSync } from 'node:fs';
import { join } from 'node:path';

import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyServerOptions } from 'fastify';

import { registerAuth } from './auth.ts';
import type { Config } from './config.ts';
import type { Db } from './db.ts';
import { describeError } from './errors.ts';
import { registerLive } from './live.ts';
import { registerAdmin } from './routes/admin.ts';
import { registerSupport } from './routes/support.ts';
import { MAX_PHOTO_BYTES, registerUpdates } from './routes/updates.ts';

const CSP = "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; "
  + "frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

export async function buildApp(db: Db, config: Config, options: FastifyServerOptions = {}) {
  const app = Fastify({ trustProxy: config.trustProxy, bodyLimit: 64 * 1024, ...options });

  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 0 } });
  await app.register(websocket, { options: { maxPayload: 4096 } });

  // Bearer-token API calls from the listed origins only. No credentials header,
  // so browsers never send the website cookie cross-origin.
  if (config.corsOrigins.length) {
    app.addHook('onRequest', async (req, reply) => {
      const origin = req.headers.origin;
      if (!origin || !config.corsOrigins.includes(origin) || !req.url.startsWith('/v1/')) return;
      reply.header('access-control-allow-origin', origin);
      reply.header('vary', 'Origin');
      if (req.method === 'OPTIONS') {
        reply.header('access-control-allow-methods', 'GET, POST, PATCH, PUT, DELETE');
        reply.header('access-control-allow-headers', 'authorization, content-type');
        reply.header('access-control-max-age', '600');
        return reply.status(204).send();
      }
    });
  }

  app.addHook('onSend', async (req, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('x-frame-options', 'DENY');
    reply.header('content-security-policy', CSP);
    if (req.url.startsWith('/v1/') && !reply.hasHeader('cache-control')) reply.header('cache-control', 'no-store');
  });

  app.setErrorHandler((error, req, reply) => {
    const known = describeError(error);
    if (!known) req.log.error(error);
    const { status, message } = known ?? { status: 500, message: 'Something went wrong on the server.' };
    reply.status(status).send({ error: message });
  });

  registerAuth(app, db, config);
  registerUpdates(app, db, config);
  registerSupport(app, db);
  registerAdmin(app, db);
  registerLive(app, db);

  app.get('/v1/health', async () => ({ ok: true }));

  // The staff website, when built (web/dist). Files are looked up on each
  // request, so a rebuild (new hashed names) needs no restart. Page paths get
  // the index page; a missing file (a path with an extension) is a plain 404.
  const hasWeb = existsSync(join(config.webDir, 'index.html'));
  if (hasWeb) {
    await app.register(fastifyStatic, {
      root: config.webDir, wildcard: true,
      // The page is always checked again; hashed assets never change once built.
      setHeaders: (reply, path) => { reply.header('cache-control', path.endsWith('.html') ? 'no-cache' : 'public, max-age=31536000, immutable'); },
    });
  }
  app.setNotFoundHandler((req, reply) => {
    const path = req.url.split('?')[0]!;
    if (hasWeb && req.method === 'GET' && !path.startsWith('/v1/') && !/\.[a-z0-9]+$/i.test(path)) {
      return reply.header('cache-control', 'no-cache').sendFile('index.html');
    }
    return reply.status(404).send({ error: 'Not found.' });
  });

  return app;
}
