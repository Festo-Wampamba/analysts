// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DirectionalValue } from "./DirectionalValue";

describe("DirectionalValue", () => {
  it("renders a positive value with the success tone", () => {
    render(
      <DirectionalValue
        value={{ value: 1.5, formatted: "+1.50", direction: "positive" }}
      />,
    );
    expect(screen.getByText("+1.50")).toHaveClass("text-success");
  });

  it("renders a negative value with the danger tone", () => {
    render(
      <DirectionalValue
        value={{ value: -2.1, formatted: "-2.10", direction: "negative" }}
      />,
    );
    expect(screen.getByText("-2.10")).toHaveClass("text-danger");
  });

  it("renders the comparison label when provided", () => {
    render(
      <DirectionalValue
        value={{
          value: 0,
          formatted: "0.00",
          direction: "neutral",
          comparisonLabel: "vs previous close",
        }}
      />,
    );
    expect(screen.getByText("vs previous close")).toBeInTheDocument();
  });
});
