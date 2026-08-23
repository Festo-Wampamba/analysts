import type { ResearchFacts } from "@/lib/research/facts";

// Provider APIs return floating-point noise (5196224.1462541735,
// 4.569999999999999) that JSON.stringify then hands the model verbatim; the
// model echoes it straight into prose. Round before a number ever reaches a
// prompt so generated text only ever needs display-grade precision.
export function roundForPrompt(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(4)) : value;
}

// Recurses through a facts object/array, rounding every finite number and
// leaving strings, booleans, and other values untouched. Shared by every
// prompt builder that interpolates raw facts (research + screen).
export function roundNumbersForPrompt<T>(value: T): T {
  if (typeof value === "number") return roundForPrompt(value) as T;
  if (Array.isArray(value)) return value.map((item) => roundNumbersForPrompt(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [key, roundNumbersForPrompt(val)]),
    ) as T;
  }
  return value;
}

export function formatFactsForPrompt(facts: ResearchFacts): ResearchFacts {
  return roundNumbersForPrompt(facts);
}
