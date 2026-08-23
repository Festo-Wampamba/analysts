import { and, desc, eq, gt } from "drizzle-orm";

import { groqJson } from "@/lib/ai/groq";
import { verifyNarrativeClaims, verifyNumericClaims } from "@/lib/ai/guards";
import {
  modelNarrativeSchema,
  type ModelResearchNarrative,
  type ResearchNarrative,
} from "@/lib/ai/report-schema";
import { db, schema } from "@/lib/db";
import type { GeneratedContentMeta, Provenance } from "@/lib/domain/provenance";
import {
  getCompanyNews,
  getMetrics,
  getPeers,
  getProfile,
  getQuote,
  getRecommendations,
  type Sourced,
} from "@/lib/source/finnhub";
import {
  buildNumericAllowlist,
  buildResearchFacts,
  hasMinimumFacts,
  PEER_TABLE_LIMIT,
  type RawResearchSources,
  type ResearchFacts,
} from "./facts";
import { buildNumericCorrectionPrompt, buildResearchUserPrompt, RESEARCH_SYSTEM_PROMPT } from "./prompt";

// Defense-in-depth: a number that IS in the sourced facts (so the numeric
// guard alone allows it) can still reach prose at raw provider precision
// instead of the rounded, display-grade form the prompt showed the model.
const EXCESS_DECIMAL_PATTERN = /\d+\.\d{5,}/g;

function findExcessDecimalNumbers(text: string): string[] {
  return [...text.matchAll(EXCESS_DECIMAL_PATTERN)].map((match) => match[0]);
}

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const QUOTE_FRESHNESS_MS = 15 * 60 * 1000;
const NEWS_LOOKBACK_DAYS = 30;

export class ReportError extends Error {
  readonly code: "unknown_ticker" | "sources_unavailable" | "unverifiable_numbers" | "unverifiable_claims";
  readonly details?: unknown;

  constructor(
    code: ReportError["code"],
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "ReportError";
    this.code = code;
    this.details = details;
  }
}

export type ResearchReport = {
  ticker: string;
  facts: ResearchFacts;
  narrative: ResearchNarrative;
  provenance: Provenance[];
  generated: GeneratedContentMeta;
  failedProviders: string[];
  cached: boolean;
};

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

// Each provider is independent: one failure degrades coverage, it does not
// abort the report (Final-design.md §9.16 provider failure state).
export async function fetchResearchSources(
  ticker: string,
  context: { researchRunId?: number } = {},
): Promise<{
  sources: RawResearchSources;
  provenance: Provenance[];
  failedProviders: string[];
}> {
  const today = new Date().toISOString().slice(0, 10);

  const calls = {
    quote: getQuote(ticker, context),
    profile: getProfile(ticker, context),
    metrics: getMetrics(ticker, context),
    peers: getPeers(ticker, context),
    news: getCompanyNews(ticker, isoDaysAgo(NEWS_LOOKBACK_DAYS), today, context),
    recommendations: getRecommendations(ticker, context),
  } as const;

  const names = Object.keys(calls) as (keyof typeof calls)[];
  const settled = await Promise.allSettled(Object.values(calls));

  const sources: RawResearchSources = {};
  const provenance: Provenance[] = [];
  const failedProviders: string[] = [];

  settled.forEach((result, i) => {
    const name = names[i];
    if (result.status === "fulfilled") {
      const sourced = result.value as Sourced<unknown>;
      Object.assign(sources, { [name]: sourced.data });
      provenance.push(sourced.provenance);
    } else {
      failedProviders.push(name);
      provenance.push({
        provider: "finnhub",
        endpoint: name,
        fetchedAt: new Date().toISOString(),
        status: "failed",
      });
    }
  });

  return { sources, provenance, failedProviders };
}

