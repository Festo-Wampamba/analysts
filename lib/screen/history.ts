import { desc, isNotNull } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import { getCachedQuote } from "@/lib/source/finnhub-cached";
import type { DailyIdeaPayload } from "./types";

export type HistoricalIdea = {
  tradingDate: string;
  ticker: string;
  score: number | null;
  selectionPrice: number | null;
  currentPrice: number | null;
  changePercent: number | null;
};

export function percentageChange(initial: number | null | undefined, current: number | null | undefined): number | null {
  if (initial == null || current == null || !Number.isFinite(initial) || !Number.isFinite(current) || initial === 0) return null;
  return ((current - initial) / Math.abs(initial)) * 100;
}

export async function getIdeaHistory(): Promise<HistoricalIdea[]> {
  const rows = await db
    .select({
      tradingDate: schema.dailyIdeas.tradingDate,
      ticker: schema.dailyIdeas.ticker,
      score: schema.dailyIdeas.score,
      narrative: schema.dailyIdeas.narrative,
    })
    .from(schema.dailyIdeas)
    .where(isNotNull(schema.dailyIdeas.ticker))
    .orderBy(desc(schema.dailyIdeas.tradingDate));

  return Promise.all(rows.map(async (row) => {
    const ticker = row.ticker as string;
    const payload = row.narrative as DailyIdeaPayload | null;
    const selectionPrice = payload?.facts.price?.current ?? null;
    let currentPrice: number | null = null;
    try {
      const quote = await getCachedQuote(ticker);
      currentPrice = Number.isFinite(quote.data.c) ? quote.data.c : null;
    } catch {
      // History remains useful when a current quote is temporarily unavailable.
    }
    return {
      tradingDate: row.tradingDate,
      ticker,
      score: row.score == null ? null : Number(row.score),
      selectionPrice,
      currentPrice,
      changePercent: percentageChange(selectionPrice, currentPrice),
    };
  }));
}
