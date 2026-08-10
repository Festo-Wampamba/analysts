type Candidate = {
  rank: number;
  ticker: string;
  sector: string;
  composite: string;
};

const dailyIdea = {
  date: "Wednesday, August 5, 2026",
  ticker: "GOOGL",
  company: "Alphabet Inc",
  sector: "Communication Services",
  score: "0.7150",
  confidence: "1.00",
  price: "$377.65",
  change: "+1.11%",
  selectionReason:
    "The quantitative screen has chosen Alphabet Inc, ticker GOOGL, for its strong growth and profitability metrics, including a revenue growth of 20.05 and an earnings per share growth of 115.31, as well as its high return on equity of 50.83999999999996 and net profit margin of 54.77",
  stats: [
    ["Universe", "54 / 54"],
    ["Threshold", "0.6500"],
    ["Highest score", "0.7150"],
    ["Run time", "165.4s"],
  ],
  thesis: [
    "Alphabet Inc has demonstrated strong growth potential with its revenue and earnings per share growth rates of 20.05 and 115.31 respectively",
    "The company's high return on equity of 50.83999999999996 and net profit margin of 54.77 indicate a strong ability to generate profits",
    "The factor scores show that Alphabet Inc ranks high in growth, profitability, financial strength, and sentiment, with scores of 0.8672, 0.8868, 0.9417, and 0.8868 respectively",
  ],
  catalyst:
    "The company's ability to continue innovating and expanding its product offerings, as well as its strong financial position, could be key catalysts for future growth",
  bullCase:
    "If Alphabet Inc can continue to execute on its growth strategy and maintain its strong profitability, the stock could potentially outperform its peers and the broader market",
  bearCase:
    "However, if the company faces increased competition or is unable to innovate and expand its product offerings, its growth and profitability could be negatively impacted",
  risks: [
    "Increased competition in the technology sector",
    "Regulatory risks and potential changes in government policies",
    "The company's high debt to equity ratio of 0.1533 and potential impact on financial flexibility",
  ],
  riskNote:
    "The confidence in this selection is supported by the comprehensive data coverage, with a coverage score of 1, and the company's composite score of 0.715, which exceeds the qualifying threshold of 0.65, indicating a strong overall profile",
};

const candidates: Candidate[] = [
  { rank: 1, ticker: "GOOGL", sector: "Communication Services", composite: "0.7150" },
  { rank: 2, ticker: "NVDA", sector: "Technology", composite: "0.6937" },
  { rank: 3, ticker: "LLY", sector: "Health Care", composite: "0.6457" },
  { rank: 4, ticker: "JPM", sector: "Financials", composite: "0.6424" },
  { rank: 5, ticker: "BAC", sector: "Financials", composite: "0.6343" },
];

function CompleteStatus() {
  return (
    <span className="daily-status" aria-label="Screen complete">
      <span className="daily-status-dot" aria-hidden="true" />
      complete
    </span>
  );
}

function Topbar() {
  return (
    <header className="daily-topbar">
      <div className="daily-topbar-inner">
        <div className="daily-brand">
          <span>Analysts</span>
          <span className="daily-brand-subtitle">Daily Idea Engine</span>
        </div>
        <CompleteStatus />
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="daily-hero">
      <div className="daily-hero-topline">
        <p className="daily-date">{dailyIdea.date}</p>
        <div className="daily-badges">
          <span className="daily-badge">{dailyIdea.sector}</span>
          <span className="daily-badge daily-badge-score">
            score {dailyIdea.score} · conf {dailyIdea.confidence}
          </span>
        </div>
      </div>

      <div className="daily-ticker-block">
        <h1>{dailyIdea.ticker}</h1>
        <p>{dailyIdea.company}</p>
      </div>

      <div className="daily-quote">
        <span className="daily-price">{dailyIdea.price}</span>
        <span className="daily-positive">{dailyIdea.change}</span>
      </div>

      <p className="daily-selection-reason">{dailyIdea.selectionReason}</p>
    </section>
  );
}

function Stats() {
  return (
    <section className="daily-stat-strip" aria-label="Screen statistics">
      {dailyIdea.stats.map(([label, value]) => (
        <div className="daily-stat" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </section>
  );
}

function EvidenceCard({
  title,
  children,
  headingTone = "neutral",
}: {
  title: string;
  children: React.ReactNode;
  headingTone?: "neutral" | "positive" | "negative";
}) {
  return (
    <article className="daily-card">
      <h2 className={`daily-card-heading-${headingTone}`}>{title}</h2>
      {children}
    </article>
  );
}

function Narrative() {
  return (
    <>
      <div className="daily-grid-two">
        <EvidenceCard title="Thesis">
          <ul className="daily-bullet-list">
            {dailyIdea.thesis.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </EvidenceCard>
        <EvidenceCard title="Key catalyst">
          <p>{dailyIdea.catalyst}</p>
        </EvidenceCard>
      </div>

      <div className="daily-grid-two daily-scenario-grid">
        <EvidenceCard title="Bull case" headingTone="positive">
          <p className="daily-positive-heading">{dailyIdea.bullCase}</p>
        </EvidenceCard>
        <EvidenceCard title="Bear case" headingTone="negative">
          <p className="daily-negative-heading">{dailyIdea.bearCase}</p>
        </EvidenceCard>
      </div>

      <EvidenceCard title="Risks">
        <ul className="daily-bullet-list daily-risk-list">
          {dailyIdea.risks.map((risk) => (
            <li key={risk}>{risk}</li>
          ))}
        </ul>
        <p className="daily-card-note">{dailyIdea.riskNote}</p>
      </EvidenceCard>
    </>
  );
}

function RankedCandidates() {
  return (
    <section className="daily-ranked">
      <h2>Ranked candidates ({candidates.length})</h2>
      <div className="daily-table-wrap">
        <table className="daily-rank-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Ticker</th>
              <th>Sector</th>
              <th>Composite</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((candidate) => (
              <tr key={candidate.ticker}>
                <td>{candidate.rank}</td>
                <td>{candidate.ticker}</td>
                <td>{candidate.sector}</td>
                <td>{candidate.composite}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <div className="daily-idea-page">
      <Topbar />
      <main className="daily-content">
        <Hero />
        <Stats />
        <Narrative />
        <RankedCandidates />
      </main>
      <footer className="daily-footer">
        Cross-sectional equity screening, sourced facts only, no unsourced numbers.
      </footer>
    </div>
  );
}
