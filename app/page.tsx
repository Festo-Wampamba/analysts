type Metric = { label: string; value: string; detail?: string; tone?: "up" | "down" | "neutral" };
type TableRow = { ticker: string; price: string; pe: string; move: string; marketCap: string; tone?: "up" | "down" };

const sections = [
  ["overview", "Overview"],
  ["financials", "Financials"],
  ["valuation", "Valuation"],
  ["peers", "Peers"],
  ["catalysts", "Catalysts"],
  ["risks", "Risks"],
  ["cases", "Bull / Base / Bear"],
  ["thesis", "Thesis"],
  ["sources", "Sources"],
] as const;

const overviewMetrics: Metric[] = [
  { label: "Market cap", value: "$2.87T" },
  { label: "Shares out.", value: "15.52B" },
  { label: "Employees", value: "164,000" },
  { label: "IPO", value: "1980-12-12" },
  { label: "52-week range", value: "148.30 – 199.62" },
  { label: "Avg. volume", value: "54.7M" },
];

const financialRows: Metric[] = [
  { label: "Revenue", value: "$391.0B", detail: "▲ 4.1%", tone: "up" },
  { label: "Gross margin", value: "46.2%", detail: "▲ 130bp", tone: "up" },
  { label: "Operating income", value: "$123.2B", detail: "▲ 6.8%", tone: "up" },
  { label: "EPS (diluted)", value: "$6.51", detail: "▲ 9.2%", tone: "up" },
  { label: "Free cash flow", value: "$108.8B", detail: "▼ 1.6%", tone: "down" },
  { label: "Net cash", value: "$51.4B", detail: "—", tone: "neutral" },
];

const valuationMetrics: Metric[] = [
  { label: "P/E (TTM)", value: "28.4" },
  { label: "Forward P/E", value: "25.9" },
  { label: "EV/EBITDA", value: "21.3" },
  { label: "P/S", value: "7.4" },
  { label: "Dividend yield", value: "0.52%" },
  { label: "5y avg P/E", value: "26.1" },
];

const peers: TableRow[] = [
  { ticker: "AAPL", price: "$184.92", pe: "28.4", move: "+14.6%", marketCap: "2.87T", tone: "up" },
  { ticker: "MSFT", price: "$471.30", pe: "34.1", move: "+21.2%", marketCap: "3.50T", tone: "up" },
  { ticker: "GOOGL", price: "$196.08", pe: "23.7", move: "+18.9%", marketCap: "2.39T", tone: "up" },
  { ticker: "DELL", price: "$121.44", pe: "15.2", move: "−6.3%", marketCap: "86.1B", tone: "down" },
  { ticker: "SONY", price: "$24.86", pe: "17.8", move: "+9.4%", marketCap: "154B", tone: "up" },
];

const catalysts = [
  ["SEP 2026", "Autumn hardware event — first full quarter of on-device model pricing is the number to watch, not unit mix."],
  ["Q4 2026", "Services pricing step-up across two markets already signalled in the last call; roughly 40bp of group margin if it holds."],
  ["H1 2027", "Search-default arrangement is up for renegotiation. The downside case is a fee reset, not a termination."],
] as const;

const risks = [
  ["Regulatory pressure on store economics", "Commission structures are being reopened in two jurisdictions. Direct revenue at stake is low single digits; the read-through to services growth is the larger number."],
  ["China demand and supply concentration", "Both a fifth of sales and the majority of assembly. Any policy shock hits revenue and cost in the same quarter."],
  ["No new category at scale", "Growth currently depends on monetising an installed base that is close to saturated in developed markets."],
] as const;

const scenarios = [
  { label: "Bull", price: "$232", move: "+25%", probability: "25%", copy: "Services holds mid-teens growth and paid AI tiers add a second subscription line." },
  { label: "Base", price: "$198", move: "+7%", probability: "50%", copy: "Low-single-digit hardware, high-single-digit services, multiple flat at 26x." },
  { label: "Bear", price: "$146", move: "−21%", probability: "25%", copy: "Search fee reset plus a China demand step-down; the multiple compresses toward the peer set." },
] as const;

