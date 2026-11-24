import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { pgliteDb, type Db } from '../src/db.ts';
import { migrate } from '../src/migrate.ts';
import { upsertAccount, type SeedAccount } from '../src/seed.ts';

/** A temporary folder that is deleted when this test file's process exits. */
export function tempDir(prefix = 'bell-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  process.once('exit', () => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

export type Who = 'sam' | 'riley' | 'gina' | 'omar' | 'uma' | 'sofia' | 'max';
const KEYS: Who[] = ['sam', 'riley', 'gina', 'omar', 'uma', 'sofia', 'max'];

// Fixed fixtures for the tests: one staff account per permission, so each
// permission is checked on its own (the seeded test accounts combine them).
const FIXTURES: SeedAccount[] = [
  { email: 'student1@bellspace.test', name: 'Sam', kind: 'student' },
  { email: 'student2@bellspace.test', name: 'Riley', kind: 'student' },
  { email: 'guide1@bellspace.test', name: 'Gina', kind: 'student', guide: { topics: ['navigation', 'new_student'], languages: ['en', 'es'] } },
  { email: 'guide2@bellspace.test', name: 'Omar', kind: 'student', guide: { topics: ['clubs', 'other'], languages: ['en', 'hy'] } },
  { email: 'staff-updates@bellspace.test', name: 'Uma (Updates)', kind: 'staff', permissions: ['updates'] },
  { email: 'staff-support@bellspace.test', name: 'Sofia (Support)', kind: 'staff', permissions: ['support'] },
  { email: 'staff-admin@bellspace.test', name: 'Max (Accounts)', kind: 'staff', permissions: ['manage_accounts'] },
];

/** A fresh in-memory database with the migration and the test accounts. */
export async function testDb(hash?: string) {
  const db = await pgliteDb(null);
  await migrate(db);
  const ids = {} as Record<Who, string>;
  for (const [i, a] of FIXTURES.entries()) ids[KEYS[i]!] = await upsertAccount(db, a, hash);
  return { db, ids, ...bind(db, ids) };
}

function bind(db: Db, ids: Record<Who, string>) {
  const rows = <T = Record<string, unknown>>(who: Who | null, sql: string, params: unknown[] = []) =>
    db.as(who ? ids[who] : null, (tx) => tx.query<T>(sql, params));
  const one = async <T = Record<string, unknown>>(who: Who | null, sql: string, params: unknown[] = []) =>
    (await rows<T>(who, sql, params))[0] as T;
  return { rows, one };
}
