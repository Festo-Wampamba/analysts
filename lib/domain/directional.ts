// Directional value model from Final-design.md §13.2–§13.3.
// Direction is decided here, in the domain layer; the UI only renders it.

export type Direction = "positive" | "negative" | "neutral";

export type DirectionalValue = {
  value: number;
  formatted: string;
  direction: Direction;
  comparisonLabel?: string; // e.g. "vs previous close"
};

export function toDirection(value: number): Direction {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

// §13.3: direction of a chart period from its endpoints.
export function chartDirection(firstClose: number, lastClose: number): Direction {
  return toDirection(lastClose - firstClose);
}

const deltaFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});

export function formatDelta(value: number): string {
  return deltaFormat.format(value);
}

export function formatPercent(value: number): string {
  return `${deltaFormat.format(value)}%`;
}

export function directionalDelta(
  value: number,
  comparisonLabel?: string,
): DirectionalValue {
  return {
    value,
    formatted: formatDelta(value),
    direction: toDirection(value),
    comparisonLabel,
  };
}

export function directionalPercent(
  value: number,
  comparisonLabel?: string,
): DirectionalValue {
  return {
    value,
    formatted: formatPercent(value),
    direction: toDirection(value),
    comparisonLabel,
  };
}
