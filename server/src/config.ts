import { join } from 'node:path';

import { pgliteDb, postgresDb, type Db } from './db.ts';

export type Config = {
  production: boolean;
  host: string;
  port: number;
  /** PostgreSQL connection string; unset in development = embedded PGlite. */
  databaseUrl: string | null;
  /** Photos, and the development database. */
  dataDir: string;
  /** Built staff website (web/dist), served at `/` when present. */
  webDir: string;
  /** Behind BUSD's reverse proxy: trust X-Forwarded-For / -Proto. */
  trustProxy: boolean;
  cookieSecure: boolean;
  sessionDays: { app: number; web: number };
  /**
   * Other origins allowed to call the API with a bearer token (e.g. the app's
   * web build, http://localhost:8081). Cookies are never allowed cross-origin.
   */
  corsOrigins: string[];
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.BELL_ENV === 'production';
  const databaseUrl = env.DATABASE_URL?.trim() || null;
  if (production && !databaseUrl) throw new Error('DATABASE_URL is required when BELL_ENV=production.');
  const root = join(import.meta.dirname, '..');
  return {
    production,
    host: env.HOST ?? (production ? '0.0.0.0' : '127.0.0.1'),
    port: Number(env.PORT ?? 8787),
    databaseUrl,
    dataDir: env.DATA_DIR ?? join(root, 'data'),
    webDir: env.WEB_DIR ?? join(root, '..', 'web', 'dist'),
    trustProxy: env.TRUST_PROXY === 'true',
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : production,
    sessionDays: { app: Number(env.APP_SESSION_DAYS ?? 60), web: Number(env.WEB_SESSION_DAYS ?? 1) },
    corsOrigins: (env.CORS_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean),
  };
}

export function openDb(config: Config): Promise<Db> {
  return config.databaseUrl ? Promise.resolve(postgresDb(config.databaseUrl)) : pgliteDb(join(config.dataDir, 'dev-db'));
}
