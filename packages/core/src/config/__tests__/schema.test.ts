import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  AgentConfigSchema,
  ConfigSchema,
  LLMProviderSchema,
  LogLevelSchema,
  PermissionModeSchema,
  PermissionSchema,
  ProviderNameSchema,
} from "../schema.js";

describe("ProviderNameSchema", () => {
  const validProviders = [
    "anthropic",
    "openai",
    "google",
    "mistral",
    "groq",
    "xai",
    "openrouter",
    "ollama",
    "lmstudio",
    "deepseek",
    "qwen",
    "moonshot",
    "zhipu",
    "yi",
    "baichuan",
    "doubao",
    "minimax",
  ] as const;

  it.each(validProviders)("accepts valid provider: %s", (provider) => {
    expect(ProviderNameSchema.parse(provider)).toBe(provider);
  });

  it("rejects invalid provider", () => {
    expect(() => ProviderNameSchema.parse("invalid-provider")).toThrow(ZodError);
  });

  it("rejects empty string", () => {
    expect(() => ProviderNameSchema.parse("")).toThrow(ZodError);
  });

  it("rejects non-string types", () => {
    expect(() => ProviderNameSchema.parse(123)).toThrow(ZodError);
    expect(() => ProviderNameSchema.parse(null)).toThrow(ZodError);
    expect(() => ProviderNameSchema.parse(undefined)).toThrow(ZodError);
  });
});

describe("LLMProviderSchema", () => {
  describe("required fields", () => {
    it("requires provider field", () => {
      expect(() =>
        LLMProviderSchema.parse({
          model: "gpt-4",
        })
      ).toThrow(ZodError);
    });

    it("requires model field", () => {
      expect(() =>
        LLMProviderSchema.parse({
          provider: "openai",
        })
      ).toThrow(ZodError);
    });

    it("parses with only required fields", () => {
      const result = LLMProviderSchema.parse({
        provider: "anthropic",
        model: "claude-3-opus",
      });
      expect(result.provider).toBe("anthropic");
      expect(result.model).toBe("claude-3-opus");
    });
  });

  describe("optional fields", () => {
    it("accepts apiKey", () => {
      const result = LLMProviderSchema.parse({
        provider: "openai",
        model: "gpt-4",
        apiKey: "sk-test-key",
      });
      expect(result.apiKey).toBe("sk-test-key");
    });

    it("accepts baseUrl", () => {
      const result = LLMProviderSchema.parse({
        provider: "ollama",
        model: "llama2",
        baseUrl: "http://localhost:11434",
      });
      expect(result.baseUrl).toBe("http://localhost:11434");
    });
  });

  describe("defaults", () => {
    it("applies default maxTokens of 4096", () => {
      const result = LLMProviderSchema.parse({
        provider: "openai",
        model: "gpt-4",
      });
      expect(result.maxTokens).toBe(4096);
    });

    it("applies default temperature of 0.7", () => {
      const result = LLMProviderSchema.parse({
        provider: "openai",
        model: "gpt-4",
      });
      expect(result.temperature).toBe(0.7);
    });

    it("applies default timeout of 60000", () => {
      const result = LLMProviderSchema.parse({
        provider: "openai",
        model: "gpt-4",
      });
      expect(result.timeout).toBe(60000);
    });
  });

  describe("validation ranges", () => {
    it("accepts temperature at lower bound (0)", () => {
      const result = LLMProviderSchema.parse({
        provider: "openai",
        model: "gpt-4",
        temperature: 0,
      });
      expect(result.temperature).toBe(0);
    });

    it("accepts temperature at upper bound (2)", () => {
      const result = LLMProviderSchema.parse({
        provider: "openai",
        model: "gpt-4",
        temperature: 2,
      });
      expect(result.temperature).toBe(2);
    });

    it("rejects temperature below lower bound", () => {
      expect(() =>
        LLMProviderSchema.parse({
          provider: "openai",
          model: "gpt-4",
          temperature: -0.1,
        })
      ).toThrow(ZodError);
    });

    it("rejects temperature above upper bound", () => {
      expect(() =>
        LLMProviderSchema.parse({
          provider: "openai",
          model: "gpt-4",
          temperature: 2.1,
        })
      ).toThrow(ZodError);
    });

    it("accepts custom maxTokens", () => {
      const result = LLMProviderSchema.parse({
        provider: "openai",
        model: "gpt-4",
        maxTokens: 8192,
      });
      expect(result.maxTokens).toBe(8192);
    });

    it("accepts custom timeout", () => {
      const result = LLMProviderSchema.parse({
        provider: "openai",
        model: "gpt-4",
        timeout: 120000,
      });
      expect(result.timeout).toBe(120000);
    });
  });
});

