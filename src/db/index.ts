import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

    if (connectionString) {
      global._postgresPool = new Pool({
        connectionString,
        max: 10,
        connectionTimeoutMillis: 15000,
      });
    } else {
      global._postgresPool = new Pool({
        host: process.env.SQL_HOST || process.env.PGHOST || 'localhost',
        port: parseInt(process.env.SQL_PORT || process.env.PGPORT || '5432', 10),
        user: process.env.SQL_USER || process.env.PGUSER || 'postgres',
        password: process.env.SQL_PASSWORD || process.env.PGPASSWORD || '',
        database: process.env.SQL_DB_NAME || process.env.PGDATABASE || 'dodik_tracker',
        max: 10,
        connectionTimeoutMillis: 15000,
      });
    }

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

export const pool = createPool();
export const db = drizzle(pool, { schema });

