// The GitHub Actions workflow is the scheduler of record. Keep this display
// contract next to the screen domain so the UI never presents a fabricated
// "next run" timestamp. The workflow runs at 13:00 UTC on weekdays.
export const DAILY_SCREEN_SCHEDULE = {
  hourUtc: 13,
  minuteUtc: 0,
  timeZone: "UTC",
  label: "Weekdays at 13:00 UTC",
} as const;

export function nextScheduledScreenAt(now: Date = new Date()): Date {
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    DAILY_SCREEN_SCHEDULE.hourUtc,
    DAILY_SCREEN_SCHEDULE.minuteUtc,
  ));
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  while (next.getUTCDay() === 0 || next.getUTCDay() === 6) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}
