import { describe, expect, it } from "vitest";

import { DAILY_SCREEN_SCHEDULE, nextScheduledScreenAt } from "./schedule";

describe("nextScheduledScreenAt", () => {
  it("matches the published weekday 13:00 UTC schedule", () => {
    expect(DAILY_SCREEN_SCHEDULE.label).toBe("Weekdays at 13:00 UTC");
    expect(nextScheduledScreenAt(new Date("2026-08-24T12:00:00Z")).toISOString()).toBe(
      "2026-08-24T13:00:00.000Z",
    );
  });

  it("skips the weekend after the Friday trigger", () => {
    expect(nextScheduledScreenAt(new Date("2026-08-21T13:01:00Z")).toISOString()).toBe(
      "2026-08-24T13:00:00.000Z",
    );
  });
});
