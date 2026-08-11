import { describe, expect, it } from "vitest";

import { normalizeTimeSeries } from "./alpha-vantage";

describe("normalizeTimeSeries", () => {
  it("sorts points chronologically and limits a seven-day view", () => {
    const rows = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => {
        const day = String(index + 1).padStart(2, "0");
        return [`2026-08-${day}`, { "4. close": String(100 + index) }];
      }).reverse(),
    );

    const result = normalizeTimeSeries("AAPL", "7d", {
      "Time Series (Daily)": rows,
    });

    expect(result.points).toHaveLength(7);
    expect(result.points[0]).toEqual({ timestamp: "2026-08-04", close: 103 });
    expect(result.asOf).toBe("2026-08-10");
  });

  it("surfaces provider quota notes as unavailable data", () => {
    expect(() => normalizeTimeSeries("AAPL", "1m", { Note: "limit reached" })).toThrow(
      "limit reached",
    );
  });
});
