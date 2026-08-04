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
  const build = process.env.BUILD_SHA ?? "unknown";
  try {
    await pool.query("select 1");
    return NextResponse.json({ status: "ok", db: "reachable", build });
  } catch {
    return NextResponse.json(
      { status: "error", db: "unreachable", build },
      { status: 503 },
    );
  }
}
