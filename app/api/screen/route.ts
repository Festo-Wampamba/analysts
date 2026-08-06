import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import {
  claimScreenRun,
  getScreenStatus,
  runScreenInBackground,
} from "@/lib/screen/run";
import { currentTradingDate } from "@/lib/screen/trading-date";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const provided = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// POST claims the trading date and starts the screen, then returns
// immediately — the run itself takes ~3 minutes (hundreds of provider
// calls), longer than the Cloudflare proxy will hold a connection open.
// Callers poll GET for completion.
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { runId, tradingDate, claimed } = await claimScreenRun();

  if (!claimed) {
    const status = await getScreenStatus(tradingDate);
    return NextResponse.json(status, { status: 200 });
  }

  runScreenInBackground(runId, tradingDate);
  return NextResponse.json(
    { tradingDate, runId, status: "running", alreadyRan: false },
    { status: 202 },
  );
}

// GET polls the status of today's trading-date run.
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const status = await getScreenStatus(currentTradingDate());
  if (!status) {
    return NextResponse.json({ error: "not_started" }, { status: 404 });
  }
  return NextResponse.json(status);
}
