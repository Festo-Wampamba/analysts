import { NextResponse } from "next/server";

import { FinnhubError } from "@/lib/source/finnhub";
import { GroqError } from "@/lib/ai/groq";
import { ReportError } from "@/lib/research/report";
import { isValidTicker, normalizeTicker } from "@/lib/research/ticker";
import { getResearchWorkspace } from "@/lib/research/workspace";
import { consumeRateLimit, requestIdentifier } from "@/lib/http/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/research/[ticker]">,
) {
  const { ticker: raw } = await ctx.params;
  const ticker = normalizeTicker(raw);

  if (!isValidTicker(ticker)) {
    return NextResponse.json(
      { error: "invalid_ticker", message: "Ticker must be 1-6 letters, optionally suffixed (e.g. BRK.B)." },
      { status: 400 },
    );
  }

  const limit = consumeRateLimit("research-api", requestIdentifier(request.headers));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many research requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  try {
    const workspace = await getResearchWorkspace(ticker);
    return NextResponse.json({
      ...workspace.report,
      workspace: {
        financials: workspace.financials,
        peers: workspace.peers,
        earnings: workspace.earnings,
        chart: workspace.chart,
        additionalProvenance: workspace.additionalProvenance,
        failedSections: workspace.failedSections,
        researchRunId: workspace.researchRunId,
      },
    });
  } catch (err) {
    if (err instanceof ReportError) {
      const status = err.code === "unknown_ticker" ? 404 : 502;
      return NextResponse.json(
        { error: err.code, message: err.message, details: err.details },
        { status },
      );
    }

    if (err instanceof FinnhubError || err instanceof GroqError) {
      return NextResponse.json(
        { error: "provider_unavailable", message: err.message },
        { status: 502 },
      );
    }

    console.error("research route failed:", err);
    return NextResponse.json(
      { error: "internal_error", message: "Report generation failed." },
      { status: 500 },
    );
  }
}
