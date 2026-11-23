import { buildApp } from './app.ts';
import { loadConfig, openDb } from './config.ts';
import { migrate } from './migrate.ts';

const config = loadConfig();
const db = await openDb(config);
if (process.env.MIGRATE_ON_START !== 'false') await migrate(db, (line) => console.log(line));

const app = await buildApp(db, config, { logger: { level: config.production ? 'info' : 'warn' } });
await app.listen({ host: config.host, port: config.port });
console.log(`Bell Space server on http://${config.host}:${config.port} (${config.databaseUrl ? 'PostgreSQL' : 'development PGlite database'})`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close();
    await db.close();
    process.exit(0);
  });
}
