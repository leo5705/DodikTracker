import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, PoolConfig } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export function findCloudSqlSocket(): string | null {
  const candidates = ['/app/cloudsql', '/cloudsql'];
  for (const base of candidates) {
    try {
      if (fs.existsSync(base)) {
        const entries = fs.readdirSync(base);
        for (const entry of entries) {
          const fullPath = path.join(base, entry);
          if (fs.statSync(fullPath).isDirectory()) {
            if (fs.existsSync(path.join(fullPath, '.s.PGSQL.5432'))) {
              return fullPath;
            }
          }
        }
      }
    } catch {
      // ignore filesystem inspection errors
    }
  }
  return null;
}

export const createPool = () => {
  if (!global._postgresPool) {
    // Ensure .env is loaded
    dotenv.config();

    const connectionString = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim();
    const socketPath = findCloudSqlSocket();
    const explicitHost = process.env.SQL_HOST;
    const resolvedHost = (socketPath && (!explicitHost || explicitHost === 'localhost' || explicitHost.startsWith('/')))
      ? socketPath
      : explicitHost;

    let poolConfig: PoolConfig;

    if (socketPath) {
      // Prioritize Cloud SQL via Unix Domain Socket in sandbox/applet environments
      const user = process.env.SQL_ADMIN_USER || process.env.SQL_USER || 'dodik_user';
      const password = process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD || 'Dodik_Password_2026!';
      const database = process.env.SQL_DB_NAME || 'cloud_sql_development_database';

      poolConfig = {
        host: socketPath,
        user,
        password,
        database,
        max: 10,
        connectionTimeoutMillis: 15000,
        idleTimeoutMillis: 30000,
      };
    } else if (connectionString) {
      poolConfig = {
        connectionString,
        max: 10,
        connectionTimeoutMillis: 15000,
        idleTimeoutMillis: 30000,
      };
    } else if (resolvedHost && (process.env.SQL_USER || socketPath)) {
      // Cloud SQL instance (Unix Domain Socket or proxy host)
      const user = process.env.SQL_USER || 'dodik_user';
      const password = process.env.SQL_PASSWORD || 'Dodik_Password_2026!';
      const database = process.env.SQL_DB_NAME || 'cloud_sql_development_database';

      poolConfig = {
        host: resolvedHost,
        user,
        password,
        database,
        max: 10,
        connectionTimeoutMillis: 15000,
        idleTimeoutMillis: 30000,
      };

      if (!resolvedHost.startsWith('/')) {
        poolConfig.port = parseInt(process.env.SQL_PORT || '5432', 10);
      }
    } else {
      const host = process.env.PGHOST || 'localhost';
      const port = parseInt(process.env.SQL_PORT || process.env.PGPORT || '5432', 10);
      const user = process.env.PGUSER || 'postgres';
      const rawPassword = process.env.PGPASSWORD ?? '';
      const password = String(rawPassword);
      const database = process.env.PGDATABASE || 'dodik_tracker';

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
