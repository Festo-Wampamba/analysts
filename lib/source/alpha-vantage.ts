import { and, count, eq, gte } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/lib/db";
import type { Provenance } from "@/lib/domain/provenance";
import { fetchWithRetry } from "@/lib/http/retry";
import { readProviderCache, writeProviderCache } from "./cache";
import { recordSourceCall } from "./log";

const PROVIDER = "alpha-vantage";
const ENDPOINT = "https://www.alphavantage.co/query";
const TIMEOUT_MS = 15_000;
const INTRADAY_TTL_MS = 5 * 60 * 1000;
const DAILY_TTL_MS = 24 * 60 * 60 * 1000;
const WEEKLY_TTL_MS = 7 * DAILY_TTL_MS;

export type ChartRange = "1d" | "5d" | "1m" | "1y";
export type ChartPoint = { timestamp: string; close: number };
export type ChartSeries = {
  ticker: string;
  range: ChartRange;
  points: ChartPoint[];
  asOf: string;
};
type StoredChartSeries = Omit<ChartSeries, "range">;

const rowSchema = z.object({ "4. close": z.string() });

function easternTimestampToUtc(timestamp: string): string {
  if (!timestamp.includes(" ")) return `${timestamp}T00:00:00.000Z`;

  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(timestamp);
  if (!match) throw new Error("unrecognised intraday timestamp");
  const [, year, month, day, hour, minute, second] = match;
  const wallClock = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(wallClock)).flatMap((part) =>
      part.type === "literal" ? [] : [[part.type, part.value]],
    ),
  );
  const observedWallClock = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const utc = wallClock - (observedWallClock - wallClock);
  return new Date(utc).toISOString();
}

function providerTimestamp(timestamp: string, range: ChartRange): string {
  return range === "1d"
    ? easternTimestampToUtc(timestamp)
    : easternTimestampToUtc(`${timestamp} 16:00:00`);
}

export function normalizeTimeSeries(
  ticker: string,
  range: ChartRange,
  raw: unknown,
): ChartSeries {
  const payload = z.record(z.string(), z.unknown()).parse(raw);
  const seriesKey = Object.keys(payload).find((key) => key.includes("Time Series"));
  if (!seriesKey) {
    const message = payload.Note ?? payload.Information ?? payload["Error Message"];
    throw new Error(typeof message === "string" ? message : "price series missing");
  }
  const rows = z.record(z.string(), rowSchema).parse(payload[seriesKey]);
  const sorted = Object.entries(rows)
    .map(([timestamp, row]) => ({ timestamp: providerTimestamp(timestamp, range), close: Number(row["4. close"]) }))
    .filter((point) => Number.isFinite(point.close))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const points = selectPoints(sorted, range);
  if (points.length < 2) throw new Error("not enough price history");
  return { ticker, range, points, asOf: points.at(-1)!.timestamp };
}

function selectPoints(points: ChartPoint[], range: ChartRange): ChartPoint[] {
  if (range === "1d") return points;
  const desired = range === "5d" ? 5 : range === "1m" ? 23 : 53;
  return points.slice(-desired);
}

function asRange(stored: StoredChartSeries, range: ChartRange): ChartSeries {
  const points = selectPoints(
    stored.points.map((point) => ({
      ...point,
      // Older daily cache rows used bare YYYY-MM-DD strings. Keep them
      // readable while those rows naturally expire after deployment.
      timestamp: point.timestamp.includes("T")
        ? point.timestamp
        : easternTimestampToUtc(`${point.timestamp} 16:00:00`),
    })),
    range,
  );
  if (points.length < 2) throw new Error("not enough price history");
  return { ...stored, range, points, asOf: points.at(-1)!.timestamp };
}

async function callsToday(): Promise<number> {
  try {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const [row] = await db
      .select({ value: count() })
      .from(schema.sourceCalls)
      .where(
        and(
          eq(schema.sourceCalls.provider, PROVIDER),
          gte(schema.sourceCalls.fetchedAt, start),
        ),
      );
    return row?.value ?? 0;
  } catch {
    return 0;
  }
}

