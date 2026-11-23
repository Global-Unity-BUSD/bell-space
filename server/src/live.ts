import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';

import type { LiveHint } from '../../shared/api.ts';
import { hashToken, loadMe } from './auth.ts';
import type { Db } from './db.ts';

// Real-time hints over WebSocket (/v1/live). The database sends ids with
// NOTIFY; this forwards a hint to each connection whose account may see the
// row (checked in the database, as that account). Content is never sent here:
// clients fetch it through the API.
//
// The website signs in with its cookie. The app sends {"type":"auth","token":...}
// (or token null to receive only Updates hints) as its first message.

type Client = { socket: WebSocket; account: string | null; tokenHash: string | null; alive: boolean };

export function registerLive(app: FastifyInstance, db: Db) {
  const clients = new Set<Client>();
  let chain = Promise.resolve();

  const send = (c: Client, hint: LiveHint) => {
    if (c.socket.readyState === c.socket.OPEN) c.socket.send(JSON.stringify(hint));
  };

  /** Send `hint` to every signed-in connection whose account passes `check` (SQL returning one boolean). */
  const sendIfAllowed = async (hint: LiveHint, check: string, arg: string) => {
    const byAccount = new Map<string, Client[]>();
    for (const c of clients) if (c.account) byAccount.set(c.account, [...(byAccount.get(c.account) ?? []), c]);
    for (const [account, list] of byAccount) {
      const [row] = await db.as(account, (tx) => tx.query<{ ok: boolean }>(`select ${check}($1) as ok`, [arg]));
      if (row?.ok) for (const c of list) send(c, hint);
    }
  };

  const onPayload = (raw: string) => {
    let hint: LiveHint;
    try { hint = JSON.parse(raw) as LiveHint; } catch { return; }
    // One at a time, so hints keep their order.
    chain = chain.then(async () => {
      if (hint.t === 'updates') for (const c of clients) send(c, hint);
      else if (hint.t === 'request') await sendIfAllowed(hint, 'can_see_request', hint.id);
      else if (hint.t === 'message') await sendIfAllowed(hint, 'can_read_thread', hint.request);
    }).catch((error) => app.log.error(error, 'live hint failed'));
  };

  let stopListening: (() => Promise<void>) | null = null;
  app.addHook('onReady', async () => {
    stopListening = await db.listen('bell', onPayload, () => { for (const c of clients) send(c, { t: 'resync' }); });
  });

  // Drop dead connections, and connections whose session has ended (signed out, disabled).
  const timer = setInterval(() => {
    chain = chain.then(async () => {
      for (const c of clients) {
        if (!c.alive) { c.socket.terminate(); clients.delete(c); continue; }
        c.alive = false;
        c.socket.ping();
        if (c.tokenHash && !(await loadMe(db, c.tokenHash))) c.socket.close(4001, 'Signed out');
      }
    }).catch((error) => app.log.error(error, 'live check failed'));
  }, 30_000);
  timer.unref();

  app.addHook('onClose', async () => {
    clearInterval(timer);
    for (const c of clients) c.socket.terminate();
    await stopListening?.();
  });

  app.get('/v1/live', { websocket: true }, (socket, req) => {
    const client: Client = { socket, account: null, tokenHash: null, alive: true };
    socket.on('pong', () => { client.alive = true; });
    socket.on('close', () => { clients.delete(client); });
    const ready = () => {
      clients.add(client);
      send(client, { t: 'ready', signed_in: Boolean(client.account) });
    };
    if (req.me) {
      Object.assign(client, { account: req.me.id, tokenHash: req.tokenHash });
      ready();
      return;
    }
    const wait = setTimeout(() => socket.close(4000, 'Send auth first'), 10_000);
    socket.once('message', async (data) => {
      clearTimeout(wait);
      try {
        const msg = JSON.parse(String(data)) as { type?: string; token?: string | null };
        if (msg.type !== 'auth') { socket.close(4000, 'Send auth first'); return; }
        if (typeof msg.token === 'string' && msg.token.length <= 200) {
          const tokenHash = hashToken(msg.token);
          const me = await loadMe(db, tokenHash);
          if (!me) { socket.close(4001, 'Signed out'); return; }
          Object.assign(client, { account: me.id, tokenHash });
        }
        ready();
      } catch {
        socket.close(4000, 'Bad auth message');
      }
    });
  });
}
