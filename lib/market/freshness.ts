export const MARKET_FRESH_WINDOW_MS = 5 * 60 * 60 * 1000;

export type MarketFreshness = {
  label: string;
  stale: boolean;
};

// Keep every live-market surface on the same definition of freshness. The
// timestamp comes from the latest provider bar, not from when a page happened
// to render or when the daily screen completed.
export function marketFreshness(asOf: string, now = Date.now()): MarketFreshness {
  const timestamp = new Date(asOf).getTime();
  if (!Number.isFinite(timestamp)) {
    return { label: "Provider time unavailable", stale: true };
  }

  const ageMs = Math.max(0, now - timestamp);
  if (ageMs <= MARKET_FRESH_WINDOW_MS) {
    const minutes = Math.max(1, Math.round(ageMs / 60_000));
    return { label: `Fresh · ${minutes}m ago`, stale: false };
  }

  const hours = Math.floor(ageMs / 3_600_000);
  return { label: `Stale · ${hours}h ago`, stale: true };
}
