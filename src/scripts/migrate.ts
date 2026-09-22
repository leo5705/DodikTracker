import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

async function runMigrations() {
  console.log('[DB Migrate] Starting database migrations...');
  
  const connectionString = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim();

  let pool: Pool;

  if (connectionString) {
    pool = new Pool({
      connectionString,
      max: 1,
      connectionTimeoutMillis: 15000,
    });
  } else {
    const host = process.env.SQL_HOST || process.env.PGHOST || 'localhost';
    const port = parseInt(process.env.SQL_PORT || process.env.PGPORT || '5432', 10);
    const user = process.env.SQL_ADMIN_USER || process.env.SQL_USER || process.env.PGUSER || 'postgres';
    const rawPassword = process.env.SQL_ADMIN_PASSWORD ?? process.env.SQL_PASSWORD ?? process.env.PGPASSWORD ?? '';
    const password = String(rawPassword);
    const database = process.env.SQL_DB_NAME || process.env.PGDATABASE || 'dodik_tracker';

    pool = new Pool({
      host,
      port,
      user,
      password,
      database,
      max: 1,
      connectionTimeoutMillis: 15000,
    });
  }

  const client = await pool.connect();

  try {
    // 1. Ensure migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      );
    `);

    // Detect if this is an existing database that was initialized via autoInit.ts
    const { rows: tableExists } = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);
    
    // If users exists, we assume initial migration is already done.
    if (tableExists[0].exists) {
      const { rows: countRows } = await client.query(`SELECT COUNT(*) FROM "__drizzle_migrations"`);
      if (parseInt(countRows[0].count, 10) === 0) {
        console.log('[DB Migrate] Detected existing legacy DB. Marking initial migration as applied...');
        await client.query(
          'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)',
          ['0000_overconfident_terrax', Date.now()]
        );
      }
    }

    // 2. Read journal
    const journalPath = path.resolve('drizzle/meta/_journal.json');
    if (!fs.existsSync(journalPath)) {
      console.log('[DB Migrate] No migrations found.');
      return;
    }

    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    if (!journal.entries || journal.entries.length === 0) {
      console.log('[DB Migrate] No migration entries found in journal.');
      return;
    }

    // 3. Get applied migrations
    const { rows: applied } = await client.query('SELECT hash FROM "__drizzle_migrations"');
    const appliedHashes = new Set(applied.map(row => row.hash));

    let count = 0;
    // 4. Apply pending migrations
    for (const entry of journal.entries) {
      const tag = entry.tag; // e.g. "0000_overconfident_terrax"
      if (appliedHashes.has(tag)) {
        continue;
      }

      console.log(`[DB Migrate] Applying migration: ${tag}...`);
      const sqlPath = path.resolve(`drizzle/${tag}.sql`);
      if (!fs.existsSync(sqlPath)) {
        throw new Error(`Migration file not found: ${sqlPath}`);
      }

      const sqlContent = fs.readFileSync(sqlPath, 'utf8');
      const statements = sqlContent
        .split('--> statement-breakpoint')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      await client.query('BEGIN');
      try {
        for (const stmt of statements) {
          if (stmt) {
             await client.query(stmt);
          }
        }
        await client.query(
          'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)',
          [tag, Date.now()]
        );
        await client.query('COMMIT');
        count++;
        console.log(`[DB Migrate] Successfully applied ${tag}.`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[DB Migrate] Failed to apply migration ${tag}:`, err);
        throw err;
      }
    }

    if (count === 0) {
      console.log('[DB Migrate] Database is up to date.');
    } else {
      console.log(`[DB Migrate] Applied ${count} migrations successfully.`);
    }

  } finally {
    client.release();
    pool.end();
  }
}

runMigrations().catch((err) => {
  console.error('[DB Migrate] Error running migrations:', err);
  process.exit(1);
});