describe("PermissionModeSchema", () => {
  const validModes = ["ask", "allow", "deny"] as const;

  it.each(validModes)("accepts valid mode: %s", (mode) => {
    expect(PermissionModeSchema.parse(mode)).toBe(mode);
  });

  it("rejects invalid mode", () => {
    expect(() => PermissionModeSchema.parse("invalid")).toThrow(ZodError);
  });

  it("rejects non-string types", () => {
    expect(() => PermissionModeSchema.parse(true)).toThrow(ZodError);
    expect(() => PermissionModeSchema.parse(1)).toThrow(ZodError);
  });
});

describe("PermissionSchema", () => {
  describe("defaults to 'ask' for all fields", () => {
    it("applies defaults when empty object provided", () => {
      const result = PermissionSchema.parse({});
      expect(result.fileRead).toBe("ask");
      expect(result.fileWrite).toBe("ask");
      expect(result.shellExecute).toBe("ask");
      expect(result.networkAccess).toBe("ask");
      expect(result.mcpConnect).toBe("ask");
    });
  });

  describe("custom values work", () => {
    it("accepts custom fileRead", () => {
      const result = PermissionSchema.parse({ fileRead: "allow" });
      expect(result.fileRead).toBe("allow");
    });

    it("accepts custom fileWrite", () => {
      const result = PermissionSchema.parse({ fileWrite: "deny" });
      expect(result.fileWrite).toBe("deny");
    });

    it("accepts custom shellExecute", () => {
      const result = PermissionSchema.parse({ shellExecute: "allow" });
      expect(result.shellExecute).toBe("allow");
    });

    it("accepts custom networkAccess", () => {
      const result = PermissionSchema.parse({ networkAccess: "deny" });
      expect(result.networkAccess).toBe("deny");
    });

    it("accepts custom mcpConnect", () => {
      const result = PermissionSchema.parse({ mcpConnect: "allow" });
      expect(result.mcpConnect).toBe("allow");
    });

    it("accepts all custom values", () => {
      const result = PermissionSchema.parse({
        fileRead: "allow",
        fileWrite: "allow",
        shellExecute: "deny",
        networkAccess: "deny",
        mcpConnect: "ask",
      });
      expect(result.fileRead).toBe("allow");
      expect(result.fileWrite).toBe("allow");
      expect(result.shellExecute).toBe("deny");
      expect(result.networkAccess).toBe("deny");
      expect(result.mcpConnect).toBe("ask");
    });
  });

  it("rejects invalid permission mode", () => {
    expect(() => PermissionSchema.parse({ fileRead: "always" })).toThrow(ZodError);
  });
});

