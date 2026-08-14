import { z } from "zod";

import type { Provenance } from "@/lib/domain/provenance";
import { fetchWithRetry } from "@/lib/http/retry";
import { readProviderCache, writeProviderCache } from "./cache";
import type { ChartRange, ChartSeries } from "./alpha-vantage";
import { recordSourceCall } from "./log";

const PROVIDER = "twelve-data";
const ENDPOINT = "https://api.twelvedata.com/time_series";
const TIMEOUT_MS = 15_000;

const rowSchema = z.object({
  datetime: z.string(),
  close: z.union([z.string(), z.number()]),
});

const responseSchema = z.object({
  status: z.string().optional(),
  code: z.number().optional(),
  message: z.string().optional(),
  meta: z.object({ exchange_timezone: z.string().optional() }).optional(),
  values: z.array(rowSchema).optional(),
});

type TwelveRangeConfig = {
  interval: "5min" | "1h" | "1day" | "1week";
  outputsize: number;
  ttlMs: number;
};

const RANGE_CONFIG: Record<ChartRange, TwelveRangeConfig> = {
  "1d": { interval: "5min", outputsize: 78, ttlMs: 5 * 60 * 1000 },
  "5d": { interval: "1h", outputsize: 35, ttlMs: 15 * 60 * 1000 },
  "1m": { interval: "1day", outputsize: 23, ttlMs: 60 * 60 * 1000 },
  "1y": { interval: "1week", outputsize: 53, ttlMs: 24 * 60 * 60 * 1000 },
};

function zonedTimestampToUtc(timestamp: string, timeZone: string): string {
  if (timestamp.includes("T")) {
    const parsed = new Date(timestamp);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?$/.exec(timestamp);
  if (!match) throw new Error("unrecognised Twelve Data timestamp");
  const [, year, month, day, hour = "16", minute = "00", second = "00"] = match;
  const wallClock = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
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
  return new Date(wallClock - (observedWallClock - wallClock)).toISOString();
}

export function normalizeTwelveDataSeries(
  ticker: string,
  range: ChartRange,
  raw: unknown,
): ChartSeries {
  const payload = responseSchema.parse(raw);
  if (payload.status === "error" || !payload.values) {
    throw new Error(payload.message ?? "Twelve Data price series missing");
  }
  const timezone = payload.meta?.exchange_timezone ?? "America/New_York";
  const points = payload.values
    .map((row) => ({
      timestamp: zonedTimestampToUtc(row.datetime, timezone),
      close: Number(row.close),
    }))
    .filter((point) => Number.isFinite(point.close))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (points.length < 2) throw new Error("not enough Twelve Data price history");
  return { ticker, range, points, asOf: points.at(-1)!.timestamp };
}

export async function getTwelveDataChartSeries(
  ticker: string,
  range: ChartRange,
  ctx: { researchRunId?: number } = {},
): Promise<{ data: ChartSeries; provenance: Provenance; cached: boolean }> {
  const symbol = ticker.toUpperCase();
  const config = RANGE_CONFIG[range];
  const cacheKey = {
    provider: PROVIDER,
    kind: "time_series",
    ticker: symbol,
    cacheKey: `${range}:${config.interval}`,
  };
  const cached = await readProviderCache<ChartSeries>(cacheKey);
  if (cached) return cached;

  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) throw new Error("TWELVE_DATA_API_KEY is not set");

  const url = new URL(ENDPOINT);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", config.interval);
  url.searchParams.set("outputsize", String(config.outputsize));
  url.searchParams.set("apikey", apiKey);

  const fetchedAt = new Date();
  const started = performance.now();
  let response: Response;
  try {
    response = await fetchWithRetry(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    await recordSourceCall({
      provider: PROVIDER,
      endpoint: "time_series",
      ticker: symbol,
      fetchedAt,
      latencyMs: Math.round(performance.now() - started),
      status: "failed",
      researchRunId: ctx.researchRunId,
      meta: { interval: config.interval, error: (error as Error).message },
    });
    throw error;
  }

  const raw = await response.json().catch(() => undefined);
  let data: ChartSeries;
  try {
    if (!response.ok) throw new Error(`Twelve Data returned HTTP ${response.status}`);
    data = normalizeTwelveDataSeries(symbol, range, raw);
  } catch (error) {
    await recordSourceCall({
      provider: PROVIDER,
      endpoint: "time_series",
      ticker: symbol,
      httpStatus: response.status,
      fetchedAt,
      latencyMs: Math.round(performance.now() - started),
      status: "failed",
      researchRunId: ctx.researchRunId,
      meta: { interval: config.interval, error: (error as Error).message },
    });
    throw error;
  }

  await recordSourceCall({
    provider: PROVIDER,
    endpoint: "time_series",
    ticker: symbol,
    httpStatus: response.status,
    providerTimestamp: new Date(data.asOf),
    fetchedAt,
    latencyMs: Math.round(performance.now() - started),
    status: "fresh",
    researchRunId: ctx.researchRunId,
    meta: { interval: config.interval },
  });
  await writeProviderCache(cacheKey, data, {
    fetchedAt,
    expiresAt: new Date(fetchedAt.getTime() + config.ttlMs),
    providerTimestamp: new Date(data.asOf),
  });
  return {
    data,
    cached: false,
    provenance: {
      provider: PROVIDER,
      endpoint: "time_series",
      fetchedAt: fetchedAt.toISOString(),
      providerTimestamp: data.asOf,
      status: "fresh",
      httpStatus: response.status,
    },
  };
}
