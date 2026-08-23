"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { dateTimeOptions, formatDateTime, useViewerTimeZone } from "@/components/LocalizedDateTime";

export type CandidatePreview = {
  ticker: string;
  companyName?: string;
  currency?: string;
  marketCapMillions?: number;
  price?: number;
  changePercent?: number;
  asOf?: string;
  thesis?: string;
  generatedAt?: string;
  generatedStatus?: "generated" | "fallback";
};

type PreviewState =
  | { status: "loading" }
  | { status: "ready"; data: CandidatePreview }
  | { status: "error"; message: string };

type ResearchResponse = {
  ticker?: unknown;
  facts?: {
    company?: { name?: unknown; currency?: unknown; marketCapMillions?: unknown };
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

function parsePreview(payload: unknown, requestedTicker: string): CandidatePreview | null {
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
    marketCapMillions: asNumber(report.facts?.company?.marketCapMillions),
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

export function CandidateResearchPreview({
  ticker,
  initial,
  onLoadingChange,
}: {
  ticker: string;
  initial?: CandidatePreview;
  onLoadingChange?: (loading: boolean) => void;
}) {
  const initialMatches = initial !== undefined && initial.ticker.toUpperCase() === ticker.toUpperCase();
  const initialEntries: [string, CandidatePreview][] = initialMatches ? [[ticker, initial]] : [];
  const cacheRef = useRef(new Map<string, CandidatePreview>(initialEntries));
  const [state, setState] = useState<PreviewState>(
    initialMatches ? { status: "ready", data: initial } : { status: "loading" },
  );
  const timeZone = useViewerTimeZone();
  const formatAsOf = (value: string | undefined) => formatDateTime(value, timeZone, dateTimeOptions, "Provider time unavailable");

  useEffect(() => {
    const cached = cacheRef.current.get(ticker);
    if (cached) {
      setState({ status: "ready", data: cached });
      onLoadingChange?.(false);
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();
    setState({ status: "loading" });
    onLoadingChange?.(true);
    void fetch(`/api/research/${encodeURIComponent(ticker)}`, { cache: "no-store", signal: controller.signal })
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
        if (!cancelled) {
          setState({ status: "ready", data: preview });
          onLoadingChange?.(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ status: "error", message: error instanceof Error ? error.message : "Sourced research is temporarily unavailable." });
          onLoadingChange?.(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [ticker, onLoadingChange]);

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
        <div><span className="eyebrow eyebrow--fact">Now viewing research · {data.ticker}</span><strong>{data.companyName ?? data.ticker}</strong><small>Live provider facts and a sourced narrative for this ranked candidate.</small></div>
        <Link className="button" href={`/research/${data.ticker}`}>Open full sourced report</Link>
      </div>
      <div className="candidate-research-preview__facts">
        <div><span>Latest quote</span><strong>{formatMoney(data.price, data.currency)}</strong>{data.changePercent !== undefined && <em className={data.changePercent >= 0 ? "trend-up" : "trend-down"}>{data.changePercent >= 0 ? "▲" : "▼"} {Math.abs(data.changePercent).toFixed(2)}%</em>}</div>
        <div><span>Latest provider bar</span><strong>{formatAsOf(data.asOf)}</strong></div>
        <div><span>Research narrative</span><strong>{data.generatedStatus === "fallback" ? "Fallback · sourced data only" : "AI-generated"}</strong><small>{data.generatedAt ? `Generated ${formatAsOf(data.generatedAt)}` : "Generated time unavailable"}</small></div>
      </div>
      {data.thesis && <p className="candidate-research-preview__thesis">{data.thesis}</p>}
    </section>
  );
}
