/**
 * Tests for /model command (Chain 22)
 *
 * Tests 5 input scenarios:
 * 1. /model (no args) - show current model and options
 * 2. /model anthropic/claude-sonnet-5-5 (single arg with /) - switch model
 * 3. /model anthropic claude-sonnet-5-5 (two args) - switch model from autocomplete
 * 4. /model google (provider only) - show provider's available models
 * 5. /model invalid-provider - error for unknown provider
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { modelCommand, setModelCommandConfig } from "../model.js";
import type { CommandContext, CommandError, CommandResult, CommandSuccess } from "../types.js";

// Mock @vellum/provider
vi.mock("@vellum/provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vellum/provider")>()),
  getSupportedProviders: () => ["anthropic", "openai", "google", "ollama", "lmstudio"],
  getProviderModels: (provider: string) => {
    const models: Record<
      string,
      Array<{
        id: string;
        name: string;
        contextWindow: number;
        inputPrice?: number;
        outputPrice?: number;
      }>
    > = {
      anthropic: [
        {
          id: "claude-sonnet-5-5",
          name: "Claude Sonnet 5.5",
          contextWindow: 200000,
          inputPrice: 3,
          outputPrice: 15,
        },
        {
          id: "claude-haiku-3.5",
          name: "Claude Haiku 3.5",
          contextWindow: 200000,
          inputPrice: 0.25,
          outputPrice: 1.25,
        },
      ],
      openai: [
        { id: "gpt-4o", name: "GPT-4o", contextWindow: 128000, inputPrice: 2.5, outputPrice: 10 },
      ],
      google: [
        {
          id: "gemini-2.0-flash",
          name: "Gemini 2.0 Flash",
          contextWindow: 1000000,
          inputPrice: 0.1,
          outputPrice: 0.4,
        },
        {
          id: "gemini-2.0-pro",
          name: "Gemini 2.0 Pro",
          contextWindow: 2000000,
          inputPrice: 1.25,
          outputPrice: 5,
        },
      ],
    };
    return models[provider] ?? [];
  },
  getModelInfo: (provider: string, modelId: string) => {
    const allModels: Record<
      string,
      Record<
        string,
        {
          id: string;
          name: string;
          contextWindow: number;
          inputPrice?: number;
          outputPrice?: number;
        }
      >
    > = {
      anthropic: {
        "claude-sonnet-5-5": {
          id: "claude-sonnet-5-5",
          name: "Claude Sonnet 5.5",
          contextWindow: 200000,
          inputPrice: 3,
          outputPrice: 15,
        },
      },
      openai: {
        "gpt-4o": {
          id: "gpt-4o",
          name: "GPT-4o",
          contextWindow: 128000,
          inputPrice: 2.5,
          outputPrice: 10,
        },
      },
      google: {
        "gemini-2.0-flash": {
          id: "gemini-2.0-flash",
          name: "Gemini 2.0 Flash",
          contextWindow: 1000000,
          inputPrice: 0.1,
          outputPrice: 0.4,
        },
      },
    };
    return allModels[provider]?.[modelId] ?? { id: modelId, name: modelId, contextWindow: 128000 };
  },
}));

function createMockContext(positionalArgs: (string | undefined)[]): CommandContext {
  const raw = `/model ${positionalArgs.filter(Boolean).join(" ")}`.trim();
  return {
    session: {
      id: "test-session",
      provider: "anthropic",
      cwd: "/test",
    },
    credentials: {
      resolve: vi.fn().mockResolvedValue({ ok: true, value: { value: "test-api-key" } }),
      store: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
      exists: vi.fn(),
      getStoreAvailability: vi.fn(),
    } as unknown as CommandContext["credentials"],
    toolRegistry: {
      get: vi.fn(),
      list: vi.fn(),
    } as unknown as CommandContext["toolRegistry"],
    parsedArgs: {
      command: "model",
      positional: positionalArgs,
      named: {},
      raw,
    },
    emit: vi.fn(),
  };
}

function isSuccess(result: CommandResult): result is CommandSuccess {
  return result.kind === "success";
}

function isError(result: CommandResult): result is CommandError {
  return result.kind === "error";
}

describe("/model command", () => {
  let onModelChangeMock: (provider: string, model: string) => void;

  beforeEach(() => {
    onModelChangeMock = vi.fn();
    setModelCommandConfig("anthropic", "claude-sonnet-5-5", onModelChangeMock);
  });

  describe("Scenario 1: /model (no args)", () => {
    it("should show current model and available options", async () => {
      const ctx = createMockContext([]);
      const result = await modelCommand.execute(ctx);

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.message).toContain("AI Models");
        expect(result.message).toContain("Current:");
        expect(result.message).toContain("Available models:");
        expect(result.message).toContain("anthropic");
        expect(result.message).toContain("openai");
        expect(result.message).toContain("google");
      }
    });
  });

  describe("Scenario 2: /model anthropic/claude-sonnet-5-5 (single arg with /)", () => {
    it("should switch to specified model with provider/model format", async () => {
      // Set different current model first
      setModelCommandConfig("openai", "gpt-4o", onModelChangeMock);

      const ctx = createMockContext(["anthropic/claude-sonnet-5-5"]);
      const result = await modelCommand.execute(ctx);

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.message).toContain("Switched to");
        expect(result.message).toContain("Claude Sonnet 5.5");
      }
      expect(onModelChangeMock).toHaveBeenCalledWith("anthropic", "claude-sonnet-5-5");
    });

    it("should report already using if same model", async () => {
      const ctx = createMockContext(["anthropic/claude-sonnet-5-5"]);
      const result = await modelCommand.execute(ctx);

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.message).toContain("Already using");
      }
    });
  });

  describe("Scenario 3: /model anthropic claude-sonnet-5-5 (two args from autocomplete)", () => {
    it("should switch to model when provider and model are separate args", async () => {
      // Set different current model first
      setModelCommandConfig("google", "gemini-2.0-flash", onModelChangeMock);

      const ctx = createMockContext(["anthropic", "claude-sonnet-5-5"]);
      const result = await modelCommand.execute(ctx);

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.message).toContain("Switched to");
        expect(result.message).toContain("Claude Sonnet 5.5");
      }
      expect(onModelChangeMock).toHaveBeenCalledWith("anthropic", "claude-sonnet-5-5");
    });
  });

  describe("Scenario 4: /model google (provider only)", () => {
    it("should show available models for the specified provider", async () => {
      const ctx = createMockContext(["google"]);
      const result = await modelCommand.execute(ctx);

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.message).toContain("google Models");
        expect(result.message).toContain("Gemini 2.0 Flash");
        expect(result.message).toContain("Gemini 2.0 Pro");
        expect(result.message).toContain("Usage: /model google/<model-id>");
        expect(result.message).toContain("Example: /model google/gemini-2.0-flash");
      }
    });
  });

  describe("Scenario 5: /model invalid-provider (unknown provider)", () => {
    it("should return error for unknown provider", async () => {
      const ctx = createMockContext(["invalid-provider"]);
      const result = await modelCommand.execute(ctx);

      expect(isError(result)).toBe(true);
      if (isError(result)) {
        expect(result.message).toContain("Unknown provider: invalid-provider");
      }
    });

    it("should return error for invalid format without /", async () => {
      const ctx = createMockContext(["notaprovider"]);
      const result = await modelCommand.execute(ctx);

      expect(isError(result)).toBe(true);
      if (isError(result)) {
        expect(result.message).toContain("Unknown provider");
      }
    });
  });

  describe("Edge cases", () => {
    it("does not claim a switch when the active runtime rejects it", async () => {
      setModelCommandConfig("anthropic", "claude-sonnet-5-5", async () => {
        throw new Error("Finish the current task before changing models.");
      });
      const result = await modelCommand.execute(createMockContext(["openai/gpt-4o"]));
      expect(result.kind).toBe("error");
      if (result.kind === "error") expect(result.message).toContain("Finish the current task");
    });

    it("offers masked key entry before selecting a provider without credentials", async () => {
      const ctx = createMockContext(["openai/gpt-4o"]);
      vi.mocked(ctx.credentials.resolve).mockResolvedValue({ ok: true, value: null });
      vi.mocked(ctx.credentials.exists).mockResolvedValue({ ok: true, value: false });

      const result = await modelCommand.execute(ctx);

      expect(result.kind).toBe("interactive");
      if (result.kind === "interactive") {
        expect(result.prompt.inputType).toBe("password");
        expect(result.prompt.provider).toBe("openai");
      }
      expect(onModelChangeMock).not.toHaveBeenCalled();
    });

    it("selects the requested model after its key is saved without echoing the key", async () => {
      const ctx = createMockContext(["openai/gpt-4o"]);
      vi.mocked(ctx.credentials.resolve).mockResolvedValueOnce({ ok: true, value: null });
      vi.mocked(ctx.credentials.exists).mockResolvedValue({ ok: true, value: false });
      vi.mocked(ctx.credentials.store).mockResolvedValue({
        ok: true,
        value: {
          id: "test",
          provider: "openai",
          value: "test-secret",
          type: "api_key",
          source: "keychain",
          metadata: {},
          createdAt: new Date(),
        },
      });
      const result = await modelCommand.execute(ctx);
      expect(result.kind).toBe("interactive");
      if (result.kind !== "interactive") return;
      const saved = await result.prompt.handler("test-secret");
      expect(saved.kind).toBe("success");
      expect(JSON.stringify(saved)).not.toContain("test-secret");
      expect(onModelChangeMock).toHaveBeenCalledWith("openai", "gpt-4o");
    });

    it("keeps selection unchanged when saving the key fails or setup is cancelled", async () => {
      const ctx = createMockContext(["openai/gpt-4o"]);
      vi.mocked(ctx.credentials.resolve).mockResolvedValue({ ok: true, value: null });
      vi.mocked(ctx.credentials.exists).mockResolvedValue({ ok: true, value: false });
      vi.mocked(ctx.credentials.store).mockResolvedValue({
        ok: false,
        error: { code: "STORE_UNAVAILABLE", message: "Storage unavailable", store: "keychain" },
      });
      const result = await modelCommand.execute(ctx);
      expect(result.kind).toBe("interactive");
      if (result.kind !== "interactive") return;
      expect((await result.prompt.handler("test-secret")).kind).toBe("error");
      expect(result.prompt.onCancel?.().kind).toBe("error");
      expect(onModelChangeMock).not.toHaveBeenCalled();
    });

    it("checks credentials even when selecting the current model", async () => {
      const ctx = createMockContext(["anthropic/claude-sonnet-5-5"]);
      vi.mocked(ctx.credentials.resolve).mockResolvedValue({ ok: true, value: null });
      vi.mocked(ctx.credentials.exists).mockResolvedValue({ ok: true, value: false });
      expect((await modelCommand.execute(ctx)).kind).toBe("interactive");
    });

    it("does not require a key for a local model", async () => {
      const ctx = createMockContext(["ollama/local-model"]);
      expect((await modelCommand.execute(ctx)).kind).toBe("success");
      expect(ctx.credentials.resolve).not.toHaveBeenCalled();
      expect(onModelChangeMock).toHaveBeenCalledWith("ollama", "local-model");
    });

    it("should handle empty provider in two-arg format", async () => {
      const ctx = createMockContext(["", "model-id"]);
      const result = await modelCommand.execute(ctx);

      // Empty string is falsy, so first condition fails, falls through to show info
      expect(isSuccess(result)).toBe(true);
    });

    it("should handle model with / in name (e.g., org/model)", async () => {
      const ctx = createMockContext(["anthropic/some/nested/model"]);
      const result = await modelCommand.execute(ctx);

      // Should handle nested / in model name
      expect(isSuccess(result)).toBe(true);
      expect(onModelChangeMock).toHaveBeenCalledWith("anthropic", "some/nested/model");
    });
  });
});
