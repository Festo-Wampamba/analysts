import { eq } from "drizzle-orm";

import { groqJson } from "@/lib/ai/groq";
import { sanitizeSourceText, verifyNumericClaims } from "@/lib/ai/guards";
import {
  dailyIdeaNarrativeSchema,
  type DailyIdeaNarrative,
} from "@/lib/ai/report-schema";
import { db, schema } from "@/lib/db";
import type { GeneratedContentMeta, Provenance } from "@/lib/domain/provenance";
import { sendEmail } from "@/lib/email/resend";
import { renderDailyIdeaEmail } from "@/lib/email/daily-idea";
import { getCompanyNews, getProfile, getQuote } from "@/lib/source/finnhub";
import { quoteLooksEmpty } from "@/lib/source/finnhub-schemas";
import { fetchUniverseCandidates } from "./fetch";
import {
  buildDailyIdeaCorrectionPrompt,
  buildDailyIdeaUserPrompt,
  DAILY_IDEA_SYSTEM_PROMPT,
} from "./prompt";
import {
  DEFAULT_SCORING_CONFIG,
  scoreCandidates,
  type CandidateInput,
  type ScoredCandidate,
} from "./score";
import { currentTradingDate } from "./trading-date";
import { SCREEN_UNIVERSE, type UniverseEntry } from "./universe";
import type { DailyIdeaFacts, DailyIdeaPayload, ScreenRunResult } from "./types";

const TOP_CANDIDATES = 5;
const NEWS_LOOKBACK_DAYS = 14;

export class ScreenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScreenError";
  }
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// Peer valuation context computed from the same universe the screen already
// fetched, so it costs no extra provider calls.
function sectorMedianPe(
  candidates: CandidateInput[],
  sector: string | undefined,
  excludeTicker: string,
): number | undefined {
  if (!sector) return undefined;
  const peerPes = candidates
    .filter(
      (c) => c.sector === sector && c.ticker !== excludeTicker && c.metrics.peTTM,
    )
    .map((c) => c.metrics.peTTM!)
    .filter((pe) => pe > 0);
  return median(peerPes);
}

async function enrichWinner(
  winner: ScoredCandidate,
  input: CandidateInput,
  candidates: CandidateInput[],
  runId: number,
  universeEvaluated: number,
): Promise<{ facts: DailyIdeaFacts; provenance: Provenance[] }> {
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - NEWS_LOOKBACK_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const [quote, profile, news] = await Promise.allSettled([
    getQuote(winner.ticker, { runId }),
    getProfile(winner.ticker, { runId }),
    getCompanyNews(winner.ticker, from, today, { runId }),
  ]);

  const provenance: Provenance[] = [];
  for (const result of [quote, profile, news]) {
    if (result.status === "fulfilled") provenance.push(result.value.provenance);
  }

  const metrics: Record<string, number> = {};
  for (const [key, value] of Object.entries(input.metrics)) {
    if (typeof value === "number") metrics[key] = value;
  }

  const facts: DailyIdeaFacts = {
    ticker: winner.ticker,
    sector: winner.sector,
    metrics,
    factorScores: winner.subScores,
    compositeScore: winner.compositeScore,
    coverage: winner.coverage,
    threshold: DEFAULT_SCORING_CONFIG.threshold,
    universeEvaluated,
    sectorMedianPe: sectorMedianPe(candidates, winner.sector, winner.ticker),
  };

  if (profile.status === "fulfilled") {
    facts.company = {
      name: profile.value.data.name,
      marketCapMillions: profile.value.data.marketCapitalization,
      currency: profile.value.data.currency,
    };
  }

  if (quote.status === "fulfilled" && !quoteLooksEmpty(quote.value.data)) {
    const q = quote.value.data;
    facts.price = {
      current: q.c,
      previousClose: q.pc,
      changePercent: q.dp ?? (q.pc === 0 ? 0 : ((q.c - q.pc) / q.pc) * 100),
    };
  }

  if (news.status === "fulfilled" && news.value.data.length > 0) {
    facts.news = news.value.data.slice(0, 6).map((item) => ({
      headline: sanitizeSourceText(item.headline, 200),
      source: sanitizeSourceText(item.source, 60),
      url: item.url,
      date: new Date(item.datetime * 1000).toISOString().slice(0, 10),
    }));
  }

  return { facts, provenance };
}

function ideaNarrativeToText(narrative: DailyIdeaNarrative): string {
  const { thesisPoints, risks, ...prose } = narrative;
  return [...Object.values(prose), ...thesisPoints, ...risks].join("\n");
}

