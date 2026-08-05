import { z } from "zod";

import { db, schema } from "@/lib/db";
import type { Provenance } from "@/lib/domain/provenance";
import {
  insiderTransactionsSchema,
  metricsSchema,
  newsSchema,
  peersSchema,
  profileSchema,
  quoteSchema,
  recommendationsSchema,
  type InsiderTransactions,
  type Metrics,
  type NewsItem,
  type Peers,
  type Profile,
  type Quote,
  type Recommendations,
} from "./finnhub-schemas";

const BASE_URL = "https://finnhub.io/api/v1";
const TIMEOUT_MS = 10_000;
const PROVIDER = "finnhub";

export class FinnhubError extends Error {
  readonly endpoint: string;
  readonly httpStatus?: number;

  constructor(
    message: string,
    opts: { endpoint: string; httpStatus?: number; cause?: unknown },
  ) {
    super(message, { cause: opts.cause });
    this.name = "FinnhubError";
    this.endpoint = opts.endpoint;
    this.httpStatus = opts.httpStatus;
  }
}

// Linkage into source_calls: a fetch belongs to a report and/or a screen run.
export type CallContext = {
  ticker?: string;
  reportId?: number;
  runId?: number;
};

export type Sourced<T> = {
  data: T;
  provenance: Provenance;
};

async function logSourceCall(row: {
  endpoint: string;
  ticker?: string;
  httpStatus?: number;
  providerTimestamp?: Date;
  fetchedAt: Date;
  latencyMs: number;
  status: "fresh" | "failed";
  reportId?: number;
  runId?: number;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(schema.sourceCalls).values({
      provider: PROVIDER,
      endpoint: row.endpoint,
      ticker: row.ticker,
      httpStatus: row.httpStatus,
      providerTimestamp: row.providerTimestamp,
      fetchedAt: row.fetchedAt,
      latencyMs: row.latencyMs,
      status: row.status,
      reportId: row.reportId,
      runId: row.runId,
      meta: row.meta,
    });
  } catch (err) {
    // Audit logging must not turn a successful provider call into a failure.
    console.error("source_calls insert failed:", (err as Error).message);
  }
}

async function finnhubGet<S extends z.ZodType>(
  endpoint: string,
  params: Record<string, string>,
  responseSchema: S,
  ctx: CallContext = {},
): Promise<Sourced<z.output<S>>> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) {
    throw new FinnhubError("FINNHUB_API_KEY is not set", { endpoint });
  }

  const url = new URL(`${BASE_URL}${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("token", token);

  const fetchedAt = new Date();
  const started = performance.now();

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (cause) {
    await logSourceCall({
      endpoint,
      ticker: ctx.ticker,
      fetchedAt,
      latencyMs: Math.round(performance.now() - started),
      status: "failed",
      reportId: ctx.reportId,
      runId: ctx.runId,
      meta: { error: (cause as Error).message },
    });
    throw new FinnhubError(`network failure on ${endpoint}`, { endpoint, cause });
  }

  const latencyMs = Math.round(performance.now() - started);
  const remaining = res.headers.get("x-ratelimit-remaining");
  const meta = remaining !== null ? { rateLimitRemaining: Number(remaining) } : undefined;

  if (!res.ok) {
    await logSourceCall({
      endpoint,
      ticker: ctx.ticker,
      httpStatus: res.status,
      fetchedAt,
      latencyMs,
      status: "failed",
      reportId: ctx.reportId,
      runId: ctx.runId,
      meta,
    });
    throw new FinnhubError(`${endpoint} returned HTTP ${res.status}`, {
      endpoint,
      httpStatus: res.status,
    });
  }

  const parsed = responseSchema.safeParse(await res.json().catch(() => undefined));
  if (!parsed.success) {
    await logSourceCall({
      endpoint,
      ticker: ctx.ticker,
      httpStatus: res.status,
      fetchedAt,
      latencyMs,
      status: "failed",
      reportId: ctx.reportId,
      runId: ctx.runId,
      meta: { ...meta, error: "response failed schema validation" },
    });
    throw new FinnhubError(`${endpoint} response failed schema validation`, {
      endpoint,
      httpStatus: res.status,
    });
  }

  const providerTimestamp = extractProviderTimestamp(endpoint, parsed.data);
  await logSourceCall({
    endpoint,
    ticker: ctx.ticker,
    httpStatus: res.status,
    providerTimestamp,
    fetchedAt,
    latencyMs,
    status: "fresh",
    reportId: ctx.reportId,
    runId: ctx.runId,
    meta,
  });

  return {
    data: parsed.data,
    provenance: {
      provider: PROVIDER,
      endpoint,
      fetchedAt: fetchedAt.toISOString(),
      providerTimestamp: providerTimestamp?.toISOString(),
      status: "fresh",
      httpStatus: res.status,
    },
  };
}

function extractProviderTimestamp(endpoint: string, data: unknown): Date | undefined {
  if (endpoint === "/quote") {
    const t = (data as Quote).t;
    return t > 0 ? new Date(t * 1000) : undefined;
  }
  return undefined;
}

export function getQuote(ticker: string, ctx?: CallContext): Promise<Sourced<Quote>> {
  return finnhubGet("/quote", { symbol: ticker }, quoteSchema, { ticker, ...ctx });
}

export function getProfile(ticker: string, ctx?: CallContext): Promise<Sourced<Profile>> {
  return finnhubGet("/stock/profile2", { symbol: ticker }, profileSchema, {
    ticker,
    ...ctx,
  });
}

export function getMetrics(ticker: string, ctx?: CallContext): Promise<Sourced<Metrics>> {
  return finnhubGet(
    "/stock/metric",
    { symbol: ticker, metric: "all" },
    metricsSchema,
    { ticker, ...ctx },
  );
}

export function getPeers(ticker: string, ctx?: CallContext): Promise<Sourced<Peers>> {
  return finnhubGet("/stock/peers", { symbol: ticker }, peersSchema, {
    ticker,
    ...ctx,
  });
}

// from/to are YYYY-MM-DD (Finnhub expects dates, not timestamps).
export function getCompanyNews(
  ticker: string,
  from: string,
  to: string,
  ctx?: CallContext,
): Promise<Sourced<NewsItem[]>> {
  return finnhubGet(
    "/company-news",
    { symbol: ticker, from, to },
    newsSchema,
    { ticker, ...ctx },
  );
}

export function getInsiderTransactions(
  ticker: string,
  ctx?: CallContext,
): Promise<Sourced<InsiderTransactions>> {
  return finnhubGet(
    "/stock/insider-transactions",
    { symbol: ticker },
    insiderTransactionsSchema,
    { ticker, ...ctx },
  );
}

export function getRecommendations(
  ticker: string,
  ctx?: CallContext,
): Promise<Sourced<Recommendations>> {
  return finnhubGet("/stock/recommendation", { symbol: ticker }, recommendationsSchema, {
    ticker,
    ...ctx,
  });
}
