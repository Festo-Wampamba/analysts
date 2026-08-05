import type { DailyIdeaNarrative } from "@/lib/ai/report-schema";
import type { GeneratedContentMeta, Provenance } from "@/lib/domain/provenance";
import type { FactorName, ScoredCandidate } from "./score";

// The sourced facts behind a daily idea: screen output plus the enrichment
// fetched for the winner only. Also the numeric-guard allowlist source.
export type DailyIdeaFacts = {
  ticker: string;
  sector?: string;
  company?: { name: string; marketCapMillions?: number; currency?: string };
  price?: { current: number; previousClose: number; changePercent: number };
  metrics: Record<string, number>;
  factorScores: Record<FactorName, number | null>;
  compositeScore: number;
  coverage: number;
  threshold: number;
  universeEvaluated: number;
  /** median P/E of the winner's sector in today's universe, when computable */
  sectorMedianPe?: number;
  news?: { headline: string; source: string; url: string; date: string }[];
};

export type DailyIdeaPayload = {
  facts: DailyIdeaFacts;
  narrative: DailyIdeaNarrative;
  generated: GeneratedContentMeta;
  provenance: Provenance[];
};

export type ScreenRunResult = {
  tradingDate: string;
  runId: number;
  status: "complete" | "no_qualifying_idea" | "running";
  universeSize: number;
  universeEvaluated: number;
  threshold: number;
  highestScore: number | null;
  topCandidates: ScoredCandidate[];
  idea: DailyIdeaPayload | null;
  emailDelivered: boolean;
  emailError: string | null;
  alreadyRan: boolean;
};
