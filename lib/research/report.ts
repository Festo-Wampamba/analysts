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
): Promise<{
  sources: RawResearchSources;
  provenance: Provenance[];
  failedProviders: string[];
}> {
  const today = new Date().toISOString().slice(0, 10);

  const calls = {
    quote: getQuote(ticker),
    profile: getProfile(ticker),
    metrics: getMetrics(ticker),
    peers: getPeers(ticker),
    news: getCompanyNews(ticker, isoDaysAgo(NEWS_LOOKBACK_DAYS), today),
    recommendations: getRecommendations(ticker),
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
      { ticker: facts.ticker },
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

export async function getResearchReport(ticker: string): Promise<ResearchReport> {
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
      },
      failedProviders: payload.failedProviders,
      cached: true,
    };
  }

  const { sources, provenance, failedProviders } = await fetchResearchSources(ticker);
  const facts = buildResearchFacts(ticker, sources);

  if (!hasMinimumFacts(facts)) {
    // Finnhub answers unknown tickers with HTTP 200 and empty payloads, so an
    // empty identity/price pair is the real "no such ticker" signal.
    const providersUp = failedProviders.length < 6;
    throw providersUp
      ? new ReportError("unknown_ticker", `no company or price data for ${ticker}`)
      : new ReportError("sources_unavailable", "all data providers failed");
  }

  const allowlist = buildNumericAllowlist(facts);
  const { narrative, generated, model } = await generateVerifiedNarrative(
    facts,
    allowlist,
  );

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