export async function getChartSeries(
  ticker: string,
  range: ChartRange,
  ctx: { researchRunId?: number } = {},
): Promise<{ data: ChartSeries; provenance: Provenance; cached: boolean }> {
  const symbol = ticker.toUpperCase();
  const kind = range === "1d" ? "intraday-5min" : range === "1y" ? "weekly-series" : "daily-series";
  const cacheKey = { provider: PROVIDER, kind, ticker: symbol };
  const cached = await readProviderCache<StoredChartSeries>(cacheKey);
  if (cached) return { ...cached, data: asRange(cached.data, range) };

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) throw new Error("ALPHA_VANTAGE_API_KEY is not set");
  const budget = Number(process.env.ALPHA_VANTAGE_DAILY_BUDGET ?? "20");
  if ((await callsToday()) >= budget) throw new Error("daily chart provider budget exhausted");

  const functionName = range === "1d"
    ? "TIME_SERIES_INTRADAY"
    : range === "1y"
      ? "TIME_SERIES_WEEKLY"
      : "TIME_SERIES_DAILY";
  const url = new URL(ENDPOINT);
  url.searchParams.set("function", functionName);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", apiKey);
  if (range === "1d") url.searchParams.set("interval", "5min");
  if (range !== "1y") url.searchParams.set("outputsize", "compact");
  const fetchedAt = new Date();
  const started = performance.now();
  let response: Response;
  try {
    response = await fetchWithRetry(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    await recordSourceCall({
      provider: PROVIDER,
      endpoint: functionName,
      ticker: symbol,
      fetchedAt,
      latencyMs: Math.round(performance.now() - started),
      status: "failed",
      researchRunId: ctx.researchRunId,
      meta: { error: (error as Error).message },
    });
    throw error;
  }
  const raw = await response.json().catch(() => undefined);
  let data: ChartSeries;
  try {
    if (!response.ok) throw new Error(`${functionName} returned HTTP ${response.status}`);
    data = normalizeTimeSeries(symbol, range, raw);
  } catch (error) {
    await recordSourceCall({
      provider: PROVIDER,
      endpoint: functionName,
      ticker: symbol,
      httpStatus: response.status,
      fetchedAt,
      latencyMs: Math.round(performance.now() - started),
      status: "failed",
      researchRunId: ctx.researchRunId,
      meta: { error: (error as Error).message },
    });
    throw error;
  }
  await recordSourceCall({
    provider: PROVIDER,
    endpoint: functionName,
    ticker: symbol,
    httpStatus: response.status,
    providerTimestamp: new Date(data.asOf),
    fetchedAt,
    latencyMs: Math.round(performance.now() - started),
    status: "fresh",
    researchRunId: ctx.researchRunId,
  });
  const payload = z.record(z.string(), z.unknown()).parse(raw);
  const seriesKey = Object.keys(payload).find((key) => key.includes("Time Series"))!;
  const rows = z.record(z.string(), rowSchema).parse(payload[seriesKey]);
  const allPoints = Object.entries(rows)
    .map(([timestamp, row]) => ({ timestamp: providerTimestamp(timestamp, range), close: Number(row["4. close"]) }))
    .filter((point) => Number.isFinite(point.close))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  await writeProviderCache(cacheKey, { ticker: symbol, points: allPoints, asOf: data.asOf }, {
    fetchedAt,
    expiresAt: new Date(fetchedAt.getTime() + (range === "1d" ? INTRADAY_TTL_MS : range === "1y" ? WEEKLY_TTL_MS : DAILY_TTL_MS)),
    providerTimestamp: new Date(data.asOf),
  });
  return {
    data,
    cached: false,
    provenance: {
      provider: PROVIDER,
      endpoint: functionName,
      fetchedAt: fetchedAt.toISOString(),
      providerTimestamp: data.asOf,
      status: "fresh",
      httpStatus: response.status,
    },
  };
}
