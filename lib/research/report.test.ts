import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ResearchNarrative } from "@/lib/ai/report-schema";

// Cache rows the mocked select returns, and rows the mocked insert captured.
const cacheRows: Record<string, unknown>[] = [];
const insertedReports: Record<string, unknown>[] = [];

vi.mock("@/lib/db", () => {
  const selectChain = {
    from: () => selectChain,
    where: () => selectChain,
    orderBy: () => selectChain,
    limit: () => Promise.resolve(cacheRows),
  };
  return {
    db: {
      select: () => selectChain,
      insert: () => ({
        values: (row: Record<string, unknown>) => {
          insertedReports.push(row);
          return Promise.resolve();
        },
      }),
    },
    schema: { reportsCache: {}, sourceCalls: {} },
  };
});

vi.mock("@/lib/source/finnhub", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/source/finnhub")>();
  return {
    ...actual,
    getQuote: vi.fn(),
    getProfile: vi.fn(),
    getMetrics: vi.fn(),
    getPeers: vi.fn(),
    getCompanyNews: vi.fn(),
    getRecommendations: vi.fn(),
  };
});

vi.mock("@/lib/ai/groq", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/groq")>();
  return { ...actual, groqJson: vi.fn() };
});

import { groqJson } from "@/lib/ai/groq";
import {
  getCompanyNews,
  getMetrics,
  getPeers,
  getProfile,
  getQuote,
  getRecommendations,
} from "@/lib/source/finnhub";
import { getResearchReport } from "./report";

function sourced<T>(data: T, endpoint: string) {
  return {
    data,
    provenance: {
      provider: "finnhub",
      endpoint,
      fetchedAt: new Date().toISOString(),
      status: "fresh" as const,
      httpStatus: 200,
    },
  };
}

const quote = {
  c: 227.52,
  d: 1.43,
  dp: 0.6325,
  h: 228.22,
  l: 224.51,
  o: 225.0,
  pc: 226.09,
  t: 1754332800,
};

const profile = {
  name: "Apple Inc",
  ticker: "AAPL",
  marketCapitalization: 3435497.15,
  shareOutstanding: 15115.82,
  currency: "USD",
};

function narrative(overrides: Partial<ResearchNarrative> = {}): ResearchNarrative {
  return {
    overview: "Designs consumer devices.",
    businessModel: "Hardware plus services.",
    financialPerformance: "Margins held steady.",
    balanceSheet: "Net cash position.",
    valuation: "Trades at a premium.",
    peers: "Competes with large platforms.",
    recentDevelopments: "Launched a product.",
    growthDrivers: "Services attach rate.",
    catalysts: "Upcoming earnings.",
    risks: ["Regulatory pressure."],
    scenarios: [
      { label: "bull", summary: "Services accelerate." },
      { label: "base", summary: "Steady growth." },
      { label: "bear", summary: "Demand softens." },
    ],
    thesis: "Quality compounder.",
    limitations: ["Free-tier data only."],
    ...overrides,
  };
}

function mockGeneration(data: ResearchNarrative) {
  return {
    data,
    model: "llama-3.3-70b-versatile",
    usage: { promptTokens: 900, completionTokens: 200, totalTokens: 1100 },
    meta: {
      generatedAt: new Date().toISOString(),
      basedOn: ["company", "quote"],
      modelLabel: "llama-3.3-70b-versatile",
    },
  };
}

function mockAllProvidersOk() {
  vi.mocked(getQuote).mockResolvedValue(sourced(quote, "/quote"));
  vi.mocked(getProfile).mockResolvedValue(sourced(profile, "/stock/profile2"));
  vi.mocked(getMetrics).mockResolvedValue(
    sourced({ metric: { peTTM: 34.7 } }, "/stock/metric"),
  );
  vi.mocked(getPeers).mockResolvedValue(sourced(["AAPL", "MSFT"], "/stock/peers"));
  vi.mocked(getCompanyNews).mockResolvedValue(sourced([], "/company-news"));
  vi.mocked(getRecommendations).mockResolvedValue(
    sourced([], "/stock/recommendation"),
  );
}

beforeEach(() => {
  cacheRows.length = 0;
  insertedReports.length = 0;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getResearchReport cache", () => {
  it("returns the cached narrative without calling any provider", async () => {
    cacheRows.push({
      ticker: "AAPL",
      facts: {
        facts: { ticker: "AAPL", company: { name: "Apple Inc" } },
        provenance: [],
        failedProviders: [],
      },
      narrative: narrative(),
      model: "llama-3.3-70b-versatile",
      generatedAt: new Date(),
    });

    const report = await getResearchReport("AAPL");

    expect(report.cached).toBe(true);
    expect(getQuote).not.toHaveBeenCalled();
  });

  it("preserves the fallback label when reading a deterministic cached report", async () => {
    cacheRows.push({
      ticker: "AAPL",
      facts: {
        facts: { ticker: "AAPL", company: { name: "Apple Inc" } },
        provenance: [],
        failedProviders: [],
      },
      narrative: narrative(),
      model: "deterministic-safety-fallback",
      generatedAt: new Date(),
    });

    const report = await getResearchReport("AAPL");

    expect(report.generated.status).toBe("fallback");
  });

  it("marks a cached quote's provenance stale once it ages past the freshness window", async () => {
    const oldFetch = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    cacheRows.push({
      ticker: "AAPL",
      facts: {
        facts: { ticker: "AAPL", company: { name: "Apple Inc" } },
        provenance: [
          { provider: "finnhub", endpoint: "/quote", fetchedAt: oldFetch, status: "fresh" },
        ],
        failedProviders: [],
      },
      narrative: narrative(),
      model: "llama-3.3-70b-versatile",
      generatedAt: new Date(),
    });

    const report = await getResearchReport("AAPL");

    expect(report.provenance[0].status).toBe("stale");
  });
});

