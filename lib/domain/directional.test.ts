import { describe, expect, it } from "vitest";

import {
  chartDirection,
  directionalDelta,
  directionalPercent,
  formatDelta,
  formatPercent,
  toDirection,
} from "./directional";

describe("toDirection", () => {
  it("maps a positive value to positive", () => {
    expect(toDirection(0.01)).toBe("positive");
  });

  it("maps a negative value to negative", () => {
    expect(toDirection(-0.01)).toBe("negative");
  });

  it("maps zero to neutral", () => {
    expect(toDirection(0)).toBe("neutral");
  });
});

describe("chartDirection", () => {
  it("is positive when lastClose exceeds firstClose", () => {
    expect(chartDirection(100, 101.5)).toBe("positive");
  });

  it("is negative when lastClose is below firstClose", () => {
    expect(chartDirection(100, 99.5)).toBe("negative");
  });

  it("is neutral when the period is flat", () => {
    expect(chartDirection(100, 100)).toBe("neutral");
  });
});

describe("formatDelta", () => {
  it("prefixes gains with an explicit plus sign", () => {
    expect(formatDelta(1.236)).toBe("+1.24");
  });

  it("keeps the minus sign on losses", () => {
    expect(formatDelta(-0.5)).toBe("-0.50");
  });

  it("shows zero without a sign", () => {
    expect(formatDelta(0)).toBe("0.00");
  });
});

describe("formatPercent", () => {
  it("appends a percent symbol to the signed value", () => {
    expect(formatPercent(0.63)).toBe("+0.63%");
  });
});

describe("directionalDelta", () => {
  it("bundles value, formatted string, and direction", () => {
    expect(directionalDelta(1.24, "vs previous close")).toEqual({
      value: 1.24,
      formatted: "+1.24",
      direction: "positive",
      comparisonLabel: "vs previous close",
    });
  });
});

describe("directionalPercent", () => {
  it("derives a negative direction from a negative percent", () => {
    expect(directionalPercent(-2.1).direction).toBe("negative");
  });
});
