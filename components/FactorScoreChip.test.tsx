// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FactorScoreChip, factorScoreTone } from "./FactorScoreChip";

describe("FactorScoreChip", () => {
  it("uses restrained, labeled tones for each score band", () => {
    expect(factorScoreTone(0.8)).toBe("positive");
    expect(factorScoreTone(0.5)).toBe("neutral");
    expect(factorScoreTone(0.2)).toBe("weak");

    const { rerender } = render(<FactorScoreChip label="Growth" score={0.8} />);
    expect(screen.getByText("Growth 0.80")).toHaveClass("factor-chip--positive");
    rerender(<FactorScoreChip label="Growth" score={0.5} />);
    expect(screen.getByText("Growth 0.50")).toHaveClass("factor-chip--neutral");
    rerender(<FactorScoreChip label="Growth" score={0.2} />);
    expect(screen.getByText("Growth 0.20")).toHaveClass("factor-chip--weak");
  });
});
