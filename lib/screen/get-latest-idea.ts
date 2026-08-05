import { desc, eq } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import type { DailyIdeaPayload } from "./types";

export type LatestIdea = {
  tradingDate: string;
  ticker: string | null;
  score: number | null;
  confidence: number | null;
  threshold: number;
  idea: DailyIdeaPayload | null;
  emailDeliveryError: string | null;
  run: {
    status: string;
    startedAt: Date;
    finishedAt: Date | null;
    durationMs: number | null;
    universeSize: number;
    universeEvaluated: number;
    highestScore: number | null;
  } | null;
  candidates: {
    rank: number;
    ticker: string;
    sector: string | null;
    compositeScore: number;
    subScores: unknown;
    catalyst: string | null;
  }[];
};

// Shared by GET /api/daily-idea and the homepage server render — one query,
// two callers, kept in sync on purpose.
export async function getLatestIdea(): Promise<LatestIdea | null> {
  const [idea] = await db
    .select()
    .from(schema.dailyIdeas)
    .orderBy(desc(schema.dailyIdeas.tradingDate))
    .limit(1);

  if (!idea) return null;

  const [run] = await db
    .select()
    .from(schema.screenRuns)
    .where(eq(schema.screenRuns.id, idea.runId))
    .limit(1);

  const candidates = await db
    .select()
    .from(schema.screenCandidates)
    .where(eq(schema.screenCandidates.runId, idea.runId));

  return {
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
  };
}
