import { describe, expect, it } from "vitest";

import {
  metricNumber,
  metricsSchema,
  profileSchema,
  quoteLooksEmpty,
  quoteSchema,
} from "./finnhub-schemas";

const validQuote = {
  c: 227.52,
  d: 1.43,
  dp: 0.6325,
  h: 228.22,
  l: 224.51,
  o: 225.0,
  pc: 226.09,
  t: 1754332800,
};

describe("quoteSchema", () => {
  it("accepts a real quote payload", () => {
    expect(quoteSchema.safeParse(validQuote).success).toBe(true);
  });

  it("accepts null change fields Finnhub sends outside market hours", () => {
    expect(quoteSchema.safeParse({ ...validQuote, d: null, dp: null }).success).toBe(
      true,
    );
  });

  it("rejects a payload missing the current price", () => {
    const withoutPrice: Partial<typeof validQuote> = { ...validQuote };
    delete withoutPrice.c;
    expect(quoteSchema.safeParse(withoutPrice).success).toBe(false);
  });
});

describe("quoteLooksEmpty", () => {
  it("flags the all-zero payload Finnhub returns for unknown tickers", () => {
    expect(
      quoteLooksEmpty({ c: 0, d: null, dp: null, h: 0, l: 0, o: 0, pc: 0, t: 0 }),
    ).toBe(true);
  });

  it("does not flag a genuine quote", () => {
    expect(quoteLooksEmpty(validQuote)).toBe(false);
  });
});

describe("profileSchema", () => {
  it("accepts a real profile payload", () => {
    const parsed = profileSchema.safeParse({
      name: "Apple Inc",
      ticker: "AAPL",
      exchange: "NASDAQ NMS - GLOBAL MARKET",
      finnhubIndustry: "Technology",
      marketCapitalization: 3435497.15,
      shareOutstanding: 15115.82,
      currency: "USD",
      country: "US",
      ipo: "1980-12-12",
      weburl: "https://www.apple.com/",
      logo: "https://static.finnhub.io/logo/aapl.png",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects the empty object Finnhub returns for unknown tickers", () => {
    expect(profileSchema.safeParse({}).success).toBe(false);
  });
});

describe("metricsSchema", () => {
  it("accepts the loose metric bag", () => {
    const parsed = metricsSchema.safeParse({
      metric: { peTTM: 34.7, marketCapitalization: 3435497.15, name: null },
      series: { annual: {} },
    });
    expect(parsed.success).toBe(true);
  });
});

describe("metricNumber", () => {
  const metrics = {
    metric: { peTTM: 34.7, name: "x", broken: null, inf: Infinity },
  };

  it("returns a finite numeric metric", () => {
    expect(metricNumber(metrics, "peTTM")).toBe(34.7);
  });

  it("returns undefined for a missing key", () => {
    expect(metricNumber(metrics, "roeTTM")).toBeUndefined();
  });

  it("returns undefined for a non-numeric value", () => {
    expect(metricNumber(metrics, "name")).toBeUndefined();
  });

  it("returns undefined for a non-finite value", () => {
    expect(metricNumber(metrics, "inf")).toBeUndefined();
  });
});
