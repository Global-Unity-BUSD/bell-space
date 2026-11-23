import type { Db } from './db.ts';

// Owner-level account setup for scripts and tests. The website uses the
// checked functions instead (create_account, set_staff_permissions, ...).

export type SeedAccount = {
  email: string;
  name: string;
  kind: 'student' | 'staff';
  permissions?: ('updates' | 'support' | 'manage_accounts')[];
  guide?: { topics: string[]; languages: string[] };
  test?: boolean;
};

/** Create or repair an account; returns its id. `hash` replaces the password when given. */
export async function upsertAccount(db: Db, a: SeedAccount, hash?: string): Promise<string> {
  return db.owner(async (tx) => {
    const [row] = await tx.query<{ id: string }>(
      `insert into public.accounts (email, display_name, kind, test_account) values ($1, $2, $3, $4)
       on conflict (email) do update set display_name = excluded.display_name, kind = excluded.kind,
         test_account = excluded.test_account, disabled = false
       returning id`, [a.email.toLowerCase(), a.name, a.kind, a.test ?? false]);
    const id = row!.id;
    if (hash) {
      await tx.query(`insert into public.account_passwords (account_id, hash) values ($1, $2)
        on conflict (account_id) do update set hash = excluded.hash, updated_at = now()`, [id, hash]);
      await tx.query('delete from public.sessions where account_id = $1', [id]);
    }
    await tx.query('delete from public.staff_permissions where account_id = $1', [id]);
    for (const p of a.permissions ?? []) {
      await tx.query('insert into public.staff_permissions (account_id, permission) values ($1, $2)', [id, p]);
    }
    if (a.guide) {
      await tx.query(`insert into public.guide_profiles (account_id, topics, languages, active) values ($1, $2::text[]::public.request_topic[], $3::text[], true)
        on conflict (account_id) do update set topics = excluded.topics, languages = excluded.languages, active = true`,
      [id, a.guide.topics, a.guide.languages]);
    }
    return id;
  });
}

/**
 * The test accounts people sign in with (fictional). Emails use the reserved
 * `.test` domain. Staff match the website's two staff types.
 */
export const TEST_ACCOUNTS: SeedAccount[] = [
  { email: 'student1@bellspace.test', name: 'Sam', kind: 'student' },
  { email: 'student2@bellspace.test', name: 'Riley', kind: 'student' },
  { email: 'guide1@bellspace.test', name: 'Gina', kind: 'student',
    guide: { topics: ['navigation', 'new_student'], languages: ['en', 'es'] } },
  { email: 'guide2@bellspace.test', name: 'Omar', kind: 'student',
    guide: { topics: ['clubs', 'other'], languages: ['en', 'hy'] } },
  { email: 'staff-chats@bellspace.test', name: 'Sofia', kind: 'staff', permissions: ['support'] },
  { email: 'staff-admin@bellspace.test', name: 'Max', kind: 'staff', permissions: ['support', 'updates', 'manage_accounts'] },
].map((a) => ({ ...a, test: true }) as SeedAccount);

/** Disable earlier test accounts that are no longer in TEST_ACCOUNTS. */
export async function disableOldTestAccounts(db: Db) {
  const keep = TEST_ACCOUNTS.map((a) => a.email);
  return db.owner(async (tx) => {
    const gone = await tx.query<{ email: string }>(
      'update public.accounts set disabled = true where test_account and not disabled and email <> all($1::text[]) returning email', [keep]);
    await tx.query('delete from public.sessions s using public.accounts a where a.id = s.account_id and a.disabled');
    return gone.map((g) => g.email);
  });
}
