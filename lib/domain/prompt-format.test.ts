import { describe, expect, it } from "vitest";

import { formatFactsForPrompt, roundForPrompt } from "./prompt-format";
import type { ResearchFacts } from "@/lib/research/facts";

describe("roundForPrompt", () => {
  it("rounds a raw float to at most 4 decimal places", () => {
    const rounded = roundForPrompt(1433132.8651042718);
    const decimals = rounded.toString().split(".")[1]?.length ?? 0;
    expect(decimals).toBeLessThanOrEqual(4);
  });

  it("leaves an integer unchanged", () => {
    expect(roundForPrompt(228)).toBe(228);
  });

  it("rounds floating-point noise like 4.569999999999999 to a clean value", () => {
    expect(roundForPrompt(4.569999999999999)).toBe(4.57);
  });
});

describe("formatFactsForPrompt", () => {
  it("leaves ticker strings alone", () => {
    const facts: ResearchFacts = { ticker: "AAPL" };
    expect(formatFactsForPrompt(facts).ticker).toBe("AAPL");
  });

  it("rounds a nested raw number to at most 4 decimal places", () => {
    const facts: ResearchFacts = {
      ticker: "TSLA",
      company: { name: "Tesla", marketCapMillions: 1433132.8651042718 },
    };
    const formatted = formatFactsForPrompt(facts);
    const value = formatted.company?.marketCapMillions ?? 0;
    const decimals = value.toString().split(".")[1]?.length ?? 0;
    expect(decimals).toBeLessThanOrEqual(4);
  });

  it("returns the same shape as the input facts", () => {
    const facts: ResearchFacts = {
      ticker: "AAPL",
      valuation: { peTTM: 34.700000001 },
    };
    expect(Object.keys(formatFactsForPrompt(facts))).toEqual(Object.keys(facts));
  });
});
