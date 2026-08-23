import { describe, expect, it } from "vitest";

import { removeStatementDashes } from "./text";

describe("removeStatementDashes", () => {
  it("replaces em and en dash punctuation without changing hyphens or minus signs", () => {
    expect(removeStatementDashes("Provider unavailable — showing sourced data"))
      .toBe("Provider unavailable: showing sourced data");
    expect(removeStatementDashes("Five–year history uses post-market data"))
      .toBe("Five: year history uses post-market data");
    expect(removeStatementDashes("AI-generated at -2.13%"))
      .toBe("AI-generated at -2.13%");
  });
});
