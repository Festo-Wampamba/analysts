// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CandidateCarousel } from "./CandidateCarousel";

const candidates = [
  { rank: 1, ticker: "NVDA", sector: "Technology", compositeScore: 0.82, subScores: {}, catalyst: "Strong revisions" },
  { rank: 2, ticker: "GOOGL", sector: "Communication Services", compositeScore: 0.76, subScores: {}, catalyst: "Growth durable" },
];

function researchPayload(ticker: string) {
  return {
    ticker,
    facts: { company: { name: `${ticker} Inc`, currency: "USD" } },
    narrative: { thesis: `${ticker} has a sourced research thesis.` },
    generated: { generatedAt: "2026-08-14T19:54:00.000Z", status: "generated" },
    workspace: {
      chart: { asOf: "2026-08-14T19:54:00.000Z" },
      peers: [{ ticker, price: 100, changePercent: 1.25, quoteAsOf: "2026-08-14T19:54:00.000Z" }],
    },
  };
}

function response(data: unknown): Response {
  return { ok: true, json: async () => data } as Response;
}

function defaultFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  if (url === "/api/daily-idea") return Promise.resolve(response({ candidates }));
  const ticker = url.split("/").at(-1) ?? "NVDA";
  return Promise.resolve(response(researchPayload(ticker)));
}

async function flushResearchRequest() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(defaultFetch));
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("CandidateCarousel", () => {
  it("keeps the initial candidate selected until the user navigates", () => {
    render(<CandidateCarousel candidates={candidates} initialTicker="NVDA" />);

    expect(screen.getByText("Ranked research queue (2)")).toBeInTheDocument();
    expect(screen.getByText("Manual selection")).toBeInTheDocument();
    expect(screen.getByText("Selected result").parentElement).toHaveTextContent("NVDA");
    act(() => vi.advanceTimersByTime(30_000));

    expect(screen.getByText("Selected result").parentElement).toHaveTextContent("NVDA");
  });

  it("allows manual previous and next selection", () => {
    render(<CandidateCarousel candidates={candidates} initialTicker="NVDA" />);

    fireEvent.click(screen.getByRole("button", { name: "Show next candidate" }));
    expect(screen.getByText("Selected result").parentElement).toHaveTextContent("GOOGL");
    fireEvent.click(screen.getByRole("button", { name: "Show previous candidate" }));
    expect(screen.getByText("Selected result").parentElement).toHaveTextContent("NVDA");
  });

  it("refreshes candidate facts even when the ranked ticker list is unchanged", async () => {
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/daily-idea") {
        return Promise.resolve(response({
            candidates: [
              candidates[0],
              { ...candidates[1], catalyst: "Updated growth evidence" },
            ],
          }));
      }
      const ticker = url.split("/").at(-1) ?? "NVDA";
      return Promise.resolve(response(researchPayload(ticker)));
    });
    render(<CandidateCarousel candidates={candidates} initialTicker="NVDA" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(screen.getByText("Selected result").parentElement).toHaveTextContent("NVDA");
    fireEvent.click(screen.getByRole("button", { name: "Show GOOGL, ranked 2" }));
    expect(screen.getByText("Updated growth evidence")).toBeInTheDocument();
  });

  it("loads the selected ticker's own sourced research after manual selection", async () => {
    render(<CandidateCarousel candidates={candidates} initialTicker="NVDA" />);
    await flushResearchRequest();

    expect(screen.getByText("NVDA has a sourced research thesis.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show GOOGL, ranked 2" }));
    await flushResearchRequest();

    expect(screen.getByText("GOOGL has a sourced research thesis.")).toBeInTheDocument();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/research/GOOGL", { cache: "no-store" });
  });
});
