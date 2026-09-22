import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config();

const connectionString = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim();

let dbCredentials: any;

if (connectionString) {
  dbCredentials = {
    url: connectionString,
    ssl: false,
  };
} else {
  const sqlHost = process.env.SQL_HOST || process.env.PGHOST || 'localhost';
  const sqlPort = parseInt(process.env.SQL_PORT || process.env.PGPORT || '5432', 10);
  const sqlDbName = process.env.SQL_DB_NAME || process.env.PGDATABASE || 'dodik_tracker';
  const user = process.env.SQL_ADMIN_USER || process.env.SQL_USER || process.env.PGUSER || 'postgres';
  const password = process.env.SQL_ADMIN_PASSWORD ?? process.env.SQL_PASSWORD ?? process.env.PGPASSWORD ?? '';

  dbCredentials = {
    host: sqlHost,
    port: sqlPort,
    user: user,
    password: String(password),
    database: sqlDbName,
    ssl: false,
  };
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials,
  verbose: true,
});
