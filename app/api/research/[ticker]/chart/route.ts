import { NextResponse } from "next/server";

import { consumeRateLimit, requestIdentifier } from "@/lib/http/rate-limit";
import { isValidTicker, normalizeTicker } from "@/lib/research/ticker";
import { getChartSeries, type ChartRange } from "@/lib/source/chart";

export const dynamic = "force-dynamic";

const ranges = new Set<ChartRange>(["1d", "5d", "1m", "1y"]);

export async function GET(
  request: Request,
  ctx: { params: Promise<{ ticker: string }> },
) {
  const { ticker: raw } = await ctx.params;
  const ticker = normalizeTicker(raw);
  const range = new URL(request.url).searchParams.get("range") as ChartRange | null;
  if (!isValidTicker(ticker)) {
    return NextResponse.json({ error: "invalid_ticker" }, { status: 400 });
  }
  if (!range || !ranges.has(range)) {
    return NextResponse.json(
      { error: "invalid_range", message: "Range must be 1d, 5d, 1m, or 1y." },
      { status: 400 },
    );
  }
  const limit = consumeRateLimit("research-chart", requestIdentifier(request.headers));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many chart requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }
  try {
    const result = await getChartSeries(ticker, range);
    return NextResponse.json(
      { ...result.data, provenance: result.provenance, cached: result.cached },
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: "chart_unavailable", message: (error as Error).message },
      { status: 503 },
    );
  }
}
