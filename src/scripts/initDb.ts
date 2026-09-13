import { pool } from '../db/index.ts';
import { runAutoMigrations } from '../db/autoInit.ts';

async function main() {
  console.log('[DB Init] Connecting to database and running table migrations...');
  await runAutoMigrations(pool);
  console.log('[DB Init] Migration completed successfully.');
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('[DB Init] Error during database initialization:', err);
  process.exit(1);
});
