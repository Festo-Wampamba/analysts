// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ResearchWorkspace } from "@/lib/research/workspace";
import { ResearchWorkspaceView } from "./ResearchWorkspaceView";

afterEach(cleanup);

const workspace = {
  report: {
    ticker: "NVDA",
    facts: {
      ticker: "NVDA",
      company: { name: "NVIDIA Corporation", currency: "USD" },
      quote: {
        price: 100,
        previousClose: 99,
        open: 99,
        dayHigh: 101,
        dayLow: 98,
        change: { value: 1, formatted: "+1.00", direction: "positive" },
        changePercent: { value: 1, formatted: "+1.00%", direction: "positive" },
      },
      balanceSheet: {
        debtToEquityQuarterly: 0.25,
        currentRatioQuarterly: 2.1,
        quickRatioQuarterly: 1.8,
      },
      profitability: { roeTTM: 28.5, roaTTM: 17.25 },
      peers: ["AMD"],
    },
    narrative: {
      overview: "Sourced overview.",
      businessModel: "Sourced business model and competitive position.",
      financialPerformance: "Sourced financial performance.",
      balanceSheet: "Sourced balance sheet.",
      valuation: "Sourced valuation.",
      peers: "Finnhub lists AMD as comparable.",
      recentDevelopments: "Sourced developments.",
      growthDrivers: "Sourced growth drivers.",
      catalysts: "Sourced catalysts.",
      risks: ["Sourced risk."],
      scenarios: [
        { label: "bull", summary: "Bull case." },
        { label: "base", summary: "Base case." },
        { label: "bear", summary: "Bear case." },
      ],
      thesis: "Sourced thesis.",
      limitations: [],
    },
    provenance: [],
    generated: {
      generatedAt: "2026-08-23T05:42:00.000Z",
      basedOn: ["quote"],
      modelLabel: "deterministic-safety-fallback",
      status: "fallback",
    },
    failedProviders: [],
    cached: false,
  },
  financials: null,
  peers: [{ ticker: "NVDA", price: 100, previousClose: 99, changePercent: 1 }],
  earnings: [],
  chart: null,
  additionalProvenance: [],
  failedSections: [],
  researchRunId: null,
} as unknown as ResearchWorkspace;

describe("ResearchWorkspaceView fallback state", () => {
  it("shows an amber fallback banner and keeps peers sourced", () => {
    render(<ResearchWorkspaceView workspace={workspace} confidence={0.9} />);

    expect(screen.getByText(/AI narrative temporarily unavailable/)).toHaveTextContent(
      "AI narrative temporarily unavailable — showing sourced data only.",
    );
    expect(screen.getAllByText(/Fallback/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Verified fallback/)).not.toBeInTheDocument();
    expect(screen.getByText("Server-built · from the peer table above")).toBeInTheDocument();
  });

  it("renders dedicated business, growth, and sourced ratio sections", () => {
    render(<ResearchWorkspaceView workspace={workspace} />);

    expect(screen.getByRole("heading", { name: /Business model & competitive position/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Growth drivers/ })).toBeInTheDocument();
    expect(screen.getByText("Debt / equity (quarterly)")).toBeInTheDocument();
    expect(screen.getByText("Current ratio (quarterly)")).toBeInTheDocument();
    expect(screen.getByText("Quick ratio (quarterly)")).toBeInTheDocument();
    expect(screen.getByText("ROE (TTM)")).toBeInTheDocument();
    expect(screen.getByText("ROA (TTM)")).toBeInTheDocument();
    expect(screen.getByText("Figures cited in generated prose are sourced tiles above; wording is AI-generated.")).toBeInTheDocument();
  });
});
