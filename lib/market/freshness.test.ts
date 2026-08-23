import { describe, expect, it } from "vitest";

import { marketFreshness } from "./freshness";

describe("marketFreshness", () => {
  it("uses the same provider-bar freshness language for recent market data", () => {
    const now = Date.parse("2026-08-14T20:00:00.000Z");
    expect(marketFreshness("2026-08-14T19:54:00.000Z", now)).toEqual({
      label: "Fresh · 6m ago",
      stale: false,
    });
  });

  it("marks an old provider bar stale instead of implying live data", () => {
    const now = Date.parse("2026-08-14T20:00:00.000Z");
    expect(marketFreshness("2026-08-14T14:00:00.000Z", now)).toEqual({
      label: "Stale · 6h ago",
      stale: true,
    });
  });

  it("labels a Saturday view of the last Friday close as markets closed", () => {
    const now = Date.parse("2026-08-15T16:00:00.000Z");
    expect(marketFreshness("2026-08-14T20:00:00.000Z", now)).toEqual({
      label: "Markets closed. Last close Fri, Aug 14",
      stale: false,
    });
  });

  it("labels a Sunday view of Friday close as markets closed", () => {
    const now = Date.parse("2026-08-16T16:00:00.000Z");
    expect(marketFreshness("2026-08-14T20:00:00.000Z", now)).toEqual({
      label: "Markets closed. Last close Fri, Aug 14",
      stale: false,
    });
  });

  it("keeps a six-hour-old bar alarming during an open Tuesday session", () => {
    const now = Date.parse("2026-08-18T18:00:00.000Z");
    expect(marketFreshness("2026-08-18T12:00:00.000Z", now)).toEqual({
      label: "Stale · 6h ago",
      stale: true,
    });
  });
});
