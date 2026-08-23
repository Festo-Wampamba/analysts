import { describe, expect, it } from "vitest";

import { buildDailyIdeaUserPrompt } from "./prompt";
import type { DailyIdeaFacts } from "./types";

const EXCESS_DECIMAL_PATTERN = /\d+\.\d{5,}/;

describe("buildDailyIdeaUserPrompt", () => {
  it("never interpolates a number with more than 4 decimal places", () => {
    const facts = {
      ticker: "TSLA",
      company: { name: "Tesla", marketCapMillions: 1433132.8651042718 },
      metrics: { priceReturn13Week: 4.569999999999999, priceReturn26Week: 8.1 },
      factorScores: {
        growth: 0.5,
        profitability: 0.5,
        valuation: 0.5,
        financialStrength: 0.5,
        momentum: 0.5,
        sentiment: 0.5,
        insiderActivity: 0.5,
      },
      compositeScore: 0.5,
      coverage: 1,
      threshold: 0.65,
      universeEvaluated: 54,
    } satisfies DailyIdeaFacts;

    const prompt = buildDailyIdeaUserPrompt(facts);

    expect(prompt).not.toMatch(EXCESS_DECIMAL_PATTERN);
  });

  it("uses semantic period labels without embedding week counts in metric keys", () => {
    const facts = {
      ticker: "AAPL",
      metrics: { priceReturn13Week: 4.2, priceReturn26Week: 8.1 },
      factorScores: {
        growth: 0.5,
        profitability: 0.5,
        valuation: 0.5,
        financialStrength: 0.5,
        momentum: 0.5,
        sentiment: 0.5,
        insiderActivity: 0.5,
      },
      compositeScore: 0.5,
      coverage: 1,
      threshold: 0.65,
      universeEvaluated: 54,
    } satisfies DailyIdeaFacts;

    const prompt = buildDailyIdeaUserPrompt(facts);

    expect(prompt).toContain("quarterPriceReturnPercent");
    expect(prompt).toContain("halfYearPriceReturnPercent");
    expect(prompt).not.toContain("priceReturn13Week");
    expect(prompt).not.toContain("priceReturn26Week");
  });
});
