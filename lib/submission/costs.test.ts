import { describe, expect, it } from "vitest";

import {
  MONTHLY_REPORT_COUNT,
  TYPICAL_MONTHLY_LLM_COST_USD,
  TYPICAL_REPORT_COST_USD,
  estimateGenerationCostUsd,
} from "./costs";

describe("submission cost estimates", () => {
  it("prices input and output tokens independently", () => {
    expect(estimateGenerationCostUsd(4_000, 1_000)).toBeCloseTo(0.0012, 8);
  });

  it("keeps the documented monthly scenario reproducible", () => {
    expect(MONTHLY_REPORT_COUNT).toBe(122);
    expect(TYPICAL_REPORT_COST_USD).toBeCloseTo(0.0012, 8);
    expect(TYPICAL_MONTHLY_LLM_COST_USD).toBeCloseTo(0.1464, 8);
  });
});
