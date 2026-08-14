"use client";

import { useCallback, useEffect, useState } from "react";

import type { ChartPoint, ChartRange, ChartSeries } from "@/lib/source/chart";

type ChartState = ChartSeries | { error: string };

const chartRanges: ChartRange[] = ["1d", "5d", "1m", "1y"];
const EASTERN_TIME_ZONE = "America/New_York";
const FRESH_WINDOW_MS = 5 * 60 * 60 * 1000;
const ONE_DAY_REFRESH_MS = 5 * 60 * 1000;

function chartGeometry(points: ChartPoint[]) {
  if (points.length < 2) return null;
  const width = 720;
  const height = 112;
  const values = points.map((point) => point.close);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const coords = points.map((point, index) => ({
    x: (index / (points.length - 1)) * width,
    y: 8 + ((max - point.close) / spread) * (height - 16),
  }));
  const line = coords
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
  return {
    width,
    height,
    line,
    fill: `${line} L${width} ${height} L0 ${height} Z`,
    last: coords.at(-1)!,
    coords,
    rising: values.at(-1)! >= values[0],
  };
}

function isChartSeries(value: unknown): value is ChartSeries {
  return Boolean(
    value &&
      typeof value === "object" &&
      "points" in value &&
      Array.isArray((value as ChartSeries).points) &&
      "asOf" in value,
  );
}

