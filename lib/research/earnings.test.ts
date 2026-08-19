import { describe, expect, it } from "vitest";

import { sortUpcomingEarnings } from "./earnings";

describe("sortUpcomingEarnings", () => {
  it("lists the nearest calendar event first regardless of provider order", () => {
    expect(sortUpcomingEarnings([
      { date: "2026-11-17", label: "later" },
      { date: "2026-08-26", label: "nearer" },
    ])).toEqual([
      { date: "2026-08-26", label: "nearer" },
      { date: "2026-11-17", label: "later" },
    ]);
  });
});
