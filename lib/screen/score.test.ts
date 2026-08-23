import { describe, expect, it } from "vitest";

import {
  DEFAULT_SCORING_CONFIG,
  leadingEvidence,
  scoreCandidates,
  type CandidateInput,
  type ScoringConfig,
} from "./score";

// Full-coverage metrics so single-factor tests can vary one dimension.
function metrics(overrides: Partial<CandidateInput["metrics"]> = {}) {
  return {
    revenueGrowthTTMYoy: 10,
    epsGrowthTTMYoy: 10,
    netProfitMarginTTM: 15,
    roeTTM: 20,
    peTTM: 20,
    psTTM: 3,
    debtToEquityQuarterly: 0.5,
    currentRatioQuarterly: 1.5,
    priceReturn13Week: 5,
    priceReturn26Week: 8,
    analystBuyRatio: 0.6,
    insiderNetShareChange: 1_000,
    ...overrides,
  };
}

function candidate(
  ticker: string,
  overrides: Partial<CandidateInput["metrics"]> = {},
): CandidateInput {
  return { ticker, metrics: metrics(overrides) };
}

const permissive: ScoringConfig = {
  ...DEFAULT_SCORING_CONFIG,
  threshold: 0,
  minCoverage: 0,
};

describe("scoreCandidates ordering", () => {
  it("returns an empty array for an empty universe", () => {
    expect(scoreCandidates([])).toEqual([]);
  });

  it("ranks the candidate that dominates every factor first", () => {
    const strong = candidate("STRONG", {
      revenueGrowthTTMYoy: 40,
      epsGrowthTTMYoy: 45,
      netProfitMarginTTM: 30,
      roeTTM: 35,
      peTTM: 12,
      psTTM: 2,
      debtToEquityQuarterly: 0.2,
      currentRatioQuarterly: 2.5,
      priceReturn13Week: 20,
      priceReturn26Week: 30,
      analystBuyRatio: 0.9,
      insiderNetShareChange: 50_000,
    });
    const weak = candidate("WEAK", {
      revenueGrowthTTMYoy: -5,
      epsGrowthTTMYoy: -10,
      netProfitMarginTTM: 2,
      roeTTM: 3,
      peTTM: 60,
      psTTM: 9,
      debtToEquityQuarterly: 3,
      currentRatioQuarterly: 0.8,
      priceReturn13Week: -15,
      priceReturn26Week: -20,
      analystBuyRatio: 0.2,
      insiderNetShareChange: -50_000,
    });
    const [first] = scoreCandidates([weak, strong], permissive);
    expect(first.ticker).toBe("STRONG");
  });

  it("breaks composite-score ties by ticker ascending", () => {
    const result = scoreCandidates([candidate("ZZZ"), candidate("AAA")], permissive);
    expect(result.map((c) => c.ticker)).toEqual(["AAA", "ZZZ"]);
  });
});

describe("leadingEvidence", () => {
  it("keeps deterministic leading-factor evidence separate from catalyst prose", () => {
    expect(leadingEvidence({ growth: 0.8, momentum: 0.6, valuation: null })).toEqual({
      factor: "growth",
      score: 0.8,
      label: "Growth",
      summary: "Growth led the relative screen with a 0.80 factor score.",
    });
  });
});

describe("factor direction", () => {
  it("scores the lower P/E as the better valuation", () => {
    const cheap = candidate("CHEAP", { peTTM: 8, psTTM: 1 });
    const expensive = candidate("RICH", { peTTM: 80, psTTM: 12 });
    const result = scoreCandidates([cheap, expensive], permissive);
    const byTicker = Object.fromEntries(result.map((c) => [c.ticker, c]));
    expect(byTicker.CHEAP.subScores.valuation!).toBeGreaterThan(
      byTicker.RICH.subScores.valuation!,
    );
  });

  it("scores higher revenue growth as better growth", () => {
    const fast = candidate("FAST", { revenueGrowthTTMYoy: 50, epsGrowthTTMYoy: 60 });
    const slow = candidate("SLOW", { revenueGrowthTTMYoy: 1, epsGrowthTTMYoy: 2 });
    const result = scoreCandidates([fast, slow], permissive);
    const byTicker = Object.fromEntries(result.map((c) => [c.ticker, c]));
    expect(byTicker.FAST.subScores.growth!).toBeGreaterThan(
      byTicker.SLOW.subScores.growth!,
    );
  });

  it("scores net insider selling below net insider buying", () => {
    const buying = candidate("BUY", { insiderNetShareChange: 10_000 });
    const selling = candidate("SELL", { insiderNetShareChange: -10_000 });
    const result = scoreCandidates([buying, selling], permissive);
    const byTicker = Object.fromEntries(result.map((c) => [c.ticker, c]));
    expect(byTicker.BUY.subScores.insiderActivity!).toBeGreaterThan(
      byTicker.SELL.subScores.insiderActivity!,
    );
  });
});