describe("AgentConfigSchema", () => {
  describe("defaults work", () => {
    it("applies defaults when empty object provided", () => {
      const result = AgentConfigSchema.parse({});
      expect(result.maxToolCalls).toBe(50);
      expect(result.maxTurns).toBe(100);
      expect(result.maxRetries).toBe(3);
      expect(result.enableReasoning).toBe(false);
    });
  });

  describe("custom values work", () => {
    it("accepts custom name", () => {
      const result = AgentConfigSchema.parse({ name: "my-agent" });
      expect(result.name).toBe("my-agent");
    });

    it("accepts custom systemPrompt", () => {
      const result = AgentConfigSchema.parse({
        systemPrompt: "You are a helpful assistant",
      });
      expect(result.systemPrompt).toBe("You are a helpful assistant");
    });

    it("accepts custom maxToolCalls", () => {
      const result = AgentConfigSchema.parse({ maxToolCalls: 100 });
      expect(result.maxToolCalls).toBe(100);
    });

    it("accepts custom maxTurns", () => {
      const result = AgentConfigSchema.parse({ maxTurns: 200 });
      expect(result.maxTurns).toBe(200);
    });

    it("accepts custom maxRetries", () => {
      const result = AgentConfigSchema.parse({ maxRetries: 5 });
      expect(result.maxRetries).toBe(5);
    });

    it("accepts custom enableReasoning", () => {
      const result = AgentConfigSchema.parse({ enableReasoning: true });
      expect(result.enableReasoning).toBe(true);
    });

    it("accepts all custom values", () => {
      const result = AgentConfigSchema.parse({
        name: "custom-agent",
        systemPrompt: "Custom prompt",
        maxToolCalls: 25,
        maxTurns: 50,
        maxRetries: 10,
        enableReasoning: true,
      });
      expect(result.name).toBe("custom-agent");
      expect(result.systemPrompt).toBe("Custom prompt");
      expect(result.maxToolCalls).toBe(25);
      expect(result.maxTurns).toBe(50);
      expect(result.maxRetries).toBe(10);
      expect(result.enableReasoning).toBe(true);
    });
  });

  it("rejects non-number for maxToolCalls", () => {
    expect(() => AgentConfigSchema.parse({ maxToolCalls: "50" })).toThrow(ZodError);
  });

  it("rejects non-boolean for enableReasoning", () => {
    expect(() => AgentConfigSchema.parse({ enableReasoning: "true" })).toThrow(ZodError);
  });
});

describe("LogLevelSchema", () => {
  const validLevels = ["debug", "info", "warn", "error"] as const;

  it.each(validLevels)("accepts valid level: %s", (level) => {
    expect(LogLevelSchema.parse(level)).toBe(level);
  });

  it("rejects invalid level", () => {
    expect(() => LogLevelSchema.parse("trace")).toThrow(ZodError);
    expect(() => LogLevelSchema.parse("fatal")).toThrow(ZodError);
  });
});