// The guard runs over prose only; structured fields carry no free-text numbers.
function narrativeToText(narrative: ModelResearchNarrative): string {
  const { risks, scenarios, limitations, ...prose } = narrative;
  return [
    ...Object.values(prose),
    ...risks,
    ...scenarios.map((s) => s.summary),
    ...limitations,
  ].join("\n");
}

// Server-built, not model-generated: the peers paragraph may reference only
// tickers the peer table (lib/research/workspace.ts) actually renders —
// `facts.peers` sliced to PEER_TABLE_LIMIT, the same slice the table applies
// — so it can never name a peer the table doesn't show.
function buildPeersNarrative(facts: ResearchFacts): string {
  const peers = (facts.peers ?? []).slice(0, PEER_TABLE_LIMIT);
  if (peers.length === 0) {
    return "No peer set was available from the source provider for this report.";
  }
  return `Finnhub lists ${peers.join(", ")} as comparable companies. Their sourced metrics appear in the peer table; peers absent from the table are not discussed.`;
}

async function generateVerifiedNarrative(
  facts: ResearchFacts,
  allowlist: number[],
  context: { researchRunId?: number } = {},
): Promise<{
  narrative: ResearchNarrative;
  generated: GeneratedContentMeta;
  model: string;
}> {
  const basedOn = Object.keys(facts).filter((key) => key !== "ticker");
  const peers = buildPeersNarrative(facts);

  const attempt = async (user: string) => {
    const result = await groqJson(
      {
        system: RESEARCH_SYSTEM_PROMPT,
        user,
        outputSchema: modelNarrativeSchema,
        basedOn,
      },
      { ticker: facts.ticker, ...context },
    );
    const text = narrativeToText(result.data);
    const guard = verifyNumericClaims(text, allowlist);
    const claimGuard = verifyNarrativeClaims(text, {
      ticker: facts.ticker,
      peerTickers: facts.peers,
      analystRecommendations: facts.analystRecommendations,
    });
    const excessDecimals = findExcessDecimalNumbers(text);
    return { result, guard, claimGuard, excessDecimals };
  };

  const first = await attempt(buildResearchUserPrompt(facts));
  if (first.guard.ok && first.claimGuard.ok && first.excessDecimals.length === 0) {
    return {
      narrative: { ...first.result.data, peers },
      generated: first.result.meta,
      model: first.result.model,
    };
  }

  // One corrective retry naming the rejected figures; models usually comply
  // once the specific offending strings are quoted back at them.
  const offending = [
    ...first.guard.violations.map((v) => v.raw),
    ...first.claimGuard.violations,
    ...first.excessDecimals,
  ];
  const second = await attempt(buildNumericCorrectionPrompt(facts, offending));
  if (!second.guard.ok || !second.claimGuard.ok || second.excessDecimals.length > 0) {
    throw new ReportError(
      second.claimGuard.ok ? "unverifiable_numbers" : "unverifiable_claims",
      "generated report contained claims absent from or contradicted by the sourced facts",
      {
        violations: [
          ...second.guard.violations.map((v) => v.raw),
          ...second.claimGuard.violations,
          ...second.excessDecimals,
        ],
      },
    );
  }

  return {
    narrative: { ...second.result.data, peers },
    generated: second.result.meta,
    model: second.result.model,
  };
}

// The fallback fires for two unrelated causes — the guard rejected the
// prose, or the provider call itself failed (network/HTTP error) — and the
// shown limitation must name the one that actually happened.
function fallbackReason(error: unknown): string {
  return error instanceof ReportError &&
    (error.code === "unverifiable_numbers" || error.code === "unverifiable_claims")
    ? "Model output failed factual verification"
    : "AI narrative generation was unavailable (provider error)";
}

