import { NextResponse } from "next/server";
import { Pool } from "pg";

// ponytail: single-connection pool just for liveness; phase 2 adds the app pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 3_000,
});

// An idle client dropped by the server emits 'error' on the pool; unhandled,
// it becomes an uncaughtException and kills the process.
pool.on("error", (err) => {
  console.error("health pool idle client error:", err.message);
});

export const dynamic = "force-dynamic";

type ResearchPersistenceSchema = {
  research_runs: boolean;
  provider_cache: boolean;
  source_calls_research_run_link: boolean;
};

const researchPersistenceQuery = `
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
`;

export async function GET() {
  const build = process.env.BUILD_SHA || "unknown";
  try {
    const [result, persistenceResult] = await Promise.all([
      pool.query<{
        trading_date: string;
        status: string;
        finished_at: Date | null;
      }>(
        `select trading_date::text, status, finished_at
         from screen_runs
         order by trading_date desc, started_at desc
         limit 1`,
      ),
      pool.query<ResearchPersistenceSchema>(researchPersistenceQuery),
    ]);
    const latest = result.rows[0] ?? null;
    const persistence = persistenceResult.rows[0];
    const researchPersistenceReady = Boolean(
      persistence?.research_runs &&
      persistence.provider_cache &&
      persistence.source_calls_research_run_link,
    );
    const screenStale = latest
      ? Date.now() - new Date(`${latest.trading_date}T23:59:59Z`).getTime() >
        3 * 86_400_000
      : true;
    return NextResponse.json({
      status:
        screenStale || latest?.status === "failed" || !researchPersistenceReady
          ? "degraded"
          : "ok",
      db: "reachable",
      build,
      researchPersistence: {
        ready: researchPersistenceReady,
        researchRuns: Boolean(persistence?.research_runs),
        providerCache: Boolean(persistence?.provider_cache),
        sourceCallsResearchRunLink: Boolean(
          persistence?.source_calls_research_run_link,
        ),
      },
      providers: {
        finnhub: Boolean(process.env.FINNHUB_API_KEY),
        groq: Boolean(process.env.GROQ_API_KEY),
        sec: Boolean(process.env.SEC_USER_AGENT),
        twelveData: Boolean(process.env.TWELVE_DATA_API_KEY),
        alphaVantage: Boolean(process.env.ALPHA_VANTAGE_API_KEY),
      },
      latestScreen: latest && {
        tradingDate: latest.trading_date,
        status: latest.status,
        finishedAt: latest.finished_at,
        stale: screenStale,
      },
    });
  } catch {
    return NextResponse.json(
      { status: "error", db: "unreachable", build },
      { status: 503 },
    );
  }
}
