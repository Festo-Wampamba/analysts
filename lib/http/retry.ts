const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retries a fetch on network failure or a 429/5xx response, with exponential
// backoff. The signal/deadline in `init` (e.g. AbortSignal.timeout(...)) is
// shared across every attempt, so total wall-clock time stays bounded by the
// caller's existing timeout rather than growing with the retry count.
export async function fetchWithRetry(
  input: string | URL,
  init: RequestInit,
  opts: RetryOptions = {},
): Promise<Response> {
  const retries = opts.retries ?? 2;
  const baseDelayMs = opts.baseDelayMs ?? 300;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(input, init);
      if (RETRYABLE_STATUS.has(res.status) && attempt < retries) {
        await sleep(baseDelayMs * 2 ** attempt);
        continue;
      }
      return res;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      lastError = err;
      if (attempt < retries) {
        await sleep(baseDelayMs * 2 ** attempt);
        continue;
      }
    }
  }
  throw lastError;
}
