// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReportNav } from "./ReportNav";

let observerCallback: IntersectionObserverCallback | undefined;

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) {
      observerCallback = callback;
    }
    observe = vi.fn();
    disconnect = vi.fn();
    root = null;
    rootMargin = "";
    thresholds = [];
    takeRecords = () => [];
    unobserve = vi.fn();
  });
  document.body.innerHTML = ["overview", "financials", "valuation"].map((id) => `<section id="${id}"></section>`).join("");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  observerCallback = undefined;
});

describe("ReportNav", () => {
  it("updates immediately when a section is selected", () => {
    render(<ReportNav />);

    fireEvent.click(screen.getByRole("link", { name: "Valuation" }));

    expect(screen.getByRole("link", { name: "Valuation" })).toHaveClass("is-active");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveClass("is-active");
  });

  it("follows the report section entering the reading position", () => {
    render(<ReportNav />);
    const valuation = document.getElementById("valuation")!;

    act(() => observerCallback?.([{ target: valuation, isIntersecting: true, boundingClientRect: { top: 120 } } as IntersectionObserverEntry], {} as IntersectionObserver));

    expect(screen.getByRole("link", { name: "Valuation" })).toHaveClass("is-active");
  });
});
