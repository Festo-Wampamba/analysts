import { describe, expect, it } from "vitest";

import { buildNumericCorrectionPrompt, buildResearchUserPrompt } from "./prompt";
import type { ResearchFacts } from "./facts";

const EXCESS_DECIMAL_PATTERN = /\d+\.\d{5,}/;

const facts: ResearchFacts = {
  ticker: "TSLA",
  company: { name: "Tesla", marketCapMillions: 1433132.8651042718 },
  quote: {
    price: 227.52,
    previousClose: 226.09,
    open: 225.0,
    dayHigh: 228.22,
    dayLow: 224.51,
    change: { value: 1.43, formatted: "+1.43", direction: "positive" },
    changePercent: {
      value: 4.569999999999999,
      formatted: "+4.57%",
      direction: "positive",
    },
  },
};

describe("buildResearchUserPrompt", () => {
  it("never interpolates a number with more than 4 decimal places", () => {
    const prompt = buildResearchUserPrompt(facts);
    expect(prompt).not.toMatch(EXCESS_DECIMAL_PATTERN);
  });
});

describe("buildNumericCorrectionPrompt", () => {
  it("never interpolates a number with more than 4 decimal places", () => {
    const prompt = buildNumericCorrectionPrompt(facts, ["394.3 billion"]);
    expect(prompt).not.toMatch(EXCESS_DECIMAL_PATTERN);
  });
});