const sourceRows = [
  ["finnhub", "/quote", "09:11:58 ET", "200"],
  ["finnhub", "/stock/profile2", "09:11:58 ET", "200"],
  ["finnhub", "/stock/metric", "09:11:59 ET", "200"],
  ["finnhub", "/stock/peers", "09:11:59 ET", "200"],
  ["finnhub", "/calendar/earnings", "09:12:00 ET", "200"],
  ["finnhub", "/news-sentiment", "09:12:00 ET", "429"],
] as const;

const dailyCandidates = [
  ["NTAP", "0.79", "Technology", "All-flash mix shift into FQ1", "0.79"],
  ["MU", "0.77", "Semiconductors", "HBM capacity sold out through 2027", "0.77"],
  ["WDC", "0.74", "Technology", "Post-split disclosure on HDD pricing", "0.74"],
  ["GLW", "0.71", "Electronic components", "Optical order book guidance raise", "0.71"],
  ["STX", "0.68", "Technology", "Nearline demand commentary", "0.68"],
] as const;

function SearchIcon({ className = "" }: { className?: string }) {
  return <svg className={className} aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>;
}

function SparkIcon({ className = "" }: { className?: string }) {
  return <svg className={className} aria-hidden="true" viewBox="0 0 24 24"><path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" /><path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z" /></svg>;
}

function ChartIcon() {
  return <svg className="nav-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M4 19V9m6 10V5m6 14v-7m4 7H2" /></svg>;
}

function StatusIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 1-4.3-7.1" /><path d="m9 11 2 2 5-6" /></svg>;
}

function SectionHeading({ id, number, title }: { id: string; number: string; title: string }) {
  return <div className="section-heading"><h2 id={id}><span className="section-number">{number}</span>{title}</h2></div>;
}

function FactLabel({ children, tone = "fact" }: { children: React.ReactNode; tone?: "fact" | "ai" }) {
  return <span className={`eyebrow eyebrow--${tone}`}>{tone === "ai" ? <SparkIcon className="chip-icon" /> : <SearchIcon className="chip-icon" />}{children}</span>;
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`glass-panel ${className}`}>{children}</div>;
}

function Chart() {
  return (
    <div className="market-chart" aria-label="AAPL 7 day price chart">
      <div className="market-chart__header">
        <span className="market-chart__label">Price · AAPL</span>
        <div className="market-chart__range"><span>1D</span><span className="is-active">7D</span><span>1M</span><span>1Y</span></div>
      </div>
      <svg viewBox="0 0 720 132" role="img" aria-label="AAPL price trend rising over seven days" preserveAspectRatio="none">
        <defs><linearGradient id="chartArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#22c55e" stopOpacity=".22" /><stop offset="1" stopColor="#22c55e" stopOpacity="0" /></linearGradient></defs>
        <path className="chart-grid" d="M0 29H720M0 66H720M0 103H720" />
        <path className="chart-fill" d="M0 103 C50 100 57 106 93 91 S150 96 185 87 S237 94 275 74 S325 82 365 58 S420 70 463 53 S520 65 563 38 S622 42 720 21 V132 H0Z" />
        <path className="chart-line" d="M0 103 C50 100 57 106 93 91 S150 96 185 87 S237 94 275 74 S325 82 365 58 S420 70 463 53 S520 65 563 38 S622 42 720 21" />
        <circle className="chart-point" cx="563" cy="38" r="4" />
      </svg>
    </div>
  );
}

function Topbar() {
  return (
    <nav className="topbar">
      <div className="topbar-inner">
        <a className="brand-lockup" href="#research" aria-label="Analysts home">
          <span className="brand-mark" aria-hidden="true">A</span>
          <span className="brand-name">Analysts</span>
        </a>
        <div className="topbar-paths">
          <a className="nav-path nav-path--active" href="#research"><ChartIcon />Research</a>
          <a className="nav-path" href="#daily-idea"><SparkIcon className="nav-icon" />Daily Idea</a>
        </div>
        <label className="nav-search" aria-label="Search a stock ticker">
          <SearchIcon className="nav-search__icon" />
          <input type="text" placeholder="Search a ticker" readOnly />
          <kbd>/</kbd>
        </label>
        <span className="status-chip"><StatusIcon />Market data live</span>
      </div>
    </nav>
  );
}

