/**
 * In-process TTL + LRU cache for facet results and filter configuration
 * (CLAUDE.md §7, §17).
 *
 * Deliberately in-memory only: it is a latency and API-quota optimisation, not
 * a source of truth. Multi-instance deployments simply get a per-instance hit
 * rate; correctness never depends on it. Entries are invalidated by product and
 * collection webhooks via `invalidateShop`.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export interface CacheOptions {
  maxEntries?: number;
  defaultTtlMs?: number;
}

export class TtlCache<T> {
  private readonly store = new Map<string, Entry<T>>();
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;

  constructor({ maxEntries = 500, defaultTtlMs = 60_000 }: CacheOptions = {}) {
    this.maxEntries = maxEntries;
    this.defaultTtlMs = defaultTtlMs;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }

    // Refresh recency for LRU eviction.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs = this.defaultTtlMs): void {
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const oldest = this.store.keys().next();
      if (!oldest.done) this.store.delete(oldest.value);
    }
    this.store.delete(key);
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async remember(
    key: string,
    ttlMs: number,
    produce: () => Promise<T>,
  ): Promise<{ value: T; cached: boolean }> {
    const hit = this.get(key);
    if (hit !== undefined) return { value: hit, cached: true };

    const value = await produce();
    this.set(key, value, ttlMs);
    return { value, cached: false };
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  /** Drops every entry whose key starts with `prefix`. */
  deletePrefix(prefix: string): number {
    let removed = 0;
    for (const key of [...this.store.keys()]) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

export const TTL = {
  /** Filter configuration changes only when a merchant saves. */
  config: 300_000,
  /** Product results — short, because inventory and prices move. */
  products: 60_000,
  /** Predictive search suggestions. */
  suggest: 120_000,
} as const;

export const configCache = new TtlCache<unknown>({
  maxEntries: 200,
  defaultTtlMs: TTL.config,
});
export const productsCache = new TtlCache<unknown>({
  maxEntries: 1_000,
  defaultTtlMs: TTL.products,
});
export const suggestCache = new TtlCache<unknown>({
  maxEntries: 500,
  defaultTtlMs: TTL.suggest,
});

export function cacheKey(...parts: (string | number | null | undefined)[]) {
  return parts.map((part) => part ?? "").join("|");
}

/** Called by product/collection webhooks and by admin mutations. */
export function invalidateShop(shopDomain: string): void {
  const prefix = `${shopDomain}|`;
  configCache.deletePrefix(prefix);
  productsCache.deletePrefix(prefix);
  suggestCache.deletePrefix(prefix);
}
