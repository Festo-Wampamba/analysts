import { z } from "zod";

// Schemas validate the fields we consume; unknown extra fields pass through
// (Finnhub adds fields without notice — strict schemas would break on deploy day).

// GET /quote — c: current, d: change, dp: change %, h/l/o: day range, pc: prev close, t: unix ts.
// Unknown tickers return all zeros (c=0, pc=0, t=0) with HTTP 200; callers must
// treat that as "no data", which quoteLooksEmpty encodes.
export const quoteSchema = z.object({
  c: z.number(),
  d: z.number().nullable(),
  dp: z.number().nullable(),
  h: z.number(),
  l: z.number(),
  o: z.number(),
  pc: z.number(),
  t: z.number(),
});
export type Quote = z.infer<typeof quoteSchema>;

export function quoteLooksEmpty(q: Quote): boolean {
  return q.c === 0 && q.pc === 0 && q.t === 0;
}

// GET /stock/profile2 — {} for unknown tickers, hence required name/ticker.
export const profileSchema = z.object({
  name: z.string().min(1),
  ticker: z.string().min(1),
  exchange: z.string().optional(),
  finnhubIndustry: z.string().optional(),
  marketCapitalization: z.number().optional(), // millions of `currency`
  shareOutstanding: z.number().optional(), // millions
  currency: z.string().optional(),
  country: z.string().optional(),
  ipo: z.string().optional(),
  weburl: z.string().optional(),
  logo: z.string().optional(),
});
export type Profile = z.infer<typeof profileSchema>;

// GET /stock/metric?metric=all — `metric` is a large loose bag; we validate the
// container and read individual keys defensively via metricNumber().
export const metricsSchema = z.object({
  metric: z.record(z.string(), z.unknown()),
  series: z.unknown().optional(),
});
export type Metrics = z.infer<typeof metricsSchema>;

export function metricNumber(m: Metrics, key: string): number | undefined {
  const v = m.metric[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

// GET /stock/peers — plain array of tickers (includes the queried ticker itself).
export const peersSchema = z.array(z.string());
export type Peers = z.infer<typeof peersSchema>;

// GET /company-news?symbol=&from=&to=
export const newsItemSchema = z.object({
  id: z.number(),
  datetime: z.number(), // unix seconds
  headline: z.string(),
  source: z.string(),
  summary: z.string(),
  url: z.string(),
  related: z.string().optional(),
});
export const newsSchema = z.array(newsItemSchema);
export type NewsItem = z.infer<typeof newsItemSchema>;

// GET /stock/insider-transactions
export const insiderTransactionsSchema = z.object({
  symbol: z.string(),
  data: z.array(
    z.object({
      name: z.string(),
      share: z.number().nullable(),
      change: z.number().nullable(),
      filingDate: z.string(),
      transactionDate: z.string(),
      transactionCode: z.string(),
      transactionPrice: z.number().nullable(),
    }),
  ),
});
export type InsiderTransactions = z.infer<typeof insiderTransactionsSchema>;

// GET /stock/recommendation — analyst recommendation trends, newest first.
export const recommendationsSchema = z.array(
  z.object({
    period: z.string(), // YYYY-MM-01
    strongBuy: z.number(),
    buy: z.number(),
    hold: z.number(),
    sell: z.number(),
    strongSell: z.number(),
    symbol: z.string(),
  }),
);
export type Recommendations = z.infer<typeof recommendationsSchema>;
