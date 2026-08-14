import {
  AmbientLayer,
  AppFooter,
  AppTopbar,
  Panel,
  ResearchWorkspaceView,
} from "@/components/ResearchWorkspaceView";
import { isValidTicker, normalizeTicker } from "@/lib/research/ticker";
import { getResearchWorkspace } from "@/lib/research/workspace";
import Link from "next/link";
import { headers } from "next/headers";
import { consumeRateLimit, requestIdentifier } from "@/lib/http/rate-limit";

export const dynamic = "force-dynamic";

export default async function ResearchTickerPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker: raw } = await params;
  const ticker = normalizeTicker(raw);
  let workspace = null;
  let errorTitle: string | null = null;
  let errorDetail: string | null = null;

  if (!isValidTicker(ticker)) {
    errorTitle = "Invalid ticker";
    errorDetail = "Ticker symbols must contain letters with an optional share-class suffix.";
  } else {
    const requestHeaders = await headers();
    const limit = consumeRateLimit("research-page", requestIdentifier(requestHeaders));
    if (!limit.allowed) {
      errorTitle = "Research request limit reached";
      errorDetail = `Please wait about ${limit.retryAfterSeconds} seconds before requesting another report.`;
    } else {
      try {
        workspace = await getResearchWorkspace(ticker);
      } catch (error) {
        console.error("research page failed:", error);
        errorTitle = `No report available for ${ticker}`;
        errorDetail = "The ticker may be unknown or its required providers may be temporarily unavailable.";
      }
    }
  }

  const content = workspace
    ? <ResearchWorkspaceView workspace={workspace} />
    : <WorkspaceError title={errorTitle ?? "Research unavailable"} detail={errorDetail ?? "The report could not be assembled."} />;

  return <div className="app-shell"><AmbientLayer /><AppTopbar ticker={workspace?.report.ticker} chartAsOf={workspace?.chart?.asOf} />{content}<AppFooter /></div>;
}

function WorkspaceError({ title, detail }: { title: string; detail: string }) {
  return <main className="research-layout research-layout--notice" id="research"><Panel className="workspace-notice"><span>Research unavailable</span><h1>{title}</h1><p>{detail}</p><Link className="button" href="/">Return to the daily idea</Link></Panel></main>;
}
