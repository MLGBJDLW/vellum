import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type CredentialManagerLike,
  clearProviderCache,
  createProvider,
  createProviderSync,
  getProvider,
  type ProviderConfig,
} from "../factory.js";

const DEPRECATED_WARNINGS = [
  "[DEPRECATED] createProvider",
  "[DEPRECATED] createProviderSync",
  "[DEPRECATED] getProvider",
] as const;

const withSuppressedDeprecationWarnings = <T>(fn: () => T): T => {
  const originalWarn = console.warn;
  const warnSpy = vi.spyOn(console, "warn").mockImplementation((...args) => {
    const [message] = args;
    if (
      typeof message === "string" &&
      DEPRECATED_WARNINGS.some((prefix) => message.startsWith(prefix))
    ) {
      return;
    }
    originalWarn(...args);
  });

  try {
    return fn();
  } finally {
    warnSpy.mockRestore();
  }
};

const withSuppressedDeprecationWarningsAsync = async <T>(fn: () => Promise<T>): Promise<T> => {
  const originalWarn = console.warn;
  const warnSpy = vi.spyOn(console, "warn").mockImplementation((...args) => {
    const [message] = args;
    if (
      typeof message === "string" &&
      DEPRECATED_WARNINGS.some((prefix) => message.startsWith(prefix))
    ) {
      return;
    }
    originalWarn(...args);
  });

  try {
    return await fn();
  } finally {
    warnSpy.mockRestore();
  }
};

// Mock CredentialManager
const mockResolve = vi.fn();
const mockCredentialManager: CredentialManagerLike = {
  resolve: mockResolve,
};

// Store original env vars to restore after tests
const originalEnv: Record<string, string | undefined> = {};

