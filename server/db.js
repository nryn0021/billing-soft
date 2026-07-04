// PostgreSQL connection pool + Drizzle instance.
//
// bigint(mode:'number') columns are converted to JS numbers by Drizzle itself
// (its mapFromDriverValue calls Number()), so no global pg type parser is needed.
import "dotenv/config";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { schema } from "./schema.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env and configure the Postgres connection string.",
  );
}

export const pool = new pg.Pool({
  connectionString,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  // Managed Postgres (RDS, Neon, etc.) usually needs TLS. Toggle with PGSSL=true.
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error.message);
});

export const db = drizzle(pool, { schema });

export async function closePool() {
  await pool.end();
}
