// Real-time hints over a real WebSocket: who receives which hint.
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import type { LiveHint } from '../../shared/api.ts';
import { buildApp } from '../src/app.ts';
import { hashPassword } from '../src/auth.ts';
import { loadConfig } from '../src/config.ts';
import { tempDir, testDb, type Who } from './helpers.ts';

const PASSWORD = 'test-password-1';
const EMAIL: Partial<Record<Who, string>> = {
  sam: 'student1@bellspace.test', riley: 'student2@bellspace.test', gina: 'guide1@bellspace.test',
  sofia: 'staff-support@bellspace.test',
};

test('hints reach only accounts allowed to see the row; Updates hints reach everyone', async (ctx) => {
  const t = await testDb(await hashPassword(PASSWORD));
  const config = { ...loadConfig({}), dataDir: tempDir(), webDir: join(tmpdir(), 'no-web') };
  const app = await buildApp(t.db, config);
  await app.listen({ host: '127.0.0.1', port: 0 });
  ctx.after(() => app.close());
  const address = app.server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;

  const token = async (who: Who) => {
    const res = await fetch(`${base}/v1/auth/sign-in`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EMAIL[who], password: PASSWORD, client: 'app' }),
    });
    return ((await res.json()) as { token: string }).token;
  };
  const tokens = { sam: await token('sam'), riley: await token('riley'), gina: await token('gina'), sofia: await token('sofia') };

  /** Connect, authenticate, and collect hints. */
  const connect = (tok: string | null) => new Promise<{ hints: LiveHint[]; close: () => void }>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${address.port}/v1/live`);
    const hints: LiveHint[] = [];
    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: tok }));
    ws.onerror = () => reject(new Error('socket error'));
    ws.onmessage = (e) => {
      const hint = JSON.parse(String(e.data)) as LiveHint;
      if (hint.t === 'ready') resolve({ hints, close: () => ws.close() });
      else hints.push(hint);
    };
  });
  const sockets = {
    sam: await connect(tokens.sam), riley: await connect(tokens.riley), gina: await connect(tokens.gina),
    sofia: await connect(tokens.sofia), anon: await connect(null),
  };
  ctx.after(() => { for (const s of Object.values(sockets)) s.close(); });

  const call = async (who: keyof typeof tokens, path: string, body: object) => {
    const res = await fetch(`${base}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tokens[who]}` }, body: JSON.stringify(body),
    });
    return (await res.json()) as { request: { id: string } };
  };
  const settle = () => new Promise((r) => setTimeout(r, 300));

  const { request } = await call('sam', '/v1/support/requests', { topic: 'navigation', question: 'Where is 1155?' });
  await settle();
  const kinds = (who: keyof typeof sockets) => sockets[who].hints.map((h) => h.t);
  assert.deepEqual(kinds('sam'), ['request']);
  assert.deepEqual(kinds('sofia'), ['request']);
  assert.deepEqual(kinds('gina'), [], 'not assigned yet');
  assert.deepEqual(kinds('riley'), []);
  assert.deepEqual(kinds('anon'), []);

  await call('sofia', `/v1/support/requests/${request.id}/assign`, { guide_id: t.ids.gina });
  await call('gina', `/v1/support/requests/${request.id}/messages`, { body: 'Hi Sam' });
  await settle();
  assert.deepEqual(kinds('gina'), ['request', 'message']);
  assert.deepEqual(kinds('sam'), ['request', 'request', 'message']);
  assert.deepEqual(kinds('riley'), []);
  const message = sockets.sam.hints.at(-1) as Extract<LiveHint, { t: 'message' }>;
  assert.equal(message.request, request.id);
  assert.equal(JSON.stringify(message).includes('Hi Sam'), false, 'message text never goes over the socket');

  await t.db.owner((tx) => tx.query(`insert into updates (title, status) values ('Rally', 'published')`));
  await settle();
  assert.equal(kinds('anon').at(-1), 'updates');
  assert.equal(kinds('riley').at(-1), 'updates');
});
