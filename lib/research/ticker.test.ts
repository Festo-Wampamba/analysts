import { describe, expect, it } from "vitest";

import { isValidTicker, normalizeTicker } from "./ticker";

describe("normalizeTicker", () => {
  it("uppercases and trims the raw path segment", () => {
    expect(normalizeTicker("  aapl ")).toBe("AAPL");
  });
});

describe("isValidTicker", () => {
  it("accepts a plain ticker", () => {
    expect(isValidTicker("AAPL")).toBe(true);
  });

  it("accepts a dotted share class", () => {
    expect(isValidTicker("BRK.B")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidTicker("")).toBe(false);
  });

  it("rejects digits", () => {
    expect(isValidTicker("AA1")).toBe(false);
  });

  it("rejects a query-string injection attempt", () => {
    expect(isValidTicker("AAPL&TOKEN=X")).toBe(false);
  });

  it("rejects a path traversal attempt", () => {
    expect(isValidTicker("../../ETC")).toBe(false);
  });

  it("rejects an over-long symbol", () => {
    expect(isValidTicker("ABCDEFGH")).toBe(false);
  });
});
