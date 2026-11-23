import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type BinaryLike, type ScryptOptions } from 'node:crypto';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { Me, StaffPermission } from '../../shared/api.ts';
import type { Config } from './config.ts';
import type { Db } from './db.ts';
import { HttpError } from './errors.ts';

declare module 'fastify' {
  interface FastifyRequest {
    me: Me | null;
    /** Signed in with the website cookie (not a bearer token). */
    viaCookie: boolean;
    tokenHash: string | null;
  }
}

export const COOKIE = 'bell_session';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// ---------------------------------------------------------------- passwords (scrypt, Node built-in)

const N = 16384, R = 8, P = 1, KEYLEN = 64;
const scrypt = (password: BinaryLike, salt: BinaryLike, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(password, salt, KEYLEN, options, (e, key) => (e ? reject(e) : resolve(key))));

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, key] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await scrypt(password.normalize('NFKC'), Buffer.from(salt, 'base64'), { N: Number(n), r: Number(r), p: Number(p) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Compared against when the email is unknown, so both cases take as long.
const DUMMY_HASH = hashPassword(randomBytes(12).toString('hex'));

export const MIN_PASSWORD = 8;
export function checkPassword(password: unknown): string {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > 200) {
    throw new HttpError(400, `Passwords need at least ${MIN_PASSWORD} characters.`);
  }
  return password;
}

// ---------------------------------------------------------------- sessions

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function loadMe(db: Db, tokenHash: string): Promise<Me | null> {
  const [account] = await db.as(null, (tx) =>
    tx.query<Pick<Me, 'id' | 'email' | 'display_name' | 'kind'>>('select * from session_resolve($1)', [tokenHash]));
  if (!account) return null;
  return db.as(account.id, async (tx) => {
    const perms = await tx.query<{ permission: StaffPermission }>(
      'select permission::text as permission from staff_permissions where account_id = $1 order by 1', [account.id]);
    const [guide] = await tx.query<Me['guide'] & object>(
      'select topics::text[] as topics, languages, active from guide_profiles where account_id = $1', [account.id]);
    return { ...account, permissions: perms.map((p) => p.permission), guide: guide ?? null };
  });
}

/** Too many failed sign-ins for one email from one address: wait 15 minutes. */
class SignInLimiter {
  private failures = new Map<string, { count: number; until: number }>();
  blocked(key: string) {
    const f = this.failures.get(key);
    if (f && f.until < Date.now()) this.failures.delete(key);
    return (this.failures.get(key)?.count ?? 0) >= 10;
  }
  fail(key: string) {
    const f = this.failures.get(key) ?? { count: 0, until: 0 };
    this.failures.set(key, { count: f.count + 1, until: Date.now() + 15 * 60_000 });
    if (this.failures.size > 10_000) this.failures.clear();
  }
  clear(key: string) { this.failures.delete(key); }
}

// ---------------------------------------------------------------- request guards

export function need(req: FastifyRequest): Me {
  if (!req.me) throw new HttpError(401, 'Sign in first.');
  return req.me;
}

export function needPermission(req: FastifyRequest, p: StaffPermission): Me {
  const me = need(req);
  if (!me.permissions.includes(p)) throw new HttpError(403, 'Your account does not have access to this.');
  return me;
}

// ---------------------------------------------------------------- plugin

export function registerAuth(app: FastifyInstance, db: Db, config: Config) {
  const limiter = new SignInLimiter();
  app.decorateRequest('me', null);
  app.decorateRequest('viaCookie', false);
  app.decorateRequest('tokenHash', null);

  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/v1/')) return;
    const header = req.headers.authorization;
    let token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token && req.cookies[COOKIE]) {
      token = req.cookies[COOKIE]!;
      req.viaCookie = true;
      // Cross-site forms cannot set this header without a CORS preflight, which this server never allows.
      if (!SAFE_METHODS.has(req.method) && req.headers['x-bell-client'] !== 'web') {
        throw new HttpError(403, 'Missing X-Bell-Client header.');
      }
    }
    if (!token || token.length > 200) return;
    req.tokenHash = hashToken(token);
    req.me = await loadMe(db, req.tokenHash);
  });

  app.post('/v1/auth/sign-in', {
    schema: {
      body: {
        type: 'object', required: ['email', 'password', 'client'], additionalProperties: false,
        properties: {
          email: { type: 'string', maxLength: 200 },
          password: { type: 'string', maxLength: 200 },
          client: { enum: ['app', 'web'] },
        },
      },
    },
  }, async (req, reply: FastifyReply) => {
    const { email, password, client } = req.body as { email: string; password: string; client: 'app' | 'web' };
    const key = `${req.ip}|${email.trim().toLowerCase()}`;
    if (limiter.blocked(key)) throw new HttpError(429, 'Too many tries. Wait 15 minutes, then try again.');
    const [row] = await db.as(null, (tx) =>
      tx.query<{ account_id: string; hash: string; disabled: boolean }>('select * from auth_lookup($1)', [email]));
    const ok = await verifyPassword(password, row?.hash ?? await DUMMY_HASH);
    if (!row || !ok || row.disabled) {
      limiter.fail(key);
      throw new HttpError(401, 'That email or password is not right.');
    }
    limiter.clear(key);
    const token = randomBytes(32).toString('base64url');
    const days = config.sessionDays[client];
    const [{ expires } = { expires: null }] = await db.as(null, (tx) =>
      tx.query<{ expires: Date }>('select session_create($1, $2, $3, $4) as expires', [row.account_id, hashToken(token), client, days]));
    const me = await loadMe(db, hashToken(token));
    if (client === 'web') {
      reply.setCookie(COOKIE, token, {
        path: '/', httpOnly: true, sameSite: 'strict', secure: config.cookieSecure, expires: expires ?? undefined,
      });
      return { me };
    }
    return { me, token, expires_at: expires };
  });

  app.post('/v1/auth/sign-out', async (req, reply) => {
    if (req.tokenHash) await db.as(null, (tx) => tx.query('select session_delete($1)', [req.tokenHash]));
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/v1/me', async (req) => ({ me: need(req) }));
}
