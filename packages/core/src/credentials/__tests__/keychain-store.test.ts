/**
 * KeychainStore Unit Tests
 *
 * Tests for OS keychain credential storage.
 * Uses mocking since keytar availability varies by environment.
 *
 * @module credentials/stores/__tests__/keychain-store
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeychainStore } from "../stores/keychain-store.js";
import type { Credential } from "../types.js";

// =============================================================================
// Mock Keytar
// =============================================================================

// Store for mock keychain data
const mockKeychainStorage = new Map<string, string>();

// Mock keytar module
const mockKeytar = {
  getPassword: vi.fn(async (_service: string, account: string) => {
    return mockKeychainStorage.get(account) ?? null;
  }),
  setPassword: vi.fn(async (_service: string, account: string, password: string) => {
    mockKeychainStorage.set(account, password);
  }),
  deletePassword: vi.fn(async (_service: string, account: string) => {
    return mockKeychainStorage.delete(account);
  }),
  findCredentials: vi.fn(async (_service: string) => {
    return Array.from(mockKeychainStorage.entries()).map(([account, password]) => ({
      account,
      password,
    }));
  }),
};

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a test credential
 */
function createTestCredential(
  provider: string,
  value: string,
  overrides?: Partial<Credential>
): Credential {
  return {
    id: `test:${provider}`,
    provider,
    type: "api_key",
    value,
    source: "keychain",
    metadata: {},
    createdAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("KeychainStore", () => {
  let store: KeychainStore;

  beforeEach(() => {
    // Clear mock data
    mockKeychainStorage.clear();
    vi.clearAllMocks();

    // Create store instance
    store = new KeychainStore();

    // Mock the dynamic import
    vi.doMock("keytar", () => mockKeytar);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should create store with correct properties", () => {
      expect(store.name).toBe("keychain");
      expect(store.priority).toBe(80);
      expect(store.readOnly).toBe(false);
    });
  });

  describe("isAvailable", () => {
    it("should return false when keytar cannot be loaded", async () => {
      // Default behavior - keytar will fail to import in test environment
      const result = await store.isAvailable();

      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toBe(false);
    });

    it("should return false when VELLUM_FORCE_FILE_STORAGE=1", async () => {
      // Set environment variable to force file storage
      process.env.VELLUM_FORCE_FILE_STORAGE = "1";

      try {
        const result = await store.isAvailable();

        expect(result.ok).toBe(true);
        expect(result.ok && result.value).toBe(false);
      } finally {
        delete process.env.VELLUM_FORCE_FILE_STORAGE;
      }
    });

    it("should return false when VELLUM_FORCE_FILE_STORAGE=true", async () => {
      // Set environment variable to force file storage
      process.env.VELLUM_FORCE_FILE_STORAGE = "true";

      try {
        const result = await store.isAvailable();

        expect(result.ok).toBe(true);
        expect(result.ok && result.value).toBe(false);
      } finally {
        delete process.env.VELLUM_FORCE_FILE_STORAGE;
      }
    });
  });

  describe("get", () => {
    it("should return store unavailable error when keytar not available", async () => {
      const result = await store.get("anthropic");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("STORE_UNAVAILABLE");
        expect(result.error.store).toBe("keychain");
      }
    });
  });

  describe("set", () => {
    it("should return store unavailable error when keytar not available", async () => {
      const credential = createTestCredential("anthropic", "sk-ant-test123");
      const result = await store.set(credential);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("STORE_UNAVAILABLE");
        expect(result.error.store).toBe("keychain");
      }
    });
  });

  describe("delete", () => {
    it("should return store unavailable error when keytar not available", async () => {
      const result = await store.delete("anthropic");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("STORE_UNAVAILABLE");
        expect(result.error.store).toBe("keychain");
      }
    });
  });

  describe("list", () => {
    it("should return store unavailable error when keytar not available", async () => {
      const result = await store.list();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("STORE_UNAVAILABLE");
        expect(result.error.store).toBe("keychain");
      }
    });
  });

  describe("exists", () => {
    it("should return store unavailable error when keytar not available", async () => {
      const result = await store.exists("anthropic");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("STORE_UNAVAILABLE");
        expect(result.error.store).toBe("keychain");
      }
    });
  });
});

// =============================================================================
// Integration Tests (with mocked keytar)
// =============================================================================

