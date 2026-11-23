import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Db } from './db.ts';

const DIR = join(import.meta.dirname, '..', 'migrations');

/** Apply every migration in server/migrations/ not applied yet, in name order. */
export async function migrate(db: Db, log: (line: string) => void = () => {}) {
  const files = readdirSync(DIR).filter((f) => /^\d+_[a-z0-9_]+\.sql$/.test(f)).sort();
  await db.owner((tx) => tx.exec(
    'create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())'));
  const done = new Set((await db.owner((tx) => tx.query<{ name: string }>('select name from public.schema_migrations')))
    .map((r) => r.name));
  for (const file of files) {
    if (done.has(file)) continue;
    await db.owner(async (tx) => {
      await tx.exec(readFileSync(join(DIR, file), 'utf8'));
      await tx.query('insert into public.schema_migrations (name) values ($1)', [file]);
    });
    log(`Applied ${file}`);
  }
}
