import { NextResponse } from "next/server";

import { FinnhubError } from "@/lib/source/finnhub";
import { GroqError } from "@/lib/ai/groq";
import { getResearchReport, ReportError } from "@/lib/research/report";
import { isValidTicker, normalizeTicker } from "@/lib/research/ticker";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
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

  try {
    return NextResponse.json(await getResearchReport(ticker));
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
