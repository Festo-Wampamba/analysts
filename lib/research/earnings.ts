export type DatedEarnings = { date: string };

export function sortUpcomingEarnings<T extends DatedEarnings>(events: T[]): T[] {
  return [...events].sort((a, b) => a.date.localeCompare(b.date));
}
