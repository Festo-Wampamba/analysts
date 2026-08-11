type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let operations = 0;

export function requestIdentifier(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export function consumeRateLimit(
  scope: string,
  identifier: string,
  options: { limit?: number; windowMs?: number; now?: number } = {},
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const limit = options.limit ?? 12;
  const windowMs = options.windowMs ?? 60_000;
  const now = options.now ?? Date.now();
  const key = `${scope}:${identifier}`;
  const current = buckets.get(key);
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : current;
  bucket.count += 1;
  buckets.set(key, bucket);

  operations += 1;
  if (operations % 100 === 0) {
    for (const [candidate, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(candidate);
    }
  }

  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}
