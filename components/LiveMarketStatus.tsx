"use client";

import { useCallback, useEffect, useState } from "react";

const HEALTH_REFRESH_MS = 5 * 60 * 1000;

type HealthPayload = {
  status?: unknown;
  db?: unknown;
  providers?: Record<string, unknown>;
  latestScreen?: { tradingDate?: unknown } | null;
};

type HealthView = { label: string; degraded: boolean; title: string };

function StatusIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 1-4.3-7.1" /><path d="m9 11 2 2 5-6" /></svg>;
}

export function parseHealthView(payload: unknown): HealthView | null {
  if (!payload || typeof payload !== "object") return null;
  const health = payload as HealthPayload;
  const providers = health.providers;
  const requiredProvidersReady = providers
    ? providers.finnhub === true && providers.groq === true
    : false;
  const degraded = health.status !== "ok" || health.db !== "reachable" || !requiredProvidersReady;
  const tradingDate = health.latestScreen && typeof health.latestScreen.tradingDate === "string"
    ? health.latestScreen.tradingDate
    : null;
  return degraded
    ? {
        label: "Provider degraded",
        degraded: true,
        title: tradingDate ? `Platform health degraded · latest screen ${tradingDate}` : "Platform health degraded",
      }
    : {
        label: tradingDate ? `Operational · data ${tradingDate}` : "Operational · data date unavailable",
        degraded: false,
        title: tradingDate ? `Platform operational · latest screen ${tradingDate}` : "Platform operational",
      };
}

export function LiveMarketStatus() {
  const [health, setHealth] = useState<HealthView | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      const nextHealth = response.ok ? parseHealthView(await response.json()) : null;
      // A short health-poll failure must never replace the last known
      // platform state with an alarming single-request error.
      if (nextHealth) setHealth(nextHealth);
    } catch {
      // Retain the last known platform state and try again on the next cadence.
    }
  }, []);

  useEffect(() => {
    // Schedule the initial provider request after mount; this avoids a
    // synchronous state transition during effect setup and keeps the status
    // chip responsive to the first completed network response.
    const initialRefreshTimer = window.setTimeout(() => void refresh(), 0);
    const refreshTimer = window.setInterval(() => void refresh(), HEALTH_REFRESH_MS);
    return () => {
      window.clearTimeout(initialRefreshTimer);
      window.clearInterval(refreshTimer);
    };
  }, [refresh]);

  return (
    <span
      className={`status-chip${health?.degraded ? " status-chip--degraded" : ""}`}
      aria-live="polite"
      title={health?.title ?? "Checking platform health"}
    >
      <StatusIcon />
      {health?.label ?? "Checking platform health"}
    </span>
  );
}