describe("KeychainStore (with mocked keytar)", () => {
  let store: KeychainStoreWithMockedKeytar;

  /**
   * KeychainStore subclass that injects mocked keytar
   */
  class KeychainStoreWithMockedKeytar extends KeychainStore {
    constructor() {
      super();
      // Inject mock keytar directly by accessing private field
      // biome-ignore lint/suspicious/noExplicitAny: Test requires access to private fields
      (this as any).keytarModule = mockKeytar;
      // biome-ignore lint/suspicious/noExplicitAny: Test requires access to private fields
      (this as any).keytarLoadAttempted = true;
    }
  }

  beforeEach(() => {
    // Clear mock data
    mockKeychainStorage.clear();
    vi.clearAllMocks();

    // Create store with mocked keytar
    store = new KeychainStoreWithMockedKeytar();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("isAvailable", () => {
    it("should return true when keytar is available", async () => {
      const result = await store.isAvailable();

      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toBe(true);
    });

    it("should return false if findCredentials throws", async () => {
      mockKeytar.findCredentials.mockRejectedValueOnce(new Error("Backend unavailable"));

      const result = await store.isAvailable();

      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toBe(false);
    });
  });

  describe("get", () => {
    it("should return null for non-existent credential", async () => {
      const result = await store.get("anthropic");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toBe(null);
    });

    it("should return credential when found", async () => {
      // Store a credential directly in mock
      const storedData = {
        id: "test:anthropic",
        provider: "anthropic",
        type: "api_key",
        value: "sk-ant-test123",
        metadata: {},
        createdAt: "2024-01-01T00:00:00.000Z",
      };
      mockKeychainStorage.set("anthropic", JSON.stringify(storedData));

      const result = await store.get("anthropic");

      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.provider).toBe("anthropic");
        expect(result.value.value).toBe("sk-ant-test123");
        expect(result.value.source).toBe("keychain");
      }
    });

    it("should support key parameter for namespaced credentials", async () => {
      const storedData = {
        id: "test:anthropic:production",
        provider: "anthropic",
        type: "api_key",
        value: "sk-ant-prod123",
        metadata: {},
        createdAt: "2024-01-01T00:00:00.000Z",
      };
      mockKeychainStorage.set("anthropic:production", JSON.stringify(storedData));

      const result = await store.get("anthropic", "production");

      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.value).toBe("sk-ant-prod123");
      }
    });

    it("should return error for malformed JSON", async () => {
      mockKeychainStorage.set("anthropic", "not valid json");

      const result = await store.get("anthropic");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("DECRYPTION_ERROR");
      }
    });

    it("should return IO_ERROR when getPassword throws", async () => {
      mockKeytar.getPassword.mockRejectedValueOnce(new Error("Keychain locked"));

      const result = await store.get("anthropic");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("IO_ERROR");
        expect(result.error.message).toContain("Keychain locked");
      }
    });
  });

  describe("set", () => {
    it("should store credential in keychain", async () => {
      const credential = createTestCredential("anthropic", "sk-ant-test123");

      const result = await store.set(credential);

      expect(result.ok).toBe(true);
      expect(mockKeytar.setPassword).toHaveBeenCalledWith(
        "vellum-credentials",
        "anthropic",
        expect.any(String)
      );

      // Verify stored data
      const storedJson = mockKeychainStorage.get("anthropic");
      expect(storedJson).toBeDefined();
      const stored = JSON.parse(storedJson ?? "{}");
      expect(stored.value).toBe("sk-ant-test123");
    });

    it("should store credential with metadata", async () => {
      const credential = createTestCredential("openai", "sk-openai-test", {
        metadata: {
          label: "Production API Key",
          environment: "production",
          tags: { team: "backend" },
        },
        expiresAt: new Date("2025-01-01T00:00:00Z"),
      });

      const result = await store.set(credential);

      expect(result.ok).toBe(true);

      const storedJson = mockKeychainStorage.get("openai");
      const stored = JSON.parse(storedJson ?? "{}");
      expect(stored.metadata.label).toBe("Production API Key");
      expect(stored.expiresAt).toBe("2025-01-01T00:00:00.000Z");
    });

    it("should return IO_ERROR when setPassword throws", async () => {
      mockKeytar.setPassword.mockRejectedValueOnce(new Error("Access denied"));

      const credential = createTestCredential("anthropic", "sk-ant-test123");
      const result = await store.set(credential);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("IO_ERROR");
        expect(result.error.message).toContain("Access denied");
      }
    });
  });

  describe("delete", () => {
    it("should delete existing credential", async () => {
      mockKeychainStorage.set("anthropic", JSON.stringify({ value: "test" }));

      const result = await store.delete("anthropic");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toBe(true);
      expect(mockKeychainStorage.has("anthropic")).toBe(false);
    });

    it("should return false for non-existent credential", async () => {
      const result = await store.delete("nonexistent");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toBe(false);
    });

    it("should support key parameter", async () => {
      mockKeychainStorage.set("anthropic:production", JSON.stringify({ value: "test" }));

      const result = await store.delete("anthropic", "production");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toBe(true);
    });

    it("should return IO_ERROR when deletePassword throws", async () => {
      mockKeytar.deletePassword.mockRejectedValueOnce(new Error("Permission denied"));

      const result = await store.delete("anthropic");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("IO_ERROR");
        expect(result.error.message).toContain("Permission denied");
      }
    });
  });

  describe("list", () => {
    it("should return empty array when no credentials", async () => {
      const result = await store.list();

      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toEqual([]);
    });

    it("should return all credentials as refs", async () => {
      mockKeychainStorage.set(
        "anthropic",
        JSON.stringify({
          id: "test:anthropic",
          provider: "anthropic",
          type: "api_key",
          value: "sk-ant-test123",
          createdAt: "2024-01-01T00:00:00.000Z",
        })
      );
      mockKeychainStorage.set(
        "openai",
        JSON.stringify({
          id: "test:openai",
          provider: "openai",
          type: "api_key",
          value: "sk-openai-test456",
          createdAt: "2024-01-01T00:00:00.000Z",
        })
      );

      const result = await store.list();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(2);
        expect(result.value.map((r) => r.provider).sort()).toEqual(["anthropic", "openai"]);
        // Values should be masked
        expect(result.value[0]?.maskedHint).toBeDefined();
        // biome-ignore lint/suspicious/noExplicitAny: Test assertion requires type assertion
        expect((result.value[0] as any)?.value).toBeUndefined();
      }
    });

    it("should filter by provider", async () => {
      mockKeychainStorage.set(
        "anthropic",
        JSON.stringify({
          id: "test:anthropic",
          provider: "anthropic",
          type: "api_key",
          value: "sk-ant-test",
          createdAt: "2024-01-01T00:00:00.000Z",
        })
      );
      mockKeychainStorage.set(
        "openai",
        JSON.stringify({
          id: "test:openai",
          provider: "openai",
          type: "api_key",
          value: "sk-openai-test",
          createdAt: "2024-01-01T00:00:00.000Z",
        })
      );

      const result = await store.list("anthropic");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0]?.provider).toBe("anthropic");
      }
    });

    it("should skip malformed entries", async () => {
      mockKeychainStorage.set("anthropic", "not valid json");
      mockKeychainStorage.set(
        "openai",
        JSON.stringify({
          id: "test:openai",
          provider: "openai",
          type: "api_key",
          value: "sk-openai-test",
          createdAt: "2024-01-01T00:00:00.000Z",
        })
      );

      const result = await store.list();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0]?.provider).toBe("openai");
      }
    });

    it("should return IO_ERROR when findCredentials throws", async () => {
      mockKeytar.findCredentials.mockRejectedValueOnce(new Error("Backend error"));

      const result = await store.list();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("IO_ERROR");
      }
    });
  });

  describe("exists", () => {
    it("should return true for existing credential", async () => {
      mockKeychainStorage.set(
        "anthropic",
        JSON.stringify({
          id: "test:anthropic",
          provider: "anthropic",
          type: "api_key",
          value: "sk-ant-test",
          createdAt: "2024-01-01T00:00:00.000Z",
        })
      );

      const result = await store.exists("anthropic");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toBe(true);
    });

    it("should return false for non-existent credential", async () => {
      const result = await store.exists("nonexistent");

      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toBe(false);
    });
  });

  describe("masked hint generation", () => {
    it("should mask credential value in refs", async () => {
      mockKeychainStorage.set(
        "anthropic",
        JSON.stringify({
          id: "test:anthropic",
          provider: "anthropic",
          type: "api_key",
          value: "sk-ant-abcdefghijklmnop",
          createdAt: "2024-01-01T00:00:00.000Z",
        })
      );

      const result = await store.list();

      expect(result.ok).toBe(true);
      if (result.ok && result.value[0]) {
        expect(result.value[0].maskedHint).toBe("sk-...nop");
      }
    });

    it("should handle short values", async () => {
      mockKeychainStorage.set(
        "test",
        JSON.stringify({
          id: "test:test",
          provider: "test",
          type: "api_key",
          value: "short",
          createdAt: "2024-01-01T00:00:00.000Z",
        })
      );

      const result = await store.list();

      expect(result.ok).toBe(true);
      if (result.ok && result.value[0]) {
        expect(result.value[0].maskedHint).toBe("***");
      }
    });
  });

  describe("account name parsing", () => {
    it("should handle provider:key format correctly", async () => {
      mockKeychainStorage.set(
        "anthropic:production",
        JSON.stringify({
          id: "test:anthropic:production",
          provider: "anthropic",
          type: "api_key",
          value: "sk-prod-key",
          createdAt: "2024-01-01T00:00:00.000Z",
        })
      );

      const result = await store.get("anthropic", "production");

      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.value).toBe("sk-prod-key");
      }
    });
  });
});
