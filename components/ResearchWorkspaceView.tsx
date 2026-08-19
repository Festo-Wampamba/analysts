import { PriceChart } from "@/components/PriceChart";
import { LiveMarketStatus } from "@/components/LiveMarketStatus";
import { LocalizedDateTime, dateTimeOptions } from "@/components/LocalizedDateTime";
import { ReportNav } from "@/components/ReportNav";
import { TickerSearch } from "@/components/TickerSearch";
import Link from "next/link";
import type { Provenance } from "@/lib/domain/provenance";
import type { FinancialValue } from "@/lib/source/sec";
import type { ResearchWorkspace } from "@/lib/research/workspace";

type Tone = "up" | "down" | "neutral";
type Metric = { label: string; value: string; detail?: string; tone?: Tone };
type SourceSummary = Provenance & { occurrences: number };

function SearchIcon({ className = "" }: { className?: string }) {
  return <svg className={className} aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>;
}

function SparkIcon({ className = "" }: { className?: string }) {
  return <svg className={className} aria-hidden="true" viewBox="0 0 24 24"><path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" /><path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z" /></svg>;
}

function ChartIcon() {
  return <svg className="nav-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M4 19V9m6 10V5m6 14v-7m4 7H2" /></svg>;
}

export function FactLabel({ children, tone = "fact" }: { children: React.ReactNode; tone?: "fact" | "ai" }) {
  return <span className={`eyebrow eyebrow--${tone}`}>{tone === "ai" ? <SparkIcon className="chip-icon" /> : <SearchIcon className="chip-icon" />}{children}</span>;
}

export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`glass-panel ${className}`}>{children}</div>;
}

function formatMoney(value: number | undefined, currency = "USD"): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  const safeCurrency = /^[A-Z]{3}$/.test(currency.toUpperCase()) ? currency.toUpperCase() : "USD";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: safeCurrency,
    notation: Math.abs(value) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(value) >= 1_000_000 ? 1 : 2,
  }).format(value);
}

