import {
  directionalDelta,
  directionalPercent,
  type DirectionalValue,
} from "@/lib/domain/directional";
import { metricNumber, quoteLooksEmpty } from "@/lib/source/finnhub-schemas";
import type {
  Metrics,
  NewsItem,
  Peers,
  Profile,
  Quote,
  Recommendations,
} from "@/lib/source/finnhub-schemas";
import { sanitizeSourceText, sanitizeSourceUrl } from "@/lib/ai/guards";

// The sourced-facts snapshot: everything the report may state as fact.
// Anything absent here cannot legitimately appear in generated prose — the
// numeric guard enforces exactly that using `numericAllowlist`.

export type ResearchFacts = {
  ticker: string;
  company?: {
    name: string;
    exchange?: string;
    industry?: string;
    country?: string;
    ipo?: string;
    weburl?: string;
    currency?: string;
    marketCapMillions?: number;
    sharesOutstandingMillions?: number;
  };
  quote?: {
    price: number;
    previousClose: number;
    open: number;
    dayHigh: number;
    dayLow: number;
    change: DirectionalValue;
    changePercent: DirectionalValue;
  };
  valuation?: Record<string, number>;
  profitability?: Record<string, number>;
  growth?: Record<string, number>;
  balanceSheet?: Record<string, number>;
  momentum?: Record<string, number>;
  peers?: string[];
  news?: { headline: string; source: string; url: string; date: string }[];
  analystRecommendations?: {
    period: string;
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
  };
};

// Finnhub metric keys are inconsistent (one contains a slash); map them once
// here so the rest of the codebase uses stable domain names.
const VALUATION_KEYS: Record<string, string> = {
  peTTM: "peTTM",
  psTTM: "psTTM",
  pbQuarterly: "pbQuarterly",
  evToFreeCashFlowTTM: "currentEv/freeCashFlowTTM",
  dividendYieldPercent: "dividendYieldIndicatedAnnual",
};

const PROFITABILITY_KEYS: Record<string, string> = {
  grossMarginTTM: "grossMarginTTM",
  operatingMarginTTM: "operatingMarginTTM",
  netProfitMarginTTM: "netProfitMarginTTM",
  roeTTM: "roeTTM",
  roaTTM: "roaTTM",
};

const GROWTH_KEYS: Record<string, string> = {
  revenueGrowthTTMYoy: "revenueGrowthTTMYoy",
  epsGrowthTTMYoy: "epsGrowthTTMYoy",
  revenueGrowth5Y: "revenueGrowth5Y",
  epsGrowth5Y: "epsGrowth5Y",
};

const BALANCE_SHEET_KEYS: Record<string, string> = {
  debtToEquityQuarterly: "totalDebt/totalEquityQuarterly",
  currentRatioQuarterly: "currentRatioQuarterly",
  quickRatioQuarterly: "quickRatioQuarterly",
};

const MOMENTUM_KEYS: Record<string, string> = {
  priceReturn13Week: "13WeekPriceReturnDaily",
  priceReturn26Week: "26WeekPriceReturnDaily",
  priceReturn52Week: "52WeekPriceReturnDaily",
  week52High: "52WeekHigh",
  week52Low: "52WeekLow",
  beta: "beta",
};

function pickMetrics(
  metrics: Metrics,
  keyMap: Record<string, string>,
): Record<string, number> | undefined {
  const out: Record<string, number> = {};
  for (const [domainKey, finnhubKey] of Object.entries(keyMap)) {
    const value = metricNumber(metrics, finnhubKey);
    if (value !== undefined) out[domainKey] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export type RawResearchSources = {
  quote?: Quote;
  profile?: Profile;
  metrics?: Metrics;
  peers?: Peers;
  news?: NewsItem[];
  recommendations?: Recommendations;
};

const MAX_NEWS_ITEMS = 8;

export function buildResearchFacts(
  ticker: string,
  sources: RawResearchSources,
): ResearchFacts {
  const facts: ResearchFacts = { ticker };

  if (sources.profile) {
    const p = sources.profile;
    facts.company = {
      name: p.name,
      exchange: p.exchange,
      industry: p.finnhubIndustry,
      country: p.country,
      ipo: p.ipo,
      weburl: p.weburl,
      currency: p.currency,
      marketCapMillions: p.marketCapitalization,
      sharesOutstandingMillions: p.shareOutstanding,
    };
  }

  if (sources.quote && !quoteLooksEmpty(sources.quote)) {
    const q = sources.quote;
    // Finnhub omits d/dp outside regular hours; derive from closes instead of
    // dropping the change entirely.
    const change = q.d ?? q.c - q.pc;
    const changePercent = q.dp ?? (q.pc === 0 ? 0 : (change / q.pc) * 100);
    facts.quote = {
      price: q.c,
      previousClose: q.pc,
      open: q.o,
      dayHigh: q.h,
      dayLow: q.l,
      change: directionalDelta(change, "vs previous close"),
      changePercent: directionalPercent(changePercent, "vs previous close"),
    };
  }

  if (sources.metrics) {
    facts.valuation = pickMetrics(sources.metrics, VALUATION_KEYS);
    facts.profitability = pickMetrics(sources.metrics, PROFITABILITY_KEYS);
    facts.growth = pickMetrics(sources.metrics, GROWTH_KEYS);
    facts.balanceSheet = pickMetrics(sources.metrics, BALANCE_SHEET_KEYS);
    facts.momentum = pickMetrics(sources.metrics, MOMENTUM_KEYS);
  }

  if (sources.peers?.length) {
    // Finnhub includes the queried ticker in its own peer list.
    facts.peers = sources.peers.filter((p) => p !== ticker).slice(0, 10);
  }

  if (sources.news?.length) {
    facts.news = sources.news
      .filter((item) =>
        item.related
          ?.split(",")
          .map((symbol) => symbol.trim().toUpperCase())
          .includes(ticker.toUpperCase()),
      )
      .slice(0, MAX_NEWS_ITEMS)
      .flatMap((item) => {
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

  if (sources.recommendations?.length) {
    const [latest] = sources.recommendations;
    facts.analystRecommendations = {
      period: latest.period,
      strongBuy: latest.strongBuy,
      buy: latest.buy,
      hold: latest.hold,
      sell: latest.sell,
      strongSell: latest.strongSell,
    };
  }

  return facts;
}

// Every finite number reachable in the facts snapshot, so the guard can't
// drift out of sync with what the model was actually shown.
function collectNumbers(value: unknown, into: Set<number>): void {
  if (typeof value === "number") {
    if (Number.isFinite(value)) into.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectNumbers(item, into);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectNumbers(item, into);
  }
}

export function buildNumericAllowlist(facts: ResearchFacts): number[] {
  const allowed = new Set<number>();
  collectNumbers(facts, allowed);

  // Finnhub reports market cap and share count in millions; prose will say
  // "$3.4 trillion" or "15.1 billion shares", so allow the expanded units too.
  for (const millions of [
    facts.company?.marketCapMillions,
    facts.company?.sharesOutstandingMillions,
  ]) {
    if (millions !== undefined) allowed.add(millions * 1e6);
  }

  // Analyst counts are also legitimately summed in prose ("28 of 40 analysts").
  const rec = facts.analystRecommendations;
  if (rec) {
    allowed.add(rec.strongBuy + rec.buy);
    allowed.add(rec.strongBuy + rec.buy + rec.hold + rec.sell + rec.strongSell);
  }

  return [...allowed];
}

export function hasMinimumFacts(facts: ResearchFacts): boolean {
  // A report needs at least an identity and a price to be worth generating.
  return facts.company !== undefined && facts.quote !== undefined;
}