function ReportNav() {
  return (
    <aside className="report-nav" aria-label="Report sections">
      <div className="report-nav__label">Report sections</div>
      {sections.map(([id, title], index) => <a className={index === 0 ? "is-active" : ""} href={`#${id}`} key={id}>{title}</a>)}
    </aside>
  );
}

function ResearchHero() {
  return (
    <header className="research-hero">
      <div className="hero-meta"><FactLabel>Ticker research</FactLabel><span>Generated 2026-08-04 09:12 ET · 1.4s</span></div>
      <div className="hero-title-row"><h1>AAPL</h1><div><strong>Apple Inc.</strong><span>NASDAQ · Technology · Consumer Electronics</span></div></div>
      <div className="hero-profile-grid">
        <div className="quote-card"><FactLabel>Finnhub · Quote</FactLabel><div className="quote-line"><strong>$184.92</strong><span className="trend-up">▲ 1.24%</span></div><small>Last trade 09:11:58 ET · prev close $182.66</small></div>
        <Panel className="read-card"><span className="read-card__title">How to read this report</span><span><SearchIcon className="chip-icon" />Provider icon — sourced fact with a named provider</span><span><SparkIcon className="chip-icon" />Spark icon — AI-generated narrative</span></Panel>
      </div>
      <Chart />
    </header>
  );
}

function Overview() {
  return <section className="report-section" id="overview"><SectionHeading id="overview-title" number="01" title="Overview" /><Panel className="metric-panel"><FactLabel>Finnhub · Company profile</FactLabel><div className="metric-grid">{overviewMetrics.map((metric) => <div className="metric" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong></div>)}</div></Panel><Panel className="ai-panel"><FactLabel tone="ai">AI-generated</FactLabel><p>Apple sells hardware, but the part of the business that sets the multiple is the installed base it monetises afterwards. Roughly 2.2 billion active devices feed a services line that carries gross margins near twice the hardware average, which is why unit growth matters less to the model than attach rate and pricing.</p><p>The remaining question for a holder is duration: how long the base keeps expanding at replacement pace without a new category.</p></Panel></section>;
}

function Financials() {
  return <section className="report-section" id="financials"><SectionHeading id="financials-title" number="02" title="Financials" /><Panel className="financial-panel"><FactLabel>Finnhub · Financials as reported · TTM</FactLabel><div className="financial-table">{financialRows.map((row) => <div className="financial-row" key={row.label}><span>{row.label}</span><strong>{row.value}</strong><em className={row.tone === "up" ? "trend-up" : row.tone === "down" ? "trend-down" : "trend-neutral"}>{row.detail}</em></div>)}</div></Panel><Panel className="ai-panel"><FactLabel tone="ai">AI-generated</FactLabel><p>Earnings are growing about twice as fast as revenue, and the gap is buyback plus mix rather than volume. Free cash flow slipping while operating income rises is worth a note: working capital and higher capex on silicon and data centre capacity absorbed the difference this year.</p></Panel></section>;
}

function Valuation() {
  return <section className="report-section" id="valuation"><SectionHeading id="valuation-title" number="03" title="Valuation" /><Panel className="metric-panel"><FactLabel>Finnhub · Basic financials</FactLabel><div className="metric-grid metric-grid--valuation">{valuationMetrics.map((metric) => <div className="metric" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong></div>)}</div></Panel><Panel className="ai-panel"><FactLabel tone="ai">AI-generated</FactLabel><p>At 25.9x forward earnings the stock trades slightly above its own five-year average and well above the hardware peer set, which is a services-mix argument rather than a growth argument. The multiple holds if services keeps compounding at a double-digit rate; it is hard to defend on the hardware line alone.</p></Panel></section>;
}

function Peers() {
  return <section className="report-section" id="peers"><SectionHeading id="peers-title" number="04" title="Peers" /><Panel className="peer-panel"><FactLabel>Finnhub · Peers</FactLabel><div className="peer-table"><div className="peer-row peer-row--head"><span>Ticker</span><span>Price</span><span>P/E</span><span>1y</span><span>Mkt cap</span></div>{peers.map((peer) => <div className="peer-row" key={peer.ticker}><strong>{peer.ticker}</strong><span>{peer.price}</span><span>{peer.pe}</span><span className={peer.tone === "down" ? "trend-down" : "trend-up"}>{peer.move}</span><span>{peer.marketCap}</span></div>)}</div></Panel><Panel className="ai-panel"><FactLabel tone="ai">AI-generated</FactLabel><p>The peer list Finnhub returns is a hardware set, and it flatters the comparison. Measured against the software-weighted names it actually competes with for capital, Apple is the cheaper multiple with the slower top line.</p></Panel></section>;
}

