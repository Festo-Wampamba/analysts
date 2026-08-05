import type { CandidateInput } from "@/lib/screen/score";
import { metricNumber } from "@/lib/source/finnhub-schemas";
import {
  getInsiderTransactions,
  getMetrics,
  getRecommendations,
} from "@/lib/source/finnhub";
import type { UniverseEntry } from "./universe";

// Finnhub's free tier allows 60 requests/minute and the screen makes three
// calls per ticker, so tickers are fetched in small concurrent batches with a
// floor on how fast a batch may complete.
const BATCH_SIZE = 6;
const MIN_BATCH_MS = 20_000;
const INSIDER_LOOKBACK_DAYS = 90;

export type UniverseFetchResult = {
  candidates: CandidateInput[];
  failedTickers: string[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function fetchCandidate(
  entry: UniverseEntry,
  runId: number,
): Promise<CandidateInput | null> {
  const ctx = { runId };
  const [metrics, recommendations, insider] = await Promise.allSettled([
    getMetrics(entry.ticker, ctx),
    getRecommendations(entry.ticker, ctx),
    getInsiderTransactions(entry.ticker, ctx),
  ]);

  // Metrics carry five of the seven factors; without them the ticker cannot
  // be ranked meaningfully and is dropped from the evaluated universe.
  if (metrics.status !== "fulfilled") return null;
  const m = metrics.value.data;

  const candidate: CandidateInput = {
    ticker: entry.ticker,
    sector: entry.sector,
    metrics: {
      revenueGrowthTTMYoy: metricNumber(m, "revenueGrowthTTMYoy"),
      epsGrowthTTMYoy: metricNumber(m, "epsGrowthTTMYoy"),
      netProfitMarginTTM: metricNumber(m, "netProfitMarginTTM"),
      roeTTM: metricNumber(m, "roeTTM"),
      peTTM: metricNumber(m, "peTTM"),
      psTTM: metricNumber(m, "psTTM"),
      debtToEquityQuarterly: metricNumber(m, "totalDebt/totalEquityQuarterly"),
      currentRatioQuarterly: metricNumber(m, "currentRatioQuarterly"),
      priceReturn13Week: metricNumber(m, "13WeekPriceReturnDaily"),
      priceReturn26Week: metricNumber(m, "26WeekPriceReturnDaily"),
    },
  };

  if (recommendations.status === "fulfilled" && recommendations.value.data.length > 0) {
    const [latest] = recommendations.value.data;
    const total =
      latest.strongBuy + latest.buy + latest.hold + latest.sell + latest.strongSell;
    if (total > 0) {
      candidate.metrics.analystBuyRatio = (latest.strongBuy + latest.buy) / total;
    }
  }

  if (insider.status === "fulfilled") {
    const cutoff = new Date(Date.now() - INSIDER_LOOKBACK_DAYS * 86_400_000);
    const recent = insider.value.data.data.filter(
      (t) => new Date(t.transactionDate) >= cutoff,
    );
    if (recent.length > 0) {
      candidate.metrics.insiderNetShareChange = recent.reduce(
        (sum, t) => sum + (t.change ?? 0),
        0,
      );
    }
  }

  return candidate;
}

export async function fetchUniverseCandidates(
  universe: UniverseEntry[],
  runId: number,
): Promise<UniverseFetchResult> {
  const candidates: CandidateInput[] = [];
  const failedTickers: string[] = [];
  const batches = chunk(universe, BATCH_SIZE);

  for (const [index, batch] of batches.entries()) {
    const startedAt = Date.now();
    const results = await Promise.all(
      batch.map((entry) =>
        fetchCandidate(entry, runId).catch(() => null),
      ),
    );

    results.forEach((candidate, i) => {
      if (candidate) candidates.push(candidate);
      else failedTickers.push(batch[i].ticker);
    });

    const isLastBatch = index === batches.length - 1;
    const elapsed = Date.now() - startedAt;
    if (!isLastBatch && elapsed < MIN_BATCH_MS) {
      await sleep(MIN_BATCH_MS - elapsed);
    }
  }

  return { candidates, failedTickers };
}
