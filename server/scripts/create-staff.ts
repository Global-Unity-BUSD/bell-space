// Create (or repair) a staff account who manages accounts, for the first sign-in
// to the staff website. Everyone else is then created on the website.
//   npm run create-staff -- --email you@school.org --name "Your Name" [--all]
// --all also grants Updates and Student support.
import { parseArgs } from 'node:util';

import { hashPassword, MIN_PASSWORD } from '../src/auth.ts';
import { loadConfig, openDb } from '../src/config.ts';
import { migrate } from '../src/migrate.ts';
import { upsertAccount } from '../src/seed.ts';
import { newPassword } from './prompt.ts';

const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' }, all: { type: 'boolean' } } });
if (!values.email || !values.name) {
  console.error('Usage: npm run create-staff -- --email you@school.org --name "Your Name" [--all]');
  process.exit(1);
}
const password = await newPassword(MIN_PASSWORD);
const db = await openDb(loadConfig());
await migrate(db);
await upsertAccount(db, {
  email: values.email, name: values.name, kind: 'staff',
  permissions: values.all ? ['manage_accounts', 'updates', 'support'] : ['manage_accounts'],
}, await hashPassword(password));
await db.close();
console.log(`${values.email} can now sign in to the staff website.`);
