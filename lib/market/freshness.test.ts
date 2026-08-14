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
});
