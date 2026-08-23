// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { parseHealthView } from "./LiveMarketStatus";

describe("parseHealthView", () => {
  it("reports operational platform health from the health endpoint", () => {
    expect(parseHealthView({
      status: "ok",
      db: "reachable",
      providers: { finnhub: true, groq: true },
      latestScreen: { tradingDate: "2026-08-23" },
    })).toEqual({
      label: "Operational · data 2026-08-23",
      degraded: false,
      title: "Platform operational · latest screen 2026-08-23",
    });
  });

  it("does not use a ticker chart response to decide platform health", () => {
    expect(parseHealthView({
      status: "ok",
      db: "reachable",
      providers: { finnhub: true, groq: true },
      latestScreen: { tradingDate: "2026-08-23" },
      tickerChart: { status: 404, asOf: null },
    })?.degraded).toBe(false);
  });

  it("shows provider degraded when required platform dependencies are unavailable", () => {
    expect(parseHealthView({
      status: "degraded",
      db: "reachable",
      providers: { finnhub: false, groq: true },
      latestScreen: { tradingDate: "2026-08-23" },
    })?.label).toBe("Provider degraded");
  });
});
