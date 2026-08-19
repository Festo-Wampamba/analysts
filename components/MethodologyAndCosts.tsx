import { FactLabel, Panel } from "@/components/ResearchWorkspaceView";
import { DEFAULT_SCORING_CONFIG } from "@/lib/screen/score";
import { SCREEN_UNIVERSE } from "@/lib/screen/universe";
import {
  MONTHLY_REPORT_ASSUMPTION,
  MONTHLY_REPORT_COUNT,
  REPORT_TOKEN_ASSUMPTION,
  TYPICAL_MONTHLY_LLM_COST_USD,
  TYPICAL_REPORT_COST_USD,
} from "@/lib/submission/costs";

const factorLabels = {
  growth: "Growth",
  profitability: "Profitability",
  valuation: "Valuation",
  financialStrength: "Financial strength",
  momentum: "Momentum",
  sentiment: "Analyst sentiment",
  insiderActivity: "Insider activity",
} as const;

function usd(value: number, digits = 4): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function MethodologyAndCosts() {
  const sectors = new Set(SCREEN_UNIVERSE.map((entry) => entry.sector)).size;

  return (
    <section className="submission-notes" id="methodology" aria-labelledby="methodology-title">
      <header className="submission-notes__head">
        <FactLabel>Assignment evidence</FactLabel>
        <h2 id="methodology-title">Methodology &amp; operating cost</h2>
        <p>The ranking is deterministic; the model writes the narrative only after the sourced screen has selected a qualifying company.</p>
      </header>
      <div className="submission-notes__grid">
        <Panel className="methodology-card">
          <div className="submission-card__head"><span>01</span><h3>Stock-ranking methodology</h3></div>
          <p>{SCREEN_UNIVERSE.length} US-listed companies across {sectors} sectors are compared against the same day&apos;s universe using cross-sectional percentile ranks.</p>
          <div className="factor-weight-list">
            {Object.entries(DEFAULT_SCORING_CONFIG.weights).map(([factor, weight]) => (
              <div key={factor}><span>{factorLabels[factor as keyof typeof factorLabels]}</span><strong>{Math.round(weight * 100)}%</strong></div>
            ))}
          </div>
          <ul>
            <li>Growth, profitability, valuation, balance-sheet strength, momentum, analyst sentiment, and insider activity use sourced Finnhub metrics.</li>
            <li>Lower positive P/E, P/S, and debt-to-equity values score better; invalid negative valuation multiples are excluded.</li>
            <li>Missing factors are not treated as zero. Available weights are re-normalized and data coverage is reported separately.</li>
            <li>A pick requires a score of at least {DEFAULT_SCORING_CONFIG.threshold.toFixed(2)} and coverage of at least {DEFAULT_SCORING_CONFIG.minCoverage.toFixed(2)}. Otherwise the engine publishes no idea.</li>
          </ul>
        </Panel>
        <Panel className="cost-card">
          <div className="submission-card__head"><span>02</span><h3>Estimated operating cost</h3></div>
          <p className="cost-card__date">Planning estimate · August 2026 · USD</p>
          <div className="cost-metrics">
            <div><span>One generated report</span><strong>{usd(TYPICAL_REPORT_COST_USD)}</strong><small>up to {usd(TYPICAL_REPORT_COST_USD * 2)} if the numerical-verification retry runs</small></div>
            <div><span>Monthly LLM usage</span><strong>~{usd(TYPICAL_MONTHLY_LLM_COST_USD, 2)}</strong><small>{MONTHLY_REPORT_COUNT} reports; ~{usd(TYPICAL_MONTHLY_LLM_COST_USD * 2, 2)} if every report retries</small></div>
            <div><span>Estimated total stack</span><strong>~$6–$10 / month</strong><small>current low-volume VPS plus free database and email tiers</small></div>
          </div>
          <p className="cost-assumption">Assumes {REPORT_TOKEN_ASSUMPTION.input.toLocaleString("en-US")} uncached input and {REPORT_TOKEN_ASSUMPTION.output.toLocaleString("en-US")} output tokens per report, {MONTHLY_REPORT_ASSUMPTION.scheduledDailyIdeas} scheduled ideas, and {MONTHLY_REPORT_ASSUMPTION.manualResearchReports} manual reports each month. Market-data upgrades, domain, tax, and regional VPS pricing are excluded.</p>
          <div className="pricing-links" aria-label="Pricing references">
            <a href="https://groq.com/pricing" target="_blank" rel="noreferrer">Groq pricing</a>
            <a href="https://neon.com/pricing" target="_blank" rel="noreferrer">Neon pricing</a>
            <a href="https://resend.com/pricing" target="_blank" rel="noreferrer">Resend pricing</a>
          </div>
        </Panel>
      </div>
    </section>
  );
}
