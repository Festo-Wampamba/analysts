import { desc, eq, isNotNull } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import type { DailyIdeaPayload } from "./types";
import { coverageForSubScores, leadingEvidence } from "./score";

export type LatestIdea = {
  tradingDate: string;
  ticker: string | null;
  latestQualifyingTicker: string | null;
  score: number | null;
  confidence: number | null;
  threshold: number;
  idea: DailyIdeaPayload | null;
  emailDeliveryError: string | null;
  delivery: {
    channel: "email";
    status: "delivered" | "failed" | "not_attempted";
    attemptedAt: Date | null;
    recipient: string | null;
    retry: "not_needed" | "manual_retry_required" | "not_applicable";
  };
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
    coverage?: number;
    subScores: unknown;
    leadingFactor: string | null;
    leadingFactorScore: number | null;
    leadingEvidence: string;
    catalyst: string | null;
  }[];
};

const LATEST_IDEA_CACHE_TTL_MS = 60_000;
let latestIdeaCache: { value: LatestIdea | null; expiresAt: number } | null = null;
let activeLatestIdeaLoad: Promise<LatestIdea | null> | null = null;

// Shared by GET /api/daily-idea and the homepage server render. Concurrent
// callers share one query, recent successful reads make reloads immediate,
// and a transient database outage does not erase the last verified result.
export function getLatestIdea(): Promise<LatestIdea | null> {
  if (latestIdeaCache && latestIdeaCache.expiresAt > Date.now()) {
    return Promise.resolve(latestIdeaCache.value);
  }
  if (activeLatestIdeaLoad) return activeLatestIdeaLoad;

  const load = loadLatestIdea()
    .then((value) => {
      latestIdeaCache = {
        value,
        expiresAt: Date.now() + LATEST_IDEA_CACHE_TTL_MS,
      };
      return value;
    })
    .catch((error: unknown) => {
      if (latestIdeaCache) {
        console.warn("latest idea refresh failed; serving last verified snapshot:", (error as Error).message);
        return latestIdeaCache.value;
      }
      throw error;
    })
    .finally(() => {
      if (activeLatestIdeaLoad === load) activeLatestIdeaLoad = null;
    });
  activeLatestIdeaLoad = load;
  return load;
}

async function loadLatestIdea(): Promise<LatestIdea | null> {
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
      delivery: {
        channel: "email",
        status: "not_attempted",
        attemptedAt: null,
        recipient: null,
        retry: "not_applicable",
      },
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
    delivery: {
      channel: "email",
      status: idea.ticker === null
        ? "not_attempted"
        : idea.emailDeliveryError === null
          ? "delivered"
          : "failed",
      attemptedAt: run?.finishedAt ?? idea.createdAt,
      recipient: process.env.DAILY_IDEA_TO ? "configured recipient(s)" : null,
      retry: idea.ticker === null
        ? "not_applicable"
        : idea.emailDeliveryError === null
          ? "not_needed"
          : "manual_retry_required",
    },
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
      .map((c) => {
        const evidence = leadingEvidence(c.subScores as Record<string, number | null>);
        return {
        rank: c.rank,
        ticker: c.ticker,
        sector: c.sector,
        compositeScore: Number(c.compositeScore),
        coverage: coverageForSubScores(c.subScores as Record<string, number | null>),
        subScores: c.subScores,
        leadingFactor: evidence?.label ?? null,
        leadingFactorScore: evidence?.score ?? null,
        leadingEvidence: evidence?.summary ?? "No factor score was available for this candidate.",
        catalyst: c.catalyst,
      };
      }),
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
