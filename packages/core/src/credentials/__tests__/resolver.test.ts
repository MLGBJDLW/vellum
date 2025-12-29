/**
 * Unit tests for CredentialResolver
 *
 * Tests priority-based resolution, caching, and store chain behavior.
 *
 * @see packages/core/src/credentials/resolver.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Err, Ok } from "../../types/result.js";
import { CredentialResolver, type CredentialResolverEvent, STORE_PRIORITIES } from "../resolver.js";
import type { Credential, CredentialRef, CredentialSource, CredentialStore } from "../types.js";
import { createStoreError } from "../types.js";

// =============================================================================
// Mock Store Factory
// =============================================================================

/**
 * Create a mock credential store for testing
 */
function createMockStore(
  name: CredentialSource,
  options: {
    priority?: number;
    readOnly?: boolean;
    available?: boolean;
    credentials?: Map<string, Credential>;
  } = {}
): CredentialStore {
  const {
    priority = STORE_PRIORITIES[name],
    readOnly = name === "env",
    available = true,
    credentials = new Map(),
  } = options;

  return {
    name,
    priority,
    readOnly,
    isAvailable: vi.fn().mockResolvedValue(Ok(available)),
    get: vi.fn().mockImplementation(async (provider: string, key?: string) => {
      const credKey = key ? `${provider}:${key}` : provider;
      return Ok(credentials.get(credKey) ?? null);
    }),
    set: vi.fn().mockImplementation(async (credential: Credential) => {
      if (readOnly) {
        return Err(createStoreError("READ_ONLY", "Store is read-only", name));
      }
      const credKey = credential.provider;
      credentials.set(credKey, credential);
      return Ok(undefined);
    }),
    delete: vi.fn().mockImplementation(async (provider: string, key?: string) => {
      if (readOnly) {
        return Err(createStoreError("READ_ONLY", "Store is read-only", name));
      }
      const credKey = key ? `${provider}:${key}` : provider;
      const existed = credentials.has(credKey);
      credentials.delete(credKey);
      return Ok(existed);
    }),
    list: vi.fn().mockImplementation(async (provider?: string) => {
      const refs: CredentialRef[] = [];
      for (const cred of credentials.values()) {
        if (!provider || cred.provider === provider) {
          const { value: _value, ...rest } = cred;
          refs.push({ ...rest, maskedHint: "***" });
        }
      }
      return Ok(refs);
    }),
    exists: vi.fn().mockImplementation(async (provider: string, key?: string) => {
      const credKey = key ? `${provider}:${key}` : provider;
      return Ok(credentials.has(credKey));
    }),
  };
}

/**
 * Create a test credential
 */
function createTestCredential(
  provider: string,
  source: CredentialSource,
  value = "test-value"
): Credential {
  return {
    id: `${source}:${provider}`,
    provider,
    type: "api_key",
    value,
    source,
    metadata: {},
    createdAt: new Date(),
  };
}

// =============================================================================
// CredentialResolver Tests
// =============================================================================

