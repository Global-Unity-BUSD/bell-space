// Create or repair the test accounts, all with one shared password:
//   npm run seed:test
// Refused when BELL_ENV=production. Stop the development server first (the
// development database can only be open in one process).
import { staffTypeLabel } from '../../shared/api.ts';
import { hashPassword, MIN_PASSWORD } from '../src/auth.ts';
import { loadConfig, openDb } from '../src/config.ts';
import { migrate } from '../src/migrate.ts';
import { disableOldTestAccounts, TEST_ACCOUNTS, upsertAccount } from '../src/seed.ts';
import { newPassword } from './prompt.ts';

const config = loadConfig();
if (config.production) {
  console.error('Refusing to create test accounts when BELL_ENV=production.');
  process.exit(1);
}
const password = await newPassword(MIN_PASSWORD);
const db = await openDb(config);
await migrate(db);
const hash = await hashPassword(password);
for (const account of TEST_ACCOUNTS) {
  await upsertAccount(db, account, hash);
  const role = account.permissions ? `staff: ${staffTypeLabel(account.permissions)}` : account.guide ? 'student guide' : 'student';
  console.log(`  ${account.email.padEnd(32)} ${account.name.padEnd(18)} ${role}`);
}
const old = await disableOldTestAccounts(db);
if (old.length) console.log(`Disabled earlier test accounts: ${old.join(', ')}`);
await db.close();
console.log(`${TEST_ACCOUNTS.length} test accounts are ready.`);
