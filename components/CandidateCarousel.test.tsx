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
  it("rotates to the next sourced candidate after one minute", () => {
    render(<CandidateCarousel candidates={candidates} initialTicker="NVDA" />);

    expect(screen.getByText("2 ranked candidates · select one to load its own live sourced research")).toBeInTheDocument();
    expect(screen.getByText("Selected candidate").parentElement).toHaveTextContent("NVDA");
    act(() => vi.advanceTimersByTime(60_000));

    expect(screen.getByText("Selected candidate").parentElement).toHaveTextContent("GOOGL");
  });

  it("allows manual previous and next selection and pauses rotation", () => {
    render(<CandidateCarousel candidates={candidates} initialTicker="NVDA" />);

    fireEvent.click(screen.getByRole("button", { name: "Show next candidate" }));
    expect(screen.getByText("Selected candidate").parentElement).toHaveTextContent("GOOGL");
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText("Selected candidate").parentElement).toHaveTextContent("GOOGL");
    fireEvent.click(screen.getByRole("button", { name: "Show previous candidate" }));
    expect(screen.getByText("Selected candidate").parentElement).toHaveTextContent("NVDA");
  });

  it("keeps sourced research on the last manual selection while the queue auto-rotates", async () => {
    render(<CandidateCarousel candidates={candidates} initialTicker="NVDA" />);
    await flushResearchRequest();

    act(() => vi.advanceTimersByTime(60_000));

    expect(screen.getByText("Selected candidate").parentElement).toHaveTextContent("GOOGL");
    expect(screen.getByText("Auto rotation highlighted GOOGL. Select it to load its sourced research; the preview below remains NVDA.")).toBeInTheDocument();
    expect(vi.mocked(fetch)).not.toHaveBeenCalledWith("/api/research/GOOGL", { cache: "no-store" });
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

    expect(screen.getByText("Selected candidate").parentElement).toHaveTextContent("GOOGL");
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
