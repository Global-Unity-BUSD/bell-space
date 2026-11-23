// Checks that the pilot test accounts can sign in with a password typed at a
// hidden prompt, using the app's publishable key from .env.local. Changes
// nothing; prints only whether each sign-in worked.
//   npm run pilot:check-signin
import { createClient } from '@supabase/supabase-js';

import { ACCOUNTS } from './accounts.mjs';
import { hidden, readEnv } from './prompt.mjs';

const env = readEnv(new URL('../../.env.local', import.meta.url));
const url = (env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
const key = env.EXPO_PUBLIC_SUPABASE_KEY ?? '';
if (!url || !key) { console.error('.env.local needs EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY.'); process.exit(1); }
console.log(`Project: ${new URL(url).host}`);

const password = await hidden('Test password, hidden: ');
console.log(`(${password.length} characters typed)`);
let failed = 0;
for (const a of ACCOUNTS) {
  const app = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await app.auth.signInWithPassword({ email: a.email, password });
  if (error) { console.log(`FAIL      ${a.email}: ${error.message}`); failed++; continue; }
  const { data: profile } = await app.from('profiles').select('first_name, role').eq('id', data.user.id).maybeSingle();
  const ok = profile?.role === a.role;
  console.log(`${ok ? 'SIGNED IN' : 'WRONG ROLE'} ${a.email} as ${profile?.first_name ?? '?'} (${profile?.role ?? 'no profile'})`);
  if (!ok) failed++;
  await app.auth.signOut();
}
console.log(failed ? `${failed} account(s) failed.` : 'All four test accounts sign in.');
process.exit(failed ? 1 : 0);
