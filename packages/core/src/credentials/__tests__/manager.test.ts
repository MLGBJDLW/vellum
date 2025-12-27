/**
 * Unit tests for CredentialManager
 *
 * Tests the high-level credential management facade including
 * resolve, store, delete, list, and validate operations.
 *
 * @see packages/core/src/credentials/manager.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Err, Ok } from "../../types/result.js";
import { CredentialManager, type CredentialManagerEvent } from "../manager.js";
import type {
  Credential,
  CredentialRef,
  CredentialSource,
  CredentialStore,
  CredentialStoreError,
  CredentialValidationResult,
} from "../types.js";
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
  const priorityMap: Record<CredentialSource, number> = {
    runtime: 100,
    env: 90,
    keychain: 80,
    file: 50,
    config: 10,
  };

  const {
    priority = priorityMap[name],
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
// CredentialManager Tests
// =============================================================================

describe("CredentialManager", () => {
  // ===========================================================================
  // resolve() Tests
  // ===========================================================================

  describe("resolve()", () => {
    it("should resolve credential from stores", async () => {
      const cred = createTestCredential("anthropic", "env");
      const envStore = createMockStore("env", {
        credentials: new Map([["anthropic", cred]]),
      });

      const manager = new CredentialManager([envStore]);
      const result = await manager.resolve("anthropic");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value?.provider).toBe("anthropic");
    });

    it("should emit credential:resolved event on success", async () => {
      const cred = createTestCredential("anthropic", "env");
      const envStore = createMockStore("env", {
        credentials: new Map([["anthropic", cred]]),
      });

      const manager = new CredentialManager([envStore]);
      const events: string[] = [];
      manager.on((e) => events.push(e.type));

      await manager.resolve("anthropic");

      expect(events).toContain("credential:resolved");
    });

    it("should emit credential:not_found event when not found", async () => {
      const envStore = createMockStore("env");
      const manager = new CredentialManager([envStore]);
      const events: string[] = [];
      manager.on((e) => events.push(e.type));

      await manager.resolve("anthropic");

      expect(events).toContain("credential:not_found");
    });
  });

  // ===========================================================================
  // store() Tests
  // ===========================================================================

  describe("store()", () => {
    it("should store credential to writable store", async () => {
      const keychainStore = createMockStore("keychain");

      const manager = new CredentialManager([keychainStore]);
      const result = await manager.store({
        provider: "anthropic",
        type: "api_key",
        value: "sk-test-key",
      });

      expect(result.ok).toBe(true);
      expect(result.ok && result.value.provider).toBe("anthropic");
      expect(keychainStore.set).toHaveBeenCalled();
    });

    it("should use preferred write store when specified", async () => {
      const keychainStore = createMockStore("keychain");
      const fileStore = createMockStore("file");

      const manager = new CredentialManager([keychainStore, fileStore], {
        preferredWriteStore: "file",
      });

      await manager.store({
        provider: "anthropic",
        type: "api_key",
        value: "sk-test-key",
      });

      expect(fileStore.set).toHaveBeenCalled();
      expect(keychainStore.set).not.toHaveBeenCalled();
    });

    it("should store to specific store when storeName provided", async () => {
      const keychainStore = createMockStore("keychain");
      const fileStore = createMockStore("file");

      const manager = new CredentialManager([keychainStore, fileStore]);

      await manager.store(
        {
          provider: "anthropic",
          type: "api_key",
          value: "sk-test-key",
        },
        "file"
      );

      expect(fileStore.set).toHaveBeenCalled();
      expect(keychainStore.set).not.toHaveBeenCalled();
    });

    it("should fail if no writable store available", async () => {
      const envStore = createMockStore("env", { readOnly: true });

      const manager = new CredentialManager([envStore]);
      const result = await manager.store({
        provider: "anthropic",
        type: "api_key",
        value: "sk-test-key",
      });

      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.code).toBe("STORE_UNAVAILABLE");
    });

    it("should fail if store is read-only", async () => {
      const envStore = createMockStore("env", { readOnly: true });

      const manager = new CredentialManager([envStore]);
      const result = await manager.store(
        {
          provider: "anthropic",
          type: "api_key",
          value: "sk-test-key",
        },
        "env"
      );

      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.code).toBe("READ_ONLY");
    });

    it("should invalidate cache after storing", async () => {
      const cred = createTestCredential("anthropic", "keychain", "old-key");
      const keychainStore = createMockStore("keychain", {
        credentials: new Map([["anthropic", cred]]),
      });

      const manager = new CredentialManager([keychainStore]);

      // First resolve caches the credential
      await manager.resolve("anthropic");

      // Store new credential
      await manager.store({
        provider: "anthropic",
        type: "api_key",
        value: "new-key",
      });

      // Resolve again should hit store, not cache
      expect(keychainStore.get).toHaveBeenCalledTimes(1);
      await manager.resolve("anthropic");
      expect(keychainStore.get).toHaveBeenCalledTimes(2);
    });

    it("should emit credential:stored event", async () => {
      const keychainStore = createMockStore("keychain");
      const manager = new CredentialManager([keychainStore]);
      const events: string[] = [];
      manager.on((e) => events.push(e.type));

      await manager.store({
        provider: "anthropic",
        type: "api_key",
        value: "sk-test-key",
      });

      expect(events).toContain("credential:stored");
    });

    it("should validate with custom validator", async () => {
      const keychainStore = createMockStore("keychain");
      const validator = vi.fn().mockResolvedValue({
        valid: false,
        error: "Invalid API key format",
      } as CredentialValidationResult);

      const manager = new CredentialManager([keychainStore], { validator });

      const result = await manager.store({
        provider: "anthropic",
        type: "api_key",
        value: "bad-key",
      });

      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.code).toBe("INVALID_CREDENTIAL");
      expect(validator).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // delete() Tests
  // ===========================================================================

  describe("delete()", () => {
    it("should delete from writable stores", async () => {
      const cred = createTestCredential("anthropic", "keychain");
      const keychainStore = createMockStore("keychain", {
        credentials: new Map([["anthropic", cred]]),
      });

      const manager = new CredentialManager([keychainStore]);
      const result = await manager.delete("anthropic");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toBe(1);
    });

    it("should skip read-only stores", async () => {
      const cred = createTestCredential("anthropic", "keychain");
      const envStore = createMockStore("env", { readOnly: true });
      const keychainStore = createMockStore("keychain", {
        credentials: new Map([["anthropic", cred]]),
      });

      const manager = new CredentialManager([envStore, keychainStore]);
      const result = await manager.delete("anthropic");

      expect(result.ok).toBe(true);
      expect(envStore.delete).not.toHaveBeenCalled();
    });

    it("should emit credential:deleted event", async () => {
      const cred = createTestCredential("anthropic", "keychain");
      const keychainStore = createMockStore("keychain", {
        credentials: new Map([["anthropic", cred]]),
      });

      const manager = new CredentialManager([keychainStore]);
      const events: string[] = [];
      manager.on((e) => events.push(e.type));

      await manager.delete("anthropic");

      expect(events).toContain("credential:deleted");
    });

    it("should emit credential:not_found when nothing deleted", async () => {
      const keychainStore = createMockStore("keychain");
      const manager = new CredentialManager([keychainStore]);
      const events: string[] = [];
      manager.on((e) => events.push(e.type));

      await manager.delete("anthropic");

      expect(events).toContain("credential:not_found");
    });

    it("should invalidate cache after deletion", async () => {
      const cred = createTestCredential("anthropic", "keychain");
      const keychainStore = createMockStore("keychain", {
        credentials: new Map([["anthropic", cred]]),
      });

      const manager = new CredentialManager([keychainStore]);

      await manager.resolve("anthropic");
      await manager.delete("anthropic");

      // Should not return cached result
      const result = await manager.resolve("anthropic");
      expect(result.ok && result.value).toBeNull();
    });
  });

  // ===========================================================================
  // list() Tests
  // ===========================================================================

  describe("list()", () => {
    it("should list credentials from all stores", async () => {
      const anthropicCred = createTestCredential("anthropic", "env");
      const openaiCred = createTestCredential("openai", "keychain");

      const envStore = createMockStore("env", {
        credentials: new Map([["anthropic", anthropicCred]]),
      });
      const keychainStore = createMockStore("keychain", {
        credentials: new Map([["openai", openaiCred]]),
      });

      const manager = new CredentialManager([envStore, keychainStore]);
      const result = await manager.list();

      expect(result.ok).toBe(true);
      expect(result.ok && result.value.length).toBe(2);
    });

    it("should filter by provider", async () => {
      const anthropicCred = createTestCredential("anthropic", "env");
      const openaiCred = createTestCredential("openai", "env");

      const envStore = createMockStore("env", {
        credentials: new Map([
          ["anthropic", anthropicCred],
          ["openai", openaiCred],
        ]),
      });

      const manager = new CredentialManager([envStore]);
      const result = await manager.list("anthropic");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value.length).toBe(1);
    });
  });

  // ===========================================================================
  // validate() Tests
  // ===========================================================================

  describe("validate()", () => {
    it("should validate schema", async () => {
      const manager = new CredentialManager([]);

      const result = await manager.validate({
        id: "test",
        provider: "anthropic",
        type: "api_key",
        value: "sk-test",
        source: "keychain",
        metadata: {},
        createdAt: new Date(),
      });

      expect(result.valid).toBe(true);
    });

    it("should fail on invalid schema", async () => {
      const manager = new CredentialManager([]);

      const result = await manager.validate({
        id: "test",
        provider: "anthropic",
        // Missing required fields
      } as Credential);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Schema validation failed");
    });

    it("should use custom validator when provided", async () => {
      const validator = vi.fn().mockResolvedValue({
        valid: true,
        details: { accountInfo: "test-account" },
      } as CredentialValidationResult);

      const manager = new CredentialManager([], { validator });

      const result = await manager.validate(createTestCredential("anthropic", "keychain"));

      expect(result.valid).toBe(true);
      expect(validator).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // exists() Tests
  // ===========================================================================

  describe("exists()", () => {
    it("should return true when credential exists", async () => {
      const cred = createTestCredential("anthropic", "env");
      const envStore = createMockStore("env", {
        credentials: new Map([["anthropic", cred]]),
      });

      const manager = new CredentialManager([envStore]);
      const result = await manager.exists("anthropic");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toBe(true);
    });

    it("should return false when credential does not exist", async () => {
      const envStore = createMockStore("env");
      const manager = new CredentialManager([envStore]);
      const result = await manager.exists("anthropic");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toBe(false);
    });
  });

  // ===========================================================================
  // Store Access Tests
  // ===========================================================================

  describe("Store Access", () => {
    it("should return resolver", () => {
      const manager = new CredentialManager([]);
      expect(manager.getResolver()).toBeDefined();
    });

    it("should get stores", () => {
      const envStore = createMockStore("env");
      const manager = new CredentialManager([envStore]);

      expect(manager.getStores().length).toBe(1);
    });

    it("should get specific store by name", () => {
      const envStore = createMockStore("env");
      const manager = new CredentialManager([envStore]);

      expect(manager.getStore("env")).toBe(envStore);
      expect(manager.getStore("keychain")).toBeUndefined();
    });

    it("should get store availability", async () => {
      const envStore = createMockStore("env", { available: true });
      const keychainStore = createMockStore("keychain", { available: false });

      const manager = new CredentialManager([envStore, keychainStore]);
      const availability = await manager.getStoreAvailability();

      expect(availability.env).toBe(true);
      expect(availability.keychain).toBe(false);
    });
  });

  // ===========================================================================
  // Cache Management Tests
  // ===========================================================================

  describe("Cache Management", () => {
    it("should invalidate cache", async () => {
      const cred = createTestCredential("anthropic", "env");
      const envStore = createMockStore("env", {
        credentials: new Map([["anthropic", cred]]),
      });

      const manager = new CredentialManager([envStore]);

      await manager.resolve("anthropic");
      expect(envStore.get).toHaveBeenCalledTimes(1);

      manager.invalidateCache("anthropic");

      await manager.resolve("anthropic");
      expect(envStore.get).toHaveBeenCalledTimes(2);
    });

    it("should return cache stats", () => {
      const manager = new CredentialManager([], { cacheTtlMs: 60000 });
      const stats = manager.getCacheStats();

      expect(stats.size).toBe(0);
      expect(stats.ttlMs).toBe(60000);
    });
  });

  // ===========================================================================
  // Event Handling Tests
  // ===========================================================================

  describe("Event Handling", () => {
    it("should allow subscribing to events", async () => {
      const envStore = createMockStore("env");
      const manager = new CredentialManager([envStore]);

      const events: string[] = [];
      manager.on((e) => events.push(e.type));

      await manager.resolve("anthropic");

      expect(events.length).toBeGreaterThan(0);
    });

    it("should allow unsubscribing from events", async () => {
      const envStore = createMockStore("env");
      const manager = new CredentialManager([envStore]);

      const events: string[] = [];
      const unsubscribe = manager.on((e) => events.push(e.type));

      await manager.resolve("anthropic");
      const countBefore = events.length;

      unsubscribe();
      await manager.resolve("openai");

      expect(events.length).toBe(countBefore);
    });
  });

  // ===========================================================================
  // Integration Tests: Full Flow (Store → Resolve → Delete)
  // ===========================================================================

  describe("Integration: Full Flow (Store → Resolve → Delete)", () => {
    it("should complete full lifecycle: store → resolve → delete", async () => {
      const keychainStore = createMockStore("keychain");
      const manager = new CredentialManager([keychainStore]);

      // 1. Store a credential
      const storeResult = await manager.store({
        provider: "anthropic",
        type: "api_key",
        value: "sk-ant-test-key",
      });
      expect(storeResult.ok).toBe(true);
      expect(storeResult.ok && storeResult.value.provider).toBe("anthropic");

      // 2. Resolve should find it
      const resolveResult = await manager.resolve("anthropic");
      expect(resolveResult.ok).toBe(true);
      expect(resolveResult.ok && resolveResult.value?.value).toBe("sk-ant-test-key");

      // 3. Delete should remove it
      const deleteResult = await manager.delete("anthropic");
      expect(deleteResult.ok).toBe(true);
      expect(deleteResult.ok && deleteResult.value).toBe(1);

      // 4. Resolve should no longer find it
      const afterDeleteResult = await manager.resolve("anthropic");
      expect(afterDeleteResult.ok).toBe(true);
      expect(afterDeleteResult.ok && afterDeleteResult.value).toBeNull();
    });

    it("should handle multiple credentials lifecycle", async () => {
      const keychainStore = createMockStore("keychain");
      const manager = new CredentialManager([keychainStore]);

      // Store multiple credentials
      await manager.store({ provider: "anthropic", type: "api_key", value: "sk-ant-1" });
      await manager.store({ provider: "openai", type: "api_key", value: "sk-openai-1" });
      await manager.store({ provider: "cohere", type: "api_key", value: "sk-cohere-1" });

      // Verify all exist
      expect(
        (await manager.exists("anthropic")).ok && (await manager.exists("anthropic")).value
      ).toBe(true);
      expect((await manager.exists("openai")).ok && (await manager.exists("openai")).value).toBe(
        true
      );
      expect((await manager.exists("cohere")).ok && (await manager.exists("cohere")).value).toBe(
        true
      );

      // Delete one
      await manager.delete("openai");

      // Verify deletion
      expect(
        (await manager.exists("anthropic")).ok && (await manager.exists("anthropic")).value
      ).toBe(true);
      expect((await manager.exists("openai")).ok && (await manager.exists("openai")).value).toBe(
        false
      );
      expect((await manager.exists("cohere")).ok && (await manager.exists("cohere")).value).toBe(
        true
      );
    });

    it("should update existing credential via store", async () => {
      const keychainStore = createMockStore("keychain");
      const manager = new CredentialManager([keychainStore]);

      // Store initial credential
      await manager.store({
        provider: "anthropic",
        type: "api_key",
        value: "old-key",
      });

      const initialResult = await manager.resolve("anthropic");
      expect(initialResult.ok && initialResult.value?.value).toBe("old-key");

      // Store updated credential (overwrites)
      await manager.store({
        provider: "anthropic",
        type: "api_key",
        value: "new-key",
      });

      const updatedResult = await manager.resolve("anthropic");
      expect(updatedResult.ok && updatedResult.value?.value).toBe("new-key");
    });

    it("should respect cache invalidation during full flow", async () => {
      const keychainStore = createMockStore("keychain");
      const manager = new CredentialManager([keychainStore]);

      // Store and resolve (caches)
      await manager.store({ provider: "anthropic", type: "api_key", value: "initial" });
      await manager.resolve("anthropic");

      // Store new value (should invalidate cache)
      await manager.store({ provider: "anthropic", type: "api_key", value: "updated" });

      // Resolve should get new value, not cached
      const result = await manager.resolve("anthropic");
      expect(result.ok && result.value?.value).toBe("updated");
    });
  });

  // ===========================================================================
  // Integration Tests: Cross-Store Operations
  // ===========================================================================

  describe("Integration: Cross-Store Operations", () => {
    it("should resolve from env but store to keychain", async () => {
      const envCred = createTestCredential("anthropic", "env", "env-key");
      const envStore = createMockStore("env", {
        readOnly: true,
        credentials: new Map([["anthropic", envCred]]),
      });
      const keychainStore = createMockStore("keychain");

      const manager = new CredentialManager([envStore, keychainStore]);

      // Resolve gets from env
      const resolveResult = await manager.resolve("anthropic");
      expect(resolveResult.ok && resolveResult.value?.source).toBe("env");

      // Store goes to keychain (env is read-only)
      const storeResult = await manager.store({
        provider: "openai",
        type: "api_key",
        value: "sk-openai-key",
      });
      expect(storeResult.ok && storeResult.value.source).toBe("keychain");
    });

    it("should store to specified store regardless of priority", async () => {
      const keychainStore = createMockStore("keychain");
      const fileStore = createMockStore("file");

      const manager = new CredentialManager([keychainStore, fileStore]);

      // Explicitly store to file (lower priority)
      const result = await manager.store(
        {
          provider: "anthropic",
          type: "api_key",
          value: "sk-test",
        },
        "file"
      );

      expect(result.ok).toBe(true);
      expect(fileStore.set).toHaveBeenCalled();
      expect(keychainStore.set).not.toHaveBeenCalled();
    });

    it("should delete from all writable stores", async () => {
      const anthropicKeychain = createTestCredential("anthropic", "keychain", "kc-key");
      const anthropicFile = createTestCredential("anthropic", "file", "file-key");

      const keychainStore = createMockStore("keychain", {
        credentials: new Map([["anthropic", anthropicKeychain]]),
      });
      const fileStore = createMockStore("file", {
        credentials: new Map([["anthropic", anthropicFile]]),
      });
      const envStore = createMockStore("env", { readOnly: true });

      const manager = new CredentialManager([envStore, keychainStore, fileStore]);

      const result = await manager.delete("anthropic");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toBe(2); // Deleted from both writable stores
      expect(keychainStore.delete).toHaveBeenCalled();
      expect(fileStore.delete).toHaveBeenCalled();
      expect(envStore.delete).not.toHaveBeenCalled();
    });

    it("should list credentials aggregated across stores", async () => {
      const anthropicEnv = createTestCredential("anthropic", "env", "env-key");
      const openaiKeychain = createTestCredential("openai", "keychain", "kc-key");
      const cohereFile = createTestCredential("cohere", "file", "file-key");

      const envStore = createMockStore("env", {
        credentials: new Map([["anthropic", anthropicEnv]]),
      });
      const keychainStore = createMockStore("keychain", {
        credentials: new Map([["openai", openaiKeychain]]),
      });
      const fileStore = createMockStore("file", {
        credentials: new Map([["cohere", cohereFile]]),
      });

      const manager = new CredentialManager([envStore, keychainStore, fileStore]);
      const result = await manager.list();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(3);
        const providers = result.value.map((r) => r.provider);
        expect(providers).toContain("anthropic");
        expect(providers).toContain("openai");
        expect(providers).toContain("cohere");
      }
    });

    it("should resolve using priority when same credential in multiple stores", async () => {
      const anthropicEnv = createTestCredential("anthropic", "env", "env-key");
      const anthropicKeychain = createTestCredential("anthropic", "keychain", "keychain-key");

      const envStore = createMockStore("env", {
        credentials: new Map([["anthropic", anthropicEnv]]),
      });
      const keychainStore = createMockStore("keychain", {
        credentials: new Map([["anthropic", anthropicKeychain]]),
      });

      const manager = new CredentialManager([keychainStore, envStore]);
      const result = await manager.resolve("anthropic");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value?.source).toBe("env");
      expect(result.ok && result.value?.value).toBe("env-key");
    });
  });

  // ===========================================================================
  // Integration Tests: Event Emission Verification
  // ===========================================================================

  describe("Integration: Event Emission Verification", () => {
    it("should emit complete event sequence for store operation", async () => {
      const keychainStore = createMockStore("keychain");
      const manager = new CredentialManager([keychainStore]);

      const events: CredentialManagerEvent[] = [];
      manager.on((e) => events.push(e));

      await manager.store({
        provider: "anthropic",
        type: "api_key",
        value: "sk-test",
      });

      expect(events.some((e) => e.type === "credential:stored")).toBe(true);
      const storedEvent = events.find((e) => e.type === "credential:stored");
      expect(storedEvent?.type === "credential:stored" && storedEvent.provider).toBe("anthropic");
      expect(storedEvent?.type === "credential:stored" && storedEvent.store).toBe("keychain");
    });

    it("should emit complete event sequence for resolve operation", async () => {
      const cred = createTestCredential("anthropic", "keychain");
      const keychainStore = createMockStore("keychain", {
        credentials: new Map([["anthropic", cred]]),
      });

      const manager = new CredentialManager([keychainStore]);
      const events: CredentialManagerEvent[] = [];
      manager.on((e) => events.push(e));

      await manager.resolve("anthropic");

      expect(events.some((e) => e.type === "credential:resolved")).toBe(true);
      const resolvedEvent = events.find((e) => e.type === "credential:resolved");
      expect(resolvedEvent?.type === "credential:resolved" && resolvedEvent.provider).toBe(
        "anthropic"
      );
      expect(resolvedEvent?.type === "credential:resolved" && resolvedEvent.source).toBe(
        "keychain"
      );
    });

    it("should emit complete event sequence for delete operation", async () => {
      const cred = createTestCredential("anthropic", "keychain");
      const keychainStore = createMockStore("keychain", {
        credentials: new Map([["anthropic", cred]]),
      });

      const manager = new CredentialManager([keychainStore]);
      const events: CredentialManagerEvent[] = [];
      manager.on((e) => events.push(e));

      await manager.delete("anthropic");

      expect(events.some((e) => e.type === "credential:deleted")).toBe(true);
      const deletedEvent = events.find((e) => e.type === "credential:deleted");
      expect(deletedEvent?.type === "credential:deleted" && deletedEvent.provider).toBe(
        "anthropic"
      );
    });

    it("should emit credential:not_found when resolve finds nothing", async () => {
      const keychainStore = createMockStore("keychain");
      const manager = new CredentialManager([keychainStore]);

      const events: CredentialManagerEvent[] = [];
      manager.on((e) => events.push(e));

      await manager.resolve("nonexistent");

      expect(events.some((e) => e.type === "credential:not_found")).toBe(true);
    });

    it("should emit error event on operation failure", async () => {
      const keychainStore = createMockStore("keychain");
      (keychainStore.set as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err(createStoreError("IO_ERROR", "Write failed", "keychain"))
      );

      const manager = new CredentialManager([keychainStore]);
      const events: CredentialManagerEvent[] = [];
      manager.on((e) => events.push(e));

      await manager.store({
        provider: "anthropic",
        type: "api_key",
        value: "sk-test",
      });

      expect(events.some((e) => e.type === "error")).toBe(true);
      const errorEvent = events.find((e) => e.type === "error");
      expect(errorEvent?.type === "error" && errorEvent.operation).toBe("store");
    });

    it("should emit credential:validated event when validator is used", async () => {
      const keychainStore = createMockStore("keychain");
      const validator = vi.fn().mockResolvedValue({ valid: true } as CredentialValidationResult);

      const manager = new CredentialManager([keychainStore], { validator });
      const events: CredentialManagerEvent[] = [];
      manager.on((e) => events.push(e));

      await manager.store({
        provider: "anthropic",
        type: "api_key",
        value: "sk-test",
      });

      expect(events.some((e) => e.type === "credential:validated")).toBe(true);
      const validatedEvent = events.find((e) => e.type === "credential:validated");
      expect(validatedEvent?.type === "credential:validated" && validatedEvent.valid).toBe(true);
    });

    it("should emit events in correct order for full flow", async () => {
      const keychainStore = createMockStore("keychain");
      const manager = new CredentialManager([keychainStore]);

      const eventTypes: string[] = [];
      manager.on((e) => eventTypes.push(e.type));

      // Store
      await manager.store({ provider: "anthropic", type: "api_key", value: "sk-test" });
      expect(eventTypes).toContain("credential:stored");

      // Resolve (first time - not in cache yet after store invalidation)
      eventTypes.length = 0;
      await manager.resolve("anthropic");
      expect(eventTypes).toContain("credential:resolved");

      // Delete
      eventTypes.length = 0;
      await manager.delete("anthropic");
      expect(eventTypes).toContain("credential:deleted");
    });
  });

  // ===========================================================================
  // Integration Tests: Validation Integration
  // ===========================================================================

  describe("Integration: Validation Integration with Resolution", () => {
    it("should validate credential before storing", async () => {
      const keychainStore = createMockStore("keychain");
      const validator = vi.fn().mockResolvedValue({ valid: true } as CredentialValidationResult);

      const manager = new CredentialManager([keychainStore], { validator });

      await manager.store({
        provider: "anthropic",
        type: "api_key",
        value: "sk-valid-key",
      });

      expect(validator).toHaveBeenCalled();
      expect(keychainStore.set).toHaveBeenCalled();
    });

    it("should reject invalid credential and not store", async () => {
      const keychainStore = createMockStore("keychain");
      const validator = vi.fn().mockResolvedValue({
        valid: false,
        error: "Invalid API key format",
      } as CredentialValidationResult);

      const manager = new CredentialManager([keychainStore], { validator });

      const result = await manager.store({
        provider: "anthropic",
        type: "api_key",
        value: "invalid-key",
      });

      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.code).toBe("INVALID_CREDENTIAL");
      expect(keychainStore.set).not.toHaveBeenCalled();
    });

    it("should validate with custom validator that checks provider format", async () => {
      const keychainStore = createMockStore("keychain");
      const validator: (cred: Credential) => Promise<CredentialValidationResult> = async (cred) => {
        if (cred.provider === "anthropic" && !cred.value.startsWith("sk-ant-")) {
          return { valid: false, error: "Anthropic keys must start with sk-ant-" };
        }
        if (cred.provider === "openai" && !cred.value.startsWith("sk-")) {
          return { valid: false, error: "OpenAI keys must start with sk-" };
        }
        return { valid: true };
      };

      const manager = new CredentialManager([keychainStore], { validator });

      // Valid anthropic key
      const validResult = await manager.store({
        provider: "anthropic",
        type: "api_key",
        value: "sk-ant-valid-key",
      });
      expect(validResult.ok).toBe(true);

      // Invalid anthropic key
      const invalidResult = await manager.store({
        provider: "anthropic",
        type: "api_key",
        value: "sk-wrong-prefix",
      });
      expect(invalidResult.ok).toBe(false);
    });

    it("should validate manually via validate() method", async () => {
      const manager = new CredentialManager([]);

      // Valid credential
      const validResult = await manager.validate(
        createTestCredential("anthropic", "keychain", "sk-test")
      );
      expect(validResult.valid).toBe(true);

      // Invalid credential (invalid type)
      const invalidResult = await manager.validate({
        id: "test",
        provider: "anthropic",
        type: "invalid_type" as "api_key", // Invalid type
        value: "sk-test",
        source: "keychain",
        metadata: {},
        createdAt: new Date(),
      });
      expect(invalidResult.valid).toBe(false);
    });

    it("should validate and store with full flow", async () => {
      const keychainStore = createMockStore("keychain");
      let validationCount = 0;
      const validator = vi.fn().mockImplementation(async () => {
        validationCount++;
        return { valid: true, details: { callNumber: validationCount } };
      });

      const manager = new CredentialManager([keychainStore], { validator });

      // Store multiple credentials
      await manager.store({ provider: "anthropic", type: "api_key", value: "key1" });
      await manager.store({ provider: "openai", type: "api_key", value: "key2" });

      expect(validationCount).toBe(2);
      expect(keychainStore.set).toHaveBeenCalledTimes(2);
    });
  });

  // ===========================================================================
  // Integration Tests: Error Handling Across Stores
  // ===========================================================================

  describe("Integration: Error Handling Across Stores", () => {
    it("should handle store unavailability gracefully", async () => {
      const envStore = createMockStore("env", { available: false });
      const keychainStore = createMockStore("keychain", { available: false });
      const fileStore = createMockStore("file");

      const manager = new CredentialManager([envStore, keychainStore, fileStore]);

      // Store should use file (only available writable store)
      const result = await manager.store({
        provider: "anthropic",
        type: "api_key",
        value: "sk-test",
      });

      expect(result.ok).toBe(true);
      expect(fileStore.set).toHaveBeenCalled();
    });

    it("should return error when no writable stores available", async () => {
      const envStore = createMockStore("env", { readOnly: true });
      const configStore = createMockStore("config", { readOnly: true });

      const manager = new CredentialManager([envStore, configStore]);

      const result = await manager.store({
        provider: "anthropic",
        type: "api_key",
        value: "sk-test",
      });

      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.code).toBe("STORE_UNAVAILABLE");
    });

    it("should handle IO errors from stores during resolve", async () => {
      const envStore = createMockStore("env");
      (envStore.isAvailable as ReturnType<typeof vi.fn>).mockResolvedValue(Ok(true));
      (envStore.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err(createStoreError("IO_ERROR", "Read failed", "env"))
      );

      const keychainCred = createTestCredential("anthropic", "keychain", "keychain-key");
      const keychainStore = createMockStore("keychain", {
        credentials: new Map([["anthropic", keychainCred]]),
      });

      const manager = new CredentialManager([envStore, keychainStore]);
      const result = await manager.resolve("anthropic");

      // Should fallback to keychain
      expect(result.ok).toBe(true);
      expect(result.ok && result.value?.source).toBe("keychain");
    });

    it("should handle IO errors from stores during store", async () => {
      const keychainStore = createMockStore("keychain");
      (keychainStore.set as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err(createStoreError("IO_ERROR", "Keychain locked", "keychain"))
      );

      const manager = new CredentialManager([keychainStore]);

      const result = await manager.store({
        provider: "anthropic",
        type: "api_key",
        value: "sk-test",
      });

      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.code).toBe("IO_ERROR");
    });

    it("should handle IO errors from stores during delete", async () => {
      const keychainStore = createMockStore("keychain");
      (keychainStore.delete as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err(createStoreError("IO_ERROR", "Delete failed", "keychain"))
      );

      const manager = new CredentialManager([keychainStore]);
      const result = await manager.delete("anthropic");

      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.code).toBe("IO_ERROR");
    });

    it("should handle partial failures during multi-store delete", async () => {
      const keychainCred = createTestCredential("anthropic", "keychain");
      const fileCred = createTestCredential("anthropic", "file");

      const keychainStore = createMockStore("keychain", {
        credentials: new Map([["anthropic", keychainCred]]),
      });
      const fileStore = createMockStore("file", {
        credentials: new Map([["anthropic", fileCred]]),
      });
      (fileStore.delete as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err(createStoreError("IO_ERROR", "File locked", "file"))
      );

      const manager = new CredentialManager([keychainStore, fileStore]);
      const events: CredentialManagerEvent[] = [];
      manager.on((e) => events.push(e));

      const result = await manager.delete("anthropic");

      // Should partially succeed (keychain deleted)
      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toBe(1);
      expect(events.some((e) => e.type === "credential:deleted")).toBe(true);
    });

    it("should handle schema validation errors", async () => {
      const keychainStore = createMockStore("keychain");
      const manager = new CredentialManager([keychainStore]);

      const result = await manager.store({
        provider: "anthropic",
        type: "invalid_type" as "api_key", // Invalid: invalid type
        value: "sk-test",
      });

      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.code).toBe("INVALID_CREDENTIAL");
    });

    it("should handle errors from all stores during list", async () => {
      const envStore = createMockStore("env");
      const keychainStore = createMockStore("keychain");

      (envStore.list as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err(createStoreError("IO_ERROR", "Env read error", "env"))
      );
      (keychainStore.list as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err(createStoreError("IO_ERROR", "Keychain error", "keychain"))
      );

      const manager = new CredentialManager([envStore, keychainStore]);
      const result = await manager.list();

      // Should return error when all stores fail
      expect(result.ok).toBe(false);
    });

    it("should return partial results when some stores fail during list", async () => {
      const anthropicCred = createTestCredential("anthropic", "env");
      const envStore = createMockStore("env", {
        credentials: new Map([["anthropic", anthropicCred]]),
      });
      const keychainStore = createMockStore("keychain");
      (keychainStore.list as ReturnType<typeof vi.fn>).mockResolvedValue(
        Err(createStoreError("IO_ERROR", "Keychain locked", "keychain"))
      );

      const manager = new CredentialManager([envStore, keychainStore]);
      const result = await manager.list();

      // Should return results from successful stores
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0].provider).toBe("anthropic");
      }
    });

    it("should handle concurrent operations safely", async () => {
      const keychainStore = createMockStore("keychain");
      const manager = new CredentialManager([keychainStore]);

      // Run multiple operations concurrently
      const [storeResult1, storeResult2, resolveResult] = await Promise.all([
        manager.store({ provider: "anthropic", type: "api_key", value: "key1" }),
        manager.store({ provider: "openai", type: "api_key", value: "key2" }),
        manager.resolve("cohere"),
      ]);

      expect(storeResult1.ok).toBe(true);
      expect(storeResult2.ok).toBe(true);
      expect(resolveResult.ok).toBe(true);
    });
  });
});
