import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db, schema } from "@/lib/db";
import type { DailyIdeaPayload } from "@/lib/screen/types";

export const dynamic = "force-dynamic";

// Read-only view of the most recent screen outcome, including the explicit
// "no qualifying idea" case (ticker is null when nothing cleared the bar).
export async function GET() {
  const [idea] = await db
    .select()
    .from(schema.dailyIdeas)
    .orderBy(desc(schema.dailyIdeas.tradingDate))
    .limit(1);

  if (!idea) {
    return NextResponse.json({ error: "no_screen_yet" }, { status: 404 });
  }

  const [run] = await db
    .select()
    .from(schema.screenRuns)
    .where(eq(schema.screenRuns.id, idea.runId))
    .limit(1);

  const candidates = await db
    .select()
    .from(schema.screenCandidates)
    .where(eq(schema.screenCandidates.runId, idea.runId));

  return NextResponse.json({
    tradingDate: idea.tradingDate,
    ticker: idea.ticker,
    score: idea.score === null ? null : Number(idea.score),
    confidence: idea.confidence === null ? null : Number(idea.confidence),
    threshold: Number(idea.thresholdAtRun),
    idea: idea.narrative as DailyIdeaPayload | null,
    emailDeliveryError: idea.emailDeliveryError,
    run: run && {
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      durationMs: run.durationMs,
      universeSize: run.universeSize,
      universeEvaluated: run.universeEvaluated,
      highestScore: run.highestScore === null ? null : Number(run.highestScore),
    },
    candidates: candidates
      .sort((a, b) => a.rank - b.rank)
      .map((c) => ({
        rank: c.rank,
        ticker: c.ticker,
        sector: c.sector,
        compositeScore: Number(c.compositeScore),
        subScores: c.subScores,
        catalyst: c.catalyst,
      })),
  });
}