function formatCompact(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

function formatMetric(value: number | undefined, suffix = ""): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}${suffix}`;
}

function changeDetail(value: FinancialValue | undefined): { detail: string; tone: Tone } {
  if (!value || value.previousValue === undefined || value.previousValue === 0) {
    return { detail: "—", tone: "neutral" };
  }
  const percent = ((value.value - value.previousValue) / Math.abs(value.previousValue)) * 100;
  return {
    detail: `${percent >= 0 ? "▲" : "▼"} ${Math.abs(percent).toFixed(1)}%`,
    tone: percent >= 0 ? "up" : "down",
  };
}

function SectionHeading({ id, number, title }: { id: string; number: string; title: string }) {
  return <div className="section-heading"><h2 id={`${id}-title`}><span className="section-number">{number}</span>{title}</h2></div>;
}

export function AppTopbar({
  ticker,
  chartAsOf,
  quoteStatus = "Market data unavailable",
}: {
  ticker?: string | null;
  chartAsOf?: string | null;
  quoteStatus?: string;
}) {
  return (
    <nav className="topbar">
      <div className="topbar-inner">
        <Link className="brand-lockup" href="/" aria-label="Analysts home"><span className="brand-mark" aria-hidden="true">A</span><span className="brand-name">Analysts</span></Link>
        <div className="topbar-paths"><a className="nav-path nav-path--active" href="#research"><ChartIcon />Research</a><Link className="nav-path" href="/#daily-idea"><SparkIcon className="nav-icon" />Daily Idea</Link></div>
        <TickerSearch />
        <LiveMarketStatus ticker={ticker} initialAsOf={chartAsOf} unavailableLabel={quoteStatus} />
      </div>
    </nav>
  );
}

export function AppFooter() {
  return <footer className="site-footer"><div><span>analysts.korestandard.com · sourced market and filing data</span><span>Research output, not investment advice. <Link href="/#methodology">Methodology</Link></span></div></footer>;
}

function MetricPanel({ label, metrics, className = "" }: { label: string; metrics: Metric[]; className?: string }) {
  return <Panel className={`metric-panel ${className}`}><FactLabel>{label}</FactLabel><div className="metric-grid">{metrics.map((metric) => <div className="metric" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong>{metric.detail && <em className={metric.tone === "up" ? "trend-up" : metric.tone === "down" ? "trend-down" : "trend-neutral"}>{metric.detail}</em>}</div>)}</div></Panel>;
}

function AiPanel({ children, fallback }: { children: React.ReactNode; fallback: boolean }) {
  return <Panel className="ai-panel"><FactLabel tone="ai">{fallback ? "Verified fallback" : "AI-generated"}</FactLabel>{children}</Panel>;
}

export function summarizeProvenance(sources: Provenance[]): SourceSummary[] {
  const grouped = new Map<string, SourceSummary>();
  for (const source of sources) {
    const key = [source.provider, source.endpoint ?? "provider snapshot", source.status].join("|");
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...source, occurrences: 1 });
      continue;
    }
    const existingTime = Date.parse(existing.providerTimestamp ?? existing.fetchedAt);
    const sourceTime = Date.parse(source.providerTimestamp ?? source.fetchedAt);
    grouped.set(key, {
      ...(sourceTime > existingTime ? source : existing),
      occurrences: existing.occurrences + 1,
    });
  }
  return [...grouped.values()].sort((a, b) =>
    a.provider.localeCompare(b.provider) || (a.endpoint ?? "").localeCompare(b.endpoint ?? ""),
  );
}

export function ResearchWorkspaceView({ workspace, confidence }: { workspace: ResearchWorkspace; confidence?: number | null }) {
  const { report, financials, peers, earnings, chart, additionalProvenance, failedSections } = workspace;
  const { facts, narrative, generated } = report;
  const primaryQuote = peers.find((peer) => peer.ticker === facts.ticker);
  const quotePrice = primaryQuote?.price ?? facts.quote?.price;
  const quoteChange = primaryQuote?.changePercent ?? facts.quote?.changePercent.value;
  const currency = facts.company?.currency ?? "USD";
  const fallback = generated.status === "fallback";
  const overviewMetrics: Metric[] = [
    { label: "Market cap", value: facts.company?.marketCapMillions === undefined ? "—" : formatMoney(facts.company.marketCapMillions * 1_000_000, currency) },
    { label: "Shares out.", value: facts.company?.sharesOutstandingMillions === undefined ? "—" : formatCompact(facts.company.sharesOutstandingMillions * 1_000_000) },
    { label: "Exchange", value: facts.company?.exchange ?? "—" },
    { label: "IPO", value: facts.company?.ipo ?? "—" },
    { label: "52-week high", value: formatMoney(facts.momentum?.week52High, currency) },
    { label: "52-week low", value: formatMoney(facts.momentum?.week52Low, currency) },
  ];
  const financialRows: Metric[] = financials
    ? [
        ["Revenue", financials.revenue],
        ["Gross profit", financials.grossProfit],
        ["Operating income", financials.operatingIncome],
        ["Net income", financials.netIncome],
        ["Diluted EPS", financials.dilutedEps],
        ["Free cash flow", financials.freeCashFlow],
        ["Net cash", financials.netCash],
      ].map(([label, raw]) => {
        const value = raw as FinancialValue | undefined;
        const change = changeDetail(value);
        return { label: label as string, value: value?.unit === "USD/shares" ? formatMoney(value.value, currency) : formatMoney(value?.value, currency), ...change };
      })
    : [];
  const valuationMetrics: Metric[] = [
    { label: "P/E (TTM)", value: formatMetric(facts.valuation?.peTTM) },
    { label: "P/S (TTM)", value: formatMetric(facts.valuation?.psTTM) },
    { label: "P/B", value: formatMetric(facts.valuation?.pbQuarterly) },
    { label: "EV / FCF", value: formatMetric(facts.valuation?.evToFreeCashFlowTTM) },
    { label: "Dividend yield", value: formatMetric(facts.valuation?.dividendYieldPercent, "%") },
    { label: "Beta", value: formatMetric(facts.momentum?.beta) },
  ];
  const rawProvenance = [...report.provenance, ...additionalProvenance].filter(
    (item, index, all) => all.findIndex((candidate) => candidate.provider === item.provider && candidate.endpoint === item.endpoint && candidate.fetchedAt === item.fetchedAt) === index,
  );
  const provenance = summarizeProvenance(rawProvenance);
  const providerCount = new Set(provenance.map((source) => source.provider)).size;

  return (
    <main className="research-layout" id="research">
      <ReportNav />
      <article className="report-column">
        <header className="research-hero">
          <div className="hero-meta"><FactLabel>Ticker research</FactLabel><span>Generated <LocalizedDateTime value={generated.generatedAt} options={dateTimeOptions} />{report.cached ? " · cached narrative" : ""}</span></div>
          <div className="hero-title-row"><h1>{facts.ticker}</h1><div><strong>{facts.company?.name ?? facts.ticker}</strong><span>{[facts.company?.exchange, facts.company?.industry, facts.company?.country].filter(Boolean).join(" · ") || "Company profile unavailable"}</span></div></div>
          <div className="hero-profile-grid">
            <div className="quote-card"><FactLabel>Finnhub · Quote</FactLabel><div className="quote-line"><strong>{formatMoney(quotePrice, currency)}</strong>{quoteChange !== undefined && <span className={quoteChange >= 0 ? "trend-up" : "trend-down"}>{quoteChange >= 0 ? "▲" : "▼"} {Math.abs(quoteChange).toFixed(2)}%</span>}</div><small>As of <LocalizedDateTime value={primaryQuote?.quoteAsOf} options={dateTimeOptions} /> · prev close {formatMoney(primaryQuote?.previousClose ?? facts.quote?.previousClose, currency)}</small></div>
            <Panel className="read-card"><span className="read-card__title">How to read this report</span><span><SearchIcon className="chip-icon" />Provider icon — sourced fact with a named provider</span><span><SparkIcon className="chip-icon" />Spark icon — generated or deterministic narrative</span></Panel>
          </div>
          <PriceChart ticker={facts.ticker} currency={currency} initial={chart} />
        </header>

        <section className="report-section" id="overview"><SectionHeading id="overview" number="01" title="Overview" /><MetricPanel label="Finnhub · Company profile" metrics={overviewMetrics} /><AiPanel fallback={fallback}><p>{narrative.overview}</p><p>{narrative.businessModel}</p></AiPanel></section>

        <section className="report-section" id="financials"><SectionHeading id="financials" number="02" title="Financials" />{financials ? <Panel className="financial-panel"><FactLabel>SEC · Annual filing · {financials.periodEnd}</FactLabel><div className="financial-table">{financialRows.map((row) => <div className="financial-row" key={row.label}><span>{row.label}</span><strong>{row.value}</strong><em className={row.tone === "up" ? "trend-up" : row.tone === "down" ? "trend-down" : "trend-neutral"}>{row.detail}</em></div>)}</div></Panel> : <Panel className="unavailable-panel"><FactLabel>SEC · Unavailable</FactLabel><p>Filing-derived financials are unavailable. The rest of the report remains usable.</p></Panel>}<AiPanel fallback={fallback}><p>{narrative.financialPerformance}</p><p>{narrative.balanceSheet}</p></AiPanel></section>

        <section className="report-section" id="valuation"><SectionHeading id="valuation" number="03" title="Valuation" /><MetricPanel label="Finnhub · Basic financials" metrics={valuationMetrics} className="metric-panel--valuation" /><AiPanel fallback={fallback}><p>{narrative.valuation}</p></AiPanel></section>

        <section className="report-section" id="peers"><SectionHeading id="peers" number="04" title="Peers" /><Panel className="peer-panel"><FactLabel>Finnhub · Cached peer snapshots</FactLabel><div className="peer-table"><div className="peer-row peer-row--head"><span>Ticker</span><span>Price</span><span>P/E</span><span>1y</span><span>Mkt cap</span></div>{peers.map((peer) => <div className="peer-row" key={peer.ticker}><strong><Link href={`/research/${peer.ticker}`}>{peer.ticker}</Link></strong><span>{formatMoney(peer.price, currency)}</span><span>{formatMetric(peer.pe)}</span><span className={(peer.oneYearReturn ?? 0) >= 0 ? "trend-up" : "trend-down"}>{peer.oneYearReturn === undefined ? "—" : `${peer.oneYearReturn >= 0 ? "+" : ""}${peer.oneYearReturn.toFixed(1)}%`}</span><span>{peer.marketCapMillions === undefined ? "—" : formatMoney(peer.marketCapMillions * 1_000_000, currency)}</span></div>)}</div></Panel><AiPanel fallback={fallback}><p>{narrative.peers}</p></AiPanel></section>

        <section className="report-section" id="catalysts"><SectionHeading id="catalysts" number="05" title="Catalysts" />{earnings.length ? <Panel className="catalyst-panel"><FactLabel>Finnhub · Earnings calendar</FactLabel>{earnings.slice(0, 2).map((event) => <div className="earnings-event" key={`${event.date}-${event.quarter}`}><strong>{event.date}</strong><span>{event.year && event.quarter ? `Fiscal Q${event.quarter} ${event.year}` : "Scheduled earnings"}{event.hour ? ` · ${event.hour}` : ""}</span><small>EPS estimate {event.epsEstimate == null ? "unavailable" : formatMoney(event.epsEstimate, currency)} · revenue estimate {event.revenueEstimate == null ? "unavailable" : formatMoney(event.revenueEstimate, currency)}</small></div>)}</Panel> : <Panel className="unavailable-panel"><FactLabel>Finnhub · Earnings calendar</FactLabel><p>No upcoming earnings event was returned for this ticker.</p></Panel>}<AiPanel fallback={fallback}><p>{narrative.catalysts}</p>{facts.news?.slice(0, 3).map((item) => <div className="news-item" key={item.url}><time>{item.date}</time><a href={item.url} target="_blank" rel="noreferrer">{item.headline}</a><small>{item.source}</small></div>)}</AiPanel></section>

        <section className="report-section" id="risks"><SectionHeading id="risks" number="06" title="Risks" /><AiPanel fallback={fallback}><div className="narrative-rows">{narrative.risks.map((risk, index) => <div key={risk}><strong>Risk {String(index + 1).padStart(2, "0")}</strong><span>{risk}</span></div>)}</div></AiPanel></section>

        <section className="report-section" id="cases"><SectionHeading id="cases" number="07" title="Bull / Base / Bear" /><div className="scenario-grid">{narrative.scenarios.map((scenario) => <Panel className={`scenario-card scenario-card--${scenario.label}`} key={scenario.label}><FactLabel tone="ai">{fallback ? "Verified fallback" : "AI-generated"} · {scenario.label}</FactLabel><div className="scenario-price"><strong>{scenario.label}</strong></div><p>{scenario.summary}</p><small>Qualitative scenario · no model-generated target</small></Panel>)}</div></section>

        <section className="report-section" id="thesis"><SectionHeading id="thesis" number="08" title="Investment thesis" /><Panel className="thesis-panel"><div className="thesis-head"><FactLabel tone="ai">{fallback ? "Verified fallback" : "AI-generated"}</FactLabel>{confidence !== undefined && confidence !== null && <span>coverage confidence {confidence.toFixed(2)}</span>}</div>{confidence !== undefined && confidence !== null && <div className="confidence-bar"><span style={{ width: `${Math.max(0, Math.min(1, confidence)) * 100}%` }} /></div>}<p>{narrative.thesis}</p><small>Model: {generated.modelLabel ?? "unlabelled"} · sourced facts and generated prose remain separately identified</small></Panel></section>

        <section className="report-section" id="sources"><SectionHeading id="sources" number="09" title="Sources" /><Panel className="sources-panel"><p className="sources-intro">Every sourced value traces to a provider call or cached provider snapshot. The detailed audit ledger is collapsed to keep the report concise.</p><div className="source-summary" aria-label="Source coverage summary"><div><strong>{providerCount}</strong><span>providers</span></div><div><strong>{provenance.length}</strong><span>unique endpoints</span></div><div><strong>{rawProvenance.length}</strong><span>logged snapshots</span></div></div><details className="source-disclosure"><summary><span>View source audit ledger</span><small>provider · endpoint · viewer-local time · status</small></summary><div className="source-list">{provenance.map((source, index) => <SourceRow source={source} key={`${source.provider}-${source.endpoint}-${index}`} />)}</div></details>{failedSections.length > 0 && <div className="failed-note"><span>Partial</span><p>{failedSections.map((failure) => `${failure.section}: ${failure.reason}`).join(" · ")}</p></div>}</Panel></section>
      </article>
    </main>
  );
}

function SourceRow({ source }: { source: SourceSummary }) {
  return <div className={`source-row ${source.status === "failed" ? "is-failed" : ""}`}><span>{source.provider}</span><strong>{source.endpoint ?? "provider snapshot"}{source.occurrences > 1 ? ` · ${source.occurrences} snapshots` : ""}</strong><LocalizedDateTime value={source.providerTimestamp ?? source.fetchedAt} options={dateTimeOptions} /><b>{source.httpStatus ?? source.status}</b></div>;
}

export function AmbientLayer() {
  return <div className="ambient-layer" aria-hidden="true"><span className="ambient-grid" /><span className="ambient-orb ambient-orb--one" /><span className="ambient-orb ambient-orb--two" /><span className="ambient-orb ambient-orb--three" /></div>;
}
