// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { TickerSearch } from "./TickerSearch";

afterEach(() => {
  cleanup();
  push.mockReset();
  window.localStorage.clear();
});

describe("TickerSearch", () => {
  it("filters the known universe by company name and navigates with the keyboard", () => {
    render(<TickerSearch />);
    const input = screen.getByRole("combobox", { name: "Ticker symbol" });

    fireEvent.change(input, { target: { value: "micr" } });
    expect(screen.getByRole("option", { name: "MSFT Microsoft" })).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(push).toHaveBeenCalledWith("/research/MSFT");
  });

  it("shows and clears the last five recent searches without an external call", () => {
    window.localStorage.setItem("analysts.recent-tickers", JSON.stringify(["NVDA", "TSLA"]));
    render(<TickerSearch />);
    const input = screen.getByRole("combobox", { name: "Ticker symbol" });
    fireEvent.focus(input);

    expect(screen.getByRole("listbox", { name: "Recent searches" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "NVDA NVIDIA" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("analysts.recent-tickers")).toBeNull();
  });

  it("explains invalid ticker input inline instead of navigating", () => {
    render(<TickerSearch />);
    const input = screen.getByRole("combobox", { name: "Ticker symbol" });

    fireEvent.change(input, { target: { value: "NVDA!" } });
    fireEvent.submit(input.closest("form")!);

    expect(screen.getByRole("status")).toHaveTextContent("Enter a valid ticker symbol");
    expect(push).not.toHaveBeenCalled();
  });
});
