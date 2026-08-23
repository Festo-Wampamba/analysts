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
//
// `peers` is deliberately absent here: it is built server-side from
// `facts.peers` (lib/research/report.ts) rather than free-generated, so the
// model is never asked for it and never validated on it.
export const modelNarrativeSchema = z.object({
  overview: prose,
  businessModel: prose,
  financialPerformance: prose,
  balanceSheet: prose,
  valuation: prose,
  recentDevelopments: prose,
  growthDrivers: prose,
  catalysts: prose,
  risks: z.array(prose).min(1),
  scenarios: z.array(scenarioSchema).length(3),
  thesis: prose,
  limitations: z.array(prose),
});
export type ModelResearchNarrative = z.infer<typeof modelNarrativeSchema>;

// The full narrative the UI consumes: the model shape plus the
// server-composed `peers` field.
export const researchNarrativeSchema = modelNarrativeSchema.extend({
  peers: prose,
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
