import { NextResponse } from "next/server";

import { getLatestIdea } from "@/lib/screen/get-latest-idea";
import { isTradingDateStale } from "@/lib/screen/trading-date";

export const dynamic = "force-dynamic";

// Read-only view of the most recent screen outcome, including the explicit
// "no qualifying idea" case (ticker is null when nothing cleared the bar).
export async function GET() {
  const idea = await getLatestIdea();

  if (!idea) {
    return NextResponse.json({ error: "no_screen_yet" }, { status: 404 });
  }

  return NextResponse.json({
    ...idea,
    freshness: {
      status: isTradingDateStale(idea.tradingDate) ? "stale" : "fresh",
      asOf: idea.tradingDate,
    },
  });
}
