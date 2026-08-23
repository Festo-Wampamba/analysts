import { describe, expect, it } from "vitest";

import {
  buildNumericAllowlist,
  buildResearchFacts,
  hasMinimumFacts,
  type RawResearchSources,
  type ResearchFacts,
} from "./facts";
import { verifyNumericClaims } from "@/lib/ai/guards";

const quote = {
  c: 227.52,
  d: 1.43,
  dp: 0.6325,
  h: 228.22,
  l: 224.51,
  o: 225.0,
  pc: 226.09,
  t: 1754332800,
};

const profile = {
  name: "Apple Inc",
  ticker: "AAPL",
  exchange: "NASDAQ NMS - GLOBAL MARKET",
  finnhubIndustry: "Technology",
  marketCapitalization: 3435497.15,
  shareOutstanding: 15115.82,
  currency: "USD",
  country: "US",
  ipo: "1980-12-12",
  weburl: "https://www.apple.com/",
};

const metrics = {
  metric: {
    peTTM: 34.7,
    psTTM: 8.9,
    netProfitMarginTTM: 24.3,
    roeTTM: 147.2,
    revenueGrowthTTMYoy: 6.1,
    "totalDebt/totalEquityQuarterly": 1.87,
    currentRatioQuarterly: 0.87,
    "13WeekPriceReturnDaily": 5.4,
    "52WeekHigh": 260.1,
    beta: 1.21,
    unusedKey: "not a number",
  },
};

const sources: RawResearchSources = {
  quote,
  profile,
  metrics,
  peers: ["AAPL", "MSFT", "GOOGL"],
  news: [
    {
      id: 1,
      datetime: 1754332800,
      headline: "Apple  beats\nQ3 estimates",
      source: "Reuters",
      summary: "s",
      url: "https://example.com/a",
      related: "AAPL",
    },
  ],
  recommendations: [
    {
      period: "2026-08-01",
      strongBuy: 12,
      buy: 16,
      hold: 9,
      sell: 2,
      strongSell: 1,
      symbol: "AAPL",
    },
  ],
};

describe("buildResearchFacts", () => {
  it("maps the profile into company identity", () => {
    const facts = buildResearchFacts("AAPL", sources);
    expect(facts.company).toMatchObject({ name: "Apple Inc", industry: "Technology" });
  });

  it("derives a directional change from the quote", () => {
    const facts = buildResearchFacts("AAPL", sources);
    expect(facts.quote?.change).toMatchObject({ value: 1.43, direction: "positive" });
  });

  it("derives the change from closes when Finnhub omits it after hours", () => {
    const facts = buildResearchFacts("AAPL", {
      quote: { ...quote, d: null, dp: null },
    });
    expect(facts.quote?.change.value).toBeCloseTo(1.43, 2);
  });

  it("omits the quote entirely for the all-zero unknown-ticker payload", () => {
    const facts = buildResearchFacts("NOPE", {
      quote: { c: 0, d: null, dp: null, h: 0, l: 0, o: 0, pc: 0, t: 0 },
    });
    expect(facts.quote).toBeUndefined();
  });

  it("maps the slash-keyed debt metric to a stable domain name", () => {
    const facts = buildResearchFacts("AAPL", sources);
    expect(facts.balanceSheet?.debtToEquityQuarterly).toBe(1.87);
  });

  it("skips metric keys whose values are not numbers", () => {
    const facts = buildResearchFacts("AAPL", sources);
    expect(facts.momentum).not.toHaveProperty("unusedKey");
  });

  it("removes the queried ticker from its own peer list", () => {
    const facts = buildResearchFacts("AAPL", sources);
    expect(facts.peers).toEqual(["MSFT", "GOOGL"]);
  });

  it("sanitizes news headlines before they reach the prompt", () => {
    const facts = buildResearchFacts("AAPL", sources);
    expect(facts.news?.[0].headline).toBe("Apple beats Q3 estimates");
  });

  it("keeps only the latest analyst recommendation period", () => {
    const facts = buildResearchFacts("AAPL", sources);
    expect(facts.analystRecommendations?.period).toBe("2026-08-01");
  });

  it("returns a bare snapshot when every provider failed", () => {
    expect(buildResearchFacts("AAPL", {})).toEqual({ ticker: "AAPL" });
  });
});

describe("hasMinimumFacts", () => {
  it("accepts a snapshot with identity and price", () => {
    expect(hasMinimumFacts(buildResearchFacts("AAPL", sources))).toBe(true);
  });

  it("rejects a snapshot missing the price", () => {
    expect(hasMinimumFacts(buildResearchFacts("AAPL", { profile }))).toBe(false);
  });
});

describe("buildNumericAllowlist", () => {
  const facts = buildResearchFacts("AAPL", sources);
  const allowlist = buildNumericAllowlist(facts);

  it("allows a price quoted straight from the facts", () => {
    expect(verifyNumericClaims("trading at 227.52", allowlist).ok).toBe(true);
  });

  it("allows a metric nested inside a facts sub-object", () => {
    expect(verifyNumericClaims("a P/E of 34.7", allowlist).ok).toBe(true);
  });

  it("allows market cap restated in trillions from the millions figure", () => {
    expect(verifyNumericClaims("worth about $3.44 trillion", allowlist).ok).toBe(true);
  });

  it("allows a summed analyst count", () => {
    expect(verifyNumericClaims("28 analysts rate it a buy", allowlist).ok).toBe(true);
  });

  it("rejects a plausible but unsourced figure", () => {
    expect(verifyNumericClaims("revenue of $394.3 billion", allowlist).ok).toBe(false);
  });

  it("rejects a fabricated price target", () => {
    expect(verifyNumericClaims("price target of 310.00", allowlist).ok).toBe(false);
  });

  it("includes numbers echoed from sourced news headlines", () => {
    const factsWithNews: ResearchFacts = {
      ticker: "AAPL",
      news: [
        {
          headline: "price hikes above 15%",
          source: "Reuters",
          url: "https://example.com/a",
          date: "2026-08-01",
        },
      ],
    };
    expect(buildNumericAllowlist(factsWithNews)).toContain(15);
  });
});
