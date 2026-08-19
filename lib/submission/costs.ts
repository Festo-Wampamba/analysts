export const GROQ_RATE_PER_MILLION_TOKENS = {
  input: 0.15,
  output: 0.6,
} as const;

export const REPORT_TOKEN_ASSUMPTION = {
  input: 4_000,
  output: 1_000,
} as const;

export const MONTHLY_REPORT_ASSUMPTION = {
  scheduledDailyIdeas: 22,
  manualResearchReports: 100,
} as const;

export function estimateGenerationCostUsd(
  inputTokens: number,
  outputTokens: number,
): number {
  return (
    (inputTokens / 1_000_000) * GROQ_RATE_PER_MILLION_TOKENS.input +
    (outputTokens / 1_000_000) * GROQ_RATE_PER_MILLION_TOKENS.output
  );
}

export const TYPICAL_REPORT_COST_USD = estimateGenerationCostUsd(
  REPORT_TOKEN_ASSUMPTION.input,
  REPORT_TOKEN_ASSUMPTION.output,
);

export const MONTHLY_REPORT_COUNT =
  MONTHLY_REPORT_ASSUMPTION.scheduledDailyIdeas +
  MONTHLY_REPORT_ASSUMPTION.manualResearchReports;

export const TYPICAL_MONTHLY_LLM_COST_USD =
  TYPICAL_REPORT_COST_USD * MONTHLY_REPORT_COUNT;
