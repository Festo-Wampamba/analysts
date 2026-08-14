import { CopyThesisButton } from "@/components/CopyThesisButton";
import { CandidateCarousel } from "@/components/CandidateCarousel";
import { FactLabel, Panel } from "@/components/ResearchWorkspaceView";
import type { LatestIdea } from "@/lib/screen/get-latest-idea";

function StatusIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 1-4.3-7.1" /><path d="m9 11 2 2 5-6" /></svg>;
}

function formatMoney(value: number | undefined, currency = "USD") {
  if (value === undefined || !Number.isFinite(value)) return "—";
  const safeCurrency = /^[A-Z]{3}$/.test(currency.toUpperCase()) ? currency.toUpperCase() : "USD";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: safeCurrency, maximumFractionDigits: 2 }).format(value);
}

function formatEt(value: Date | string | null | undefined) {
  if (!value) return "Unavailable";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

const factorLabels: Record<string, string> = {
  growth: "Growth",
  profitability: "Profitability",
  valuation: "Valuation",
  financialStrength: "Financial strength",
  momentum: "Momentum",
  sentiment: "Analyst sentiment",
  insiderActivity: "Insider activity",
};

function strongestFactor(subScores: unknown): string {
  if (!subScores || typeof subScores !== "object") return "Factor detail unavailable";
  const ranked = Object.entries(subScores as Record<string, unknown>)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number")
    .sort((a, b) => b[1] - a[1]);
  return ranked.length ? `${factorLabels[ranked[0][0]] ?? ranked[0][0]} led the relative score` : "Factor detail unavailable";
}

function isStale(idea: LatestIdea): boolean {
  const now = new Date();
  const latest = new Date(`${idea.tradingDate}T23:59:59-04:00`);
  return now.getTime() - latest.getTime() > 3 * 86_400_000;
}

export function DailyIdeaView({ latest }: { latest: LatestIdea | null }) {
  const attempt = latest?.latestAttempt;
  const idea = latest?.idea;
  const hasPick = !!(latest?.ticker && idea);
  const stale = latest ? isStale(latest) : false;
  const failedLatest = attempt?.status === "failed" && attempt.tradingDate !== latest?.tradingDate;

  return (
    <main className="daily-layout" id="daily-idea">
      <header className="daily-header"><div className="hero-meta"><FactLabel tone="ai">Daily idea engine</FactLabel><span>{latest ? `${latest.tradingDate} · ${attempt?.status ?? latest.run?.status}` : "No completed screen"}</span></div><h1>Today&apos;s idea</h1>{stale && <p className="data-warning">The most recent publishable result is stale. The latest screen status is shown below.</p>}</header>

      {latest?.candidates.length ? <CandidateCarousel candidates={latest.candidates} initialTicker={latest.ticker} /> : null}

      {hasPick ? (
        <section className="daily-pick">
          <div className="daily-pick-grid"><div className="daily-pick-main"><FactLabel tone="ai">{idea.generated.status === "fallback" ? "Verified fallback" : "Today’s pick"}</FactLabel><div className="daily-title"><h2>{idea.facts.ticker}</h2><span>{idea.facts.company?.name ?? idea.facts.ticker}</span></div><div className="daily-tags"><span>{idea.facts.sector ?? "Sector unavailable"}</span><span>Rank 1 of {idea.facts.universeEvaluated}</span></div><div className="score-line"><span>Score</span><i><b style={{ width: `${Math.max(0, Math.min(1, idea.facts.compositeScore)) * 100}%` }} /></i><strong>{idea.facts.compositeScore.toFixed(2)}</strong></div></div><div className="daily-pick-side"><Panel className="quote-card"><FactLabel>Finnhub · Quote</FactLabel><div className="quote-line"><strong>{formatMoney(idea.facts.price?.current, idea.facts.company?.currency)}</strong>{idea.facts.price?.changePercent !== undefined && <span className={idea.facts.price.changePercent >= 0 ? "trend-up" : "trend-down"}>{idea.facts.price.changePercent >= 0 ? "▲" : "▼"} {Math.abs(idea.facts.price.changePercent).toFixed(2)}%</span>}</div></Panel><Panel className="metrics-card"><FactLabel>Screen · Strongest factors</FactLabel><div className="daily-metrics">{Object.entries(idea.facts.factorScores).filter((entry): entry is [string, number] => typeof entry[1] === "number").sort((a, b) => b[1] - a[1]).slice(0, 3).map(([factor, score]) => <div key={factor}><span>{factorLabels[factor] ?? factor}</span><strong>{score.toFixed(2)}</strong></div>)}</div></Panel></div></div>
          <Panel className="daily-reason"><FactLabel tone="ai">{idea.generated.status === "fallback" ? "Verified fallback" : "AI-generated"} · Why it ranked first</FactLabel><p>{idea.narrative.selectionReason}</p></Panel>
          <div className="daily-actions"><a className="button button--primary" href={`/research/${idea.facts.ticker}`}>Open full report</a><CopyThesisButton text={[idea.narrative.selectionReason, ...idea.narrative.thesisPoints].join("\n")} /><span>Surfaced {formatEt(latest.run?.finishedAt)}</span></div>
        </section>
      ) : (
        <section className="daily-pick daily-pick--empty"><div className="empty-pick-grid"><div><FactLabel tone="ai">Daily screen</FactLabel><h2>{attempt?.status === "running" ? "Screen in progress" : attempt?.status === "failed" ? "Latest screen failed" : latest ? "No qualifying idea today" : "No screen has completed yet"}</h2><p>{attempt?.status === "failed" ? "The last run did not produce a publishable result. A failed run can be safely retried without duplicating the day." : latest ? `No candidate cleared the ${latest.threshold.toFixed(2)} qualifying threshold. The engine does not publish a pick merely to fill the slot.` : "The first scheduled screen will populate this workspace."}</p><div className="daily-actions"><a className="button" href="#research">Research the latest candidate</a></div></div><Panel className="engine-snapshot"><FactLabel>Engine · Latest attempt</FactLabel><div><span>Universe evaluated</span><strong>{attempt?.universeEvaluated ?? 0}</strong></div><div><span>Highest score</span><strong>{attempt?.highestScore?.toFixed(2) ?? "—"}</strong></div><div><span>Threshold</span><strong>{latest?.threshold.toFixed(2) ?? "—"}</strong></div></Panel></div></section>
      )}

      {latest && <div className="daily-engine-grid"><Panel className="daily-table-card"><div className="daily-card-head"><h2>Ranked candidates</h2><span>Finnhub metrics · engine score</span></div><div className="candidate-table"><div className="candidate-row candidate-row--head"><span>Ticker</span><span>Score</span><span>Sector</span><span>Leading evidence</span><span>Conf.</span></div>{latest.candidates.map((candidate) => <div className="candidate-row" key={candidate.ticker}><strong><a href={`/research/${candidate.ticker}`}>{candidate.ticker}</a></strong><span>{candidate.compositeScore.toFixed(2)}</span><span>{candidate.sector ?? "—"}</span><span>{candidate.catalyst ?? strongestFactor(candidate.subScores)}</span><strong className={candidate.compositeScore >= latest.threshold ? "trend-up" : "trend-neutral"}>{candidate.compositeScore.toFixed(2)}</strong></div>)}</div><small>Scores and sectors are sourced or deterministic. Generated catalyst text is used only for the winning idea.</small></Panel><Panel className="daily-engine-card"><div className="daily-card-head"><h2>Engine status</h2><span className={attempt?.status === "complete" || attempt?.status === "no_qualifying_idea" ? "verified" : "status-attention"}><StatusIcon />{attempt?.status ?? "Not run"}</span></div><div className="engine-details"><div><span>Last attempt</span><strong>{formatEt(attempt?.startedAt)}</strong></div><div><span>Duration</span><strong>{attempt?.durationMs == null ? "—" : `${(attempt.durationMs / 1000).toFixed(1)}s`}</strong></div><div><span>Universe size</span><strong>{attempt?.universeSize ?? latest.run?.universeSize ?? 0} tickers</strong></div><div><span>Latest publishable result</span><strong>{latest.tradingDate}</strong></div></div>{failedLatest && <div className="engine-recovery" role="status"><strong>Recovery ready</strong><p>The prior verified result remains visible. The next authorized screen starts a clean run with the verified narrative fallback enabled.</p>{attempt?.error && <code>{attempt.error}</code>}</div>}<p>{failedLatest ? "The failed attempt is recorded for audit; it does not replace the last verified research result." : "The engine screens once per trading day and publishes only when a candidate clears the configured bar."}</p></Panel></div>}
    </main>
  );
}
