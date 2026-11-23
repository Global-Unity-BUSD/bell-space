// Creates or repairs the four pilot test accounts and gives them one shared
// password, then signs in as each (with the app's publishable key) to verify.
// Safe to re-run: existing accounts are updated, never duplicated.
//   npm run pilot:accounts
// The admin (secret) key comes from the logged-in Supabase CLI with
// `--from-cli` (npm run pilot:accounts -- --from-cli), from SUPABASE_SECRET_KEY,
// or a hidden prompt. The password is always typed at a hidden prompt. Neither
// is echoed, stored or printed. Reads the URL and publishable key from .env.local.
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

import { ACCOUNTS, findUser } from './accounts.mjs';
import { hidden, readEnv } from './prompt.mjs';

const env = readEnv(new URL('../../.env.local', import.meta.url));
const url = (env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
const publishable = env.EXPO_PUBLIC_SUPABASE_KEY ?? '';
if (!url || !publishable) { console.error('.env.local needs EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY.'); process.exit(1); }
console.log(`Project: ${new URL(url).host}`);

/** The project's secret key from the logged-in Supabase CLI (`npx supabase login`), never printed. */
function secretFromCli() {
  const ref = new URL(url).host.split('.')[0];
  const r = spawnSync('npx', ['--yes', 'supabase@latest', 'projects', 'api-keys', '--project-ref', ref, '--reveal', '-o', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  try { return JSON.parse(r.stdout).find((k) => k.type === 'secret')?.api_key ?? ''; } catch { return ''; }
}
const fromCli = process.argv.includes('--from-cli');
const secret = (fromCli ? secretFromCli() : process.env.SUPABASE_SECRET_KEY || await hidden('Secret key (sb_secret_…), hidden: ')).trim();
if (fromCli) console.log(secret ? 'Got the admin key from the Supabase CLI.' : 'The Supabase CLI gave no key: run npx supabase login first.');
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
{
  const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) {
    console.error(`Supabase rejected the secret key (${error.message}; ${secret.length} characters). Nothing was changed.`);
    process.exit(1);
  }
}

console.log('Choose the shared test password for all four accounts. Letters and numbers, 10 or more; you will type it on the phones.');
const password = await hidden('Test password (nothing shows as you type): ');
if (password.length < 10) { console.error('Use at least 10 characters. Nothing was changed.'); process.exit(1); }
if (password !== password.trim()) { console.error('It starts or ends with a space. Nothing was changed.'); process.exit(1); }
if ((await hidden('Type it again: ')) !== password) { console.error('The two did not match. Nothing was changed.'); process.exit(1); }

let failed = 0;
for (const a of ACCOUNTS) {
  let user = await findUser(admin, a.email);
  const meta = { first_name: a.first_name };
  if (user) {
    const { error } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true, user_metadata: meta });
    if (error) { console.log(`FAIL      update ${a.email}: ${error.message}`); failed++; continue; }
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email: a.email, password, email_confirm: true, user_metadata: meta });
    if (error) { console.log(`FAIL      create ${a.email}: ${error.message}`); failed++; continue; }
    user = data.user;
  }
  const profile = await admin.from('profiles').upsert({ id: user.id, first_name: a.first_name, role: a.role });
  if (profile.error) { console.log(`FAIL      profile ${a.email}: ${profile.error.message}`); failed++; continue; }
  if (a.guide) {
    const g = await admin.from('guide_settings').upsert({ guide_id: user.id, ...a.guide });
    if (g.error) { console.log(`FAIL      guide settings ${a.email}: ${g.error.message}`); failed++; continue; }
  }
}

// Verify the way the app signs in: publishable key, then read your own profile.
for (const a of ACCOUNTS) {
  const app = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await app.auth.signInWithPassword({ email: a.email, password });
  if (error) { console.log(`FAIL      sign in ${a.email}: ${error.message}`); failed++; continue; }
  const { data: profile } = await app.from('profiles').select('first_name, role').eq('id', data.user.id).maybeSingle();
  const ok = profile?.role === a.role;
  console.log(`${ok ? 'SIGNED IN' : 'WRONG ROLE'} ${a.email} as ${profile?.first_name ?? '?'} (${profile?.role ?? 'no profile'})`);
  if (!ok) failed++;
  await app.auth.signOut();
}
console.log(failed ? `${failed} problem(s) above.` : 'All four test accounts are ready and sign in with that password.');
process.exit(failed ? 1 : 0);
