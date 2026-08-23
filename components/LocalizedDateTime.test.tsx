import { describe, expect, it } from "vitest";

import { dateTimeOptions, formatDateTime } from "./LocalizedDateTime";

describe("formatDateTime", () => {
  it("uses UTC as the deterministic fallback", () => {
    expect(formatDateTime("2026-08-14T19:54:00.000Z", "UTC", dateTimeOptions))
      .toBe("Aug 14, 2026, 7:54 PM UTC");
  });

  it("formats the same instant in a supplied viewer time zone", () => {
    expect(formatDateTime("2026-08-14T19:54:00.000Z", "Africa/Kampala", dateTimeOptions))
      .toBe("Aug 14, 2026, 10:54 PM GMT+3");
  });

  it("keeps an unavailable label for missing or malformed provider times", () => {
    expect(formatDateTime(undefined, "UTC", dateTimeOptions)).toBe("Unavailable");
    expect(formatDateTime("not-a-date", "UTC", dateTimeOptions)).toBe("Unavailable");
  });
});
