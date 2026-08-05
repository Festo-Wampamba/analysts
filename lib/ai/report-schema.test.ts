import { describe, expect, it } from "vitest";

import { dailyIdeaNarrativeSchema, researchNarrativeSchema } from "./report-schema";

const validResearch = {
  overview: "Designs and sells consumer devices.",
  businessModel: "Hardware margins funded by a growing services attach.",
  financialPerformance: "Revenue grew with stable margins.",
  balanceSheet: "Net cash position with modest leverage.",
  valuation: "Trades at a premium to peers.",
  peers: "Competes with large platform vendors.",
  recentDevelopments: "Launched a new product line.",
  growthDrivers: "Services expansion and emerging markets.",
  catalysts: "Earnings release and product event.",
  risks: ["Regulatory pressure on the app store."],
  scenarios: [
    { label: "bull", summary: "Services accelerate." },
    { label: "base", summary: "Steady growth continues." },
    { label: "bear", summary: "Hardware demand softens." },
  ],
  thesis: "Quality compounder at a full price.",
  limitations: ["Based on free-tier data only."],
};

describe("researchNarrativeSchema", () => {
  it("accepts a complete narrative", () => {
    expect(researchNarrativeSchema.safeParse(validResearch).success).toBe(true);
  });

  it("rejects a narrative missing a section", () => {
    const withoutThesis: Partial<typeof validResearch> = { ...validResearch };
    delete withoutThesis.thesis;
    expect(researchNarrativeSchema.safeParse(withoutThesis).success).toBe(false);
  });

  it("rejects fewer than three scenarios", () => {
    const twoScenarios = { ...validResearch, scenarios: validResearch.scenarios.slice(0, 2) };
    expect(researchNarrativeSchema.safeParse(twoScenarios).success).toBe(false);
  });

  it("rejects an empty risks list", () => {
    expect(
      researchNarrativeSchema.safeParse({ ...validResearch, risks: [] }).success,
    ).toBe(false);
  });
});

describe("dailyIdeaNarrativeSchema", () => {
  const validIdea = {
    selectionReason: "Top composite score with full data coverage.",
    thesisPoints: ["Growing revenue.", "Expanding margins.", "Cheap vs peers."],
    keyCatalyst: "Earnings next week.",
    bullCase: "Re-rating on margin expansion.",
    bearCase: "Macro slowdown hits demand.",
    risks: ["Customer concentration."],
    confidenceRationale: "High coverage across all factors.",
  };

  it("accepts a complete daily idea narrative", () => {
    expect(dailyIdeaNarrativeSchema.safeParse(validIdea).success).toBe(true);
  });

  it("rejects a thesis without exactly three points", () => {
    const fourPoints = { ...validIdea, thesisPoints: [...validIdea.thesisPoints, "Extra."] };
    expect(dailyIdeaNarrativeSchema.safeParse(fourPoints).success).toBe(false);
  });
});
