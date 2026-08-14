"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Preview = {
  ticker: string;
  companyName?: string;
  currency?: string;
  price?: number;
  changePercent?: number;
  asOf?: string;
  thesis?: string;
  generatedAt?: string;
  generatedStatus?: "generated" | "fallback";
};

type PreviewState =
  | { status: "loading" }
  | { status: "ready"; data: Preview }
  | { status: "error"; message: string };

type ResearchResponse = {
  ticker?: unknown;
  facts?: {
    company?: { name?: unknown; currency?: unknown };
  };
  narrative?: { thesis?: unknown };
  generated?: { generatedAt?: unknown; status?: unknown };
  workspace?: {
    chart?: { asOf?: unknown } | null;
    peers?: { ticker?: unknown; price?: unknown; changePercent?: unknown; quoteAsOf?: unknown }[];
  };
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parsePreview(payload: unknown, requestedTicker: string): Preview | null {
  if (!payload || typeof payload !== "object") return null;
  const report = payload as ResearchResponse;
  const ticker = asString(report.ticker) ?? requestedTicker;
  const peers = Array.isArray(report.workspace?.peers) ? report.workspace?.peers : [];
  const quote = peers.find((peer) => asString(peer.ticker)?.toUpperCase() === ticker.toUpperCase());
  const generatedStatus = report.generated?.status === "fallback" ? "fallback" : "generated";
  return {
    ticker,
    companyName: asString(report.facts?.company?.name),
    currency: asString(report.facts?.company?.currency),
    price: asNumber(quote?.price),
    changePercent: asNumber(quote?.changePercent),
    asOf: asString(report.workspace?.chart?.asOf) ?? asString(quote?.quoteAsOf),
    thesis: asString(report.narrative?.thesis),
    generatedAt: asString(report.generated?.generatedAt),
    generatedStatus,
  };
}

function formatMoney(value: number | undefined, currency = "USD") {
  if (value === undefined) return "Quote unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatAsOf(value: string | undefined) {
  if (!value) return "Provider time unavailable";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

export function CandidateResearchPreview({ ticker }: { ticker: string }) {
  const cacheRef = useRef(new Map<string, Preview>());
  const [state, setState] = useState<PreviewState>({ status: "loading" });

  useEffect(() => {
    const cached = cacheRef.current.get(ticker);
    if (cached) {
      setState({ status: "ready", data: cached });
      return undefined;
    }

    let cancelled = false;
    setState({ status: "loading" });
    void fetch(`/api/research/${encodeURIComponent(ticker)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message = payload && typeof payload === "object" && "message" in payload
            ? String(payload.message)
            : "Sourced research is temporarily unavailable.";
          throw new Error(message);
        }
        const preview = parsePreview(payload, ticker);
        if (!preview) throw new Error("The research response was incomplete.");
        return preview;
      })
      .then((preview) => {
        cacheRef.current.set(ticker, preview);
        if (!cancelled) setState({ status: "ready", data: preview });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: "error", message: error instanceof Error ? error.message : "Sourced research is temporarily unavailable." });
      });

    return () => {
      cancelled = true;
    };
  }, [ticker]);

  if (state.status === "loading") {
    return <section className="candidate-research-preview" aria-busy="true"><span className="eyebrow eyebrow--fact">Sourced research · {ticker}</span><p>Loading live provider facts and verified research…</p></section>;
  }
  if (state.status === "error") {
    return <section className="candidate-research-preview candidate-research-preview--error" role="status"><span className="eyebrow eyebrow--fact">Sourced research · {ticker}</span><p>{state.message}</p><Link className="button" href={`/research/${ticker}`}>Open {ticker} report</Link></section>;
  }

  const { data } = state;
  return (
    <section className="candidate-research-preview" aria-live="polite">
      <div className="candidate-research-preview__head">
        <div><span className="eyebrow eyebrow--fact">Live provider facts · {data.ticker}</span><strong>{data.companyName ?? data.ticker}</strong></div>
        <Link className="button" href={`/research/${data.ticker}`}>Open full sourced report</Link>
      </div>
      <div className="candidate-research-preview__facts">
        <div><span>Latest quote</span><strong>{formatMoney(data.price, data.currency)}</strong>{data.changePercent !== undefined && <em className={data.changePercent >= 0 ? "trend-up" : "trend-down"}>{data.changePercent >= 0 ? "▲" : "▼"} {Math.abs(data.changePercent).toFixed(2)}%</em>}</div>
        <div><span>Latest provider bar</span><strong>{formatAsOf(data.asOf)}</strong></div>
        <div><span>Research narrative</span><strong>{data.generatedStatus === "fallback" ? "Verified fallback" : "AI-generated"}</strong><small>{data.generatedAt ? `Generated ${formatAsOf(data.generatedAt)}` : "Generated time unavailable"}</small></div>
      </div>
      {data.thesis && <p className="candidate-research-preview__thesis">{data.thesis}</p>}
    </section>
  );
}
