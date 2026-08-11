import {
  getEarningsCalendar,
  getMarketHolidays,
  getMetrics,
  getProfile,
  getQuote,
  type CallContext,
} from "./finnhub";
import { withProviderCache } from "./cache";

const QUOTE_TTL_MS = 5 * 60 * 1000;
const FUNDAMENTALS_TTL_MS = 12 * 60 * 60 * 1000;
const EARNINGS_TTL_MS = 6 * 60 * 60 * 1000;
const HOLIDAY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function getCachedQuote(ticker: string, ctx?: CallContext) {
  return withProviderCache(
    { provider: "finnhub", kind: "/quote", ticker },
    QUOTE_TTL_MS,
    () => getQuote(ticker, ctx),
  );
}

export function getCachedMarketHolidays(exchange = "US", ctx?: CallContext) {
  return withProviderCache(
    {
      provider: "finnhub",
      kind: "/stock/market-holiday",
      ticker: exchange,
    },
    HOLIDAY_TTL_MS,
    () => getMarketHolidays(exchange, ctx),
  );
}

export function getCachedProfile(ticker: string, ctx?: CallContext) {
  return withProviderCache(
    { provider: "finnhub", kind: "/stock/profile2", ticker },
    FUNDAMENTALS_TTL_MS,
    () => getProfile(ticker, ctx),
  );
}

export function getCachedMetrics(ticker: string, ctx?: CallContext) {
  return withProviderCache(
    { provider: "finnhub", kind: "/stock/metric", ticker },
    FUNDAMENTALS_TTL_MS,
    () => getMetrics(ticker, ctx),
  );
}

export function getCachedEarnings(
  ticker: string,
  from: string,
  to: string,
  ctx?: CallContext,
) {
  return withProviderCache(
    {
      provider: "finnhub",
      kind: "/calendar/earnings",
      ticker,
      cacheKey: `${from}:${to}`,
    },
    EARNINGS_TTL_MS,
    () => getEarningsCalendar(ticker, from, to, ctx),
  );
}
