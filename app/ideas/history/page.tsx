import Link from "next/link";

import { Panel } from "@/components/ResearchWorkspaceView";
import { getIdeaHistory, type HistoricalIdea } from "@/lib/screen/history";

export const dynamic = "force-dynamic";

function money(value: number | null): string {
  return value == null ? "Not available" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function change(value: number | null): string {
  return value == null ? "Needs review" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function HistoryTable({ ideas }: { ideas: HistoricalIdea[] }) {
  return <div className="history-table-wrap"><table className="history-table"><thead><tr><th scope="col">Date</th><th scope="col">Ticker</th><th scope="col">Score</th><th scope="col">At selection</th><th scope="col">Current</th><th scope="col">Since selection</th></tr></thead><tbody>{ideas.map((idea) => <tr key={`${idea.tradingDate}-${idea.ticker}`}><td>{idea.tradingDate}</td><th scope="row"><Link href={`/research/${idea.ticker}`}>{idea.ticker}</Link></th><td>{idea.score == null ? "Not available" : idea.score.toFixed(2)}</td><td>{money(idea.selectionPrice)}</td><td>{money(idea.currentPrice)}</td><td className={idea.changePercent == null ? "" : idea.changePercent >= 0 ? "trend-up" : "trend-down"}>{change(idea.changePercent)}</td></tr>)}</tbody></table></div>;
}

export default async function PastIdeasPage() {
  let ideas: HistoricalIdea[] = [];
  let unavailable = false;
  try {
    ideas = await getIdeaHistory();
  } catch (error) {
    console.error("idea history load failed:", error);
    unavailable = true;
  }

  return <main className="history-layout"><div className="history-header"><Link className="history-back" href="/#daily-idea">← Daily idea</Link><span className="eyebrow eyebrow--fact">Decision log</span><h1>Past ideas &amp; what happened next</h1><p>Review each qualifying daily pick from its selection price to the latest available quote. Missing prices stay visible as unavailable.</p></div>{unavailable ? <Panel className="workspace-notice"><h2>History temporarily unavailable</h2><p>The database or quote provider could not be reached. Try again when the platform is operational.</p></Panel> : ideas.length ? <Panel className="history-card"><HistoryTable ideas={ideas} /></Panel> : <Panel className="workspace-notice"><h2>No past ideas yet</h2><p>The history will populate after the first qualifying daily screen.</p></Panel>}</main>;
}
