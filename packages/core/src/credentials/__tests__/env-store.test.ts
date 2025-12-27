/**
 * Unit tests for EnvCredentialStore
 *
 * Tests environment variable credential resolution, read-only enforcement,
 * and listing/existence checking functionality.
 *
 * @see packages/core/src/credentials/stores/env-store.ts
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EnvCredentialStore } from "../stores/env-store.js";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Helper to save and restore environment variables
 */
function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => Promise<void> | void
): () => Promise<void> {
  return async () => {
    const saved: Record<string, string | undefined> = {};

    // Save and set
    for (const [key, value] of Object.entries(vars)) {
      saved[key] = process.env[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    try {
      await fn();
    } finally {
      // Restore
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  };
}

// =============================================================================
// EnvCredentialStore Tests
// =============================================================================

describe("EnvCredentialStore", () => {
  let store: EnvCredentialStore;

  // Store original env vars to restore after tests
  const originalEnv: Record<string, string | undefined> = {};
  const testEnvVars = [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_AI_API_KEY",
    "GEMINI_API_KEY",
    "AZURE_OPENAI_API_KEY",
    "MISTRAL_API_KEY",
    "CUSTOM_API_KEY",
    "XAI_API_KEY",
    "UNKNOWN_PROVIDER_API_KEY",
  ];

  beforeEach(() => {
    store = new EnvCredentialStore();

    // Save original values
    for (const key of testEnvVars) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    // Restore original values
    for (const key of testEnvVars) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  // ===========================================================================
  // Store Properties
  // ===========================================================================

  describe("Store Properties", () => {
    it("should have name 'env'", () => {
      expect(store.name).toBe("env");
    });

    it("should have priority 90", () => {
      expect(store.priority).toBe(90);
    });

    it("should be read-only", () => {
      expect(store.readOnly).toBe(true);
    });
  });

  // ===========================================================================
  // isAvailable()
  // ===========================================================================

  describe("isAvailable()", () => {
    it("should always return true", async () => {
      const result = await store.isAvailable();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(true);
      }
    });
  });

  // ===========================================================================
  // get() - Provider Resolution
  // ===========================================================================

  describe("get() - Provider Resolution", () => {
    it(
      "should resolve ANTHROPIC_API_KEY for anthropic provider",
      withEnv({ ANTHROPIC_API_KEY: "sk-ant-test-key-12345" }, async () => {
        const result = await store.get("anthropic");

        expect(result.ok).toBe(true);
        if (result.ok && result.value) {
          expect(result.value.provider).toBe("anthropic");
          expect(result.value.value).toBe("sk-ant-test-key-12345");
          expect(result.value.source).toBe("env");
          expect(result.value.type).toBe("api_key");
          expect(result.value.id).toBe("env:anthropic:ANTHROPIC_API_KEY");
          expect(result.value.metadata?.tags?.envVar).toBe("ANTHROPIC_API_KEY");
        }
      })
    );

    it(
      "should resolve OPENAI_API_KEY for openai provider",
      withEnv({ OPENAI_API_KEY: "sk-openai-test-key-67890" }, async () => {
        const result = await store.get("openai");

        expect(result.ok).toBe(true);
        if (result.ok && result.value) {
          expect(result.value.provider).toBe("openai");
          expect(result.value.value).toBe("sk-openai-test-key-67890");
          expect(result.value.source).toBe("env");
        }
      })
    );

    it(
      "should resolve GOOGLE_API_KEY for google provider",
      withEnv({ GOOGLE_API_KEY: "google-test-key-abc123" }, async () => {
        const result = await store.get("google");

        expect(result.ok).toBe(true);
        if (result.ok && result.value) {
          expect(result.value.provider).toBe("google");
          expect(result.value.value).toBe("google-test-key-abc123");
        }
      })
    );

    it(
      "should check alternative env vars for google provider",
      withEnv({ GEMINI_API_KEY: "gemini-test-key-xyz" }, async () => {
        const result = await store.get("google");

        expect(result.ok).toBe(true);
        if (result.ok && result.value) {
          expect(result.value.provider).toBe("google");
          expect(result.value.value).toBe("gemini-test-key-xyz");
          expect(result.value.metadata?.tags?.envVar).toBe("GEMINI_API_KEY");
        }
      })
    );

    it(
      "should prioritize first env var when multiple are set",
      withEnv(
        {
          GOOGLE_API_KEY: "primary-key",
          GOOGLE_AI_API_KEY: "secondary-key",
          GEMINI_API_KEY: "tertiary-key",
        },
        async () => {
          const result = await store.get("google");

          expect(result.ok).toBe(true);
          if (result.ok && result.value) {
            // Should use first in the list (GOOGLE_API_KEY)
            expect(result.value.value).toBe("primary-key");
            expect(result.value.metadata?.tags?.envVar).toBe("GOOGLE_API_KEY");
          }
        }
      )
    );

    it(
      "should use generic pattern for unknown providers",
      withEnv({ UNKNOWN_PROVIDER_API_KEY: "unknown-key" }, async () => {
        const result = await store.get("unknown_provider");

        expect(result.ok).toBe(true);
        if (result.ok && result.value) {
          expect(result.value.provider).toBe("unknown_provider");
          expect(result.value.value).toBe("unknown-key");
        }
      })
    );

    it("should return null when env var not set", async () => {
      const result = await store.get("anthropic");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it("should return null for unknown provider with no env var", async () => {
      const result = await store.get("nonexistent_provider");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it(
      "should handle case-insensitive provider names",
      withEnv({ ANTHROPIC_API_KEY: "case-test-key" }, async () => {
        const result = await store.get("ANTHROPIC");

        expect(result.ok).toBe(true);
        if (result.ok && result.value) {
          expect(result.value.value).toBe("case-test-key");
        }
      })
    );
  });

  // ===========================================================================
  // get() - Specific Key Override
  // ===========================================================================

  describe("get() - Specific Key Override", () => {
    it(
      "should use specific key when provided",
      withEnv({ CUSTOM_API_KEY: "custom-value" }, async () => {
        const result = await store.get("anthropic", "CUSTOM_API_KEY");

        expect(result.ok).toBe(true);
        if (result.ok && result.value) {
          expect(result.value.provider).toBe("anthropic");
          expect(result.value.value).toBe("custom-value");
          expect(result.value.metadata?.tags?.envVar).toBe("CUSTOM_API_KEY");
        }
      })
    );

    it("should return null when specific key not set", async () => {
      const result = await store.get("anthropic", "NONEXISTENT_KEY");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });
  });

  // ===========================================================================
  // set() - Read-Only Enforcement
  // ===========================================================================

  describe("set() - Read-Only Enforcement", () => {
    it("should return READ_ONLY error when setting credential", async () => {
      const credential = {
        id: "test-id",
        provider: "anthropic",
        type: "api_key" as const,
        value: "test-value",
        source: "env" as const,
        createdAt: new Date(),
      };

      const result = await store.set(credential);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("READ_ONLY");
        expect(result.error.store).toBe("env");
        expect(result.error.message).toContain("read-only");
      }
    });
  });

  // ===========================================================================
  // delete() - Read-Only Enforcement
  // ===========================================================================

  describe("delete() - Read-Only Enforcement", () => {
    it("should return READ_ONLY error when deleting credential", async () => {
      const result = await store.delete("anthropic");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("READ_ONLY");
        expect(result.error.store).toBe("env");
        expect(result.error.message).toContain("read-only");
      }
    });

    it("should return READ_ONLY error when deleting with specific key", async () => {
      const result = await store.delete("anthropic", "ANTHROPIC_API_KEY");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("READ_ONLY");
      }
    });
  });

  // ===========================================================================
  // list()
  // ===========================================================================

  describe("list()", () => {
    it(
      "should list all set environment credentials",
      withEnv(
        {
          ANTHROPIC_API_KEY: "ant-key-123456789",
          OPENAI_API_KEY: "openai-key-987654321",
        },
        async () => {
          const result = await store.list();

          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.value.length).toBeGreaterThanOrEqual(2);

            const providers = result.value.map((ref) => ref.provider);
            expect(providers).toContain("anthropic");
            expect(providers).toContain("openai");

            // Values should be masked (no 'value' property)
            const anthropicRef = result.value.find((r) => r.provider === "anthropic");
            expect(anthropicRef).toBeDefined();
            expect((anthropicRef as Record<string, unknown>).value).toBeUndefined();
            expect(anthropicRef?.maskedHint).toBeDefined();
          }
        }
      )
    );

    it("should return empty array when no env vars set", async () => {
      const result = await store.list();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    it(
      "should filter by provider when specified",
      withEnv(
        {
          ANTHROPIC_API_KEY: "ant-key",
          OPENAI_API_KEY: "openai-key",
        },
        async () => {
          const result = await store.list("anthropic");

          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.value.length).toBe(1);
            expect(result.value[0].provider).toBe("anthropic");
          }
        }
      )
    );

    it("should return empty array when provider not found", async () => {
      const result = await store.list("nonexistent");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });
  });

  // ===========================================================================
  // exists()
  // ===========================================================================

  describe("exists()", () => {
    it(
      "should return true when credential exists",
      withEnv({ ANTHROPIC_API_KEY: "test-key" }, async () => {
        const result = await store.exists("anthropic");

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toBe(true);
        }
      })
    );

    it("should return false when credential does not exist", async () => {
      const result = await store.exists("anthropic");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false);
      }
    });

    it(
      "should check specific key when provided",
      withEnv({ CUSTOM_API_KEY: "custom-value" }, async () => {
        const existsWithKey = await store.exists("anthropic", "CUSTOM_API_KEY");
        const existsWithoutKey = await store.exists("anthropic");

        expect(existsWithKey.ok).toBe(true);
        expect(existsWithoutKey.ok).toBe(true);

        if (existsWithKey.ok && existsWithoutKey.ok) {
          expect(existsWithKey.value).toBe(true);
          expect(existsWithoutKey.value).toBe(false);
        }
      })
    );
  });

  // ===========================================================================
  // Credential Format
  // ===========================================================================

  describe("Credential Format", () => {
    it(
      "should generate correct masked hint",
      withEnv({ ANTHROPIC_API_KEY: "sk-ant-api03-ABCDEFGHIJKLMN" }, async () => {
        const result = await store.list();

        expect(result.ok).toBe(true);
        if (result.ok) {
          const ref = result.value.find((r) => r.provider === "anthropic");
          expect(ref?.maskedHint).toBe("sk-...LMN");
        }
      })
    );

    it(
      "should use '***' for short values",
      withEnv({ ANTHROPIC_API_KEY: "short" }, async () => {
        const result = await store.list();

        expect(result.ok).toBe(true);
        if (result.ok) {
          const ref = result.value.find((r) => r.provider === "anthropic");
          expect(ref?.maskedHint).toBe("***");
        }
      })
    );

    it(
      "should have correct metadata in credential",
      withEnv({ XAI_API_KEY: "xai-test-key" }, async () => {
        const result = await store.get("xai");

        expect(result.ok).toBe(true);
        if (result.ok && result.value) {
          expect(result.value.metadata?.label).toContain("XAI_API_KEY");
          expect(result.value.metadata?.label).toContain("environment variable");
          expect(result.value.createdAt).toBeInstanceOf(Date);
        }
      })
    );
  });
});
