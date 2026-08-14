// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/research/workspace", () => ({
  getResearchWorkspace: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/components/ResearchWorkspaceView", () => ({
  AmbientLayer: () => null,
  AppFooter: () => null,
  AppTopbar: () => null,
  Panel: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  ResearchWorkspaceView: ({ workspace }: { workspace: { report: { facts: { company?: { name?: string }; quote?: { price?: number } } } } }) => (
    <main><h1>{workspace.report.facts.company?.name}</h1><span>{workspace.report.facts.quote?.price}</span></main>
  ),
}));

import { getResearchWorkspace } from "@/lib/research/workspace";
import ResearchTickerPage from "./page";

beforeEach(() => vi.clearAllMocks());

describe("ResearchTickerPage", () => {
  it("renders the shared workspace for a valid ticker", async () => {
    vi.mocked(getResearchWorkspace).mockResolvedValue({
      report: { facts: { company: { name: "Apple Inc" }, quote: { price: 200 } } },
    } as never);

    render(await ResearchTickerPage({ params: Promise.resolve({ ticker: "aapl" }) }));

    expect(screen.getByText("Apple Inc")).toBeInTheDocument();
    expect(screen.getByText("200")).toBeInTheDocument();
    expect(getResearchWorkspace).toHaveBeenCalledWith("AAPL");
  });

  it("rejects an invalid ticker before calling providers", async () => {
    render(await ResearchTickerPage({ params: Promise.resolve({ ticker: "bad/value" }) }));

    expect(screen.getByText("Invalid ticker")).toBeInTheDocument();
    expect(getResearchWorkspace).not.toHaveBeenCalled();
  });

  it("renders a safe unavailable state when providers fail", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getResearchWorkspace).mockRejectedValue(new Error("provider down"));

    render(await ResearchTickerPage({ params: Promise.resolve({ ticker: "AAPL" }) }));

    expect(screen.getByText("No report available for AAPL")).toBeInTheDocument();
  });
});
