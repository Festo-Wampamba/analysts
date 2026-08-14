import { NextResponse } from "next/server";

import { getLatestIdea } from "@/lib/screen/get-latest-idea";

export const dynamic = "force-dynamic";

// Read-only view of the most recent screen outcome, including the explicit
// "no qualifying idea" case (ticker is null when nothing cleared the bar).
export async function GET() {
  const idea = await getLatestIdea();

  if (!idea) {
    return NextResponse.json({ error: "no_screen_yet" }, { status: 404 });
  }

  const ageMs = Date.now() - new Date(`${idea.tradingDate}T23:59:59Z`).getTime();
  return NextResponse.json({
    ...idea,
    freshness: {
      status: ageMs > 3 * 86_400_000 ? "stale" : "fresh",
      asOf: idea.tradingDate,
    },
  });
}
