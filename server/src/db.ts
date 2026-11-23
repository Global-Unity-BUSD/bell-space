import { mkdirSync } from 'node:fs';

import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

// One small interface over PostgreSQL (production) and PGlite (development and
// tests), so the same SQL and the same access rules run in both.

export type Row = Record<string, unknown>;

export interface Tx {
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Several statements, no parameters (migrations). */
  exec(sql: string): Promise<void>;
}

export interface Db {
  /**
   * Run `fn` in one transaction as the `app_user` role, signed in as `account`
   * (null when signed out). Row-level security applies to everything inside.
   */
  as<T>(account: string | null, fn: (tx: Tx) => Promise<T>): Promise<T>;
  /** Run as the connecting (owner) role, for migrations and admin scripts only. */
  owner<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  /** Subscribe to NOTIFY on `channel`. `onReconnect` runs after a dropped listener reconnects. */
  listen(channel: string, onPayload: (payload: string) => void, onReconnect?: () => void): Promise<() => Promise<void>>;
  close(): Promise<void>;
}

async function signIn(tx: Tx, account: string | null) {
  await tx.exec('set local role app_user');
  await tx.query("select set_config('app.account_id', $1, true)", [account ?? '']);
}

// ---------------------------------------------------------------- PostgreSQL

export function postgresDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString, max: 10 });
  const wrap = (client: pg.PoolClient): Tx => ({
    query: async <T>(sql: string, params?: unknown[]) => (await client.query(sql, params)).rows as T[],
    exec: async (sql) => { await client.query(sql); },
  });
  const run = async <T>(fn: (tx: Tx) => Promise<T>, account?: string | null) => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      const tx = wrap(client);
      if (account !== undefined) await signIn(tx, account);
      const result = await fn(tx);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };
  return {
    as: (account, fn) => run(fn, account),
    owner: (fn) => run(fn),
    async listen(channel, onPayload, onReconnect) {
      if (!/^[a-z_]+$/.test(channel)) throw new Error('Bad channel name');
      let client: pg.Client | null = null;
      let stopped = false;
      const connect = async (isRetry: boolean) => {
        if (stopped) return;
        const c = new pg.Client({ connectionString });
        c.on('notification', (n) => { if (n.channel === channel && n.payload) onPayload(n.payload); });
        c.on('error', () => {
          // Reconnect, then tell the caller that hints may have been missed.
          c.end().catch(() => {});
          if (!stopped) setTimeout(() => { connect(true).catch(() => {}); }, 2000);
        });
        try {
          await c.connect();
          await c.query(`listen ${channel}`);
          client = c;
          if (isRetry) onReconnect?.();
        } catch {
          c.end().catch(() => {});
          if (!stopped) setTimeout(() => { connect(true).catch(() => {}); }, 2000);
        }
      };
      await connect(false);
      return async () => { stopped = true; await client?.end().catch(() => {}); };
    },
    close: () => pool.end(),
  };
}

// ---------------------------------------------------------------- PGlite

/** `dataDir` null = in memory (tests). */
export async function pgliteDb(dataDir: string | null): Promise<Db> {
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const db = dataDir ? await PGlite.create(dataDir) : await PGlite.create();
  const run = <T>(fn: (tx: Tx) => Promise<T>, account?: string | null) =>
    db.transaction(async (t) => {
      const tx: Tx = {
        query: async <R>(sql: string, params?: unknown[]) => (await t.query(sql, params)).rows as R[],
        exec: async (sql) => { await t.exec(sql); },
      };
      if (account !== undefined) await signIn(tx, account);
      return fn(tx);
    });
  return {
    as: (account, fn) => run(fn, account),
    owner: (fn) => run(fn),
    async listen(channel, onPayload) {
      const stop = await db.listen(channel, onPayload);
      return async () => { await stop(); };
    },
    close: () => db.close(),
  };
}
