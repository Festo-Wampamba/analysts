// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ResearchTickerPage from "./page";

describe("ResearchTickerPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the company name and price for a successful report", async () => {
    const report = {
      ticker: "AAPL",
      facts: {
        ticker: "AAPL",
        company: { name: "Apple Inc" },
        quote: {
          price: 200,
          previousClose: 198,
          open: 199,
          dayHigh: 201,
          dayLow: 198,
          change: { value: 2, formatted: "+2.00", direction: "positive" },
          changePercent: { value: 1.01, formatted: "+1.01%", direction: "positive" },
        },
      },
      narrative: {
        overview: "Apple's ecosystem economics remain intact.",
        businessModel: "Hardware-led with a growing services layer.",
        financialPerformance: "Revenue growth driven by iPhone and services.",
        balanceSheet: "Net cash position supports buybacks.",
        valuation: "Trades in line with its historical multiple.",
        peers: "Trades at a premium to hardware peers.",
        recentDevelopments: "Recent product cycle announcements.",
        growthDrivers: "Services attach rate and installed base growth.",
        catalysts: "Product cycle",
        risks: ["Competition"],
        scenarios: [
          { label: "bull", summary: "Upside case" },
          { label: "base", summary: "Base case" },
          { label: "bear", summary: "Downside case" },
        ],
        thesis: "Durable ecosystem moat.",
        limitations: [],
      },
      provenance: [
        { provider: "finnhub", fetchedAt: "2026-08-05T10:00:00.000Z", status: "fresh" },
      ],
      generated: { generatedAt: "2026-08-05T10:00:00.000Z", basedOn: ["quote"], modelLabel: "llama-3.3-70b-versatile" },
      failedProviders: [],
      cached: false,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(report), { status: 200 })),
    );

    const Page = await ResearchTickerPage({ params: Promise.resolve({ ticker: "AAPL" }) });
    render(Page);

    expect(await screen.findByText("Apple Inc")).toBeInTheDocument();
    expect(screen.getByText("+2.00")).toBeInTheDocument();
    expect(screen.getByText("Product cycle")).toBeInTheDocument();
  });

  it("renders a StatusNotice when the ticker is unknown", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: "unknown_ticker", message: "No such ticker." }),
          { status: 404 },
        ),
      ),
    );

    const Page = await ResearchTickerPage({ params: Promise.resolve({ ticker: "ZZZZ" }) });
    render(Page);

    expect(await screen.findByText("No such ticker.")).toBeInTheDocument();
  });
});
