"use client";

import { useState } from "react";

import type { ChartPoint, ChartRange, ChartSeries } from "@/lib/source/alpha-vantage";

type ChartState = ChartSeries | { error: string };

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
    line,
    fill: `${line} L${width} 132 L0 132 Z`,
    last: coords.at(-1)!,
    rising: values.at(-1)! >= values[0],
  };
}

export function PriceChart({ ticker, initial }: { ticker: string; initial: ChartSeries | null }) {
  const [range, setRange] = useState<ChartRange>(initial?.range ?? "1m");
  const [state, setState] = useState<ChartState>(
    initial ?? { error: "Historical chart data is unavailable." },
  );
  const [loading, setLoading] = useState(false);
  const series = "points" in state ? state : null;
  const geometry = series ? chartGeometry(series.points) : null;

  async function selectRange(next: ChartRange) {
    if (next === range && series) return;
    setRange(next);
    setLoading(true);
    try {
      const response = await fetch(`/api/research/${encodeURIComponent(ticker)}/chart?range=${next}`);
      const payload = await response.json();
      setState(response.ok ? payload : { error: payload.message ?? "Chart unavailable." });
    } catch {
      setState({ error: "Could not reach the chart service." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`market-chart ${geometry?.rising === false ? "market-chart--down" : ""}`}>
      <div className="market-chart__header">
        <span className="market-chart__label">Price · {ticker}</span>
        <div className="market-chart__range" aria-label="Chart range">
          <button type="button" disabled title="Intraday history requires an upgraded market-data plan">1D</button>
          {(["7d", "1m", "1y"] as const).map((option) => (
            <button
              type="button"
              className={range === option ? "is-active" : ""}
              aria-pressed={range === option}
              onClick={() => void selectRange(option)}
              key={option}
            >
              {option.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      {geometry && series ? (
        <svg
          viewBox="0 0 720 132"
          role="img"
          aria-label={`${ticker} ${range} closing-price trend`}
          preserveAspectRatio="none"
          aria-busy={loading}
        >
          <defs>
            <linearGradient id={`chartArea-${ticker}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity=".22" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path className="chart-grid" d="M0 29H720M0 66H720M0 103H720" />
          <path className="chart-fill" d={geometry.fill} style={{ fill: `url(#chartArea-${ticker})` }} />
          <path className="chart-line" d={geometry.line} />
          <circle className="chart-point" cx={geometry.last.x} cy={geometry.last.y} r="4" />
        </svg>
      ) : (
        <div className="chart-unavailable" role="status">
          <span>{"error" in state ? state.error : "Historical chart data is unavailable."}</span>
          <small>Quote and fundamentals remain available.</small>
        </div>
      )}
    </div>
  );
}
