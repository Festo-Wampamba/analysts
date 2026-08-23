export const MARKET_FRESH_WINDOW_MS = 5 * 60 * 60 * 1000;

export type MarketFreshness = {
  label: string;
  stale: boolean;
};

const NEW_YORK = "America/New_York";

function easternParts(instant: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: NEW_YORK,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant).reduce<Record<string, string>>((parts, part) => {
    parts[part.type] = part.value;
    return parts;
  }, {});
}

function isWeekend(parts: Record<string, string>): boolean {
  return parts.weekday === "Sat" || parts.weekday === "Sun";
}

function minutesSinceMidnight(parts: Record<string, string>): number {
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function closedLabel(timestamp: number): string {
  const parts = easternParts(new Date(timestamp));
  return `Markets closed. Last close ${parts.weekday}, ${parts.month} ${parts.day}`;
}

// Keep every live-market surface on the same definition of freshness. The
// timestamp comes from the latest provider bar, not from when a page happened
// to render or when the daily screen completed.
export function marketFreshness(asOf: string, now = Date.now()): MarketFreshness {
  const timestamp = new Date(asOf).getTime();
  if (!Number.isFinite(timestamp)) {
    return { label: "Provider time unavailable", stale: true };
  }

  const currentParts = easternParts(new Date(now));
  const currentMinutes = minutesSinceMidnight(currentParts);
  const asOfParts = easternParts(new Date(timestamp));
  const marketOpen = !isWeekend(currentParts) && currentMinutes >= 9 * 60 + 30 && currentMinutes < 16 * 60;
  const outsideSessionWithLatestClose = !marketOpen && (
    isWeekend(currentParts) || minutesSinceMidnight(asOfParts) >= 16 * 60
  );
  if (outsideSessionWithLatestClose) {
    return { label: closedLabel(timestamp), stale: false };
  }

  const ageMs = Math.max(0, now - timestamp);
  if (ageMs <= MARKET_FRESH_WINDOW_MS) {
    const minutes = Math.max(1, Math.round(ageMs / 60_000));
    return { label: `Fresh · ${minutes}m ago`, stale: false };
  }

  const hours = Math.floor(ageMs / 3_600_000);
  return { label: `Stale · ${hours}h ago`, stale: true };
}
