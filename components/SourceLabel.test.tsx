// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SourceLabel } from "./SourceLabel";

describe("SourceLabel", () => {
  it("renders the provider name and fresh status", () => {
    render(
      <SourceLabel
        provenance={{
          provider: "finnhub",
          endpoint: "/quote",
          fetchedAt: "2026-08-05T10:07:25.451Z",
          status: "fresh",
          httpStatus: 200,
        }}
      />,
    );
    expect(screen.getByText("finnhub")).toBeInTheDocument();
    expect(screen.getByText("fresh")).toBeInTheDocument();
  });

  it("renders a failed source with the danger tone", () => {
    render(
      <SourceLabel
        provenance={{
          provider: "groq",
          fetchedAt: "2026-08-05T10:07:25.451Z",
          status: "failed",
        }}
      />,
    );
    expect(screen.getByText("failed")).toHaveClass("text-danger");
  });
});
