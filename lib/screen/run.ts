import { and, eq, lt, or } from "drizzle-orm";

import { groqJson } from "@/lib/ai/groq";
import {
  sanitizeSourceText,
  sanitizeSourceUrl,
  verifyNumericClaims,
} from "@/lib/ai/guards";
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
import { resolveTradingDate } from "./trading-date";
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
    if (typeof value === "number") metrics[key] = Math.round(value * 10_000) / 10_000;
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
      current: Math.round(q.c * 10_000) / 10_000,
      previousClose: Math.round(q.pc * 10_000) / 10_000,
      changePercent: Math.round(
        (q.dp ?? (q.pc === 0 ? 0 : ((q.c - q.pc) / q.pc) * 100)) * 10_000,
      ) / 10_000,
    };
  }

  if (news.status === "fulfilled" && news.value.data.length > 0) {
    const relevant = news.value.data.filter((item) =>
      item.related
        ?.split(",")
        .map((symbol) => symbol.trim().toUpperCase())
        .includes(winner.ticker.toUpperCase()),
    );
    facts.news = relevant.slice(0, 6).flatMap((item) => {
      const url = sanitizeSourceUrl(item.url);
      return url
        ? [{
            headline: sanitizeSourceText(item.headline, 200),
            source: sanitizeSourceText(item.source, 60),
            url,
            date: new Date(item.datetime * 1000).toISOString().slice(0, 10),
          }]
        : [];
    });
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

const FACTOR_LABELS: Record<keyof DailyIdeaFacts["factorScores"], string> = {
  growth: "growth",
  profitability: "profitability",
  valuation: "valuation",
  financialStrength: "financial strength",
  momentum: "market momentum",
  sentiment: "analyst sentiment",
  insiderActivity: "insider activity",
};

function deterministicIdeaFallback(
  facts: DailyIdeaFacts,
): { narrative: DailyIdeaNarrative; generated: GeneratedContentMeta } {
  const rankedFactors = Object.entries(facts.factorScores)
    .filter((entry): entry is [keyof DailyIdeaFacts["factorScores"], number] =>
      typeof entry[1] === "number",
    )
    .sort((a, b) => b[1] - a[1])
    .map(([factor]) => FACTOR_LABELS[factor]);
  const [first = "available fundamentals", second = "relative positioning"] =
    rankedFactors;

  return {
    narrative: {
      selectionReason: `${facts.ticker} ranked first in the daily screen, led by ${first} and ${second}.`,
      thesisPoints: [
        `${first[0].toUpperCase()}${first.slice(1)} was the strongest relative factor in the screened universe.`,
        `${second[0].toUpperCase()}${second.slice(1)} provided additional support for the ranking.`,
        "The result is based on the available sourced data and should be reassessed as new information arrives.",
      ],
      keyCatalyst: facts.news?.length
        ? "A recent company-specific development may change how the market assesses the business."
        : "No dated company-specific catalyst was available from the configured sources.",
      bullCase:
        "The constructive case is that the company sustains its strongest operating factors while market expectations remain measured.",
      bearCase:
        "The adverse case is that the factors supporting the ranking weaken or the available data no longer reflects current conditions.",
      risks: [
        "Provider coverage can be incomplete or delayed.",
        "A relative screen can rank a company highly even when the broader market backdrop is weak.",
      ],
      confidenceRationale:
        "Confidence reflects data coverage and the candidate's position relative to the qualifying rule.",
    },
    generated: {
      generatedAt: new Date().toISOString(),
      basedOn: ["screen", ...Object.keys(facts).filter((key) => key !== "ticker")],
      modelLabel: "deterministic-safety-fallback",
      limitations: ["Model output failed factual verification."],
      status: "fallback",
    },
  };
}

// A run stuck in "running" past this long is presumed to belong to a
// process that died mid-run (e.g. a Dokploy redeploy) rather than one still
// working — the real run finishes in ~3 minutes.
const STALE_RUNNING_MS = 10 * 60 * 1000;

// Idempotency: screen_runs.trading_date is unique, so a second call on the
// same trading date loses the insert race and returns the stored result
// instead of spending another few hundred provider calls. A previously
// failed or stale-running run is the exception — it's reclaimed and re-run
// rather than returned as a permanent result.
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

  // Single conditional UPDATE, not SELECT-then-UPDATE: the WHERE clause
  // itself is the reclaimability check, so two concurrent requests can't
  // both pass a check and both win the claim. Only the row matching this
  // trading date AND currently in a reclaimable state gets updated; an
  // empty .returning() means either the row isn't reclaimable or another
  // request's UPDATE already won the race.
  const [reclaimed] = await db
    .update(schema.screenRuns)
    .set({ status: "running", startedAt: new Date(), error: null })
    .where(
      and(
        eq(schema.screenRuns.tradingDate, tradingDate),
        or(
          eq(schema.screenRuns.status, "failed"),
          and(
            eq(schema.screenRuns.status, "running"),
            lt(schema.screenRuns.startedAt, new Date(Date.now() - STALE_RUNNING_MS)),
          ),
        ),
      ),
    )
    .returning({ id: schema.screenRuns.id });

  if (reclaimed) {
    // Candidates from the failed/stale attempt would otherwise duplicate.
    await db
      .delete(schema.screenCandidates)
      .where(eq(schema.screenCandidates.runId, reclaimed.id));
    return { runId: reclaimed.id, claimed: true };
  }

  const [existing] = await db
    .select({ id: schema.screenRuns.id })
    .from(schema.screenRuns)
    .where(eq(schema.screenRuns.tradingDate, tradingDate))
    .limit(1);

  return { runId: existing.id, claimed: false };
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
    // claimRun reclaims failed/stale runs when called through
    // runDailyScreen, but getScreenStatus reads this row directly without
    // going through claimRun first, so "failed" can genuinely appear here.
    status: run.status,
    runError: run.status === "failed" ? run.error : undefined,
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

async function executeScreen(
  runId: number,
  tradingDate: string,
  universe: UniverseEntry[],
  startedAt: number,
): Promise<ScreenRunResult> {
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
      let generatedIdea: {
        narrative: DailyIdeaNarrative;
        generated: GeneratedContentMeta;
      };
      try {
        generatedIdea = await generateVerifiedIdea(facts);
      } catch (error) {
        console.error("daily idea generation verification failed; using fallback:", error);
        generatedIdea = deterministicIdeaFallback(facts);
      }
      const { narrative, generated } = generatedIdea;
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

export async function runDailyScreen(
  universe: UniverseEntry[] = SCREEN_UNIVERSE,
): Promise<ScreenRunResult> {
  const tradingDate = await resolveTradingDate();
  const startedAt = Date.now();

  const { runId, claimed } = await claimRun(tradingDate, universe.length);
  if (!claimed) return readExistingRun(tradingDate, runId);

  return executeScreen(runId, tradingDate, universe, startedAt);
}

// Claims today's trading date without running the screen, so a caller (the
// HTTP route) can respond immediately instead of holding the connection
// open for the ~3 minutes the screen takes.
export async function claimScreenRun(
  universe: UniverseEntry[] = SCREEN_UNIVERSE,
): Promise<{ runId: number; tradingDate: string; claimed: boolean }> {
  const tradingDate = await resolveTradingDate();
  const { runId, claimed } = await claimRun(tradingDate, universe.length);
  return { runId, tradingDate, claimed };
}

// Runs the screen without the caller awaiting it. The process is a
// long-lived Node container (not serverless), so work continues after the
// HTTP response is sent. Errors are caught here only to stop them becoming
// an unhandled rejection — executeScreen already records failure on the run.
export function runScreenInBackground(
  runId: number,
  tradingDate: string,
  universe: UniverseEntry[] = SCREEN_UNIVERSE,
): void {
  void executeScreen(runId, tradingDate, universe, Date.now()).catch((err) => {
    console.error("background screen run failed:", err);
  });
}

// Read-only status lookup for polling, keyed by trading date rather than a
// runId the caller may not have yet (e.g. a GitHub Actions poll loop).
export async function getScreenStatus(
  tradingDate: string,
): Promise<ScreenRunResult | null> {
  const [run] = await db
    .select({ id: schema.screenRuns.id })
    .from(schema.screenRuns)
    .where(eq(schema.screenRuns.tradingDate, tradingDate))
    .limit(1);

  if (!run) return null;
  return readExistingRun(tradingDate, run.id);
}
