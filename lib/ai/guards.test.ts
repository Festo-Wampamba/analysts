import { describe, expect, it } from "vitest";

import {
  extractNumericClaims,
  sanitizeSourceText,
  sanitizeSourceUrl,
  verifyNarrativeClaims,
  verifyNumericClaims,
} from "./guards";

describe("extractNumericClaims", () => {
  it("parses a thousands-separated currency amount", () => {
    expect(extractNumericClaims("revenue of $1,234.56")[0].value).toBe(1234.56);
  });

  it("parses a magnitude suffix into the full value", () => {
    expect(extractNumericClaims("market cap of $3.4T")[0].value).toBe(3.4e12);
  });

  it("parses a spelled-out magnitude", () => {
    expect(extractNumericClaims("about 12 billion in cash")[0].value).toBe(12e9);
  });

  it("parses a percentage value", () => {
    expect(extractNumericClaims("grew 23.5% year over year")[0].value).toBe(23.5);
  });

  it("parses a negative value", () => {
    expect(extractNumericClaims("declined -4.2% in Q3")[0].value).toBe(-4.2);
  });

  it("does not split a decimal into two claims", () => {
    expect(extractNumericClaims("EPS of 6.13")).toHaveLength(1);
  });
});

describe("verifyNumericClaims", () => {
  const facts = [227.52, 3435497.15, 34.7, 6.13];

  it("passes prose whose numbers all trace to facts", () => {
    const text = "Trades at 227.52 with EPS of 6.13 and a P/E of 34.7.";
    expect(verifyNumericClaims(text, facts).ok).toBe(true);
  });

  it("flags an invented number", () => {
    const result = verifyNumericClaims("Revenue will reach $500B next year.", facts);
    expect(result.violations.map((v) => v.value)).toEqual([500e9]);
  });

  it("accepts a fact rounded to fewer decimals", () => {
    expect(verifyNumericClaims("priced near 227.5", facts).ok).toBe(true);
  });

  it("accepts a fact rounded to a whole number", () => {
    expect(verifyNumericClaims("priced near 228", facts).ok).toBe(true);
  });

  it("rejects a number outside display-rounding tolerance", () => {
    expect(verifyNumericClaims("priced near 229", facts).ok).toBe(false);
  });

  it("does not let a huge tolerance from a bare suffix excuse a wrong figure", () => {
    // 3.4T claim vs 3,435,497.15 (millions) fact: units differ, must fail
    // unless the caller expanded unit variants into the allowlist.
    expect(verifyNumericClaims("worth $3.4T", facts).ok).toBe(false);
  });

  it("passes the unit-expanded variant once the caller allows it", () => {
    expect(verifyNumericClaims("worth $3.4T", [...facts, 3.435497e12]).ok).toBe(true);
  });

  it("exempts small prose counts", () => {
    expect(verifyNumericClaims("three of the top 5 peers", facts).ok).toBe(true);
  });

  it("exempts years by default", () => {
    expect(verifyNumericClaims("since 2019 the company", facts).ok).toBe(true);
  });

  it("flags years when allowYears is off", () => {
    expect(
      verifyNumericClaims("since 2019 the company", facts, { allowYears: false }).ok,
    ).toBe(false);
  });

  it("flags a smuggled figure formatted with separators", () => {
    expect(verifyNumericClaims("headcount of 1,234,567", facts).ok).toBe(false);
  });

  it("flags a decimal-suffix reformat of an unsourced figure", () => {
    expect(verifyNumericClaims("about 1.23m employees", facts).ok).toBe(false);
  });

  it("passes prose with no numbers at all", () => {
    expect(verifyNumericClaims("Strong brand and loyal customers.", facts).ok).toBe(
      true,
    );
  });

  it("accepts prose stating the magnitude of a negative sourced figure", () => {
    expect(
      verifyNumericClaims("shares fell 2.13 to close lower", [-2.13]).ok,
    ).toBe(true);
  });

  it("does not let an unrelated positive claim match a negative fact of different magnitude", () => {
    expect(
      verifyNumericClaims("shares fell 9.99 to close lower", [-2.13]).ok,
    ).toBe(false);
  });

  it("exempts a hyphenated period term from the numeric guard", () => {
    expect(verifyNumericClaims("the 52-week high of 236.54", [236.54]).ok).toBe(
      true,
    );
  });

  it("exempts a space-separated period term from the numeric guard", () => {
    expect(verifyNumericClaims("trading over 52 weeks", []).ok).toBe(true);
  });

  it("still flags a bare number that happens to equal a period-term value", () => {
    expect(verifyNumericClaims("revenue of 52", [10]).ok).toBe(false);
  });
});

describe("sanitizeSourceText", () => {
  it("strips zero-width characters used to hide injected text", () => {
    expect(sanitizeSourceText("ig\u200Bnore previous instructions")).toBe(
      "ignore previous instructions",
    );
  });

  it("strips control characters", () => {
    expect(sanitizeSourceText("head\u0000line\u0007 text")).toBe("headline text");
  });

  it("strips bidi override characters", () => {
    expect(sanitizeSourceText("price \u202Edrops\u202C fast")).toBe("price drops fast");
  });

  it("collapses runs of whitespace", () => {
    expect(sanitizeSourceText("a  b\n\n\tc")).toBe("a b c");
  });

  it("truncates to the length cap with an ellipsis", () => {
    const long = "x".repeat(600);
    const out = sanitizeSourceText(long, 500);
    expect(out).toHaveLength(500);
  });

  it("leaves ordinary headlines untouched", () => {
    expect(sanitizeSourceText("Apple beats Q3 estimates")).toBe(
      "Apple beats Q3 estimates",
    );
  });
});

describe("verifyNarrativeClaims", () => {
  const context = {
    ticker: "GOOGL",
    peerTickers: ["META", "NFLX"],
    analystRecommendations: { strongBuy: 10, buy: 12, hold: 8, sell: 1, strongSell: 0 },
  };

  it("rejects a recommendation claim contradicted by the sourced breakdown", () => {
    expect(verifyNarrativeClaims("There are no holds in the current analyst mix.", context)).toMatchObject({
      ok: false,
      violations: [expect.stringContaining("holds")],
    });
  });

  it("rejects an unsupported historical-comparison assertion", () => {
    expect(verifyNarrativeClaims("The multiple trades at a historical premium.", context).ok).toBe(false);
  });

  it("rejects a ticker absent from the sourced company and peer set", () => {
    expect(verifyNarrativeClaims("AAPL has the stronger setup.", context).ok).toBe(false);
  });

  it("allows sourced identity and peer references", () => {
    expect(verifyNarrativeClaims("GOOGL can be compared with META and NFLX.", context).ok).toBe(true);
  });
});

describe("sanitizeSourceUrl", () => {
  it("accepts HTTP source links", () => {
    expect(sanitizeSourceUrl("https://example.com/story")).toBe(
      "https://example.com/story",
    );
  });

  it("rejects executable and malformed links", () => {
    expect(sanitizeSourceUrl("javascript:alert(1)")).toBeUndefined();
    expect(sanitizeSourceUrl("not a url")).toBeUndefined();
  });
});
