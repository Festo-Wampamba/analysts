export const factorLabels: Record<string, string> = {
  growth: "Growth",
  profitability: "Profitability",
  valuation: "Valuation",
  financialStrength: "Financial strength",
  momentum: "Momentum",
  sentiment: "Analyst sentiment",
  insiderActivity: "Insider activity",
};

export function factorScoreTone(score: number): "positive" | "neutral" | "weak" {
  if (score >= 0.66) return "positive";
  if (score >= 0.33) return "neutral";
  return "weak";
}

export function FactorScoreChip({ label, score }: { label: string; score: number }) {
  const tone = factorScoreTone(score);
  return <span className={`factor-chip factor-chip--${tone}`}>{label} {score.toFixed(2)}</span>;
}

export function leadingFactor(subScores: unknown): { label: string; score: number } | null {
  if (!subScores || typeof subScores !== "object") return null;
  const ranked = Object.entries(subScores as Record<string, unknown>)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number")
    .sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return null;
  return { label: factorLabels[ranked[0][0]] ?? ranked[0][0], score: ranked[0][1] };
}
