/**
 * HybridCredentialStore Tests
 *
 * Tests for the auto-switching credential store that uses OS keychain
 * when available, falling back to encrypted file storage.
 *
 * @module credentials/__tests__/hybrid-store.test
 */

import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HybridCredentialStore } from "../stores/hybrid-store.js";
import { KeychainStore } from "../stores/keychain-store.js";
import type { Credential } from "../types.js";

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestCredential(provider: string, value: string): Credential {
  return {
    id: `${provider}-${Date.now()}`,
    provider,
    type: "api_key",
    value,
    source: "keychain",
    metadata: {},
    createdAt: new Date(),
  };
}

// =============================================================================
// Test Setup
// =============================================================================

describe("HybridCredentialStore", () => {
  let testDir: string;
  let testFilePath: string;
  const testPassword = "test-password-123!";

  beforeEach(async () => {
    // Create unique test directory
    testDir = join(
      tmpdir(),
      `hybrid-store-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await mkdir(testDir, { recursive: true });
    testFilePath = join(testDir, "credentials.enc");

    // Reset environment
    delete process.env.VELLUM_FORCE_FILE_STORAGE;
  });

  afterEach(async () => {
    // Cleanup test directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    // Reset environment
    delete process.env.VELLUM_FORCE_FILE_STORAGE;
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Basic Properties
  // ===========================================================================

  describe("Basic Properties", () => {
    it("should have correct name", () => {
      const store = new HybridCredentialStore({
        filePath: testFilePath,
        password: testPassword,
      });
      expect(store.name).toBe("keychain");
    });

    it("should have correct priority", () => {
      const store = new HybridCredentialStore({
        filePath: testFilePath,
        password: testPassword,
      });
      expect(store.priority).toBe(80);
    });

    it("should not be read-only", () => {
      const store = new HybridCredentialStore({
        filePath: testFilePath,
        password: testPassword,
      });
      expect(store.readOnly).toBe(false);
    });
  });

  // ===========================================================================
  // VELLUM_FORCE_FILE_STORAGE Environment Variable
  // ===========================================================================

  describe("VELLUM_FORCE_FILE_STORAGE Environment Variable", () => {
    it("should use file storage when VELLUM_FORCE_FILE_STORAGE=1", async () => {
      process.env.VELLUM_FORCE_FILE_STORAGE = "1";

      const store = new HybridCredentialStore({
        filePath: testFilePath,
        password: testPassword,
      });

      expect(store.isForceFileStorage()).toBe(true);

      // Trigger initialization
      await store.isAvailable();

      expect(await store.getActiveBackend()).toBe("file");
    });

    it("should use file storage when VELLUM_FORCE_FILE_STORAGE=true", async () => {
      process.env.VELLUM_FORCE_FILE_STORAGE = "true";

      const store = new HybridCredentialStore({
        filePath: testFilePath,
        password: testPassword,
      });

      expect(store.isForceFileStorage()).toBe(true);

      // Trigger initialization
      await store.isAvailable();

      expect(await store.getActiveBackend()).toBe("file");
    });

    it("should not force file storage when env var is not set", async () => {
      const store = new HybridCredentialStore({
        filePath: testFilePath,
        password: testPassword,
      });

      expect(store.isForceFileStorage()).toBe(false);
    });

    it("should not force file storage when env var is empty", async () => {
      process.env.VELLUM_FORCE_FILE_STORAGE = "";

      const store = new HybridCredentialStore({
        filePath: testFilePath,
        password: testPassword,
      });

      expect(store.isForceFileStorage()).toBe(false);
    });

    it("should not force file storage when env var is 0", async () => {
      process.env.VELLUM_FORCE_FILE_STORAGE = "0";

      const store = new HybridCredentialStore({
        filePath: testFilePath,
        password: testPassword,
      });

      expect(store.isForceFileStorage()).toBe(false);
    });

    it("should respect forceFileStorage option over env var", async () => {
      // Env says don't force
      delete process.env.VELLUM_FORCE_FILE_STORAGE;

      // But option says force
      const store = new HybridCredentialStore({
        filePath: testFilePath,
        password: testPassword,
        forceFileStorage: true,
      });

      expect(store.isForceFileStorage()).toBe(true);

      // Trigger initialization
      await store.isAvailable();

      expect(await store.getActiveBackend()).toBe("file");
    });

    it("should respect forceFileStorage=false option over env var", async () => {
      // Env says force
      process.env.VELLUM_FORCE_FILE_STORAGE = "1";

      // But option says don't force
      const store = new HybridCredentialStore({
        filePath: testFilePath,
        password: testPassword,
        forceFileStorage: false,
      });

      expect(store.isForceFileStorage()).toBe(false);
    });
  });

  // ===========================================================================
  // Backend Selection
  // ===========================================================================

  describe("Backend Selection", () => {
    it("should fall back to file when keychain unavailable", async () => {
      // Mock KeychainStore.isAvailable to return false
      vi.spyOn(KeychainStore.prototype, "isAvailable").mockResolvedValue({
        ok: true,
        value: false,
      });

      const store = new HybridCredentialStore({
        filePath: testFilePath,
        password: testPassword,
      });

      // Trigger initialization
      await store.isAvailable();

      expect(await store.getActiveBackend()).toBe("file");
    });

    it("should use keychain when available", async () => {
      // Mock KeychainStore.isAvailable to return true
      vi.spyOn(KeychainStore.prototype, "isAvailable").mockResolvedValue({
        ok: true,
        value: true,
      });

      const store = new HybridCredentialStore({
        filePath: testFilePath,
        password: testPassword,
      });

      // Trigger initialization
      await store.isAvailable();

      expect(await store.getActiveBackend()).toBe("keychain");
      expect(store.isKeychainAvailable()).toBe(true);
    });

    it("should report keychain unavailable after initialization when falling back", async () => {
      // Mock KeychainStore.isAvailable to return false
      vi.spyOn(KeychainStore.prototype, "isAvailable").mockResolvedValue({
        ok: true,
        value: false,
      });

      const store = new HybridCredentialStore({
        filePath: testFilePath,
        password: testPassword,
      });

      // Before initialization, keychain status is unknown (false by default)
      expect(store.isKeychainAvailable()).toBe(false);

      // Trigger initialization
      await store.isAvailable();

      // After initialization, keychain is confirmed unavailable
      expect(store.isKeychainAvailable()).toBe(false);
    });
  });

  // ===========================================================================
  // CRUD Operations (File Storage Fallback)
  // ===========================================================================

  describe("CRUD Operations (File Storage)", () => {
    beforeEach(() => {
      // Force file storage for predictable testing
      process.env.VELLUM_FORCE_FILE_STORAGE = "1";
    });

    it("should store and retrieve a credential", async () => {
      const store = new HybridCredentialStore({
        filePath: testFilePath,
        password: testPassword,
      });

      const credential = createTestCredential("anthropic", "sk-ant-test-key");
      const setResult = await store.set(credential);
      expect(setResult.ok).toBe(true);

      const getResult = await store.get("anthropic");
      expect(getResult.ok).toBe(true);
      expect(getResult.ok && getResult.value?.value).toBe("sk-ant-test-key");
    });

    it("should return null for non-existent credential", async () => {
      const store = new HybridCredentialStore({
        filePath: testFilePath,
        password: testPassword,
      });

      const result = await store.get("non-existent");
      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toBeNull();
    });

    it("should delete a credential", async () => {
      const store = new HybridCredentialStore({
        filePath: testFilePath,
        password: testPassword,
      });

      const credential = createTestCredential("openai", "sk-openai-test");
      await store.set(credential);

      const deleteResult = await store.delete("openai");
      expect(deleteResult.ok).toBe(true);
      expect(deleteResult.ok && deleteResult.value).toBe(true);

      const getResult = await store.get("openai");
      expect(getResult.ok).toBe(true);
      expect(getResult.ok && getResult.value).toBeNull();
    });

    it("should list credentials", async () => {
      const store = new HybridCredentialStore({
        filePath: testFilePath,
        password: testPassword,
      });

      await store.set(createTestCredential("anthropic", "sk-ant-1"));
      await store.set(createTestCredential("openai", "sk-openai-1"));

      const result = await store.list();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(2);
        const providers = result.value.map((c) => c.provider).sort();
        expect(providers).toEqual(["anthropic", "openai"]);
      }
    });

    it("should filter list by provider", async () => {
      const store = new HybridCredentialStore({
        filePath: testFilePath,
        password: testPassword,
      });

      await store.set(createTestCredential("anthropic", "sk-ant-1"));
      await store.set(createTestCredential("openai", "sk-openai-1"));

      const result = await store.list("anthropic");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0]?.provider).toBe("anthropic");
      }
    });

    it("should check if credential exists", async () => {
      const store = new HybridCredentialStore({
        filePath: testFilePath,
        password: testPassword,
      });

      await store.set(createTestCredential("anthropic", "sk-ant-1"));

      const existsResult = await store.exists("anthropic");
      expect(existsResult.ok).toBe(true);
      expect(existsResult.ok && existsResult.value).toBe(true);

      const notExistsResult = await store.exists("non-existent");
      expect(notExistsResult.ok).toBe(true);
      expect(notExistsResult.ok && notExistsResult.value).toBe(false);
    });
  });

  // ===========================================================================
  // isAvailable()
  // ===========================================================================

  describe("isAvailable()", () => {
    it("should return true when file storage is available", async () => {
      process.env.VELLUM_FORCE_FILE_STORAGE = "1";

      const store = new HybridCredentialStore({
        filePath: testFilePath,
        password: testPassword,
      });

      const result = await store.isAvailable();
      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toBe(true);
    });

    it("should return false when password is empty (file storage unavailable)", async () => {
      process.env.VELLUM_FORCE_FILE_STORAGE = "1";

      const store = new HybridCredentialStore({
        filePath: testFilePath,
        password: "", // Empty password makes file store unavailable
      });

      const result = await store.isAvailable();
      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toBe(false);
    });
  });

  // ===========================================================================
  // Lazy Initialization
  // ===========================================================================

  describe("Lazy Initialization", () => {
    it("should initialize only once", async () => {
      vi.spyOn(KeychainStore.prototype, "isAvailable").mockResolvedValue({
        ok: true,
        value: false,
      });

      const store = new HybridCredentialStore({
        filePath: testFilePath,
        password: testPassword,
      });

      // First call triggers initialization
      await store.isAvailable();
      expect(KeychainStore.prototype.isAvailable).toHaveBeenCalledTimes(1);

      // Subsequent calls should not re-initialize
      await store.isAvailable();
      await store.get("test");
      await store.exists("test");
      expect(KeychainStore.prototype.isAvailable).toHaveBeenCalledTimes(1);
    });

    it("should not call keychain.isAvailable when forceFileStorage is true", async () => {
      const spy = vi.spyOn(KeychainStore.prototype, "isAvailable");

      const store = new HybridCredentialStore({
        filePath: testFilePath,
        password: testPassword,
        forceFileStorage: true,
      });

      await store.isAvailable();
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
