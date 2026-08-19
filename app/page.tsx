import {
  AmbientLayer,
  AppFooter,
  AppTopbar,
  Panel,
  ResearchWorkspaceView,
} from "@/components/ResearchWorkspaceView";
import { DailyIdeaView } from "@/components/DailyIdeaView";
import { MethodologyAndCosts } from "@/components/MethodologyAndCosts";
import type { CandidatePreview } from "@/components/CandidateResearchPreview";
import {
  getResearchWorkspace,
  type ResearchWorkspace,
} from "@/lib/research/workspace";
import { getLatestIdea, type LatestIdea } from "@/lib/screen/get-latest-idea";

export const dynamic = "force-dynamic";

export default async function Home() {
  let latest: LatestIdea | null = null;
  let workspace: ResearchWorkspace | null = null;
  let researchError: string | null = null;
  let livePreview: CandidatePreview | undefined;

  try {
    latest = await getLatestIdea();
  } catch (error) {
    console.error("homepage daily idea load failed:", error);
  }

  const reportTicker = latest?.ticker ?? latest?.latestQualifyingTicker;
  if (reportTicker) {
    try {
      const assembledWorkspace = await getResearchWorkspace(reportTicker);
      workspace = assembledWorkspace;
      const primaryQuote = assembledWorkspace.peers.find((peer) => peer.ticker === assembledWorkspace.report.ticker);
      livePreview = {
        ticker: assembledWorkspace.report.ticker,
        companyName: assembledWorkspace.report.facts.company?.name,
        currency: assembledWorkspace.report.facts.company?.currency,
        marketCapMillions: assembledWorkspace.report.facts.company?.marketCapMillions,
        price: primaryQuote?.price ?? assembledWorkspace.report.facts.quote?.price,
        changePercent: primaryQuote?.changePercent ?? assembledWorkspace.report.facts.quote?.changePercent.value,
        asOf: primaryQuote?.quoteAsOf ?? assembledWorkspace.chart?.asOf,
        thesis: assembledWorkspace.report.narrative.thesis,
        generatedAt: assembledWorkspace.report.generated.generatedAt,
        generatedStatus: assembledWorkspace.report.generated.status,
      };
    } catch (error) {
      console.error("homepage research load failed:", error);
      researchError = "The latest research report could not be assembled. The daily-screen result remains available below.";
    }
  } else {
    researchError = "A full report will appear after the daily screen publishes a qualifying company. You can also search for a ticker above.";
  }

  return (
    <div className="app-shell">
      <AmbientLayer />
      <AppTopbar
        ticker={workspace?.report.ticker}
        chartAsOf={workspace?.chart?.asOf}
      />
      {workspace ? (
        <ResearchWorkspaceView workspace={workspace} confidence={latest?.confidence} />
      ) : (
        <main className="research-layout research-layout--notice" id="research">
          <Panel className="workspace-notice"><span>Research workspace</span><h1>Waiting for sourced company data</h1><p>{researchError}</p></Panel>
        </main>
      )}
      <DailyIdeaView latest={latest} livePreview={livePreview} />
      <MethodologyAndCosts />
      <AppFooter />
    </div>
  );
}
