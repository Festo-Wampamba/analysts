// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CandidateCarousel } from "./CandidateCarousel";

const candidates = [
  { rank: 1, ticker: "NVDA", sector: "Technology", compositeScore: 0.82, subScores: {}, catalyst: "Strong revisions" },
  { rank: 2, ticker: "GOOGL", sector: "Communication Services", compositeScore: 0.76, subScores: {}, catalyst: "Growth durable" },
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates }) }));
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

  it("refreshes candidate facts even when the ranked ticker list is unchanged", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          candidates[0],
          { ...candidates[1], catalyst: "Updated growth evidence" },
        ],
      }),
    } as Response);
    render(<CandidateCarousel candidates={candidates} initialTicker="NVDA" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(screen.getByText("Selected candidate").parentElement).toHaveTextContent("GOOGL");
    expect(screen.getByText("Updated growth evidence")).toBeInTheDocument();
  });
});
