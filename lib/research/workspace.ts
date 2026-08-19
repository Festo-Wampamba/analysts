import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";

import { db, schema } from "@/lib/db";
import type { Provenance } from "@/lib/domain/provenance";
import { getChartSeries, type ChartSeries } from "@/lib/source/chart";
import {
  getCachedEarnings,
  getCachedMetrics,
  getCachedProfile,
  getCachedQuote,
} from "@/lib/source/finnhub-cached";
import { metricNumber } from "@/lib/source/finnhub-schemas";
import { getFinancialSnapshot, type FinancialSnapshot } from "@/lib/source/sec";
import { sortUpcomingEarnings } from "./earnings";
import { getResearchReport, type ResearchReport } from "./report";

export type PeerSnapshot = {
  ticker: string;
  price?: number;
  previousClose?: number;
  changePercent?: number;
  quoteAsOf?: string;
  pe?: number;
  oneYearReturn?: number;
  marketCapMillions?: number;
};

export type EarningsEvent = {
  date: string;
  hour?: string;
  quarter?: number;
  year?: number;
  epsEstimate?: number | null;
  revenueEstimate?: number | null;
};

export type ResearchWorkspace = {
  report: ResearchReport;
  financials: FinancialSnapshot | null;
  peers: PeerSnapshot[];
  earnings: EarningsEvent[];
  chart: ChartSeries | null;
  additionalProvenance: Provenance[];
  failedSections: { section: string; reason: string }[];
  researchRunId: number | null;
};

export function workspaceQuoteStatus(workspace: ResearchWorkspace | null): string {
  const quote = workspace?.additionalProvenance.find(
    (source) => source.provider === "finnhub" && source.endpoint === "/quote",
  );
  if (!quote) return "Quote unavailable";
  const asOf = quote.providerTimestamp ?? quote.fetchedAt;
  const age = Date.now() - new Date(asOf).getTime();
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(asOf));
  return `${age <= 15 * 60 * 1000 ? "Fresh" : "Stale"} · ${time}`;
}

async function startRun(ticker: string): Promise<number | null> {
  try {
    const [row] = await db
      .insert(schema.researchRuns)
      .values({ ticker, startedAt: new Date() })
      .returning({ id: schema.researchRuns.id });
    return row.id;
  } catch (error) {
    console.error("research run start failed:", (error as Error).message);
    return null;
  }
}

async function finishRun(
  id: number | null,
  status: "complete" | "fallback" | "failed",
  error?: string,
  factFingerprint?: string,
): Promise<void> {
  if (id === null) return;
  try {
    await db
      .update(schema.researchRuns)
      .set({ status, finishedAt: new Date(), error, factFingerprint })
      .where(eq(schema.researchRuns.id, id));
  } catch (updateError) {
    console.error("research run completion failed:", (updateError as Error).message);
  }
}

function isoDateOffset(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Provider unavailable";
}

async function loadPeer(
  ticker: string,
  researchRunId: number | null,
): Promise<{ peer: PeerSnapshot; provenance: Provenance[] }> {
  const context = researchRunId === null ? {} : { researchRunId };
  const [quote, profile, metrics] = await Promise.allSettled([
    getCachedQuote(ticker, context),
    getCachedProfile(ticker, context),
    getCachedMetrics(ticker, context),
  ]);
  const peer: PeerSnapshot = { ticker };
  const provenance: Provenance[] = [];
  if (quote.status === "fulfilled") {
    peer.price = quote.value.data.c;
    peer.previousClose = quote.value.data.pc;
    peer.changePercent =
      quote.value.data.dp ??
      (quote.value.data.pc === 0
        ? 0
        : ((quote.value.data.c - quote.value.data.pc) / quote.value.data.pc) * 100);
    peer.quoteAsOf = quote.value.provenance.providerTimestamp ?? quote.value.provenance.fetchedAt;
    provenance.push(quote.value.provenance);
  }
  if (profile.status === "fulfilled") {
    peer.marketCapMillions = profile.value.data.marketCapitalization;
    provenance.push(profile.value.provenance);
  }
  if (metrics.status === "fulfilled") {
    peer.pe = metricNumber(metrics.value.data, "peTTM");
    peer.oneYearReturn = metricNumber(metrics.value.data, "52WeekPriceReturnDaily");
    provenance.push(metrics.value.provenance);
  }
  return { peer, provenance };
}

async function loadInitialChart(
  ticker: string,
  context: { researchRunId?: number },
): Promise<Awaited<ReturnType<typeof getChartSeries>>> {
  try {
    return await getChartSeries(ticker, "1d", context);
  } catch (error) {
    // Keep the research page usable if the provider cannot supply an intraday
    // series, while retaining the actual provider failure for observability.
    console.warn("initial intraday chart unavailable; falling back to five days:", (error as Error).message);
    return getChartSeries(ticker, "5d", context);
  }
}

