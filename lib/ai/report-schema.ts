import { z } from "zod";

// Narrative structures the model must return (JSON mode). Prose only —
// every numeric claim inside these strings still has to pass the numeric
// guard against the sourced-facts allowlist before the report is accepted.

const prose = z.string().min(1);

export const scenarioSchema = z.object({
  label: z.enum(["bull", "base", "bear"]),
  summary: prose,
});

// Research report (assignment part one): section keys mirror the report
// section nav in Final-design.md §14.
export const researchNarrativeSchema = z.object({
  overview: prose,
  businessModel: prose,
  financialPerformance: prose,
  balanceSheet: prose,
  valuation: prose,
  peers: prose,
  recentDevelopments: prose,
  growthDrivers: prose,
  catalysts: prose,
  risks: z.array(prose).min(1),
  scenarios: z.array(scenarioSchema).length(3),
  thesis: prose,
  limitations: z.array(prose),
});
export type ResearchNarrative = z.infer<typeof researchNarrativeSchema>;

// Daily idea narrative (assignment part two).
export const dailyIdeaNarrativeSchema = z.object({
  selectionReason: prose,
  thesisPoints: z.array(prose).length(3),
  keyCatalyst: prose,
  bullCase: prose,
  bearCase: prose,
  risks: z.array(prose).min(1),
  confidenceRationale: prose,
});
export type DailyIdeaNarrative = z.infer<typeof dailyIdeaNarrativeSchema>;
