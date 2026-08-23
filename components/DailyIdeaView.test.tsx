// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./CandidateCarousel", () => ({ CandidateCarousel: () => null }));

import { DailyIdeaView, isStale } from "./DailyIdeaView";
import type { LatestIdea } from "@/lib/screen/get-latest-idea";

afterEach(cleanup);

const latest: LatestIdea = {
  tradingDate: "2026-08-19",
  ticker: "NVDA",
  latestQualifyingTicker: "NVDA",
  score: 0.82,
  confidence: 0.9,
  threshold: 0.65,
  emailDeliveryError: null,
  delivery: {
    channel: "email",
    status: "delivered",
    attemptedAt: new Date("2026-08-19T13:03:00.000Z"),
    recipient: "configured recipient(s)",
    retry: "not_needed",
  },
  candidates: [],
  run: {
    status: "complete",
    startedAt: new Date("2026-08-19T13:00:00.000Z"),
    finishedAt: new Date("2026-08-19T13:03:00.000Z"),
    durationMs: 180_000,
    universeSize: 54,
    universeEvaluated: 54,
    highestScore: 0.82,
  },
  latestAttempt: {
    tradingDate: "2026-08-19",
    status: "complete",
    startedAt: new Date("2026-08-19T13:00:00.000Z"),
    finishedAt: new Date("2026-08-19T13:03:00.000Z"),
    durationMs: 180_000,
    universeSize: 54,
    universeEvaluated: 54,
    highestScore: 0.82,
    nextScheduledAt: null,
    error: null,
  },
  idea: {
    facts: {
      ticker: "NVDA",
      sector: "Technology",
      company: { name: "NVIDIA Corp", currency: "USD", marketCapMillions: 4_000_000 },
      price: { current: 219.74, previousClose: 225.01, changePercent: -2.34 },
      metrics: { peTTM: 33.98, revenueGrowthTTMYoy: 55.1 },
      factorScores: {
        growth: 0.9,
        profitability: 0.8,
        valuation: 0.7,
        financialStrength: 0.6,
        momentum: 0.5,
        sentiment: 0.4,
        insiderActivity: 0.3,
      },
      compositeScore: 0.82,
      coverage: 0.9,
      threshold: 0.65,
      universeEvaluated: 54,
      sectorMedianPe: 35.2,
      news: [{ headline: "Earnings update", source: "Reuters", url: "https://example.com/news", date: "2026-08-18" }],
    },
    narrative: {
      selectionReason: "It ranked first on the deterministic screen.",
      thesisPoints: ["Growth remains strong.", "Margins are durable.", "Valuation is competitive."],
      keyCatalyst: "Upcoming earnings.",
      bullCase: "Demand accelerates.",
      bearCase: "Demand softens.",
      risks: ["Customer concentration."],
      confidenceRationale: "High factor coverage.",
    },
    generated: { generatedAt: "2026-08-19T13:03:00.000Z", basedOn: ["finnhub:quote"], status: "generated" },
    provenance: [{ provider: "finnhub", endpoint: "/quote", fetchedAt: "2026-08-19T13:00:00.000Z", status: "fresh" }],
  },
};

describe("DailyIdeaView", () => {
  it("keeps every assignment-required daily evidence block on the web page", () => {
    render(<DailyIdeaView latest={latest} />);

    expect(screen.getByText("Investment thesis · three points")).toBeInTheDocument();
    expect(screen.getByText("Growth remains strong.")).toBeInTheDocument();
    expect(screen.getByText("P/E 33.98 versus sector median 35.2.")).toBeInTheDocument();
    expect(screen.getByText("Recent catalyst")).toBeInTheDocument();
    expect(screen.getByText("Bull case")).toBeInTheDocument();
    expect(screen.getByText("Bear case")).toBeInTheDocument();
    expect(screen.getByText("Principal risks")).toBeInTheDocument();
    expect(screen.getByText("90% coverage confidence")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open report source audit" })).toHaveAttribute("href", "#sources");
    expect(screen.getByText((_, element) => element?.tagName === "SPAN" && element.textContent?.startsWith("Generated ") === true)).toBeInTheDocument();
  });

  it("makes a deterministic fallback visibly distinct from generated research", () => {
    render(
      <DailyIdeaView
        latest={{
          ...latest,
          idea: {
            ...latest.idea!,
            generated: { ...latest.idea!.generated, status: "fallback" },
          },
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "AI narrative temporarily unavailable — showing sourced data only.",
    );
    expect(screen.getAllByText(/Fallback/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Verified fallback/)).not.toBeInTheDocument();
  });

  it("foregrounds five candidates and expands the retained queue", () => {
    const candidates = Array.from({ length: 7 }, (_, index) => ({
      rank: index + 1,
      ticker: `T${index + 1}`,
      sector: "Technology",
      compositeScore: 0.8 - index * 0.02,
      coverage: 0.9,
      subScores: { growth: 0.8 - index * 0.02 },
      leadingFactor: "Growth",
      leadingFactorScore: 0.8 - index * 0.02,
      leadingEvidence: `Growth led with a ${(0.8 - index * 0.02).toFixed(2)} factor score.`,
      catalyst: `Catalyst ${index + 1}`,
    }));
    const { container } = render(<DailyIdeaView latest={{ ...latest, candidates }} />);

    expect(screen.getByRole("heading", { name: "Top 5 candidates" })).toBeInTheDocument();
    expect(screen.getByText("7 screened · deterministic score")).toBeInTheDocument();
    expect(container.querySelectorAll(".daily-table-card > .candidate-table > .candidate-row")).toHaveLength(6);

    const disclosure = screen.getByText("See all 7 screened").closest("details");
    expect(disclosure).not.toHaveAttribute("open");
    expect(within(disclosure as HTMLElement).getByText("T6")).toBeInTheDocument();
    fireEvent.click(screen.getByText("See all 7 screened"));
    expect(disclosure).toHaveAttribute("open");
  });

  it("does not call a Friday result stale over the weekend", () => {
    expect(isStale({ ...latest, tradingDate: "2026-08-21" }, new Date("2026-08-24T14:00:00.000Z"))).toBe(false);
    expect(isStale({ ...latest, tradingDate: "2026-08-17" }, new Date("2026-08-20T14:00:00.000Z"))).toBe(true);
  });

  it("uses the documented schedule for legacy runs without a stored next timestamp", () => {
    render(<DailyIdeaView latest={latest} />);

    expect(screen.getByText("Weekdays at 13:00 UTC")).toBeInTheDocument();
    expect(screen.getByText("Delivery attempted")).toBeInTheDocument();
  });
});
