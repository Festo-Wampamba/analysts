import { describe, expect, it } from "vitest";

import { normalizeTwelveDataSeries } from "./twelve-data";

describe("normalizeTwelveDataSeries", () => {
  it("uses the provider exchange timezone and sorts five-minute bars", () => {
    const result = normalizeTwelveDataSeries("AAPL", "1d", {
      status: "ok",
      meta: { exchange_timezone: "America/New_York" },
      values: [
        { datetime: "2026-08-13 15:55:00", close: "305.32001" },
        { datetime: "2026-08-13 09:30:00", close: "301.25" },
      ],
    });

    expect(result.points).toEqual([
      { timestamp: "2026-08-13T13:30:00.000Z", close: 301.25 },
      { timestamp: "2026-08-13T19:55:00.000Z", close: 305.32001 },
    ]);
    expect(result.asOf).toBe("2026-08-13T19:55:00.000Z");
  });

  it("surfaces a provider-side error without pretending a chart exists", () => {
    expect(() => normalizeTwelveDataSeries("AAPL", "1d", {
      status: "error",
      code: 401,
      message: "Invalid API key.",
    })).toThrow("Invalid API key.");
  });
});
