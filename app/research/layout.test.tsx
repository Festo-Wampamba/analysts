// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ResearchWorkspaceView", () => ({
  AmbientLayer: () => <div data-testid="ambient-layer" />,
  AppFooter: () => <footer data-testid="app-footer" />,
  AppTopbar: () => <header data-testid="app-topbar" />,
}));
vi.mock("@/components/ScrollToTopOnPathChange", () => ({
  ScrollToTopOnPathChange: () => null,
}));

import ResearchLayout from "./layout";
import { ResearchLoadingSkeleton } from "@/components/ResearchLoadingSkeleton";

describe("research layout", () => {
  it("keeps the application shell mounted around the loading skeleton", () => {
    render(<ResearchLayout><ResearchLoadingSkeleton /></ResearchLayout>);

    expect(screen.getByTestId("app-topbar")).toBeInTheDocument();
    expect(screen.getByLabelText("Loading research workspace")).toBeInTheDocument();
    expect(screen.getByTestId("app-footer")).toBeInTheDocument();
  });
});