function formatFact(value: number | undefined, suffix = ""): string | null {
  if (value === undefined || !Number.isFinite(value)) return null;
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}${suffix}`;
}

function deterministicResearchFallback(
  facts: ResearchFacts,
  error: unknown,
): {
  narrative: ResearchNarrative;
  generated: GeneratedContentMeta;
  model: string;
} {
  const company = facts.company?.name ?? facts.ticker;
  const quote = facts.quote;
  const pe = formatFact(facts.valuation?.peTTM);
  const revenueGrowth = formatFact(facts.growth?.revenueGrowthTTMYoy, "%");
  const operatingMargin = formatFact(facts.profitability?.operatingMarginTTM, "%");
  const debtToEquity = formatFact(facts.balanceSheet?.debtToEquityQuarterly);
  const latestNews = facts.news?.[0];
  const reason = fallbackReason(error);
  return {
    narrative: {
      overview: quote
        ? `${company} (${facts.ticker}) last traded at ${formatFact(quote.price)} ${facts.company?.currency ?? "USD"}, ${quote.change.direction === "negative" ? "down" : "up"} ${formatFact(Math.abs(quote.changePercent.value), "%")} versus the prior close in the sourced quote.`
        : `${company} (${facts.ticker}) has sourced company-profile coverage, but a usable current quote was not available for this report.`,
      businessModel:
        facts.company?.industry
          ? `${company} is classified by the source provider in ${facts.company.industry}. The available profile identifies the company and market classification but does not provide enough segment detail to make a more specific revenue-model claim.`
          : "The available provider profile does not contain sufficient business-model detail for a more specific deterministic description.",
      financialPerformance:
        [revenueGrowth && `Sourced trailing revenue growth is ${revenueGrowth}.`, operatingMargin && `Sourced operating margin is ${operatingMargin}.`, "Filing-derived annual figures are shown only when period and filing coverage is compatible."].filter(Boolean).join(" ") || "No compatible sourced growth or profitability metric was available for deterministic financial commentary.",
      balanceSheet:
        debtToEquity
          ? `The sourced quarterly debt-to-equity measure is ${debtToEquity}. Liquidity and leverage conclusions remain limited to the reported ratio coverage.`
          : "No compatible leverage ratio was available, so the report does not make a deterministic balance-sheet conclusion.",
      valuation:
        pe
          ? `The sourced trailing P/E is ${pe}. This report presents that observed multiple without a model-derived target price or unsupported historical comparison.`
          : "No sourced trailing valuation multiple was available, so the report does not infer a valuation conclusion.",
      peers: buildPeersNarrative(facts),
      recentDevelopments: latestNews
        ? `The latest linked coverage is dated ${latestNews.date} from ${latestNews.source}: ${latestNews.headline}`
        : "No relevant recent company coverage was available from the configured source.",
      growthDrivers:
        revenueGrowth
          ? `The observable growth input is ${revenueGrowth} trailing revenue growth. Whether that persists requires future filings and cannot be assumed from this snapshot alone.`
          : "No sourced growth-rate field was available, so no deterministic growth driver is asserted.",
      catalysts: latestNews
        ? `The dated catalyst is the ${latestNews.date} ${latestNews.source} coverage linked in this report. Its implications should be verified at the original source.`
        : "Scheduled earnings are the primary dated catalyst available to this report.",
      risks: [
        "Market-data, news, and filing coverage can be incomplete or delayed.",
        "Observed valuation, growth, and momentum inputs can change before the next refresh.",
      ],
      scenarios: [
        { label: "bull", summary: "The constructive case requires operating strengths and relevant catalysts to develop favorably." },
        { label: "base", summary: "The central case assumes current operating trends remain broadly intact." },
        { label: "bear", summary: "The adverse case reflects weakening fundamentals, expectations, or company-specific developments." },
      ],
      thesis:
        `${company} should be assessed from the sourced ${pe ? `P/E of ${pe}` : "valuation coverage"}${revenueGrowth ? ` and trailing revenue growth of ${revenueGrowth}` : ""}. The current evidence is descriptive rather than a forecast and is constrained by the available provider fields. The stance would change if a later filing or linked company development materially changes those sourced inputs.`,
      limitations: [`${reason}, so deterministic explanatory text is shown.`],
    },
    generated: {
      generatedAt: new Date().toISOString(),
      basedOn: Object.keys(facts).filter((key) => key !== "ticker"),
      modelLabel: "deterministic-safety-fallback",
      limitations: [`${reason}.`],
      status: "fallback",
    },
    model: "deterministic-safety-fallback",
  };
}

async function readCachedReport(ticker: string) {
  const [row] = await db
    .select()
    .from(schema.reportsCache)
    .where(
      and(
        eq(schema.reportsCache.ticker, ticker),
        gt(schema.reportsCache.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(schema.reportsCache.generatedAt))
    .limit(1);
  return row;
}

// Provenance recorded at fetch time; freshness is re-evaluated on read so a
// cached report shows its quote as stale instead of implying live data.
function agedProvenance(provenance: Provenance[]): Provenance[] {
  const now = Date.now();
  return provenance.map((p) => {
    if (p.status !== "fresh") return p;
    const age = now - new Date(p.fetchedAt).getTime();
    return age > QUOTE_FRESHNESS_MS ? { ...p, status: "stale" as const } : p;
  });
}

export async function getResearchReport(
  ticker: string,
  context: { researchRunId?: number } = {},
): Promise<ResearchReport> {
  const cached = await readCachedReport(ticker);
  if (cached) {
    const payload = cached.facts as {
      facts: ResearchFacts;
      provenance: Provenance[];
      failedProviders: string[];
    };
    return {
      ticker,
      facts: payload.facts,
      narrative: cached.narrative as ResearchNarrative,
      provenance: agedProvenance(payload.provenance),
      generated: {
        generatedAt: cached.generatedAt.toISOString(),
        basedOn: Object.keys(payload.facts).filter((key) => key !== "ticker"),
        modelLabel: cached.model,
        status: cached.model === "deterministic-safety-fallback" ? "fallback" : "generated",
      },
      failedProviders: payload.failedProviders,
      cached: true,
    };
  }

  const { sources, provenance, failedProviders } = await fetchResearchSources(
    ticker,
    context,
  );
  const facts = buildResearchFacts(ticker, sources);

  if (!hasMinimumFacts(facts)) {
    // Finnhub answers unknown tickers with HTTP 200 and empty payloads, so an
    // explicitly empty quote with no company is the real "no such ticker"
    // signal. If either required fact exists, a missing counterpart is source
    // degradation and must not be misreported as an invalid symbol.
    const quoteReturnedEmpty =
      !failedProviders.includes("quote") && facts.quote === undefined;
    const tickerLooksUnknown =
      quoteReturnedEmpty && facts.company === undefined;

    throw tickerLooksUnknown
      ? new ReportError("unknown_ticker", `no company or price data for ${ticker}`)
      : new ReportError(
          "sources_unavailable",
          "required company or quote data is unavailable",
          { failedProviders },
        );
  }

  const allowlist = buildNumericAllowlist(facts);
  let generatedReport: {
    narrative: ResearchNarrative;
    generated: GeneratedContentMeta;
    model: string;
  };
  try {
    generatedReport = await generateVerifiedNarrative(facts, allowlist, context);
  } catch (error) {
    console.error("research generation verification failed; using fallback:", error);
    generatedReport = deterministicResearchFallback(facts, error);
  }
  const { narrative, generated, model } = generatedReport;

  const generatedAt = new Date(generated.generatedAt);
  await db.insert(schema.reportsCache).values({
    ticker,
    facts: { facts, provenance, failedProviders },
    narrative,
    model,
    generatedAt,
    expiresAt: new Date(generatedAt.getTime() + CACHE_TTL_MS),
  });

  return {
    ticker,
    facts,
    narrative,
    provenance: agedProvenance(provenance),
    generated,
    failedProviders,
    cached: false,
  };
}
