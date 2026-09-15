import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { pool } from '../db/index.ts';

async function checkStatus() {
  console.log('--- Database Migration Status ---');
  const client = await pool.connect();
  try {
    let appliedHashes = new Set<string>();
    const { rows: tableExists } = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = '__drizzle_migrations'
      );
    `);
    
    if (tableExists[0].exists) {
      const { rows } = await client.query('SELECT hash FROM "__drizzle_migrations"');
      appliedHashes = new Set(rows.map(row => row.hash));
    } else {
      console.log('No migration table found in database.');
    }

    const journalPath = path.resolve('drizzle/meta/_journal.json');
    if (!fs.existsSync(journalPath)) {
      console.log('No local migrations found (drizzle/meta/_journal.json missing).');
      return;
    }

    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    let pendingCount = 0;
    
    console.log('\nMigrations:');
    for (const entry of journal.entries) {
      const isApplied = appliedHashes.has(entry.tag);
      if (!isApplied) pendingCount++;
      console.log(`[${isApplied ? 'APPLIED' : 'PENDING'}] ${entry.tag}`);
    }

    console.log(`\nSummary: ${appliedHashes.size} applied, ${pendingCount} pending.`);

  } finally {
    client.release();
    pool.end();
  }
}

checkStatus().catch(err => {
  console.error('Error checking status:', err);
  process.exit(1);
});