function buildIdeaAllowlist(facts: DailyIdeaFacts): number[] {
  const allowed = new Set<number>();
  const walk = (value: unknown) => {
    if (typeof value === "number") {
      if (Number.isFinite(value)) allowed.add(value);
      return;
    }
    if (Array.isArray(value)) return value.forEach(walk);
    if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(facts);

  // Percentile scores and coverage read naturally as percentages in prose.
  for (const score of Object.values(facts.factorScores)) {
    if (score !== null) allowed.add(score * 100);
  }
  allowed.add(facts.compositeScore * 100);
  allowed.add(facts.coverage * 100);
  allowed.add(facts.threshold * 100);
  if (facts.company?.marketCapMillions !== undefined) {
    allowed.add(facts.company.marketCapMillions * 1e6);
  }

  return [...allowed];
}

async function generateVerifiedIdea(
  facts: DailyIdeaFacts,
): Promise<{ narrative: DailyIdeaNarrative; generated: GeneratedContentMeta }> {
  const allowlist = buildIdeaAllowlist(facts);
  const basedOn = ["screen", ...Object.keys(facts).filter((k) => k !== "ticker")];

  const attempt = async (user: string) => {
    const result = await groqJson(
      {
        system: DAILY_IDEA_SYSTEM_PROMPT,
        user,
        outputSchema: dailyIdeaNarrativeSchema,
        basedOn,
      },
      { ticker: facts.ticker },
    );
    return {
      result,
      guard: verifyNumericClaims(ideaNarrativeToText(result.data), allowlist),
    };
  };

  const first = await attempt(buildDailyIdeaUserPrompt(facts));
  if (first.guard.ok) {
    return { narrative: first.result.data, generated: first.result.meta };
  }

  const offending = first.guard.violations.map((v) => v.raw);
  const second = await attempt(buildDailyIdeaCorrectionPrompt(facts, offending));
  if (!second.guard.ok) {
    throw new ScreenError(
      `daily idea contained unverifiable figures: ${second.guard.violations
        .map((v) => v.raw)
        .join(", ")}`,
    );
  }

  return { narrative: second.result.data, generated: second.result.meta };
}

// Idempotency: screen_runs.trading_date is unique, so a second call on the
// same trading date loses the insert race and returns the stored result
// instead of spending another few hundred provider calls. A previously
// failed run is the exception — the cron retries it, so its row is reclaimed
// and re-run rather than returned as a permanent result.
async function claimRun(
  tradingDate: string,
  universeSize: number,
): Promise<{ runId: number; claimed: boolean }> {
  const [inserted] = await db
    .insert(schema.screenRuns)
    .values({
      tradingDate,
      status: "running",
      startedAt: new Date(),
      universeSize,
      threshold: String(DEFAULT_SCORING_CONFIG.threshold),
    })
    .onConflictDoNothing()
    .returning({ id: schema.screenRuns.id });

  if (inserted) return { runId: inserted.id, claimed: true };

  const [existing] = await db
    .select({ id: schema.screenRuns.id, status: schema.screenRuns.status })
    .from(schema.screenRuns)
    .where(eq(schema.screenRuns.tradingDate, tradingDate))
    .limit(1);

  if (existing.status !== "failed") return { runId: existing.id, claimed: false };

  await db
    .update(schema.screenRuns)
    .set({ status: "running", startedAt: new Date(), error: null })
    .where(eq(schema.screenRuns.id, existing.id));
  // Candidates from the failed attempt would otherwise duplicate.
  await db
    .delete(schema.screenCandidates)
    .where(eq(schema.screenCandidates.runId, existing.id));

  return { runId: existing.id, claimed: true };
}

async function readExistingRun(
  tradingDate: string,
  runId: number,
): Promise<ScreenRunResult> {
  const [run] = await db
    .select()
    .from(schema.screenRuns)
    .where(eq(schema.screenRuns.id, runId))
    .limit(1);

  const candidates = await db
    .select()
    .from(schema.screenCandidates)
    .where(eq(schema.screenCandidates.runId, runId));

  const [idea] = await db
    .select()
    .from(schema.dailyIdeas)
    .where(eq(schema.dailyIdeas.tradingDate, tradingDate))
    .limit(1);

  return {
    tradingDate,
    runId,
    // "failed" is never reached here: claimRun reclaims failed runs instead
    // of returning them.
    status: run.status === "running" ? "running" : run.status === "no_qualifying_idea" ? "no_qualifying_idea" : "complete",
    universeSize: run.universeSize,
    universeEvaluated: run.universeEvaluated,
    threshold: Number(run.threshold),
    highestScore: run.highestScore === null ? null : Number(run.highestScore),
    topCandidates: candidates
      .sort((a, b) => a.rank - b.rank)
      .map((c) => ({
        ticker: c.ticker,
        sector: c.sector ?? undefined,
        catalyst: c.catalyst ?? undefined,
        subScores: c.subScores as ScoredCandidate["subScores"],
        compositeScore: Number(c.compositeScore),
        coverage: 0,
        qualified: false,
      })),
    idea: (idea?.narrative as DailyIdeaPayload | undefined) ?? null,
    // No email is attempted on a day with no qualifying idea, so a null
    // delivery error only means "delivered" when there was an idea to send.
    emailDelivered: idea?.ticker != null && idea.emailDeliveryError === null,
    emailError: idea?.emailDeliveryError ?? null,
    alreadyRan: true,
  };
}

export async function runDailyScreen(
  universe: UniverseEntry[] = SCREEN_UNIVERSE,
): Promise<ScreenRunResult> {
  const tradingDate = currentTradingDate();
  const startedAt = Date.now();

  const { runId, claimed } = await claimRun(tradingDate, universe.length);
  if (!claimed) return readExistingRun(tradingDate, runId);

  try {
    const { candidates, failedTickers } = await fetchUniverseCandidates(
      universe,
      runId,
    );
    // An empty evaluated universe is not a legitimate "no idea" result when
    // every requested ticker failed at the provider boundary. Fail the run so
    // claimRun can reclaim it on the next cron attempt instead of allowing the
    // trading-date uniqueness constraint to suppress retries for the day.
    if (
      universe.length > 0 &&
      candidates.length === 0 &&
      failedTickers.length === universe.length
    ) {
      throw new ScreenError(
        `unable to evaluate any of ${universe.length} universe tickers`,
      );
    }
    const scored = scoreCandidates(candidates, DEFAULT_SCORING_CONFIG);
    const top = scored.slice(0, TOP_CANDIDATES);
    const winner = scored.find((c) => c.qualified) ?? null;
    const highestScore = scored[0]?.compositeScore ?? null;

    let idea: DailyIdeaPayload | null = null;
    let emailResult: { delivered: boolean; error: string | null } = {
      delivered: false,
      error: null,
    };

    if (winner) {
      const input = candidates.find((c) => c.ticker === winner.ticker)!;
      const { facts, provenance } = await enrichWinner(
        winner,
        input,
        candidates,
        runId,
        candidates.length,
      );
      const { narrative, generated } = await generateVerifiedIdea(facts);
      idea = { facts, narrative, generated, provenance };

      const email = await sendEmail(
        renderDailyIdeaEmail(idea, tradingDate),
        { runId },
      );
      emailResult = email.delivered
        ? { delivered: true, error: null }
        : { delivered: false, error: email.error };
    }

    // The winner's headline catalyst comes from the model, grounded in the
    // news block it was shown.
    if (idea && top.length > 0) {
      const winnerRow = top.find((c) => c.ticker === idea!.facts.ticker);
      if (winnerRow) winnerRow.catalyst = idea.narrative.keyCatalyst;
    }

    if (top.length > 0) {
      await db.insert(schema.screenCandidates).values(
        top.map((candidate, index) => ({
          runId,
          ticker: candidate.ticker,
          sector: candidate.sector,
          rank: index + 1,
          subScores: candidate.subScores,
          compositeScore: String(candidate.compositeScore),
          catalyst: candidate.catalyst,
        })),
      );
    }

    const ideaRow = {
      tradingDate,
      ticker: winner?.ticker ?? null,
      score: winner ? String(winner.compositeScore) : null,
      confidence: winner ? String(winner.coverage) : null,
      thresholdAtRun: String(DEFAULT_SCORING_CONFIG.threshold),
      narrative: idea,
      runId,
      emailDeliveryError: emailResult.error,
    };
    await db
      .insert(schema.dailyIdeas)
      .values(ideaRow)
      // A reclaimed failed run may already have written an idea row.
      .onConflictDoUpdate({ target: schema.dailyIdeas.tradingDate, set: ideaRow });

    const status = winner ? "complete" : "no_qualifying_idea";
    await db
      .update(schema.screenRuns)
      .set({
        status,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt,
        universeEvaluated: candidates.length,
        highestScore: highestScore === null ? null : String(highestScore),
      })
      .where(eq(schema.screenRuns.id, runId));

    return {
      tradingDate,
      runId,
      status,
      universeSize: universe.length,
      universeEvaluated: candidates.length,
      threshold: DEFAULT_SCORING_CONFIG.threshold,
      highestScore,
      topCandidates: top,
      idea,
      emailDelivered: emailResult.delivered,
      emailError: emailResult.error,
      alreadyRan: false,
    };
  } catch (err) {
    await db
      .update(schema.screenRuns)
      .set({
        status: "failed",
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt,
        error: (err as Error).message,
      })
      .where(eq(schema.screenRuns.id, runId));
    throw err;
  }
}
