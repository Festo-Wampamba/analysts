import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const insertedRows: Record<string, unknown>[] = [];

vi.mock("@/lib/db", () => ({
  db: {
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        insertedRows.push(row);
        return Promise.resolve();
      },
    }),
  },
  schema: { sourceCalls: {} },
}));

import { FinnhubError, getQuote } from "./finnhub";

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

function mockFetchOnce(status: number, body: unknown, headers?: Record<string, string>) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", ...headers },
      }),
    ),
  );
}

beforeEach(() => {
  insertedRows.length = 0;
  vi.stubEnv("FINNHUB_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("getQuote", () => {
  it("returns the parsed quote on a valid 200", async () => {
    mockFetchOnce(200, validQuote);
    const { data } = await getQuote("AAPL");
    expect(data).toEqual(validQuote);
  });

  it("returns fresh provenance with the quote's own timestamp", async () => {
    mockFetchOnce(200, validQuote);
    const { provenance } = await getQuote("AAPL");
    expect(provenance).toMatchObject({
      provider: "finnhub",
      endpoint: "/quote",
      status: "fresh",
      httpStatus: 200,
      providerTimestamp: new Date(validQuote.t * 1000).toISOString(),
    });
  });

  it("logs a fresh source_calls row for a valid 200", async () => {
    mockFetchOnce(200, validQuote);
    await getQuote("AAPL");
    expect(insertedRows[0]).toMatchObject({
      provider: "finnhub",
      endpoint: "/quote",
      ticker: "AAPL",
      httpStatus: 200,
      status: "fresh",
    });
  });

  it("records the rate-limit-remaining header in meta", async () => {
    mockFetchOnce(200, validQuote, { "x-ratelimit-remaining": "57" });
    await getQuote("AAPL");
    expect(insertedRows[0]).toMatchObject({ meta: { rateLimitRemaining: 57 } });
  });

  it("throws a FinnhubError carrying the status on HTTP 429", async () => {
    mockFetchOnce(429, { error: "API limit reached." });
    await expect(getQuote("AAPL")).rejects.toMatchObject({
      name: "FinnhubError",
      httpStatus: 429,
    });
  });

  it("logs a failed source_calls row on HTTP 429", async () => {
    mockFetchOnce(429, { error: "API limit reached." });
    await getQuote("AAPL").catch(() => {});
    expect(insertedRows[0]).toMatchObject({
      endpoint: "/quote",
      httpStatus: 429,
      status: "failed",
    });
  });

  it("throws when the 200 body fails schema validation", async () => {
    mockFetchOnce(200, { unexpected: "shape" });
    await expect(getQuote("AAPL")).rejects.toBeInstanceOf(FinnhubError);
  });

  it("logs a failed row when the body fails schema validation", async () => {
    mockFetchOnce(200, { unexpected: "shape" });
    await getQuote("AAPL").catch(() => {});
    expect(insertedRows[0]).toMatchObject({
      status: "failed",
      meta: { error: "response failed schema validation" },
    });
  });

  it("throws a FinnhubError on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(getQuote("AAPL")).rejects.toBeInstanceOf(FinnhubError);
  });

  it("logs a failed row with the error message on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await getQuote("AAPL").catch(() => {});
    expect(insertedRows[0]).toMatchObject({
      status: "failed",
      meta: { error: "fetch failed" },
    });
  });

  it("throws before fetching when FINNHUB_API_KEY is missing", async () => {
    vi.stubEnv("FINNHUB_API_KEY", "");
    await expect(getQuote("AAPL")).rejects.toMatchObject({
      message: "FINNHUB_API_KEY is not set",
    });
  });

  it("still resolves the quote when the audit insert fails", async () => {
    mockFetchOnce(200, validQuote);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = await import("@/lib/db");
    vi.spyOn(db, "insert").mockImplementation(() => {
      throw new Error("db down");
    });
    const { data } = await getQuote("AAPL");
    consoleError.mockRestore();
    expect(data).toEqual(validQuote);
  });
});
