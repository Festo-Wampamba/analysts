import { desc, eq, isNotNull } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import type { DailyIdeaPayload } from "./types";

export type LatestIdea = {
  tradingDate: string;
  ticker: string | null;
  latestQualifyingTicker: string | null;
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
  latestAttempt: {
    tradingDate: string;
    status: string;
    startedAt: Date;
    finishedAt: Date | null;
    durationMs: number | null;
    universeSize: number;
    universeEvaluated: number;
    highestScore: number | null;
    nextScheduledAt: Date | null;
    error: string | null;
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
  const [latestAttempt] = await db
    .select()
    .from(schema.screenRuns)
    .orderBy(desc(schema.screenRuns.tradingDate), desc(schema.screenRuns.startedAt))
    .limit(1);

  const [idea] = await db
    .select()
    .from(schema.dailyIdeas)
    .orderBy(desc(schema.dailyIdeas.tradingDate))
    .limit(1);

  const [latestQualifyingIdea] = await db
    .select({ ticker: schema.dailyIdeas.ticker })
    .from(schema.dailyIdeas)
    .where(isNotNull(schema.dailyIdeas.ticker))
    .orderBy(desc(schema.dailyIdeas.tradingDate))
    .limit(1);
  const latestQualifyingTicker = latestQualifyingIdea?.ticker ?? null;

  if (!idea) {
    if (!latestAttempt) return null;
    return {
      tradingDate: latestAttempt.tradingDate,
      ticker: null,
      latestQualifyingTicker,
      score: null,
      confidence: null,
      threshold: Number(latestAttempt.threshold),
      idea: null,
      emailDeliveryError: null,
      run: null,
      latestAttempt: mapRun(latestAttempt),
      candidates: [],
    };
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

  return {
    tradingDate: idea.tradingDate,
    ticker: idea.ticker,
    latestQualifyingTicker,
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
    latestAttempt: latestAttempt ? mapRun(latestAttempt) : null,
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

function mapRun(run: typeof schema.screenRuns.$inferSelect) {
  return {
    tradingDate: run.tradingDate,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    durationMs: run.durationMs,
    universeSize: run.universeSize,
    universeEvaluated: run.universeEvaluated,
    highestScore: run.highestScore === null ? null : Number(run.highestScore),
    nextScheduledAt: run.nextScheduledAt,
    error: run.error,
  };
}
