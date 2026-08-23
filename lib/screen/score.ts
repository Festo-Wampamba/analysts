// Daily Stock Idea Engine scoring — pure and deterministic, no I/O.
//
// Methodology (README §ranking): every factor component is percentile-ranked
// cross-sectionally against the same day's universe, so scores answer "how
// does this ticker compare to the alternatives today", not "is 12% margin
// good in the abstract". Factor sub-scores are stored per candidate
// (screen_candidates.sub_scores) so ranking outcomes stay explainable.

export type FactorName =
  | "growth"
  | "profitability"
  | "valuation"
  | "financialStrength"
  | "momentum"
  | "sentiment"
  | "insiderActivity";

export type CandidateMetrics = {
  revenueGrowthTTMYoy?: number;
  epsGrowthTTMYoy?: number;
  netProfitMarginTTM?: number;
  roeTTM?: number;
  peTTM?: number;
  psTTM?: number;
  debtToEquityQuarterly?: number;
  currentRatioQuarterly?: number;
  priceReturn13Week?: number;
  priceReturn26Week?: number;
  /** (strongBuy + buy) / total analysts, latest period, 0..1 */
  analystBuyRatio?: number;
  /** net insider share change over the lookback window (buys - sells) */
  insiderNetShareChange?: number;
};

export type CandidateInput = {
  ticker: string;
  sector?: string;
  catalyst?: string;
  metrics: CandidateMetrics;
};

export type ScoredCandidate = {
  ticker: string;
  sector?: string;
  catalyst?: string;
  /** null = no data for any component of the factor */
  subScores: Record<FactorName, number | null>;
  /** weighted mean of available factor sub-scores, 0..1, 4 dp */
  compositeScore: number;
  /** fraction of total factor weight backed by real data, 0..1, 4 dp */
  coverage: number;
  qualified: boolean;
};

export type ScoringConfig = {
  weights: Record<FactorName, number>;
  /** minimum composite score to qualify as the daily idea */
  threshold: number;
  /** minimum data coverage to qualify — a great score on 30% data is noise */
  minCoverage: number;
};

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  weights: {
    growth: 0.2,
    profitability: 0.2,
    valuation: 0.2,
    financialStrength: 0.15,
    momentum: 0.15,
    sentiment: 0.05,
    insiderActivity: 0.05,
  },
  threshold: 0.65,
  minCoverage: 0.6,
};

/** Reconstruct stored candidate coverage from the same factor weights used by
 * the deterministic scorer. This keeps historical rows explainable without
 * requiring a schema change just to display the persisted queue. */
export function coverageForSubScores(
  subScores: Partial<Record<FactorName, number | null>>,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): number {
  const totalWeight = Object.values(config.weights).reduce((sum, weight) => sum + weight, 0);
  const availableWeight = (Object.keys(config.weights) as FactorName[]).reduce(
    (sum, factor) => sum + (typeof subScores[factor] === "number" ? config.weights[factor] : 0),
    0,
  );
  return totalWeight > 0 ? round4(availableWeight / totalWeight) : 0;
}

type Component = {
  extract: (m: CandidateMetrics) => number | undefined;
  lowerIsBetter?: boolean;
};

const positive = (v: number | undefined) =>
  v !== undefined && v > 0 ? v : undefined;

const FACTOR_COMPONENTS: Record<FactorName, Component[]> = {
  growth: [
    { extract: (m) => m.revenueGrowthTTMYoy },
    { extract: (m) => m.epsGrowthTTMYoy },
  ],
  profitability: [
    { extract: (m) => m.netProfitMarginTTM },
    { extract: (m) => m.roeTTM },
  ],
  valuation: [
    // Negative P/E or P/S (losses / negative revenue) would percentile-rank as
    // "cheap"; exclude instead — profitability already punishes losses.
    { extract: (m) => positive(m.peTTM), lowerIsBetter: true },
    { extract: (m) => positive(m.psTTM), lowerIsBetter: true },
  ],
  financialStrength: [
    // Negative D/E means negative equity, not low leverage; exclude.
    { extract: (m) => positive(m.debtToEquityQuarterly), lowerIsBetter: true },
    { extract: (m) => m.currentRatioQuarterly },
  ],
  momentum: [
    { extract: (m) => m.priceReturn13Week },
    { extract: (m) => m.priceReturn26Week },
  ],
  sentiment: [{ extract: (m) => m.analystBuyRatio }],
  insiderActivity: [{ extract: (m) => m.insiderNetShareChange }],
};

const FACTORS = Object.keys(FACTOR_COMPONENTS) as FactorName[];

const round4 = (v: number) => Math.round(v * 10_000) / 10_000;

// Fractional percentile rank among defined values: strictly-lower count plus
// half of the other equal values, over n-1. A lone defined value scores 0.5
// (no cross-sectional information either way).
function percentileScores(values: (number | undefined)[]): (number | undefined)[] {
  const defined = values.filter((v): v is number => v !== undefined);
  if (defined.length === 0) return values.map(() => undefined);
  if (defined.length === 1) return values.map((v) => (v === undefined ? undefined : 0.5));

  return values.map((v) => {
    if (v === undefined) return undefined;
    let below = 0;
    let equal = 0;
    for (const other of defined) {
      if (other < v) below += 1;
      else if (other === v) equal += 1;
    }
    return (below + (equal - 1) / 2) / (defined.length - 1);
  });
}

export function scoreCandidates(
  inputs: CandidateInput[],
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): ScoredCandidate[] {
  if (inputs.length === 0) return [];

  // factor -> per-candidate sub-score (mean of its components' percentiles)
  const factorScores = new Map<FactorName, (number | undefined)[]>();

  for (const factor of FACTORS) {
    const componentScores = FACTOR_COMPONENTS[factor].map((component) => {
      const raw = inputs.map((input) => component.extract(input.metrics));
      const scores = percentileScores(raw);
      return component.lowerIsBetter
        ? scores.map((s) => (s === undefined ? undefined : 1 - s))
        : scores;
    });

    factorScores.set(
      factor,
      inputs.map((_, i) => {
        const defined = componentScores
          .map((scores) => scores[i])
          .filter((s): s is number => s !== undefined);
        if (defined.length === 0) return undefined;
        return defined.reduce((a, b) => a + b, 0) / defined.length;
      }),
    );
  }

  const totalWeight = FACTORS.reduce((sum, f) => sum + config.weights[f], 0);

  const scored = inputs.map((input, i) => {
    const subScores = {} as Record<FactorName, number | null>;
    let weightedSum = 0;
    let availableWeight = 0;

    for (const factor of FACTORS) {
      const score = factorScores.get(factor)![i];
      if (score === undefined) {
        subScores[factor] = null;
      } else {
        subScores[factor] = round4(score);
        weightedSum += config.weights[factor] * score;
        availableWeight += config.weights[factor];
      }
    }

    const compositeScore =
      availableWeight > 0 ? round4(weightedSum / availableWeight) : 0;
    const coverage = round4(availableWeight / totalWeight);

    return {
      ticker: input.ticker,
      sector: input.sector,
      catalyst: input.catalyst,
      subScores,
      compositeScore,
      coverage,
      qualified:
        compositeScore >= config.threshold && coverage >= config.minCoverage,
    };
  });

  // Deterministic order: composite desc, ticker asc on ties.
  return scored.sort(
    (a, b) =>
      b.compositeScore - a.compositeScore || a.ticker.localeCompare(b.ticker),
  );
}
