import { and, eq, gt } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import type { Provenance } from "@/lib/domain/provenance";
import type { Sourced } from "./finnhub";

export type ProviderCacheKey = {
  provider: string;
  kind: string;
  ticker: string;
  cacheKey?: string;
};

export type CachedProviderValue<T> = {
  data: T;
  provenance: Provenance;
  cached: true;
};

export async function readProviderCache<T>(
  key: ProviderCacheKey,
): Promise<CachedProviderValue<T> | null> {
  try {
    const [row] = await db
      .select()
      .from(schema.providerCache)
      .where(
        and(
          eq(schema.providerCache.provider, key.provider),
          eq(schema.providerCache.kind, key.kind),
          eq(schema.providerCache.ticker, key.ticker),
          eq(schema.providerCache.cacheKey, key.cacheKey ?? "default"),
          gt(schema.providerCache.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!row) return null;
    return {
      data: row.payload as T,
      provenance: {
        provider: row.provider,
        endpoint: row.kind,
        fetchedAt: row.fetchedAt.toISOString(),
        providerTimestamp: row.providerTimestamp?.toISOString(),
        status: "fresh",
        httpStatus: 200,
      },
      cached: true,
    };
  } catch (error) {
    console.error("provider cache read failed:", (error as Error).message);
    return null;
  }
}

export async function writeProviderCache<T>(
  key: ProviderCacheKey,
  data: T,
  options: { fetchedAt: Date; expiresAt: Date; providerTimestamp?: Date },
): Promise<void> {
  const values = {
    provider: key.provider,
    kind: key.kind,
    ticker: key.ticker,
    cacheKey: key.cacheKey ?? "default",
    payload: data as object,
    providerTimestamp: options.providerTimestamp,
    fetchedAt: options.fetchedAt,
    expiresAt: options.expiresAt,
  };
  try {
    await db
      .insert(schema.providerCache)
      .values(values)
      .onConflictDoUpdate({
        target: [
          schema.providerCache.provider,
          schema.providerCache.kind,
          schema.providerCache.ticker,
          schema.providerCache.cacheKey,
        ],
        set: values,
      });
  } catch (error) {
    console.error("provider cache write failed:", (error as Error).message);
  }
}

export async function withProviderCache<T>(
  key: ProviderCacheKey,
  ttlMs: number,
  loader: () => Promise<Sourced<T>>,
): Promise<Sourced<T> & { cached: boolean }> {
  const cached = await readProviderCache<T>(key);
  if (cached) return cached;
  const loaded = await loader();
  const fetchedAt = new Date(loaded.provenance.fetchedAt);
  await writeProviderCache(key, loaded.data, {
    fetchedAt,
    expiresAt: new Date(fetchedAt.getTime() + ttlMs),
    providerTimestamp: loaded.provenance.providerTimestamp
      ? new Date(loaded.provenance.providerTimestamp)
      : undefined,
  });
  return { ...loaded, cached: false };
}