function Catalysts() {
  return <section className="report-section" id="catalysts"><SectionHeading id="catalysts-title" number="05" title="Catalysts" /><Panel className="catalyst-panel"><FactLabel>Finnhub · Earnings calendar</FactLabel><div className="earnings-event"><strong>2026-10-29</strong><span>FQ4 2026 report · after close · confirmed</span><small>Consensus EPS $1.68 · revenue $95.2B</small></div></Panel><Panel className="ai-panel"><FactLabel tone="ai">AI-generated</FactLabel><div className="narrative-rows">{catalysts.map(([label, copy]) => <div key={label}><strong>{label}</strong><span>{copy}</span></div>)}</div></Panel></section>;
}

function Risks() {
  return <section className="report-section" id="risks"><SectionHeading id="risks-title" number="06" title="Risks" /><Panel className="ai-panel risks-panel"><FactLabel tone="ai">AI-generated</FactLabel><div className="narrative-rows">{risks.map(([label, copy]) => <div key={label}><strong>{label}</strong><span>{copy}</span></div>)}</div></Panel></section>;
}

function Scenarios() {
  return <section className="report-section" id="cases"><SectionHeading id="cases-title" number="07" title="Bull / Base / Bear" /><div className="scenario-grid">{scenarios.map((scenario) => <Panel className={`scenario-card scenario-card--${scenario.label.toLowerCase()}`} key={scenario.label}><FactLabel tone="ai">AI-generated · {scenario.label}</FactLabel><div className="scenario-price"><strong>{scenario.price}</strong><span className={scenario.label === "Bear" ? "trend-down" : "trend-up"}>{scenario.move}</span></div><p>{scenario.copy}</p><small>Probability {scenario.probability}</small></Panel>)}</div></section>;
}

function Thesis() {
  return <section className="report-section" id="thesis"><SectionHeading id="thesis-title" number="08" title="Investment thesis" /><Panel className="thesis-panel"><div className="thesis-head"><FactLabel tone="ai">AI-generated</FactLabel><span>confidence 0.71</span></div><div className="confidence-bar"><span /></div><p>Own this for the cash return and the services annuity, not for growth. At 26x the market is paying for durability, and the evidence for durability is good: margin expanded while revenue grew 4%. The thesis breaks on the search arrangement, which is the one line item large enough to move the model on its own.</p><small>Model: 8 sourced blocks · 7 generated blocks · no figure in this report was produced by the model</small></Panel></section>;
}

function Sources() {
  return <section className="report-section" id="sources"><SectionHeading id="sources-title" number="09" title="Sources" /><Panel className="sources-panel"><p className="sources-intro">Every figure above traces to one of these calls. Timestamps are the provider&apos;s, not ours.</p><div className="source-list">{sourceRows.map(([provider, path, time, status]) => <div className={`source-row ${status === "429" ? "is-failed" : ""}`} key={path}><span>{provider}</span><strong>{path}</strong><time>{time}</time><b>{status}</b></div>)}</div><div className="failed-note"><span>Failed</span><p>Sentiment was rate-limited, so no section in this report uses it.</p></div></Panel></section>;
}

function ResearchReport() {
  return <main className="research-layout" id="research"><ReportNav /><article className="report-column"><ResearchHero /><Overview /><Financials /><Valuation /><Peers /><Catalysts /><Risks /><Scenarios /><Thesis /><Sources /></article></main>;
}

