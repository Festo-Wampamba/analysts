import { describe, expect, it } from "vitest";

import {
  currentTradingDate,
  isBusinessDay,
  toEasternDate,
  tradingDateWithHolidays,
} from "./trading-date";

describe("toEasternDate", () => {
  it("formats an instant as the US Eastern calendar date", () => {
    expect(toEasternDate(new Date("2026-08-05T18:00:00Z"))).toBe("2026-08-05");
  });

  it("reports the previous Eastern date for a late-evening UTC instant", () => {
    // 02:30 UTC Thursday is still 22:30 Wednesday in New York.
    expect(toEasternDate(new Date("2026-08-06T02:30:00Z"))).toBe("2026-08-05");
  });
});

describe("isBusinessDay", () => {
  it("accepts a weekday", () => {
    expect(isBusinessDay(new Date("2026-08-05T18:00:00Z"))).toBe(true);
  });

  it("rejects a Saturday", () => {
    expect(isBusinessDay(new Date("2026-08-08T18:00:00Z"))).toBe(false);
  });

  it("rejects a Sunday", () => {
    expect(isBusinessDay(new Date("2026-08-09T18:00:00Z"))).toBe(false);
  });
});

describe("currentTradingDate", () => {
  it("returns the same date on a weekday", () => {
    expect(currentTradingDate(new Date("2026-08-05T18:00:00Z"))).toBe("2026-08-05");
  });

  it("rolls a Saturday back to the preceding Friday", () => {
    expect(currentTradingDate(new Date("2026-08-08T18:00:00Z"))).toBe("2026-08-07");
  });

  it("rolls a Sunday back to the preceding Friday", () => {
    expect(currentTradingDate(new Date("2026-08-09T18:00:00Z"))).toBe("2026-08-07");
  });

  it("files a late-evening Eastern instant under that Eastern date, not the UTC one", () => {
    expect(currentTradingDate(new Date("2026-08-06T02:30:00Z"))).toBe("2026-08-05");
  });
});

describe("tradingDateWithHolidays", () => {
  it("rolls a US market holiday back to the preceding trading day", () => {
    const result = tradingDateWithHolidays(
      new Date("2026-09-07T14:00:00Z"),
      new Set(["2026-09-07"]),
    );
    expect(result).toBe("2026-09-04");
  });
});
