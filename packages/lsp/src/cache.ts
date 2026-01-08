import { LRUCache } from "lru-cache";

export interface LspCacheConfig {
  maxSize: number;
  ttlMs: number;
  enableStats: boolean;
}

export interface LspCacheStats {
  hits: number;
  misses: number;
  hitRate: string;
}

export class LspCache<T> {
  private cache: LRUCache<string, { value: T; timestamp: number }>;
  private hits = 0;
  private misses = 0;
  private config: LspCacheConfig;

  constructor(config: Partial<LspCacheConfig> = {}) {
    this.config = {
      maxSize: config.maxSize ?? 500,
      ttlMs: config.ttlMs ?? 5 * 60 * 1000,
      enableStats: config.enableStats ?? true,
    };

    this.cache = new LRUCache({
      max: this.config.maxSize,
      ttl: this.config.ttlMs,
    });
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      if (this.config.enableStats) this.misses += 1;
      return undefined;
    }

    if (this.config.enableStats) this.hits += 1;
    return entry.value;
  }

  set(key: string, value: T): void {
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  invalidateByUri(uri: string): number {
    let removed = 0;
    for (const key of this.cache.keys()) {
      if (key.includes(uri)) {
        this.cache.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  getStats(): LspCacheStats {
    const total = this.hits + this.misses;
    const hitRate = total === 0 ? "0%" : `${((this.hits / total) * 100).toFixed(1)}%`;

    return {
      hits: this.hits,
      misses: this.misses,
      hitRate,
    };
  }
}