describe("ConfigSchema", () => {
  const minimalValidConfig = {
    llm: {
      provider: "anthropic" as const,
      model: "claude-3-opus",
    },
  };

  describe("complete config validates", () => {
    it("parses complete config with all fields", () => {
      const result = ConfigSchema.parse({
        llm: {
          provider: "openai",
          model: "gpt-4",
          apiKey: "sk-test",
          baseUrl: "https://api.openai.com",
          maxTokens: 8192,
          temperature: 1.0,
          timeout: 30000,
        },
        agent: {
          name: "test-agent",
          systemPrompt: "You are helpful",
          maxToolCalls: 100,
          maxTurns: 200,
          maxRetries: 5,
          enableReasoning: true,
        },
        permissions: {
          fileRead: "allow",
          fileWrite: "ask",
          shellExecute: "deny",
          networkAccess: "allow",
          mcpConnect: "ask",
        },
        workingDir: "/home/user/project",
        debug: true,
        logLevel: "debug",
      });

      expect(result.llm.provider).toBe("openai");
      expect(result.llm.model).toBe("gpt-4");
      expect(result.llm.maxTokens).toBe(8192);
      expect(result.agent?.name).toBe("test-agent");
      expect(result.agent?.enableReasoning).toBe(true);
      expect(result.permissions?.fileRead).toBe("allow");
      expect(result.permissions?.shellExecute).toBe("deny");
      expect(result.workingDir).toBe("/home/user/project");
      expect(result.debug).toBe(true);
      expect(result.logLevel).toBe("debug");
    });
  });

  describe("partial configs work", () => {
    it("parses with only llm config", () => {
      const result = ConfigSchema.parse(minimalValidConfig);
      expect(result.llm.provider).toBe("anthropic");
      expect(result.llm.model).toBe("claude-3-opus");
    });

    it("parses with llm and partial agent", () => {
      const result = ConfigSchema.parse({
        ...minimalValidConfig,
        agent: { name: "partial-agent" },
      });
      expect(result.agent?.name).toBe("partial-agent");
      expect(result.agent?.maxToolCalls).toBe(50);
    });

    it("parses with llm and partial permissions", () => {
      const result = ConfigSchema.parse({
        ...minimalValidConfig,
        permissions: { fileRead: "allow" },
      });
      expect(result.permissions?.fileRead).toBe("allow");
      expect(result.permissions?.fileWrite).toBe("ask");
    });
  });

  describe("defaults applied", () => {
    it("applies default agent config", () => {
      const result = ConfigSchema.parse({
        ...minimalValidConfig,
        agent: {},
      });
      expect(result.agent).toBeDefined();
      expect(result.agent?.maxToolCalls).toBe(50);
      expect(result.agent?.maxTurns).toBe(100);
      expect(result.agent?.maxRetries).toBe(3);
      expect(result.agent?.enableReasoning).toBe(false);
    });

    it("applies default permissions config", () => {
      const result = ConfigSchema.parse({
        ...minimalValidConfig,
        permissions: {},
      });
      expect(result.permissions).toBeDefined();
      expect(result.permissions?.fileRead).toBe("ask");
      expect(result.permissions?.fileWrite).toBe("ask");
      expect(result.permissions?.shellExecute).toBe("ask");
      expect(result.permissions?.networkAccess).toBe("ask");
      expect(result.permissions?.mcpConnect).toBe("ask");
    });

    it("applies default debug of false", () => {
      const result = ConfigSchema.parse(minimalValidConfig);
      expect(result.debug).toBe(false);
    });

    it("applies default logLevel of 'info'", () => {
      const result = ConfigSchema.parse(minimalValidConfig);
      expect(result.logLevel).toBe("info");
    });

    it("applies default llm fields", () => {
      const result = ConfigSchema.parse(minimalValidConfig);
      expect(result.llm.maxTokens).toBe(4096);
      expect(result.llm.temperature).toBe(0.7);
      expect(result.llm.timeout).toBe(60000);
    });
  });

  describe("validation errors on invalid data", () => {
    it("rejects missing llm config", () => {
      expect(() => ConfigSchema.parse({})).toThrow(ZodError);
    });

    it("rejects invalid provider in llm", () => {
      expect(() =>
        ConfigSchema.parse({
          llm: { provider: "invalid", model: "test" },
        })
      ).toThrow(ZodError);
    });

    it("rejects invalid logLevel", () => {
      expect(() =>
        ConfigSchema.parse({
          ...minimalValidConfig,
          logLevel: "invalid",
        })
      ).toThrow(ZodError);
    });

    it("rejects invalid permission mode", () => {
      expect(() =>
        ConfigSchema.parse({
          ...minimalValidConfig,
          permissions: { fileRead: "invalid" },
        })
      ).toThrow(ZodError);
    });

    it("rejects temperature out of range", () => {
      expect(() =>
        ConfigSchema.parse({
          llm: {
            provider: "openai",
            model: "gpt-4",
            temperature: 3,
          },
        })
      ).toThrow(ZodError);
    });

    it("provides descriptive error messages", () => {
      try {
        ConfigSchema.parse({
          llm: { provider: "invalid-provider", model: "test" },
        });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.issues.length).toBeGreaterThan(0);
        expect(zodError.issues[0]?.path).toContain("provider");
      }
    });
  });
});