describe("factory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearProviderCache();

    // Set mock API keys for provider creation tests
    // Store original values
    originalEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    originalEnv.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    originalEnv.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    // Set test API keys
    process.env.ANTHROPIC_API_KEY = "sk-ant-api03-test-key";
    process.env.OPENAI_API_KEY = "sk-test-openai-key";
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "AIzaSyTestGoogleKey";
  });

  afterEach(() => {
    // Restore original env vars
    if (originalEnv.ANTHROPIC_API_KEY === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalEnv.ANTHROPIC_API_KEY;
    }
    if (originalEnv.OPENAI_API_KEY === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalEnv.OPENAI_API_KEY;
    }
    if (originalEnv.GOOGLE_GENERATIVE_AI_API_KEY === undefined) {
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    } else {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = originalEnv.GOOGLE_GENERATIVE_AI_API_KEY;
    }
  });

  describe("createProvider (async)", () => {
    it("should create provider with string type", async () => {
      const provider = await withSuppressedDeprecationWarningsAsync(() =>
        createProvider("anthropic")
      );
      expect(provider.name).toBe("anthropic");
    });

    it("should create provider with config object", async () => {
      const provider = await withSuppressedDeprecationWarningsAsync(() =>
        createProvider({ type: "openai" })
      );
      expect(provider.name).toBe("openai");
    });

    it("should create google provider", async () => {
      const provider = await withSuppressedDeprecationWarningsAsync(() =>
        createProvider({ type: "google" })
      );
      expect(provider.name).toBe("google");
    });

    it("should throw for unknown provider type", async () => {
      await expect(
        withSuppressedDeprecationWarningsAsync(() =>
          createProvider("unknown" as unknown as ProviderConfig["type"])
        )
      ).rejects.toThrow("Unknown provider: unknown");
    });

    it("should configure provider with direct credential", async () => {
      const provider = await withSuppressedDeprecationWarningsAsync(() =>
        createProvider({
          type: "anthropic",
          credential: { type: "api_key", value: "sk-ant-api03-test" },
        })
      );
      expect(provider.name).toBe("anthropic");
      expect(provider.isConfigured?.()).toBe(true);
    });

    it("should configure provider with credentialManager", async () => {
      mockResolve.mockResolvedValue({
        ok: true,
        value: {
          id: "test-id",
          provider: "openai",
          type: "api_key",
          value: "sk-test-key",
          source: "env",
          createdAt: new Date(),
        },
      });

      const provider = await withSuppressedDeprecationWarningsAsync(() =>
        createProvider({ type: "openai" }, { credentialManager: mockCredentialManager })
      );

      expect(mockResolve).toHaveBeenCalledWith("openai");
      expect(provider.name).toBe("openai");
    });

    it("should prefer direct credential over credentialManager", async () => {
      mockResolve.mockResolvedValue({
        ok: true,
        value: {
          id: "test-id",
          provider: "anthropic",
          type: "api_key",
          value: "sk-ant-api03-from-manager",
          source: "env",
          createdAt: new Date(),
        },
      });

      const provider = await withSuppressedDeprecationWarningsAsync(() =>
        createProvider(
          {
            type: "anthropic",
            credential: { type: "api_key", value: "sk-ant-api03-direct" },
          },
          { credentialManager: mockCredentialManager }
        )
      );

      // Direct credential used, manager not called
      expect(mockResolve).not.toHaveBeenCalled();
      expect(provider.isConfigured?.()).toBe(true);
    });

    it("should handle credential not found from manager", async () => {
      mockResolve.mockResolvedValue({
        ok: true,
        value: null,
      });

      const provider = await withSuppressedDeprecationWarningsAsync(() =>
        createProvider({ type: "anthropic" }, { credentialManager: mockCredentialManager })
      );

      expect(mockResolve).toHaveBeenCalledWith("anthropic");
      expect(provider.name).toBe("anthropic");
      // Provider created but may not be configured (depends on env vars)
    });

    it("should handle credential manager error gracefully", async () => {
      mockResolve.mockResolvedValue({
        ok: false,
        error: { code: "STORE_UNAVAILABLE", message: "Store not available" },
      });

      const provider = await withSuppressedDeprecationWarningsAsync(() =>
        createProvider({ type: "google" }, { credentialManager: mockCredentialManager })
      );

      // Provider still created despite error
      expect(provider.name).toBe("google");
    });

    it("should skip credential configuration when autoConfigureCredential is false", async () => {
      mockResolve.mockResolvedValue({
        ok: true,
        value: {
          id: "test-id",
          provider: "anthropic",
          type: "api_key",
          value: "sk-ant-api03-test",
          source: "env",
          createdAt: new Date(),
        },
      });

      const provider = await withSuppressedDeprecationWarningsAsync(() =>
        createProvider(
          { type: "anthropic" },
          {
            credentialManager: mockCredentialManager,
            autoConfigureCredential: false,
          }
        )
      );

      expect(mockResolve).not.toHaveBeenCalled();
      expect(provider.name).toBe("anthropic");
    });
  });

  describe("createProviderSync", () => {
    it("should create anthropic provider", () => {
      const provider = withSuppressedDeprecationWarnings(() => createProviderSync("anthropic"));
      expect(provider.name).toBe("anthropic");
    });

    it("should create openai provider", () => {
      const provider = withSuppressedDeprecationWarnings(() => createProviderSync("openai"));
      expect(provider.name).toBe("openai");
    });

    it("should create google provider", () => {
      const provider = withSuppressedDeprecationWarnings(() => createProviderSync("google"));
      expect(provider.name).toBe("google");
    });

    it("should throw for unknown provider", () => {
      expect(() =>
        withSuppressedDeprecationWarnings(() =>
          createProviderSync("unknown" as unknown as ProviderConfig["type"])
        )
      ).toThrow("Unknown provider: unknown");
    });
  });

  describe("getProvider", () => {
    it("should return cached provider on second call", () => {
      const [provider1, provider2] = withSuppressedDeprecationWarnings(() => {
        const provider1 = getProvider("anthropic");
        const provider2 = getProvider("anthropic");
        return [provider1, provider2] as const;
      });
      expect(provider1).toBe(provider2);
    });

    it("should return different instances for different types", () => {
      const [anthropic, openai] = withSuppressedDeprecationWarnings(() => {
        const anthropic = getProvider("anthropic");
        const openai = getProvider("openai");
        return [anthropic, openai] as const;
      });
      expect(anthropic).not.toBe(openai);
      expect(anthropic.name).toBe("anthropic");
      expect(openai.name).toBe("openai");
    });
  });

  describe("clearProviderCache", () => {
    it("should clear cached providers", () => {
      const [provider1, provider2] = withSuppressedDeprecationWarnings(() => {
        const provider1 = getProvider("anthropic");
        clearProviderCache();
        const provider2 = getProvider("anthropic");
        return [provider1, provider2] as const;
      });
      expect(provider1).not.toBe(provider2);
    });
  });

  describe("integration: credential validation through factory", () => {
    it("should validate and configure anthropic with credential manager", async () => {
      mockResolve.mockResolvedValue({
        ok: true,
        value: {
          type: "api_key",
          value: "sk-ant-api03-valid-key",
        },
      });

      const provider = await withSuppressedDeprecationWarningsAsync(() =>
        createProvider({ type: "anthropic" }, { credentialManager: mockCredentialManager })
      );

      expect(provider.isConfigured?.()).toBe(true);
    });

    it("should validate and configure openai with credential manager", async () => {
      mockResolve.mockResolvedValue({
        ok: true,
        value: {
          type: "api_key",
          value: "sk-proj-valid-openai-key",
        },
      });

      const provider = await withSuppressedDeprecationWarningsAsync(() =>
        createProvider({ type: "openai" }, { credentialManager: mockCredentialManager })
      );

      expect(provider.isConfigured?.()).toBe(true);
    });

    it("should validate and configure google with credential manager", async () => {
      mockResolve.mockResolvedValue({
        ok: true,
        value: {
          type: "api_key",
          value: "AIzaSyValidGoogleKey12345678901234567",
        },
      });

      const provider = await withSuppressedDeprecationWarningsAsync(() =>
        createProvider({ type: "google" }, { credentialManager: mockCredentialManager })
      );

      expect(provider.isConfigured?.()).toBe(true);
    });

    it("should work without credential manager (backward compatibility)", async () => {
      // Provider should be created even without credential manager
      const provider = await withSuppressedDeprecationWarningsAsync(() =>
        createProvider("anthropic")
      );
      expect(provider.name).toBe("anthropic");
      // May or may not be configured depending on env vars
      expect(typeof provider.isConfigured?.()).toBe("boolean");
    });

    it("should handle rejected promise from credential manager", async () => {
      mockResolve.mockRejectedValue(new Error("Network error"));

      // Should not throw, provider should still be created
      await expect(
        withSuppressedDeprecationWarningsAsync(() =>
          createProvider({ type: "openai" }, { credentialManager: mockCredentialManager })
        )
      ).rejects.toThrow("Network error");
    });
  });
});