describe("getResearchReport generation", () => {
  it("returns a freshly generated report on a cache miss", async () => {
    mockAllProvidersOk();
    vi.mocked(groqJson).mockResolvedValue(mockGeneration(narrative()));

    const report = await getResearchReport("AAPL");

    expect(report).toMatchObject({ cached: false, ticker: "AAPL" });
  });

  it("writes the generated report to the cache with an expiry", async () => {
    mockAllProvidersOk();
    vi.mocked(groqJson).mockResolvedValue(mockGeneration(narrative()));

    await getResearchReport("AAPL");

    const [row] = insertedReports;
    expect((row.expiresAt as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it("still generates a report when one provider fails", async () => {
    mockAllProvidersOk();
    vi.mocked(getPeers).mockRejectedValue(new Error("peers down"));
    vi.mocked(groqJson).mockResolvedValue(mockGeneration(narrative()));

    const report = await getResearchReport("AAPL");

    expect(report.failedProviders).toEqual(["peers"]);
  });

  it("records a failed provenance entry for the failed provider", async () => {
    mockAllProvidersOk();
    vi.mocked(getPeers).mockRejectedValue(new Error("peers down"));
    vi.mocked(groqJson).mockResolvedValue(mockGeneration(narrative()));

    const report = await getResearchReport("AAPL");

    expect(report.provenance).toContainEqual(
      expect.objectContaining({ endpoint: "peers", status: "failed" }),
    );
  });

  it("rejects a ticker with no identity or price data as unknown", async () => {
    mockAllProvidersOk();
    vi.mocked(getQuote).mockResolvedValue(
      sourced({ c: 0, d: null, dp: null, h: 0, l: 0, o: 0, pc: 0, t: 0 }, "/quote"),
    );
    vi.mocked(getProfile).mockRejectedValue(new Error("empty profile"));

    await expect(getResearchReport("NOPE")).rejects.toMatchObject({
      code: "unknown_ticker",
    });
  });

  it("reports sources_unavailable when profile fails for a valid quote", async () => {
    mockAllProvidersOk();
    vi.mocked(getProfile).mockRejectedValue(new Error("profile rate limited"));

    await expect(getResearchReport("AAPL")).rejects.toMatchObject({
      code: "sources_unavailable",
      details: { failedProviders: ["profile"] },
    });
  });

  it("reports sources_unavailable when quote fails for a valid profile", async () => {
    mockAllProvidersOk();
    vi.mocked(getQuote).mockRejectedValue(new Error("quote rate limited"));

    await expect(getResearchReport("AAPL")).rejects.toMatchObject({
      code: "sources_unavailable",
      details: { failedProviders: ["quote"] },
    });
  });

  it("reports sources_unavailable when every provider fails", async () => {
    for (const call of [
      getQuote,
      getProfile,
      getMetrics,
      getPeers,
      getCompanyNews,
      getRecommendations,
    ]) {
      vi.mocked(call).mockRejectedValue(new Error("provider down"));
    }

    await expect(getResearchReport("AAPL")).rejects.toMatchObject({
      code: "sources_unavailable",
    });
  });
});

describe("getResearchReport numeric guard", () => {
  it("retries once when the first draft invents a figure", async () => {
    mockAllProvidersOk();
    vi.mocked(groqJson)
      .mockResolvedValueOnce(
        mockGeneration(narrative({ thesis: "Revenue will hit $394.3 billion." })),
      )
      .mockResolvedValueOnce(mockGeneration(narrative()));

    await getResearchReport("AAPL");

    expect(groqJson).toHaveBeenCalledTimes(2);
  });

  it("returns the corrected narrative from the retry", async () => {
    mockAllProvidersOk();
    vi.mocked(groqJson)
      .mockResolvedValueOnce(
        mockGeneration(narrative({ thesis: "Revenue will hit $394.3 billion." })),
      )
      .mockResolvedValueOnce(mockGeneration(narrative({ thesis: "Quality at a price." })));

    const report = await getResearchReport("AAPL");

    expect(report.narrative.thesis).toBe("Quality at a price.");
  });

  it("names the offending figure in the correction prompt", async () => {
    mockAllProvidersOk();
    vi.mocked(groqJson)
      .mockResolvedValueOnce(
        mockGeneration(narrative({ thesis: "Revenue will hit $394.3 billion." })),
      )
      .mockResolvedValueOnce(mockGeneration(narrative()));

    await getResearchReport("AAPL");

    const retryPrompt = vi.mocked(groqJson).mock.calls[1][0].user;
    expect(retryPrompt).toContain("394.3 billion");
  });

  it("returns a deterministic fallback when the retry still invents a figure", async () => {
    mockAllProvidersOk();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(groqJson).mockResolvedValue(
      mockGeneration(narrative({ thesis: "Revenue will hit $394.3 billion." })),
    );

    const report = await getResearchReport("AAPL");

    expect(report.generated.status).toBe("fallback");
    expect(report.narrative.thesis).not.toContain("394.3");
  });

  it("caches the safe fallback after numeric verification fails", async () => {
    mockAllProvidersOk();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(groqJson).mockResolvedValue(
      mockGeneration(narrative({ thesis: "Revenue will hit $394.3 billion." })),
    );

    await getResearchReport("AAPL");

    expect(insertedReports).toHaveLength(1);
    expect(insertedReports[0].model).toBe("deterministic-safety-fallback");
  });
});
