// The screen is keyed by US trading date, not by the server's local date —
// the VPS runs in Europe/Paris and would roll over hours before the US close.
import { getCachedMarketHolidays } from "@/lib/source/finnhub-cached";

const NEW_YORK = "America/New_York";

export function toEasternDate(instant: Date): string {
  // en-CA formats as YYYY-MM-DD, which is the shape the date column wants.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: NEW_YORK,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

function easternWeekday(instant: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: NEW_YORK,
    weekday: "short",
  }).format(instant);
}

function utcDateWeekday(date: Date): number {
  return date.getUTCDay();
}

export function isBusinessDay(instant: Date): boolean {
  const day = easternWeekday(instant);
  return day !== "Sat" && day !== "Sun";
}

/** Number of weekdays since a stored trading date, using the latest weekday
 * as the current business date. Weekend gaps therefore do not look stale. */
export function tradingDaysSince(tradingDate: string, now: Date = new Date()): number {
  const current = currentTradingDate(now);
  if (tradingDate >= current) return 0;

  const cursor = new Date(`${tradingDate}T12:00:00.000Z`);
  let days = 0;
  while (toEasternDate(cursor) < current && days < 370) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (utcDateWeekday(cursor) !== 0 && utcDateWeekday(cursor) !== 6) days += 1;
  }
  return days;
}

export function isTradingDateStale(tradingDate: string, now: Date = new Date()): boolean {
  return tradingDaysSince(tradingDate, now) > 1;
}

// The trading date a run started now should be filed under: the current
// Eastern date on a weekday, otherwise the Friday the weekend follows.
export function currentTradingDate(instant: Date = new Date()): string {
  const cursor = new Date(instant);
  while (!isBusinessDay(cursor)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return toEasternDate(cursor);
}

export function tradingDateWithHolidays(
  instant: Date,
  holidayDates: ReadonlySet<string>,
): string {
  const cursor = new Date(instant);
  for (;;) {
    const date = currentTradingDate(cursor);
    if (!holidayDates.has(date)) return date;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
}

export async function resolveTradingDate(instant: Date = new Date()): Promise<string> {
  if (!process.env.FINNHUB_API_KEY) return currentTradingDate(instant);
  try {
    const holidays = await getCachedMarketHolidays("US");
    return tradingDateWithHolidays(
      instant,
      new Set(holidays.data.data.map((holiday) => holiday.atDate)),
    );
  } catch (error) {
    console.error("market holiday lookup failed; using weekday calendar:", (error as Error).message);
    return currentTradingDate(instant);
  }
}