function DailyPick() {
  return <section className="daily-pick"><div className="daily-pick-grid"><div className="daily-pick-main"><FactLabel tone="ai">Today&apos;s pick</FactLabel><div className="daily-title"><h2>CRWD</h2><span>CrowdStrike Holdings</span></div><div className="daily-tags"><span>Software — Infrastructure</span><span>Rank 1 of 50</span></div><div className="score-line"><span>Score</span><i><b /></i><strong>0.84</strong></div></div><div className="daily-pick-side"><Panel className="quote-card"><FactLabel>Finnhub · Quote</FactLabel><div className="quote-line"><strong>$421.16</strong><span className="trend-up">▲ 2.08%</span></div></Panel><Panel className="metrics-card"><FactLabel>Finnhub · Metrics</FactLabel><div className="daily-metrics"><div><span>Fwd P/S</span><strong>17.2</strong></div><div><span>Rev growth</span><strong className="trend-up">+22.4%</strong></div><div><span>FCF margin</span><strong>31.0%</strong></div></div></Panel></div></div><Panel className="daily-reason"><FactLabel tone="ai">AI-generated · Why it ranked first today</FactLabel><p>Net-new ARR has reaccelerated for two consecutive quarters while the multiple sits a third below its own three-year average, and the 26 August print is the first read where module attach and the pricing change land in the same quarter. The screen surfaced it on the gap between growth trend and multiple, not on momentum.</p></Panel><div className="daily-actions"><button type="button" className="button button--primary">Open full report</button><button type="button" className="button">Copy thesis</button><span>Surfaced 06:00:42 ET</span></div></section>;
}

function EmptyPick() {
  return <section className="daily-pick daily-pick--empty"><div className="empty-pick-grid"><div><FactLabel tone="ai">Today&apos;s pick</FactLabel><h2>No qualifying idea today</h2><p>No candidate cleared the 0.70 confidence threshold in the 06:00 screen. The screen ran clean — it just found nothing worth your attention.</p><div className="daily-actions"><button type="button" className="button">Research a ticker instead</button><span>Next screen 2026-08-05 06:00 ET</span></div></div><Panel className="engine-snapshot"><FactLabel>Engine · Screen 2026-08-04</FactLabel><div><span>Universe evaluated</span><strong>50</strong></div><div><span>Highest score</span><strong>0.61</strong></div><div><span>Threshold</span><strong>0.70</strong></div></Panel></div></section>;
}

function RankedCandidates() {
  return <Panel className="daily-table-card"><div className="daily-card-head"><h2>Ranked candidates</h2><span>Finnhub metrics · engine score</span></div><div className="candidate-table"><div className="candidate-row candidate-row--head"><span>Ticker</span><span>Score</span><span>Sector</span><span>Catalyst</span><span>Conf.</span></div>{dailyCandidates.map(([ticker, score, sector, catalyst, confidence]) => <div className="candidate-row" key={ticker}><strong>{ticker}</strong><span>{score}</span><span>{sector}</span><span>{catalyst}</span><strong className={Number(confidence) >= 0.73 ? "trend-up" : "trend-neutral"}>{confidence}</strong></div>)}</div><small>Catalyst text is AI-generated. Scores, prices and sectors are sourced.</small></Panel>;
}

function EngineStatus() {
  return <Panel className="daily-engine-card"><div className="daily-card-head"><h2>Engine status</h2><span className="verified"><StatusIcon />Verified</span></div><div className="engine-details"><div><span>Last screen run</span><strong>2026-08-04 06:00 ET</strong></div><div><span>Duration</span><strong>42s</strong></div><div><span>Universe size</span><strong>50 tickers</strong></div><div><span>Next scheduled run</span><strong>2026-08-05 06:00 ET</strong></div></div><p>The engine screens once a day. It does not run on request, and it does not publish a pick to fill the slot.</p></Panel>;
}

function DailyIdea() {
  return <main className="daily-layout" id="daily-idea"><header className="daily-header"><div className="hero-meta"><FactLabel tone="ai">Daily idea engine</FactLabel><span>2026-08-04 · screen 06:00 ET</span></div><h1>Today&apos;s idea</h1></header><DailyPick /><EmptyPick /><div className="daily-engine-grid"><RankedCandidates /><EngineStatus /></div></main>;
}

export default function Home() {
  return <div className="app-shell"><div className="ambient-layer" aria-hidden="true"><span className="ambient-orb ambient-orb--one" /><span className="ambient-orb ambient-orb--two" /></div><Topbar /><ResearchReport /><DailyIdea /><footer className="site-footer"><div><span>analysts.korestandard.com · quotes and fundamentals via Finnhub</span><span>Research output, not investment advice. <a href="#methodology">Methodology</a></span></div></footer></div>;
}
