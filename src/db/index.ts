import dotenv from 'dotenv';
dotenv.config();

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, PoolConfig } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    // Ensure .env is loaded
    dotenv.config();

    const connectionString = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim();

    let poolConfig: PoolConfig;

    if (connectionString) {
      poolConfig = {
        connectionString,
        max: 10,
        connectionTimeoutMillis: 15000,
        idleTimeoutMillis: 30000,
      };
    } else {
      const host = process.env.SQL_HOST || process.env.PGHOST || 'localhost';
      const port = parseInt(process.env.SQL_PORT || process.env.PGPORT || '5432', 10);
      const user = process.env.SQL_USER || process.env.PGUSER || 'postgres';
      const rawPassword = process.env.SQL_PASSWORD ?? process.env.PGPASSWORD ?? '';
      const password = String(rawPassword);
      const database = process.env.SQL_DB_NAME || process.env.PGDATABASE || 'dodik_tracker';

      poolConfig = {
        host,
        port,
        user,
        password,
        database,
        max: 10,
        connectionTimeoutMillis: 15000,
        idleTimeoutMillis: 30000,
      };
    }

    global._postgresPool = new Pool(poolConfig);

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

export const pool = createPool();
export const db = drizzle(pool, { schema });
