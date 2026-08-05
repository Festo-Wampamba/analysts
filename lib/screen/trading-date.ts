// The screen is keyed by US trading date, not by the server's local date —
// the VPS runs in Europe/Paris and would roll over hours before the US close.
// Holidays are not modelled: a run on a US market holiday produces a normal
// (stale-priced) result rather than being skipped. Documented as a limitation.

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

export function isBusinessDay(instant: Date): boolean {
  const day = easternWeekday(instant);
  return day !== "Sat" && day !== "Sun";
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
