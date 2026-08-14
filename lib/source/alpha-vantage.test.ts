import { describe, expect, it } from "vitest";

import { normalizeTimeSeries } from "./alpha-vantage";

describe("normalizeTimeSeries", () => {
  it("sorts points chronologically and limits a five-day view", () => {
    const rows = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => {
        const day = String(index + 1).padStart(2, "0");
        return [`2026-08-${day}`, { "4. close": String(100 + index) }];
      }).reverse(),
    );

    const result = normalizeTimeSeries("AAPL", "5d", {
      "Time Series (Daily)": rows,
    });

    expect(result.points).toHaveLength(5);
    expect(result.points[0]).toEqual({ timestamp: "2026-08-06T20:00:00.000Z", close: 105 });
    expect(result.asOf).toBe("2026-08-10T20:00:00.000Z");
  });

  it("normalizes intraday Eastern timestamps into sortable UTC points", () => {
    const result = normalizeTimeSeries("AAPL", "1d", {
      "Time Series (5min)": {
        "2026-08-11 16:00:00": { "4. close": "220.01" },
        "2026-08-11 09:30:00": { "4. close": "214.50" },
      },
    });

    expect(result.points).toEqual([
      { timestamp: "2026-08-11T13:30:00.000Z", close: 214.5 },
      { timestamp: "2026-08-11T20:00:00.000Z", close: 220.01 },
    ]);
    expect(result.asOf).toBe("2026-08-11T20:00:00.000Z");
  });

  it("surfaces provider quota notes as unavailable data", () => {
    expect(() => normalizeTimeSeries("AAPL", "1m", { Note: "limit reached" })).toThrow(
      "limit reached",
    );
  });
});