describe("CredentialResolver", () => {
  // ===========================================================================
  // Store Priority Tests
  // ===========================================================================

  describe("Store Priority", () => {
    it("should sort stores by priority (highest first)", () => {
      const envStore = createMockStore("env", { priority: 90 });
      const keychainStore = createMockStore("keychain", { priority: 80 });
      const fileStore = createMockStore("file", { priority: 50 });

      // Create resolver with stores in wrong order
      const resolver = new CredentialResolver([fileStore, envStore, keychainStore]);

      const stores = resolver.getStores();
      expect(stores[0]?.name).toBe("env");
      expect(stores[1]?.name).toBe("keychain");
      expect(stores[2]?.name).toBe("file");
    });

    it("should use default priorities from STORE_PRIORITIES", () => {
      expect(STORE_PRIORITIES.runtime).toBe(100);
      expect(STORE_PRIORITIES.env).toBe(90);
      expect(STORE_PRIORITIES.keychain).toBe(80);
      expect(STORE_PRIORITIES.file).toBe(50);
      expect(STORE_PRIORITIES.config).toBe(10);
    });
  });

  // ===========================================================================
  // Resolution Tests
  // ===========================================================================

  describe("resolve()", () => {
    it("should resolve from highest priority store first", async () => {
      const envCred = createTestCredential("anthropic", "env", "env-key");
      const keychainCred = createTestCredential("anthropic", "keychain", "keychain-key");

      const envStore = createMockStore("env", {
        credentials: new Map([["anthropic", envCred]]),
      });
      const keychainStore = createMockStore("keychain", {
        credentials: new Map([["anthropic", keychainCred]]),
      });

      const resolver = new CredentialResolver([keychainStore, envStore]);
      const result = await resolver.resolve("anthropic");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value?.source).toBe("env");
      expect(result.ok && result.value?.value).toBe("env-key");
    });

    it("should fall back to lower priority store if not found", async () => {
      const keychainCred = createTestCredential("anthropic", "keychain", "keychain-key");

      const envStore = createMockStore("env");
      const keychainStore = createMockStore("keychain", {
        credentials: new Map([["anthropic", keychainCred]]),
      });

      const resolver = new CredentialResolver([keychainStore, envStore]);
      const result = await resolver.resolve("anthropic");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value?.source).toBe("keychain");
    });

    it("should return null if not found in any store", async () => {
      const envStore = createMockStore("env");
      const keychainStore = createMockStore("keychain");

      const resolver = new CredentialResolver([envStore, keychainStore]);
      const result = await resolver.resolve("anthropic");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toBeNull();
    });

    it("should skip unavailable stores", async () => {
      const keychainCred = createTestCredential("anthropic", "keychain", "keychain-key");

      const envStore = createMockStore("env", { available: false });
      const keychainStore = createMockStore("keychain", {
        credentials: new Map([["anthropic", keychainCred]]),
      });

      const resolver = new CredentialResolver([envStore, keychainStore]);
      const result = await resolver.resolve("anthropic");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value?.source).toBe("keychain");
      expect(envStore.get).not.toHaveBeenCalled();
    });

    it("should handle store errors gracefully and continue", async () => {
      const fileCred = createTestCredential("anthropic", "file", "file-key");

      const envStore = createMockStore("env");
      (envStore.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err(createStoreError("IO_ERROR", "Network error", "env"))
      );

      const fileStore = createMockStore("file", {
        credentials: new Map([["anthropic", fileCred]]),
      });

      const resolver = new CredentialResolver([envStore, fileStore]);
      const result = await resolver.resolve("anthropic");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value?.source).toBe("file");
    });

    it("should support key parameter for provider-specific lookup", async () => {
      const defaultCred = createTestCredential("openai", "env", "default-key");
      const projectCred = createTestCredential("openai", "env", "project-key");

      const envStore = createMockStore("env");
      (envStore.get as ReturnType<typeof vi.fn>).mockImplementation(
        async (_provider: string, key?: string) => {
          if (key === "project-a") return Ok(projectCred);
          if (!key) return Ok(defaultCred);
          return Ok(null);
        }
      );

      const resolver = new CredentialResolver([envStore]);

      const defaultResult = await resolver.resolve("openai");
      expect(defaultResult.ok && defaultResult.value?.value).toBe("default-key");

      const projectResult = await resolver.resolve("openai", "project-a");
      expect(projectResult.ok && projectResult.value?.value).toBe("project-key");
    });
  });

  // ===========================================================================
  // resolveRequired() Tests
  // ===========================================================================

  describe("resolveRequired()", () => {
    it("should return credential when found", async () => {
      const cred = createTestCredential("anthropic", "env");
      const envStore = createMockStore("env", {
        credentials: new Map([["anthropic", cred]]),
      });

      const resolver = new CredentialResolver([envStore]);
      const result = await resolver.resolveRequired("anthropic");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value.provider).toBe("anthropic");
    });

    it("should return NOT_FOUND error when not found", async () => {
      const envStore = createMockStore("env");
      const resolver = new CredentialResolver([envStore]);

      const result = await resolver.resolveRequired("anthropic");

      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.code).toBe("NOT_FOUND");
    });
  });

  // ===========================================================================
  // Cache Tests
  // ===========================================================================

  describe("Caching", () => {
    it("should cache resolved credentials", async () => {
      const cred = createTestCredential("anthropic", "env");
      const envStore = createMockStore("env", {
        credentials: new Map([["anthropic", cred]]),
      });

      const resolver = new CredentialResolver([envStore]);

      // First call - hits store
      await resolver.resolve("anthropic");
      expect(envStore.get).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      await resolver.resolve("anthropic");
      expect(envStore.get).toHaveBeenCalledTimes(1);
    });

    it("should cache negative results by default", async () => {
      const envStore = createMockStore("env");
      const resolver = new CredentialResolver([envStore]);

      await resolver.resolve("anthropic");
      expect(envStore.get).toHaveBeenCalledTimes(1);

      await resolver.resolve("anthropic");
      expect(envStore.get).toHaveBeenCalledTimes(1);
    });

    it("should not cache negatives when disabled", async () => {
      const envStore = createMockStore("env");
      const resolver = new CredentialResolver([envStore], { cacheNegatives: false });

      await resolver.resolve("anthropic");
      expect(envStore.get).toHaveBeenCalledTimes(1);

      await resolver.resolve("anthropic");
      expect(envStore.get).toHaveBeenCalledTimes(2);
    });

    it("should expire cache entries after TTL", async () => {
      vi.useFakeTimers();

      const cred = createTestCredential("anthropic", "env");
      const envStore = createMockStore("env", {
        credentials: new Map([["anthropic", cred]]),
      });

      const resolver = new CredentialResolver([envStore], { cacheTtlMs: 1000 });

      await resolver.resolve("anthropic");
      expect(envStore.get).toHaveBeenCalledTimes(1);

      // Advance time past TTL
      vi.advanceTimersByTime(1500);

      await resolver.resolve("anthropic");
      expect(envStore.get).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it("should invalidate cache for specific provider", async () => {
      const cred = createTestCredential("anthropic", "env");
      const envStore = createMockStore("env", {
        credentials: new Map([["anthropic", cred]]),
      });

      const resolver = new CredentialResolver([envStore]);

      await resolver.resolve("anthropic");
      expect(envStore.get).toHaveBeenCalledTimes(1);

      resolver.invalidateCache("anthropic");

      await resolver.resolve("anthropic");
      expect(envStore.get).toHaveBeenCalledTimes(2);
    });

    it("should invalidate entire cache when no provider specified", async () => {
      const anthropicCred = createTestCredential("anthropic", "env");
      const openaiCred = createTestCredential("openai", "env");
      const envStore = createMockStore("env", {
        credentials: new Map([
          ["anthropic", anthropicCred],
          ["openai", openaiCred],
        ]),
      });

      const resolver = new CredentialResolver([envStore]);

      await resolver.resolve("anthropic");
      await resolver.resolve("openai");
      expect(envStore.get).toHaveBeenCalledTimes(2);

      resolver.invalidateCache();

      await resolver.resolve("anthropic");
      await resolver.resolve("openai");
      expect(envStore.get).toHaveBeenCalledTimes(4);
    });

    it("should report cache stats", () => {
      const resolver = new CredentialResolver([], { cacheTtlMs: 10000 });
      const stats = resolver.getCacheStats();

      expect(stats.size).toBe(0);
      expect(stats.ttlMs).toBe(10000);
    });
  });

  // ===========================================================================
  // List Tests
  // ===========================================================================

  describe("list()", () => {
    it("should aggregate credentials from all stores", async () => {
      const envCred = createTestCredential("anthropic", "env");
      const keychainCred = createTestCredential("openai", "keychain");

      const envStore = createMockStore("env", {
        credentials: new Map([["anthropic", envCred]]),
      });
      const keychainStore = createMockStore("keychain", {
        credentials: new Map([["openai", keychainCred]]),
      });

      const resolver = new CredentialResolver([envStore, keychainStore]);
      const result = await resolver.list();

      expect(result.ok).toBe(true);
      expect(result.ok && result.value.length).toBe(2);
    });

    it("should deduplicate by provider (keep highest priority)", async () => {
      const envCred = createTestCredential("anthropic", "env", "env-val");
      const keychainCred = createTestCredential("anthropic", "keychain", "keychain-val");

      const envStore = createMockStore("env", {
        credentials: new Map([["anthropic", envCred]]),
      });
      const keychainStore = createMockStore("keychain", {
        credentials: new Map([["anthropic", keychainCred]]),
      });

      const resolver = new CredentialResolver([envStore, keychainStore]);
      const result = await resolver.list();

      expect(result.ok).toBe(true);
      expect(result.ok && result.value.length).toBe(1);
      expect(result.ok && result.value[0]?.source).toBe("env");
    });

    it("should filter by provider when specified", async () => {
      const anthropicCred = createTestCredential("anthropic", "env");
      const openaiCred = createTestCredential("openai", "env");

      const envStore = createMockStore("env", {
        credentials: new Map([
          ["anthropic", anthropicCred],
          ["openai", openaiCred],
        ]),
      });

      const resolver = new CredentialResolver([envStore]);
      const result = await resolver.list("anthropic");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value.length).toBe(1);
      expect(result.ok && result.value[0]?.provider).toBe("anthropic");
    });
  });

  // ===========================================================================
  // Store Access Tests
  // ===========================================================================

  describe("Store Access", () => {
    it("should get store by name", () => {
      const envStore = createMockStore("env");
      const keychainStore = createMockStore("keychain");

      const resolver = new CredentialResolver([envStore, keychainStore]);

      expect(resolver.getStore("env")).toBe(envStore);
      expect(resolver.getStore("keychain")).toBe(keychainStore);
      expect(resolver.getStore("file")).toBeUndefined();
    });

    it("should get writable stores only", () => {
      const envStore = createMockStore("env", { readOnly: true });
      const keychainStore = createMockStore("keychain", { readOnly: false });
      const fileStore = createMockStore("file", { readOnly: false });

      const resolver = new CredentialResolver([envStore, keychainStore, fileStore]);
      const writable = resolver.getWritableStores();

      expect(writable.length).toBe(2);
      expect(writable.find((s) => s.name === "env")).toBeUndefined();
    });
  });

  // ===========================================================================
  // Event Tests
  // ===========================================================================

  describe("Events", () => {
    it("should emit cache:hit on cache hit", async () => {
      const cred = createTestCredential("anthropic", "env");
      const envStore = createMockStore("env", {
        credentials: new Map([["anthropic", cred]]),
      });

      const resolver = new CredentialResolver([envStore]);
      const events: string[] = [];
      resolver.on((e) => events.push(e.type));

      await resolver.resolve("anthropic");
      await resolver.resolve("anthropic");

      expect(events).toContain("cache:miss");
      expect(events).toContain("cache:hit");
    });

    it("should emit store:query and store:found events", async () => {
      const cred = createTestCredential("anthropic", "env");
      const envStore = createMockStore("env", {
        credentials: new Map([["anthropic", cred]]),
      });

      const resolver = new CredentialResolver([envStore]);
      const events: string[] = [];
      resolver.on((e) => events.push(e.type));

      await resolver.resolve("anthropic");

      expect(events).toContain("store:query");
      expect(events).toContain("store:found");
    });

    it("should allow unsubscribing from events", async () => {
      const envStore = createMockStore("env");
      const resolver = new CredentialResolver([envStore]);

      const events: string[] = [];
      const unsubscribe = resolver.on((e) => events.push(e.type));

      await resolver.resolve("anthropic");
      expect(events.length).toBeGreaterThan(0);

      const countBefore = events.length;
      unsubscribe();

      await resolver.resolve("openai");
      expect(events.length).toBe(countBefore);
    });
  });

  // ===========================================================================
  // Integration Tests: Priority Chain
  // ===========================================================================

  describe("Integration: Priority Chain", () => {
    it("should resolve in priority order: env > keychain > file > config", async () => {
      const envCred = createTestCredential("anthropic", "env", "env-key");
      const keychainCred = createTestCredential("anthropic", "keychain", "keychain-key");
      const fileCred = createTestCredential("anthropic", "file", "file-key");
      const configCred = createTestCredential("anthropic", "config", "config-key");

      const envStore = createMockStore("env", {
        credentials: new Map([["anthropic", envCred]]),
      });
      const keychainStore = createMockStore("keychain", {
        credentials: new Map([["anthropic", keychainCred]]),
      });
      const fileStore = createMockStore("file", {
        credentials: new Map([["anthropic", fileCred]]),
      });
      const configStore = createMockStore("config", {
        credentials: new Map([["anthropic", configCred]]),
      });

      // Pass stores in random order - resolver should sort by priority
      const resolver = new CredentialResolver([configStore, fileStore, envStore, keychainStore]);

      const result = await resolver.resolve("anthropic");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value?.source).toBe("env");
      expect(result.ok && result.value?.value).toBe("env-key");
    });

    it("should use keychain when env is unavailable", async () => {
      const keychainCred = createTestCredential("anthropic", "keychain", "keychain-key");
      const fileCred = createTestCredential("anthropic", "file", "file-key");

      const envStore = createMockStore("env", { available: false });
      const keychainStore = createMockStore("keychain", {
        credentials: new Map([["anthropic", keychainCred]]),
      });
      const fileStore = createMockStore("file", {
        credentials: new Map([["anthropic", fileCred]]),
      });

      const resolver = new CredentialResolver([envStore, keychainStore, fileStore]);
      const result = await resolver.resolve("anthropic");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value?.source).toBe("keychain");
    });

    it("should use file when env and keychain are unavailable", async () => {
      const fileCred = createTestCredential("anthropic", "file", "file-key");
      const configCred = createTestCredential("anthropic", "config", "config-key");

      const envStore = createMockStore("env", { available: false });
      const keychainStore = createMockStore("keychain", { available: false });
      const fileStore = createMockStore("file", {
        credentials: new Map([["anthropic", fileCred]]),
      });
      const configStore = createMockStore("config", {
        credentials: new Map([["anthropic", configCred]]),
      });

      const resolver = new CredentialResolver([envStore, keychainStore, fileStore, configStore]);
      const result = await resolver.resolve("anthropic");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value?.source).toBe("file");
    });

    it("should fall to config as last resort", async () => {
      const configCred = createTestCredential("anthropic", "config", "config-key");

      const envStore = createMockStore("env");
      const keychainStore = createMockStore("keychain");
      const fileStore = createMockStore("file");
      const configStore = createMockStore("config", {
        credentials: new Map([["anthropic", configCred]]),
      });

      const resolver = new CredentialResolver([envStore, keychainStore, fileStore, configStore]);
      const result = await resolver.resolve("anthropic");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value?.source).toBe("config");
    });

    it("should query stores in priority order (track via events)", async () => {
      const envStore = createMockStore("env");
      const keychainStore = createMockStore("keychain");
      const fileCred = createTestCredential("anthropic", "file", "file-key");
      const fileStore = createMockStore("file", {
        credentials: new Map([["anthropic", fileCred]]),
      });

      const resolver = new CredentialResolver([fileStore, envStore, keychainStore]);

      const queryOrder: CredentialSource[] = [];
      resolver.on((e) => {
        if (e.type === "store:query") {
          queryOrder.push(e.store);
        }
      });

      await resolver.resolve("anthropic");

      // Should query env first, then keychain, then file (in priority order)
      expect(queryOrder).toEqual(["env", "keychain", "file"]);
    });

    it("should handle custom priority values", async () => {
      const envCred = createTestCredential("anthropic", "env", "env-key");
      const keychainCred = createTestCredential("anthropic", "keychain", "keychain-key");

      // Override keychain priority to be higher than env
      const envStore = createMockStore("env", {
        priority: 50,
        credentials: new Map([["anthropic", envCred]]),
      });
      const keychainStore = createMockStore("keychain", {
        priority: 100,
        credentials: new Map([["anthropic", keychainCred]]),
      });

      const resolver = new CredentialResolver([envStore, keychainStore]);
      const result = await resolver.resolve("anthropic");

      // Keychain should win due to custom higher priority
      expect(result.ok).toBe(true);
      expect(result.ok && result.value?.source).toBe("keychain");
    });
  });

  // ===========================================================================
  // Integration Tests: Cache Behavior
  // ===========================================================================

  describe("Integration: Cache Behavior", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should cache positive results and reuse them", async () => {
      const envCred = createTestCredential("anthropic", "env");
      const envStore = createMockStore("env", {
        credentials: new Map([["anthropic", envCred]]),
      });

      const resolver = new CredentialResolver([envStore], { cacheTtlMs: 5000 });

      // First call - cache miss
      await resolver.resolve("anthropic");
      expect(envStore.get).toHaveBeenCalledTimes(1);

      // Advance time but within TTL
      vi.advanceTimersByTime(3000);

      // Second call - should use cache
      const result = await resolver.resolve("anthropic");
      expect(envStore.get).toHaveBeenCalledTimes(1); // No additional calls
      expect(result.ok && result.value?.source).toBe("env");
    });

    it("should expire cache after TTL and re-query stores", async () => {
      const envCred = createTestCredential("anthropic", "env", "initial-value");
      const credentials = new Map([["anthropic", envCred]]);
      const envStore = createMockStore("env", { credentials });

      const resolver = new CredentialResolver([envStore], { cacheTtlMs: 2000 });

      // First call
      await resolver.resolve("anthropic");
      expect(envStore.get).toHaveBeenCalledTimes(1);

      // Update credential in store (simulating external change)
      const updatedCred = createTestCredential("anthropic", "env", "updated-value");
      credentials.set("anthropic", updatedCred);

      // Advance time past TTL
      vi.advanceTimersByTime(2500);

      // Third call - should re-query and get updated value
      const result = await resolver.resolve("anthropic");
      expect(envStore.get).toHaveBeenCalledTimes(2);
      expect(result.ok && result.value?.value).toBe("updated-value");
    });

    it("should cache negative results and not re-query within TTL", async () => {
      const envStore = createMockStore("env");
      const keychainStore = createMockStore("keychain");

      const resolver = new CredentialResolver([envStore, keychainStore], {
        cacheTtlMs: 5000,
        cacheNegatives: true,
      });

      // First call - not found
      await resolver.resolve("missing-provider");
      expect(envStore.get).toHaveBeenCalledTimes(1);
      expect(keychainStore.get).toHaveBeenCalledTimes(1);

      // Second call within TTL - should use cached negative result
      await resolver.resolve("missing-provider");
      expect(envStore.get).toHaveBeenCalledTimes(1);
      expect(keychainStore.get).toHaveBeenCalledTimes(1);
    });

    it("should properly expire negative cache entries", async () => {
      const envStore = createMockStore("env");

      const resolver = new CredentialResolver([envStore], {
        cacheTtlMs: 1000,
        cacheNegatives: true,
      });

      // First call - not found
      await resolver.resolve("missing");
      expect(envStore.get).toHaveBeenCalledTimes(1);

      // Advance past TTL
      vi.advanceTimersByTime(1500);

      // Should re-query
      await resolver.resolve("missing");
      expect(envStore.get).toHaveBeenCalledTimes(2);
    });

    it("should cache different providers independently", async () => {
      const anthropicCred = createTestCredential("anthropic", "env", "anthropic-key");
      const openaiCred = createTestCredential("openai", "env", "openai-key");
      const envStore = createMockStore("env", {
        credentials: new Map([
          ["anthropic", anthropicCred],
          ["openai", openaiCred],
        ]),
      });

      const resolver = new CredentialResolver([envStore], { cacheTtlMs: 5000 });

      // Resolve both
      await resolver.resolve("anthropic");
      await resolver.resolve("openai");
      expect(envStore.get).toHaveBeenCalledTimes(2);

      // Both should be cached
      await resolver.resolve("anthropic");
      await resolver.resolve("openai");
      expect(envStore.get).toHaveBeenCalledTimes(2);

      // Invalidate only anthropic
      resolver.invalidateCache("anthropic");

      // Anthropic should re-query, openai should still be cached
      await resolver.resolve("anthropic");
      await resolver.resolve("openai");
      expect(envStore.get).toHaveBeenCalledTimes(3);
    });

    it("should track cache stats correctly", async () => {
      const envCred = createTestCredential("anthropic", "env");
      const envStore = createMockStore("env", {
        credentials: new Map([["anthropic", envCred]]),
      });

      const resolver = new CredentialResolver([envStore], { cacheTtlMs: 10000 });

      expect(resolver.getCacheStats().size).toBe(0);

      await resolver.resolve("anthropic");
      expect(resolver.getCacheStats().size).toBe(1);

      await resolver.resolve("openai"); // Not found - cached as negative
      expect(resolver.getCacheStats().size).toBe(2);

      resolver.invalidateCache();
      expect(resolver.getCacheStats().size).toBe(0);
    });
  });

  // ===========================================================================
  // Integration Tests: Cache Invalidation on Mutations
  // ===========================================================================

  describe("Integration: Cache Invalidation on Mutations", () => {
    it("should invalidate specific provider on manual invalidation", async () => {
      const anthropicCred = createTestCredential("anthropic", "env");
      const openaiCred = createTestCredential("openai", "env");
      const envStore = createMockStore("env", {
        credentials: new Map([
          ["anthropic", anthropicCred],
          ["openai", openaiCred],
        ]),
      });

      const resolver = new CredentialResolver([envStore]);

      // Cache both providers
      await resolver.resolve("anthropic");
      await resolver.resolve("openai");
      expect(envStore.get).toHaveBeenCalledTimes(2);

      // Invalidate only anthropic
      resolver.invalidateCache("anthropic");

      // anthropic should re-query, openai should use cache
      await resolver.resolve("anthropic");
      await resolver.resolve("openai");
      expect(envStore.get).toHaveBeenCalledTimes(3); // Only 1 new call for anthropic
    });

    it("should invalidate all cache on full invalidation", async () => {
      const anthropicCred = createTestCredential("anthropic", "env");
      const openaiCred = createTestCredential("openai", "env");
      const envStore = createMockStore("env", {
        credentials: new Map([
          ["anthropic", anthropicCred],
          ["openai", openaiCred],
        ]),
      });

      const resolver = new CredentialResolver([envStore]);

      // Cache both providers
      await resolver.resolve("anthropic");
      await resolver.resolve("openai");

      // Invalidate all
      resolver.invalidateCache();

      // Both should re-query
      await resolver.resolve("anthropic");
      await resolver.resolve("openai");
      expect(envStore.get).toHaveBeenCalledTimes(4);
    });

    it("should invalidate specific key within provider", async () => {
      const defaultCred = createTestCredential("openai", "env", "default-key");
      const projectCred = { ...createTestCredential("openai", "env", "project-key") };

      const envStore = createMockStore("env");
      (envStore.get as ReturnType<typeof vi.fn>).mockImplementation(
        async (provider: string, key?: string) => {
          if (provider === "openai" && key === "project-a") return Ok(projectCred);
          if (provider === "openai" && !key) return Ok(defaultCred);
          return Ok(null);
        }
      );

      const resolver = new CredentialResolver([envStore]);

      // Cache both
      await resolver.resolve("openai");
      await resolver.resolve("openai", "project-a");
      expect(envStore.get).toHaveBeenCalledTimes(2);

      // Invalidate only the project-a key
      resolver.invalidateCache("openai", "project-a");

      // Default should use cache, project-a should re-query
      await resolver.resolve("openai");
      await resolver.resolve("openai", "project-a");
      expect(envStore.get).toHaveBeenCalledTimes(3);
    });

    it("should emit cache:invalidate events", async () => {
      const resolver = new CredentialResolver([]);

      const events: CredentialResolverEvent[] = [];
      resolver.on((e) => events.push(e));

      resolver.invalidateCache("anthropic");
      resolver.invalidateCache("openai", "project-a");
      resolver.invalidateCache();

      const invalidateEvents = events.filter((e) => e.type === "cache:invalidate");
      expect(invalidateEvents.length).toBe(3);
      expect(invalidateEvents[0]).toEqual({
        type: "cache:invalidate",
        provider: "anthropic",
        key: undefined,
      });
      expect(invalidateEvents[1]).toEqual({
        type: "cache:invalidate",
        provider: "openai",
        key: "project-a",
      });
      expect(invalidateEvents[2]).toEqual({
        type: "cache:invalidate",
        provider: undefined,
        key: undefined,
      });
    });
  });

  // ===========================================================================
  // Integration Tests: Fallback Scenarios
  // ===========================================================================

  describe("Integration: Fallback Scenarios", () => {
    it("should fallback through chain until credential found", async () => {
      const fileCred = createTestCredential("anthropic", "file", "file-key");

      const envStore = createMockStore("env"); // No credential
      const keychainStore = createMockStore("keychain"); // No credential
      const fileStore = createMockStore("file", {
        credentials: new Map([["anthropic", fileCred]]),
      });

      const resolver = new CredentialResolver([envStore, keychainStore, fileStore]);
      const result = await resolver.resolve("anthropic");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value?.source).toBe("file");

      // All stores should have been queried in order
      expect(envStore.get).toHaveBeenCalled();
      expect(keychainStore.get).toHaveBeenCalled();
      expect(fileStore.get).toHaveBeenCalled();
    });

    it("should fallback past erroring stores", async () => {
      const keychainCred = createTestCredential("anthropic", "keychain", "keychain-key");

      const envStore = createMockStore("env");
      (envStore.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err(createStoreError("IO_ERROR", "Env read failed", "env"))
      );

      const keychainStore = createMockStore("keychain", {
        credentials: new Map([["anthropic", keychainCred]]),
      });

      const resolver = new CredentialResolver([envStore, keychainStore]);
      const result = await resolver.resolve("anthropic");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value?.source).toBe("keychain");
    });

    it("should fallback past unavailable stores", async () => {
      const configCred = createTestCredential("anthropic", "config", "config-key");

      const envStore = createMockStore("env", { available: false });
      const keychainStore = createMockStore("keychain", { available: false });
      const fileStore = createMockStore("file", { available: false });
      const configStore = createMockStore("config", {
        credentials: new Map([["anthropic", configCred]]),
      });

      const resolver = new CredentialResolver([envStore, keychainStore, fileStore, configStore]);
      const result = await resolver.resolve("anthropic");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value?.source).toBe("config");

      // Unavailable stores should not have get() called
      expect(envStore.get).not.toHaveBeenCalled();
      expect(keychainStore.get).not.toHaveBeenCalled();
      expect(fileStore.get).not.toHaveBeenCalled();
    });

    it("should return null when all stores exhausted without credential", async () => {
      const envStore = createMockStore("env");
      const keychainStore = createMockStore("keychain");
      const fileStore = createMockStore("file");

      const resolver = new CredentialResolver([envStore, keychainStore, fileStore]);
      const result = await resolver.resolve("nonexistent");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toBeNull();
    });

    it("should handle mixed availability and errors gracefully", async () => {
      const configCred = createTestCredential("anthropic", "config", "config-key");

      const envStore = createMockStore("env", { available: false });
      const keychainStore = createMockStore("keychain");
      (keychainStore.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err(createStoreError("IO_ERROR", "Keychain locked", "keychain"))
      );
      const fileStore = createMockStore("file"); // No credential
      const configStore = createMockStore("config", {
        credentials: new Map([["anthropic", configCred]]),
      });

      const resolver = new CredentialResolver([envStore, keychainStore, fileStore, configStore]);

      const events: CredentialResolverEvent[] = [];
      resolver.on((e) => events.push(e));

      const result = await resolver.resolve("anthropic");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value?.source).toBe("config");

      // Should have store:error event for keychain
      const errorEvents = events.filter((e) => e.type === "store:error");
      expect(errorEvents.length).toBe(1);
      expect(errorEvents[0]?.type === "store:error" && errorEvents[0]?.store).toBe("keychain");
    });
  });

  // ===========================================================================
  // Integration Tests: Multiple Stores Same Credential
  // ===========================================================================

  describe("Integration: Multiple Stores Same Credential", () => {
    it("should always return highest priority store's credential", async () => {
      const envCred = createTestCredential("anthropic", "env", "env-value");
      const keychainCred = createTestCredential("anthropic", "keychain", "keychain-value");
      const fileCred = createTestCredential("anthropic", "file", "file-value");

      const envStore = createMockStore("env", {
        credentials: new Map([["anthropic", envCred]]),
      });
      const keychainStore = createMockStore("keychain", {
        credentials: new Map([["anthropic", keychainCred]]),
      });
      const fileStore = createMockStore("file", {
        credentials: new Map([["anthropic", fileCred]]),
      });

      const resolver = new CredentialResolver([fileStore, keychainStore, envStore]);
      const result = await resolver.resolve("anthropic");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value?.value).toBe("env-value");
      expect(result.ok && result.value?.source).toBe("env");

      // Should not query lower priority stores after finding credential
      expect(envStore.get).toHaveBeenCalled();
      expect(keychainStore.get).not.toHaveBeenCalled();
      expect(fileStore.get).not.toHaveBeenCalled();
    });

    it("should use next highest priority when top store doesn't have it", async () => {
      const keychainCred = createTestCredential("anthropic", "keychain", "keychain-value");
      const fileCred = createTestCredential("anthropic", "file", "file-value");

      const envStore = createMockStore("env"); // No credential for anthropic
      const keychainStore = createMockStore("keychain", {
        credentials: new Map([["anthropic", keychainCred]]),
      });
      const fileStore = createMockStore("file", {
        credentials: new Map([["anthropic", fileCred]]),
      });

      const resolver = new CredentialResolver([envStore, keychainStore, fileStore]);
      const result = await resolver.resolve("anthropic");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value?.value).toBe("keychain-value");
      expect(result.ok && result.value?.source).toBe("keychain");
    });

    it("should handle different providers across different stores", async () => {
      const anthropicEnvCred = createTestCredential("anthropic", "env", "anthropic-env");
      const openaiKeychainCred = createTestCredential("openai", "keychain", "openai-keychain");
      const cohereFileCred = createTestCredential("cohere", "file", "cohere-file");

      const envStore = createMockStore("env", {
        credentials: new Map([["anthropic", anthropicEnvCred]]),
      });
      const keychainStore = createMockStore("keychain", {
        credentials: new Map([["openai", openaiKeychainCred]]),
      });
      const fileStore = createMockStore("file", {
        credentials: new Map([["cohere", cohereFileCred]]),
      });

      const resolver = new CredentialResolver([envStore, keychainStore, fileStore]);

      const anthropicResult = await resolver.resolve("anthropic");
      expect(anthropicResult.ok && anthropicResult.value?.source).toBe("env");

      const openaiResult = await resolver.resolve("openai");
      expect(openaiResult.ok && openaiResult.value?.source).toBe("keychain");

      const cohereResult = await resolver.resolve("cohere");
      expect(cohereResult.ok && cohereResult.value?.source).toBe("file");
    });

    it("should list credentials with deduplication (highest priority wins)", async () => {
      const envCred = createTestCredential("anthropic", "env", "env-value");
      const keychainCred = createTestCredential("anthropic", "keychain", "keychain-value");
      const openaiCred = createTestCredential("openai", "keychain", "openai-value");

      const envStore = createMockStore("env", {
        credentials: new Map([["anthropic", envCred]]),
      });
      const keychainStore = createMockStore("keychain", {
        credentials: new Map([
          ["anthropic", keychainCred],
          ["openai", openaiCred],
        ]),
      });

      const resolver = new CredentialResolver([envStore, keychainStore]);
      const result = await resolver.list();

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should have 2 credentials (anthropic deduplicated)
        expect(result.value.length).toBe(2);
        // Anthropic should be from env (highest priority)
        const anthropicRef = result.value.find((r) => r.provider === "anthropic");
        expect(anthropicRef?.source).toBe("env");
      }
    });
  });
});
