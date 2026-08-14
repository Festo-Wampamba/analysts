import { and, desc, eq, gt } from "drizzle-orm";

import { groqJson } from "@/lib/ai/groq";
import { verifyNumericClaims } from "@/lib/ai/guards";
import {
  researchNarrativeSchema,
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
  type RawResearchSources,
  type ResearchFacts,
} from "./facts";
import { buildNumericCorrectionPrompt, buildResearchUserPrompt, RESEARCH_SYSTEM_PROMPT } from "./prompt";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const QUOTE_FRESHNESS_MS = 15 * 60 * 1000;
const NEWS_LOOKBACK_DAYS = 30;

export class ReportError extends Error {
  readonly code: "unknown_ticker" | "sources_unavailable" | "unverifiable_numbers";
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
function narrativeToText(narrative: ResearchNarrative): string {
  const { risks, scenarios, limitations, ...prose } = narrative;
  return [
    ...Object.values(prose),
    ...risks,
    ...scenarios.map((s) => s.summary),
    ...limitations,
  ].join("\n");
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

  const attempt = async (user: string) => {
    const result = await groqJson(
      {
        system: RESEARCH_SYSTEM_PROMPT,
        user,
        outputSchema: researchNarrativeSchema,
        basedOn,
      },
      { ticker: facts.ticker, ...context },
    );
    const guard = verifyNumericClaims(narrativeToText(result.data), allowlist);
    return { result, guard };
  };

  const first = await attempt(buildResearchUserPrompt(facts));
  if (first.guard.ok) {
    return {
      narrative: first.result.data,
      generated: first.result.meta,
      model: first.result.model,
    };
  }

  // One corrective retry naming the rejected figures; models usually comply
  // once the specific offending strings are quoted back at them.
  const offending = first.guard.violations.map((v) => v.raw);
  const second = await attempt(buildNumericCorrectionPrompt(facts, offending));
  if (!second.guard.ok) {
    throw new ReportError(
      "unverifiable_numbers",
      "generated report contained figures absent from the sourced facts",
      { violations: second.guard.violations.map((v) => v.raw) },
    );
  }

  return {
    narrative: second.result.data,
    generated: second.result.meta,
    model: second.result.model,
  };
}

function deterministicResearchFallback(facts: ResearchFacts): {
  narrative: ResearchNarrative;
  generated: GeneratedContentMeta;
  model: string;
} {
  const company = facts.company?.name ?? facts.ticker;
  const hasNews = !!facts.news?.length;
  return {
    narrative: {
      overview: `${company} is presented from the sourced company profile and market-data snapshot available to this report.`,
      businessModel:
        "Use the company profile and filing-derived financials to assess how the business earns revenue; source coverage may not describe every segment.",
      financialPerformance:
        "Reported financial values should be read directly from the sourced financial table and compared on matching fiscal periods.",
      balanceSheet:
        "Balance-sheet conclusions are limited to the available sourced liquidity and leverage measures.",
      valuation:
        "The valuation table shows the available market multiples without adding a model-derived target price.",
      peers:
        "Peer comparisons are relative snapshots and may be incomplete when a provider omits a company or metric.",
      recentDevelopments: hasNews
        ? "Recent company-related coverage is listed in the catalyst section and should be verified at the linked source."
        : "No relevant recent company coverage was available from the configured source.",
      growthDrivers:
        "Potential growth drivers should be evaluated against the sourced growth, profitability, and market-position evidence.",
      catalysts: hasNews
        ? "Relevant dated company developments and scheduled earnings are the primary observable catalysts."
        : "Scheduled earnings are the primary dated catalyst available to this report.",
      risks: [
        "Market-data and filing coverage can be incomplete or delayed.",
        "Relative valuation and momentum can change before the next report refresh.",
      ],
      scenarios: [
        { label: "bull", summary: "The constructive case requires operating strengths and relevant catalysts to develop favorably." },
        { label: "base", summary: "The central case assumes current operating trends remain broadly intact." },
        { label: "bear", summary: "The adverse case reflects weakening fundamentals, expectations, or company-specific developments." },
      ],
      thesis:
        "The investment case should be based on the sourced operating evidence, valuation context, and identified risks rather than generated forecasts.",
      limitations: ["Model output failed factual verification, so deterministic explanatory text is shown."],
    },
    generated: {
      generatedAt: new Date().toISOString(),
      basedOn: Object.keys(facts).filter((key) => key !== "ticker"),
      modelLabel: "deterministic-safety-fallback",
      limitations: ["Model output failed factual verification."],
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
    generatedReport = deterministicResearchFallback(facts);
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
