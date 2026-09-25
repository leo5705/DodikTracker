import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { pool } from '../db/index.ts';

async function dumpDatabase() {
  const targetFile = process.argv[2];
  if (!targetFile) {
    console.error('[DumpDB] Error: Target file argument required.');
    process.exit(1);
  }

  const client = await pool.connect();

  try {
    const timestamp = new Date().toISOString();
    const dbName = process.env.SQL_DB_NAME || 'dodik_tracker';

    let dumpContent = `--
-- PostgreSQL database dump
-- Dumped by Dodik Tracker Unified Backup Engine
-- Dumped at: ${timestamp}
-- Database: ${dbName}
--

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

BEGIN;

`;

    // 1. Get list of all public tables in dependency-friendly order
    const { rows: tables } = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    console.log(`[DumpDB] Found ${tables.length} tables to dump.`);

    // 2. Dump table data
    for (const { table_name } of tables) {
      // Skip internal temporary or migration lock tables if any
      const { rows } = await client.query(`SELECT * FROM "${table_name}"`);
      
      dumpContent += `\n--\n-- Data for Name: ${table_name}; Type: TABLE DATA; Rows: ${rows.length}\n--\n\n`;

      if (rows.length > 0) {
        const columns = Object.keys(rows[0]);
        const quotedCols = columns.map(c => `"${c}"`).join(', ');

        for (const row of rows) {
          const values = columns.map(col => {
            const val = row[col];
            if (val === null || val === undefined) {
              return 'NULL';
            }
            if (typeof val === 'boolean') {
              return val ? 'true' : 'false';
            }
            if (typeof val === 'number') {
              return String(val);
            }
            if (val instanceof Date) {
              return `'${val.toISOString()}'`;
            }
            if (typeof val === 'object') {
              const jsonStr = JSON.stringify(val).replace(/'/g, "''");
              return `'${jsonStr}'`;
            }
            // String value: escape single quotes and backslashes
            const escaped = String(val).replace(/'/g, "''");
            return `'${escaped}'`;
          });

          dumpContent += `INSERT INTO public."${table_name}" (${quotedCols}) VALUES (${values.join(', ')}) ON CONFLICT DO NOTHING;\n`;
        }
      }

      // Update sequences if table has serial / identity column
      const { rows: seqs } = await client.query(`
        SELECT pg_get_serial_sequence('public."${table_name}"', column_name) as seq_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_default LIKE 'nextval%'
      `, [table_name]);

      for (const { seq_name } of seqs) {
        if (seq_name) {
          dumpContent += `SELECT setval('${seq_name}', COALESCE((SELECT MAX(id) FROM public."${table_name}"), 1), true);\n`;
        }
      }
    }

    dumpContent += `\nCOMMIT;\n\n-- Dump completed at: ${new Date().toISOString()}\n`;

    const dir = path.dirname(targetFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(targetFile, dumpContent, 'utf8');
    const stat = fs.statSync(targetFile);
    console.log(`[DumpDB] Database dump successfully written to ${targetFile} (${stat.size} bytes).`);
  } catch (err: any) {
    console.error('[DumpDB] Error dumping database:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
}

dumpDatabase();
