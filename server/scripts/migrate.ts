// Apply pending migrations: npm run migrate
import { loadConfig, openDb } from '../src/config.ts';
import { migrate } from '../src/migrate.ts';

const db = await openDb(loadConfig());
await migrate(db, (line) => console.log(line));
await db.close();
console.log('Database is up to date.');