function formatPrice(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatAsOf(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Provider time unavailable";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function formatTooltipTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Provider time unavailable";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function freshnessLabel(asOf: string): { label: string; stale: boolean } {
  const timestamp = new Date(asOf).getTime();
  if (!Number.isFinite(timestamp)) return { label: "Provider time unavailable", stale: true };
  const ageMs = Math.max(0, Date.now() - timestamp);
  if (ageMs <= FRESH_WINDOW_MS) {
    const minutes = Math.max(1, Math.round(ageMs / 60_000));
    return { label: `Fresh · ${minutes}m ago`, stale: false };
  }
  const hours = Math.floor(ageMs / 3_600_000);
  return { label: `Stale · ${hours}h ago`, stale: true };
}

function axisLabels(series: ChartSeries): { value: string; x: number; anchor: "start" | "middle" | "end" }[] {
  const points = series.points;
  const indexes = [0, Math.floor((points.length - 1) / 2), points.length - 1];
  return indexes.map((index, labelIndex) => {
    const date = new Date(points[index].timestamp);
    const value = new Intl.DateTimeFormat("en-US", {
      timeZone: EASTERN_TIME_ZONE,
      month: series.range === "1y" ? "short" : "short",
      day: series.range === "1y" ? undefined : "numeric",
      year: series.range === "1y" ? "2-digit" : undefined,
      hour: series.range === "1d" ? "numeric" : undefined,
      minute: series.range === "1d" ? "2-digit" : undefined,
    }).format(date);
    return {
      value,
      x: labelIndex === 0 ? 0 : labelIndex === 1 ? 360 : 720,
      anchor: labelIndex === 0 ? "start" : labelIndex === 1 ? "middle" : "end",
    };
  });
}

export function PriceChart({
  ticker,
  currency,
  initial,
}: {
  ticker: string;
  currency: string;
  initial: ChartSeries | null;
}) {
  const [range, setRange] = useState<ChartRange>(initial?.range ?? "5d");
  const [state, setState] = useState<ChartState>(
    initial ?? { error: "Historical chart data is unavailable." },
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const series = "points" in state ? state : null;
  const geometry = series ? chartGeometry(series.points) : null;
  const activePoint = hoveredIndex === null || !series ? null : series.points[hoveredIndex];
  const activeCoord = hoveredIndex === null || !geometry ? null : geometry.coords[hoveredIndex];
  const latest = series?.points.at(-1);
  const opening = series?.points[0];
  const change = latest && opening && opening.close !== 0
    ? ((latest.close - opening.close) / opening.close) * 100
    : null;
  const freshness = latest ? freshnessLabel(series!.asOf) : null;

  const loadRange = useCallback(async (next: ChartRange, options: { force?: boolean } = {}) => {
    if (!options.force && next === range && series) return;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/research/${encodeURIComponent(ticker)}/chart?range=${next}`,
        { cache: "no-store" },
      );
      const payload: unknown = await response.json();
      if (response.ok && isChartSeries(payload)) {
        setState(payload);
        setRange(next);
        setMessage(null);
        setHoveredIndex(null);
      } else {
        const detail = payload && typeof payload === "object" && "message" in payload
          ? String(payload.message)
          : "Chart unavailable.";
        setMessage(next === "1d" ? `1D intraday data unavailable: ${detail}` : detail);
      }
    } catch {
      setMessage("Could not reach the chart service. The last valid series is still shown.");
    } finally {
      setLoading(false);
    }
  }, [range, series, ticker]);

  useEffect(() => {
    if (range !== "1d") return undefined;
    const refresh = window.setInterval(() => void loadRange("1d", { force: true }), ONE_DAY_REFRESH_MS);
    return () => window.clearInterval(refresh);
  }, [loadRange, range]);

  function setHoveredPoint(clientX: number, element: SVGSVGElement) {
    if (!series) return;
    const bounds = element.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    setHoveredIndex(Math.round(ratio * (series.points.length - 1)));
  }

  return (
    <section className={`market-chart ${geometry?.rising === false ? "market-chart--down" : ""}`} aria-label={`${ticker} price chart`}>
      <div className="market-chart__header">
        <div>
          <span className="market-chart__label">Price · {ticker}</span>
          {latest && (
            <div className="market-chart__summary">
              <strong>{formatPrice(latest.close, currency)}</strong>
              {change !== null && <span className={change >= 0 ? "trend-up" : "trend-down"}>{change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%</span>}
            </div>
          )}
        </div>
        <div className="market-chart__controls">
          {freshness && <span className={`market-chart__freshness${freshness.stale ? " is-stale" : ""}`}>{freshness.label}</span>}
          <div className="market-chart__range" aria-label="Chart range">
            {chartRanges.map((option) => (
              <button
                type="button"
                className={range === option ? "is-active" : ""}
                aria-pressed={range === option}
                aria-label={`Show ${option.toUpperCase()} price history`}
                onClick={() => void loadRange(option)}
                key={option}
              >
                {option.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
      {latest && <div className="market-chart__asof"><span>Latest provider bar</span><time dateTime={series!.asOf}>{formatAsOf(series!.asOf)}</time></div>}
      {message && <p className="market-chart__message" role="status">{message}</p>}
      {geometry && series ? (
        <svg
          viewBox="0 0 720 154"
          role="img"
          aria-label={`${ticker} ${range} closing-price trend. Latest provider bar ${formatAsOf(series.asOf)}.`}
          preserveAspectRatio="none"
          aria-busy={loading}
          onPointerMove={(event) => setHoveredPoint(event.clientX, event.currentTarget)}
          onPointerLeave={() => setHoveredIndex(null)}
        >
          <defs>
            <linearGradient id={`chartArea-${ticker}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity=".26" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path className="chart-grid" d="M0 28H720M0 60H720M0 92H720" />
          <path className="chart-fill" d={geometry.fill} style={{ fill: `url(#chartArea-${ticker})` }} />
          <path className="chart-line" d={geometry.line} />
          {activeCoord && activePoint ? (
            <g className="chart-hover">
              <line className="chart-crosshair" x1={activeCoord.x} x2={activeCoord.x} y1="4" y2={geometry.height} />
              <circle className="chart-point chart-point--hover" cx={activeCoord.x} cy={activeCoord.y} r="4" />
              <g transform={`translate(${Math.max(6, Math.min(522, activeCoord.x + 10))} 8)`}>
                <rect className="chart-tooltip__surface" width="192" height="38" rx="6" />
                <text className="chart-tooltip__price" x="8" y="14">{formatPrice(activePoint.close, currency)}</text>
                <text className="chart-tooltip__date" x="8" y="29">{formatTooltipTime(activePoint.timestamp)}</text>
              </g>
            </g>
          ) : <circle className="chart-point" cx={geometry.last.x} cy={geometry.last.y} r="4" />}
          {axisLabels(series).map((label) => <text className="chart-axis-label" key={`${label.x}-${label.value}`} x={label.x} y="142" textAnchor={label.anchor}>{label.value}</text>)}
        </svg>
      ) : (
        <div className="chart-unavailable" role="status">
          <span>{"error" in state ? state.error : "Historical chart data is unavailable."}</span>
          <small>Quote and fundamentals remain available.</small>
        </div>
      )}
    </section>
  );
}