async function buildResearchWorkspace(ticker: string): Promise<ResearchWorkspace> {
  const symbol = ticker.toUpperCase();
  const researchRunId = await startRun(symbol);
  const context = researchRunId === null ? {} : { researchRunId };
  try {
    const report = await getResearchReport(symbol, context);
    const failedSections: ResearchWorkspace["failedSections"] = [];
    const provenance: Provenance[] = [];

    const financialPromise = process.env.SEC_USER_AGENT
      ? getFinancialSnapshot(symbol, context)
      : Promise.reject(new Error("SEC_USER_AGENT is not configured"));
    const chartPromise = process.env.TWELVE_DATA_API_KEY || process.env.ALPHA_VANTAGE_API_KEY
      ? loadInitialChart(symbol, context)
      : Promise.reject(new Error("No chart provider is configured"));
    const earningsPromise = getCachedEarnings(
      symbol,
      isoDateOffset(-1),
      isoDateOffset(180),
      context,
    );
    const peerTickers = [symbol, ...(report.facts.peers ?? [])].slice(0, 5);
    const [financialResult, chartResult, earningsResult, peerResults] =
      await Promise.all([
        Promise.resolve(financialPromise).then(
          (value) => ({ status: "fulfilled" as const, value }),
          (reason) => ({ status: "rejected" as const, reason }),
        ),
        Promise.resolve(chartPromise).then(
          (value) => ({ status: "fulfilled" as const, value }),
          (reason) => ({ status: "rejected" as const, reason }),
        ),
        Promise.resolve(earningsPromise).then(
          (value) => ({ status: "fulfilled" as const, value }),
          (reason) => ({ status: "rejected" as const, reason }),
        ),
        Promise.all(peerTickers.map((peer) => loadPeer(peer, researchRunId))),
      ]);

    const financials = financialResult.status === "fulfilled" ? financialResult.value.data : null;
    if (financialResult.status === "fulfilled") provenance.push(financialResult.value.provenance);
    else failedSections.push({ section: "financials", reason: errorMessage(financialResult.reason) });

    const chart = chartResult.status === "fulfilled" ? chartResult.value.data : null;
    if (chartResult.status === "fulfilled") provenance.push(chartResult.value.provenance);
    else failedSections.push({ section: "chart", reason: errorMessage(chartResult.reason) });

    const earnings = earningsResult.status === "fulfilled"
      ? sortUpcomingEarnings(earningsResult.value.data.earningsCalendar
          .filter((event) => event.symbol.toUpperCase() === symbol)
          .map(({ date, hour, quarter, year, epsEstimate, revenueEstimate }) => ({
            date,
            hour,
            quarter,
            year,
            epsEstimate,
            revenueEstimate,
          })))
      : [];
    if (earningsResult.status === "fulfilled") provenance.push(earningsResult.value.provenance);
    else failedSections.push({ section: "catalysts", reason: errorMessage(earningsResult.reason) });

    for (const result of peerResults) provenance.push(...result.provenance);
    const peers = peerResults.map((result) => result.peer);

    await finishRun(
      researchRunId,
      report.generated.status === "fallback" ? "fallback" : "complete",
      undefined,
      createHash("sha256").update(JSON.stringify(report.facts)).digest("hex"),
    );
    return {
      report,
      financials,
      peers,
      earnings,
      chart,
      additionalProvenance: provenance,
      failedSections,
      researchRunId,
    };
  } catch (error) {
    await finishRun(researchRunId, "failed", (error as Error).message);
    throw error;
  }
}

const activeWorkspaceBuilds = new Map<string, Promise<ResearchWorkspace>>();
const completedWorkspaceBuilds = new Map<
  string,
  { value: ResearchWorkspace; expiresAt: number }
>();
const WORKSPACE_CACHE_TTL_MS = 60_000;

export function getResearchWorkspace(ticker: string): Promise<ResearchWorkspace> {
  const symbol = ticker.toUpperCase();
  const completed = completedWorkspaceBuilds.get(symbol);
  if (completed && completed.expiresAt > Date.now()) {
    return Promise.resolve(completed.value);
  }
  if (completed) completedWorkspaceBuilds.delete(symbol);

  const active = activeWorkspaceBuilds.get(symbol);
  if (active) return active;
  const build = buildResearchWorkspace(symbol)
    .then((value) => {
      completedWorkspaceBuilds.set(symbol, {
        value,
        expiresAt: Date.now() + WORKSPACE_CACHE_TTL_MS,
      });
      return value;
    })
    .finally(() => {
      if (activeWorkspaceBuilds.get(symbol) === build) {
        activeWorkspaceBuilds.delete(symbol);
      }
    });
  activeWorkspaceBuilds.set(symbol, build);
  return build;
}
