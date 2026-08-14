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

type ResearchPersistenceSchema = {
  research_runs: boolean;
  provider_cache: boolean;
  source_calls_research_run_link: boolean;
};

async function assertResearchPersistenceSchema(pool: Pool): Promise<void> {
  const result = await pool.query<ResearchPersistenceSchema>(`
    select
      to_regclass('public.research_runs') is not null as research_runs,
      to_regclass('public.provider_cache') is not null as provider_cache,
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'source_calls'
          and column_name = 'research_run_id'
      ) as source_calls_research_run_link
  `);
  const schema = result.rows[0];
  if (
    !schema?.research_runs ||
    !schema.provider_cache ||
    !schema.source_calls_research_run_link
  ) {
    throw new Error(
      "Research persistence schema is incomplete. Verify DATABASE_URL points to the deployed database, then rerun pnpm db:migrate.",
    );
  }
}

async function main() {
  const pool = new Pool({
    connectionString: databaseUrl(),
    max: 1,
    // Neon may need longer than the application request budget to resume a
    // suspended compute. Migrations are an operator task, so prefer a
    // reliable one-time connection over an avoidable cold-start timeout.
    connectionTimeoutMillis: 30_000,
  });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await assertResearchPersistenceSchema(pool);
    console.log("migrations applied and research persistence schema verified");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("migration failed:", err);
  process.exit(1);
});
