import { describe, expect, it } from "vitest";

import { LspCache } from "../cache.js";

describe("LspCache", () => {
  it("stores and retrieves values", () => {
    const cache = new LspCache<string>({ maxSize: 10, ttlMs: 1000, enableStats: true });
    cache.set("a", "value");
    expect(cache.get("a")).toBe("value");
  });

  it("tracks hits and misses", () => {
    const cache = new LspCache<string>({ maxSize: 10, ttlMs: 1000, enableStats: true });
    cache.get("missing");
    cache.set("a", "value");
    cache.get("a");
    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });
});
