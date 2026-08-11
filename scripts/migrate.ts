// Explicit startup migration step (never implicit on first request).
// Run: pnpm db:migrate
import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local or export it before running pnpm db:migrate.",
    );
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      throw new Error("unsupported protocol");
    }
  } catch {
    throw new Error("DATABASE_URL must be a valid postgres:// or postgresql:// URL.");
  }
  return value;
}

async function main() {
  const pool = new Pool({
    connectionString: databaseUrl(),
    max: 1,
    connectionTimeoutMillis: 10_000,
  });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("migrations applied");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("migration failed:", err);
  process.exit(1);
});