describe("degenerate raw values", () => {
  it("excludes negative P/E from valuation instead of ranking it as cheap", () => {
    const losing = candidate("LOSS", { peTTM: -5, psTTM: undefined });
    const modest = candidate("OK", { peTTM: 25, psTTM: undefined });
    const result = scoreCandidates([losing, modest], permissive);
    const loss = result.find((c) => c.ticker === "LOSS")!;
    expect(loss.subScores.valuation).toBeNull();
  });

  it("excludes negative debt-to-equity instead of ranking it as low leverage", () => {
    const negativeEquity = candidate("NEGEQ", {
      debtToEquityQuarterly: -2,
      currentRatioQuarterly: undefined,
    });
    const result = scoreCandidates([negativeEquity, candidate("OK")], permissive);
    const negeq = result.find((c) => c.ticker === "NEGEQ")!;
    expect(negeq.subScores.financialStrength).toBeNull();
  });
});

describe("missing data handling", () => {
  it("nulls a factor when no component has data", () => {
    const bare = candidate("BARE", {
      analystBuyRatio: undefined,
    });
    const [scored] = scoreCandidates([bare], permissive);
    expect(scored.subScores.sentiment).toBeNull();
  });

  it("reports full coverage when every factor has data", () => {
    const [scored] = scoreCandidates([candidate("FULL")], permissive);
    expect(scored.coverage).toBe(1);
  });

  it("reduces coverage by the missing factor's weight", () => {
    const missingSentiment = candidate("PART", { analystBuyRatio: undefined });
    const [scored] = scoreCandidates([missingSentiment], permissive);
    expect(scored.coverage).toBe(0.95);
  });

  it("renormalizes the composite over available factors only", () => {
    // Single candidate: every defined factor percentiles to 0.5, so the
    // composite must stay 0.5 no matter which factors are missing.
    const partial = candidate("PART", {
      analystBuyRatio: undefined,
      insiderNetShareChange: undefined,
    });
    const [scored] = scoreCandidates([partial], permissive);
    expect(scored.compositeScore).toBe(0.5);
  });

  it("scores a candidate with no data at zero composite", () => {
    const empty: CandidateInput = { ticker: "NONE", metrics: {} };
    const [scored] = scoreCandidates([empty], permissive);
    expect(scored).toMatchObject({ compositeScore: 0, coverage: 0 });
  });
});

describe("qualification", () => {
  it("disqualifies a top score built on thin coverage", () => {
    const thin: CandidateInput = {
      ticker: "THIN",
      metrics: { priceReturn13Week: 50, priceReturn26Week: 80 },
    };
    const config: ScoringConfig = { ...DEFAULT_SCORING_CONFIG, threshold: 0.4 };
    const result = scoreCandidates([thin, candidate("FULL")], config);
    const thinScored = result.find((c) => c.ticker === "THIN")!;
    expect(thinScored.qualified).toBe(false);
  });

  it("disqualifies every candidate when none clears the threshold", () => {
    const config: ScoringConfig = { ...DEFAULT_SCORING_CONFIG, threshold: 0.99 };
    const result = scoreCandidates([candidate("AAA"), candidate("BBB")], config);
    expect(result.every((c) => !c.qualified)).toBe(true);
  });

  it("qualifies a candidate meeting both threshold and coverage", () => {
    const strong = candidate("STRONG", { revenueGrowthTTMYoy: 40 });
    const weak = candidate("WEAK", { revenueGrowthTTMYoy: -5 });
    const config: ScoringConfig = {
      ...DEFAULT_SCORING_CONFIG,
      threshold: 0.5,
      minCoverage: 0.9,
    };
    const [first] = scoreCandidates([strong, weak], config);
    expect(first.qualified).toBe(true);
  });
});

describe("determinism and bounds", () => {
  it("produces identical output for identical input", () => {
    const universe = [candidate("AAA"), candidate("BBB", { peTTM: 10 })];
    expect(scoreCandidates(universe, permissive)).toEqual(
      scoreCandidates(universe, permissive),
    );
  });

  it("keeps every score inside [0, 1] rounded to 4 decimals", () => {
    const universe = [
      candidate("AAA", { revenueGrowthTTMYoy: 33.33333 }),
      candidate("BBB", { revenueGrowthTTMYoy: -11.11111 }),
      candidate("CCC", { revenueGrowthTTMYoy: 7.77777 }),
    ];
    const all = scoreCandidates(universe, permissive).flatMap((c) => [
      c.compositeScore,
      c.coverage,
      ...Object.values(c.subScores).filter((s): s is number => s !== null),
    ]);
    expect(
      all.every((s) => s >= 0 && s <= 1 && s === Math.round(s * 10_000) / 10_000),
    ).toBe(true);
  });
});
