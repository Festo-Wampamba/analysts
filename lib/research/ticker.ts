// Ticker arrives from the URL path and is interpolated into provider query
// strings and prompts, so it is constrained to the shape US listings actually
// use rather than passed through.
const TICKER_PATTERN = /^[A-Z]{1,6}(?:[.-][A-Z]{1,2})?$/;

export function normalizeTicker(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidTicker(ticker: string): boolean {
  return TICKER_PATTERN.test(ticker);
}
