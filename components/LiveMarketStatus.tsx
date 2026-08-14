"use client";

import { useCallback, useEffect, useState } from "react";

import { marketFreshness } from "@/lib/market/freshness";

const CHART_REFRESH_MS = 5 * 60 * 1000;
const CLOCK_REFRESH_MS = 60 * 1000;

type ChartPayload = { asOf?: unknown };

function StatusIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 1-4.3-7.1" /><path d="m9 11 2 2 5-6" /></svg>;
}

function validAsOf(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const asOf = (payload as ChartPayload).asOf;
  return typeof asOf === "string" && Number.isFinite(new Date(asOf).getTime())
    ? asOf
    : null;
}

export function LiveMarketStatus({
  ticker,
  initialAsOf,
  unavailableLabel = "Market data unavailable",
}: {
  ticker?: string | null;
  initialAsOf?: string | null;
  unavailableLabel?: string;
}) {
  const [asOf, setAsOf] = useState<string | null>(initialAsOf ?? null);
  const [, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    if (!ticker) return;
    try {
      const response = await fetch(
        `/api/research/${encodeURIComponent(ticker)}/chart?range=1d`,
        { cache: "no-store" },
      );
      const nextAsOf = response.ok ? validAsOf(await response.json()) : null;
      // A short provider or network failure must never replace the latest
      // valid timestamp with an unhelpful error chip.
      if (nextAsOf) setAsOf(nextAsOf);
    } catch {
      // Retain the last valid provider bar and try again on the next cadence.
    }
  }, [ticker]);

  useEffect(() => {
    // Schedule the initial provider request after mount; this avoids a
    // synchronous state transition during effect setup and keeps the status
    // chip responsive to the first completed network response.
    const initialRefreshTimer = window.setTimeout(() => void refresh(), 0);
    const refreshTimer = window.setInterval(() => void refresh(), CHART_REFRESH_MS);
    return () => {
      window.clearTimeout(initialRefreshTimer);
      window.clearInterval(refreshTimer);
    };
  }, [refresh]);

  useEffect(() => {
    const clockTimer = window.setInterval(() => setNow(Date.now()), CLOCK_REFRESH_MS);
    return () => window.clearInterval(clockTimer);
  }, []);

  const freshness = asOf ? marketFreshness(asOf) : null;
  return (
    <span
      className={`status-chip${freshness?.stale ? " status-chip--stale" : ""}`}
      aria-live="polite"
      title={asOf ?? unavailableLabel}
    >
      <StatusIcon />
      {freshness?.label ?? unavailableLabel}
    </span>
  );
}
