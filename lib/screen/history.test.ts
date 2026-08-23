import { describe, expect, it } from "vitest";

import { percentageChange } from "./history";

describe("percentageChange", () => {
  it("compares current price with selection price", () => {
    expect(percentageChange(100, 112.5)).toBe(12.5);
  });

  it("returns null when a price is missing or unusable", () => {
    expect(percentageChange(null, 112.5)).toBeNull();
    expect(percentageChange(0, 112.5)).toBeNull();
  });
});
