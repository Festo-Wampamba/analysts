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

export async function GET() {
  const build = process.env.BUILD_SHA || "unknown";
  try {
    const result = await pool.query<{
      trading_date: string;
      status: string;
      finished_at: Date | null;
    }>(
      `select trading_date::text, status, finished_at
       from screen_runs
       order by trading_date desc, started_at desc
       limit 1`,
    );
    const latest = result.rows[0] ?? null;
    const screenStale = latest
      ? Date.now() - new Date(`${latest.trading_date}T23:59:59Z`).getTime() >
        3 * 86_400_000
      : true;
    return NextResponse.json({
      status: screenStale || latest?.status === "failed" ? "degraded" : "ok",
      db: "reachable",
      build,
      providers: {
        finnhub: Boolean(process.env.FINNHUB_API_KEY),
        groq: Boolean(process.env.GROQ_API_KEY),
        sec: Boolean(process.env.SEC_USER_AGENT),
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
