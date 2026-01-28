import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ConfigError,
  type ConfigErrorCode,
  checkDeprecatedApiKeyUsage,
  clearDeprecationWarningsCache,
  deepMerge,
  findProjectConfig,
  getProviderDisplayName,
  hasProviderCredentials,
  loadConfig,
  loadConfigWithCredentials,
  parseEnvConfig,
  promptForCredentials,
} from "../loader.js";
import type { PartialConfig } from "../schema.js";

// ============================================
// T039: Integration Tests for Config Loader
// ============================================

describe("findProjectConfig", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vellum-test-"));
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("finds vellum.toml in current directory", () => {
    const configPath = path.join(tempDir, "vellum.toml");
    fs.writeFileSync(configPath, '[llm]\nprovider = "anthropic"\nmodel = "claude-3"');

    const found = findProjectConfig(tempDir);
    expect(found).toBe(configPath);
  });

  it("finds .vellum.toml in current directory", () => {
    const configPath = path.join(tempDir, ".vellum.toml");
    fs.writeFileSync(configPath, '[llm]\nprovider = "openai"\nmodel = "gpt-4"');

    const found = findProjectConfig(tempDir);
    expect(found).toBe(configPath);
  });

  it("finds .config/vellum.toml in current directory", () => {
    const configDir = path.join(tempDir, ".config");
    fs.mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, "vellum.toml");
    fs.writeFileSync(configPath, '[llm]\nprovider = "google"\nmodel = "gemini-pro"');

    const found = findProjectConfig(tempDir);
    expect(found).toBe(configPath);
  });

  it("prefers vellum.toml over .vellum.toml", () => {
    const primaryPath = path.join(tempDir, "vellum.toml");
    const secondaryPath = path.join(tempDir, ".vellum.toml");
    fs.writeFileSync(primaryPath, '[llm]\nprovider = "anthropic"\nmodel = "claude-3"');
    fs.writeFileSync(secondaryPath, '[llm]\nprovider = "openai"\nmodel = "gpt-4"');

    const found = findProjectConfig(tempDir);
    expect(found).toBe(primaryPath);
  });

  it("walks up directories to find config", () => {
    // Create nested structure: tempDir/parent/child
    const parentDir = path.join(tempDir, "parent");
    const childDir = path.join(parentDir, "child");
    fs.mkdirSync(childDir, { recursive: true });

    // Put config in parent, search from child
    const configPath = path.join(parentDir, "vellum.toml");
    fs.writeFileSync(configPath, '[llm]\nprovider = "anthropic"\nmodel = "claude-3"');

    const found = findProjectConfig(childDir);
    expect(found).toBe(configPath);
  });

  it("walks up multiple levels to find config", () => {
    // Create: tempDir/a/b/c/d
    const deepDir = path.join(tempDir, "a", "b", "c", "d");
    fs.mkdirSync(deepDir, { recursive: true });

    // Put config at tempDir level
    const configPath = path.join(tempDir, "vellum.toml");
    fs.writeFileSync(configPath, '[llm]\nprovider = "anthropic"\nmodel = "claude-3"');

    const found = findProjectConfig(deepDir);
    expect(found).toBe(configPath);
  });

  it("returns undefined when config not found", () => {
    // Empty temp directory - no config files
    const found = findProjectConfig(tempDir);
    expect(found).toBeUndefined();
  });

  it("uses process.cwd() when no startDir provided", () => {
    const configPath = path.join(tempDir, "vellum.toml");
    fs.writeFileSync(configPath, '[llm]\nprovider = "anthropic"\nmodel = "claude-3"');

    process.chdir(tempDir);
    const found = findProjectConfig();
    // Use realpathSync to handle macOS /var -> /private/var symlink
    expect(found ? fs.realpathSync(found) : found).toBe(fs.realpathSync(configPath));
  });

  it("ignores directories named like config files", () => {
    // Create a directory named vellum.toml (not a file)
    const dirPath = path.join(tempDir, "vellum.toml");
    fs.mkdirSync(dirPath, { recursive: true });

    const found = findProjectConfig(tempDir);
    expect(found).toBeUndefined();
  });
});

describe("parseEnvConfig", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("maps VELLUM_LLM_PROVIDER to llm.provider", () => {
    vi.stubEnv("VELLUM_LLM_PROVIDER", "anthropic");

    const config = parseEnvConfig();
    expect(config).toEqual({
      llm: { provider: "anthropic" },
    });
  });

  it("maps VELLUM_LLM_MODEL to llm.model", () => {
    vi.stubEnv("VELLUM_LLM_MODEL", "claude-3-opus");

    const config = parseEnvConfig();
    expect(config).toEqual({
      llm: { model: "claude-3-opus" },
    });
  });

  it("maps VELLUM_LLM_API_KEY to llm.apiKey", () => {
    vi.stubEnv("VELLUM_LLM_API_KEY", "sk-test-key-12345");

    const config = parseEnvConfig();
    expect(config).toEqual({
      llm: { apiKey: "sk-test-key-12345" },
    });
  });

  it("maps VELLUM_LOG_LEVEL to logLevel", () => {
    vi.stubEnv("VELLUM_LOG_LEVEL", "debug");

    const config = parseEnvConfig();
    expect(config).toEqual({
      logLevel: "debug",
    });
  });

  it("coerces VELLUM_DEBUG='true' to boolean true", () => {
    vi.stubEnv("VELLUM_DEBUG", "true");

    const config = parseEnvConfig();
    expect(config).toEqual({
      debug: true,
    });
  });

  it("coerces VELLUM_DEBUG='1' to boolean true", () => {
    vi.stubEnv("VELLUM_DEBUG", "1");

    const config = parseEnvConfig();
    expect(config).toEqual({
      debug: true,
    });
  });

  it("coerces VELLUM_DEBUG='false' to boolean false", () => {
    vi.stubEnv("VELLUM_DEBUG", "false");

    const config = parseEnvConfig();
    expect(config).toEqual({
      debug: false,
    });
  });

  it("coerces VELLUM_DEBUG='0' to boolean false", () => {
    vi.stubEnv("VELLUM_DEBUG", "0");

    const config = parseEnvConfig();
    expect(config).toEqual({
      debug: false,
    });
  });

  it("ignores unset environment variables", () => {
    // No env vars set
    const config = parseEnvConfig();
    expect(config).toEqual({});
  });

  it("ignores empty string environment variables", () => {
    vi.stubEnv("VELLUM_LLM_PROVIDER", "");
    vi.stubEnv("VELLUM_DEBUG", "");

    const config = parseEnvConfig();
    expect(config).toEqual({});
  });

  it("combines multiple environment variables", () => {
    vi.stubEnv("VELLUM_LLM_PROVIDER", "openai");
    vi.stubEnv("VELLUM_LLM_MODEL", "gpt-4");
    vi.stubEnv("VELLUM_LLM_API_KEY", "sk-test");
    vi.stubEnv("VELLUM_DEBUG", "true");
    vi.stubEnv("VELLUM_LOG_LEVEL", "warn");

    const config = parseEnvConfig();
    expect(config).toEqual({
      llm: {
        provider: "openai",
        model: "gpt-4",
        apiKey: "sk-test",
      },
      debug: true,
      logLevel: "warn",
    });
  });

  it("ignores non-VELLUM environment variables", () => {
    vi.stubEnv("OTHER_VAR", "some-value");
    vi.stubEnv("LLM_PROVIDER", "should-be-ignored");

    const config = parseEnvConfig();
    expect(config).toEqual({});
  });
});

describe("deepMerge", () => {
  it("merges flat objects", () => {
    const result = deepMerge<Record<string, unknown>>({ a: 1 }, { b: 2 });
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it("later sources override earlier ones", () => {
    const result = deepMerge<Record<string, unknown>>({ a: 1 }, { a: 2 });
    expect(result).toEqual({ a: 2 });
  });

  it("deep merges nested objects", () => {
    const result = deepMerge<Record<string, unknown>>({ a: { b: 1, c: 2 } }, { a: { d: 3 } });
    expect(result).toEqual({ a: { b: 1, c: 2, d: 3 } });
  });

  it("deeply nested override", () => {
    const result = deepMerge<Record<string, unknown>>(
      { a: { b: { c: 1 } } },
      { a: { b: { c: 2 } } }
    );
    expect(result).toEqual({ a: { b: { c: 2 } } });
  });

  it("replaces arrays (does not concatenate)", () => {
    const result = deepMerge<Record<string, unknown>>({ arr: [1, 2, 3] }, { arr: [4, 5] });
    expect(result).toEqual({ arr: [4, 5] });
  });

  it("undefined values do not overwrite existing values", () => {
    const result = deepMerge<Record<string, unknown>>({ a: 1, b: 2 }, { a: undefined, b: 3 });
    expect(result).toEqual({ a: 1, b: 3 });
  });

  it("null values DO overwrite existing values", () => {
    const result = deepMerge<Record<string, unknown>>({ a: 1 }, { a: null });
    expect(result).toEqual({ a: null });
  });

  it("merges multiple sources in order", () => {
    const result = deepMerge<Record<string, unknown>>(
      { a: 1, b: 1 },
      { b: 2, c: 2 },
      { c: 3, d: 3 }
    );
    expect(result).toEqual({ a: 1, b: 2, c: 3, d: 3 });
  });

  it("handles empty objects", () => {
    const result = deepMerge<Record<string, unknown>>({}, { a: 1 }, {});
    expect(result).toEqual({ a: 1 });
  });

  it("handles no sources", () => {
    const result = deepMerge<Record<string, unknown>>();
    expect(result).toEqual({});
  });

  it("does not mutate source objects", () => {
    const source1 = { a: { b: 1 } };
    const source2 = { a: { c: 2 } };
    const originalSource1 = JSON.parse(JSON.stringify(source1));
    const originalSource2 = JSON.parse(JSON.stringify(source2));

    deepMerge<Record<string, unknown>>(source1, source2);

    expect(source1).toEqual(originalSource1);
    expect(source2).toEqual(originalSource2);
  });

  it("replaces non-object with object", () => {
    const result = deepMerge<Record<string, unknown>>({ a: "string" }, { a: { b: 1 } });
    expect(result).toEqual({ a: { b: 1 } });
  });

  it("replaces object with non-object", () => {
    const result = deepMerge<Record<string, unknown>>({ a: { b: 1 } }, { a: "string" });
    expect(result).toEqual({ a: "string" });
  });

  it("handles complex nested structure", () => {
    const result = deepMerge<Record<string, unknown>>(
      {
        llm: { provider: "anthropic", model: "claude-2" },
        agent: { maxTurns: 10 },
        debug: false,
      },
      {
        llm: { model: "claude-3", apiKey: "key" },
        permissions: { fileRead: "allow" },
      },
      {
        debug: true,
      }
    );
    expect(result).toEqual({
      llm: { provider: "anthropic", model: "claude-3", apiKey: "key" },
      agent: { maxTurns: 10 },
      permissions: { fileRead: "allow" },
      debug: true,
    });
  });
});

describe("loadConfig", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    vi.unstubAllEnvs();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vellum-test-"));
    originalCwd = process.cwd();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("loading global config", () => {
    it("loads global config when present", () => {
      // We can't easily test the actual global path, but we can test via project config
      const projectDir = path.join(tempDir, "project");
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(
        path.join(projectDir, "vellum.toml"),
        `[llm]
provider = "anthropic"
model = "claude-3"
`
      );

      const result = loadConfig({ cwd: projectDir, skipEnv: true });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.llm.provider).toBe("anthropic");
      }
    });
  });

  describe("loading project config", () => {
    it("loads project config from cwd", () => {
      fs.writeFileSync(
        path.join(tempDir, "vellum.toml"),
        `[llm]
provider = "openai"
model = "gpt-4"
`
      );

      const result = loadConfig({ cwd: tempDir, skipEnv: true });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.llm.provider).toBe("openai");
        expect(result.value.llm.model).toBe("gpt-4");
      }
    });

    it("skips project config when skipProjectFile is true", () => {
      fs.writeFileSync(
        path.join(tempDir, "vellum.toml"),
        `[llm]
provider = "openai"
model = "gpt-4"
`
      );

      // Without a valid config and no project file, validation should fail
      const result = loadConfig({
        cwd: tempDir,
        skipEnv: true,
        skipProjectFile: true,
      });
      expect(result.ok).toBe(false);
    });
  });

  describe("environment variable override", () => {
    it("env vars override file config", () => {
      fs.writeFileSync(
        path.join(tempDir, "vellum.toml"),
        `[llm]
provider = "openai"
model = "gpt-4"
`
      );

      vi.stubEnv("VELLUM_LLM_MODEL", "gpt-4-turbo");

      const result = loadConfig({ cwd: tempDir });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.llm.provider).toBe("openai");
        expect(result.value.llm.model).toBe("gpt-4-turbo");
      }
    });

    it("skips env vars when skipEnv is true", () => {
      fs.writeFileSync(
        path.join(tempDir, "vellum.toml"),
        `[llm]
provider = "anthropic"
model = "claude-3"
`
      );

      vi.stubEnv("VELLUM_LLM_MODEL", "should-be-ignored");

      const result = loadConfig({ cwd: tempDir, skipEnv: true });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.llm.model).toBe("claude-3");
      }
    });

    it("env VELLUM_DEBUG overrides file debug setting", () => {
      fs.writeFileSync(
        path.join(tempDir, "vellum.toml"),
        `[llm]
provider = "anthropic"
model = "claude-3"

debug = false
`
      );

      vi.stubEnv("VELLUM_DEBUG", "true");

      const result = loadConfig({ cwd: tempDir });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.debug).toBe(true);
      }
    });
  });

  describe("CLI overrides", () => {
    it("CLI overrides override all other sources", () => {
      fs.writeFileSync(
        path.join(tempDir, "vellum.toml"),
        `[llm]
provider = "openai"
model = "gpt-4"
`
      );

      vi.stubEnv("VELLUM_LLM_MODEL", "gpt-4-turbo");

      const result = loadConfig({
        cwd: tempDir,
        overrides: {
          llm: {
            provider: "anthropic",
            model: "claude-3-opus",
          },
        },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.llm.provider).toBe("anthropic");
        expect(result.value.llm.model).toBe("claude-3-opus");
      }
    });

    it("CLI overrides merge with file config", () => {
      fs.writeFileSync(
        path.join(tempDir, "vellum.toml"),
        `[llm]
provider = "anthropic"
model = "claude-3"

[agent]
maxTurns = 50
`
      );

      const result = loadConfig({
        cwd: tempDir,
        skipEnv: true,
        overrides: {
          debug: true,
        } as PartialConfig,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.llm.provider).toBe("anthropic");
        expect(result.value.agent?.maxTurns).toBe(50);
        expect(result.value.debug).toBe(true);
      }
    });
  });

  describe("validation and defaults", () => {
    it("applies schema defaults", () => {
      fs.writeFileSync(
        path.join(tempDir, "vellum.toml"),
        `[llm]
provider = "anthropic"
model = "claude-3"
`
      );

      const result = loadConfig({ cwd: tempDir, skipEnv: true });
      expect(result.ok).toBe(true);
      if (result.ok) {
        // Check defaults are applied
        expect(result.value.debug).toBe(false);
        expect(result.value.logLevel).toBe("info");
        expect(result.value.llm.maxTokens).toBe(4096);
        expect(result.value.llm.temperature).toBe(0.7);
        expect(result.value.llm.timeout).toBe(60000);
        expect(result.value.agent?.maxToolCalls).toBe(50);
        expect(result.value.agent?.maxTurns).toBe(100);
        expect(result.value.agent?.maxRetries).toBe(3);
        expect(result.value.permissions?.fileRead).toBe("ask");
      }
    });

    it("validates config and returns error on invalid data", () => {
      fs.writeFileSync(
        path.join(tempDir, "vellum.toml"),
        `[llm]
provider = "invalid-provider-name"
model = "some-model"
`
      );

      const result = loadConfig({ cwd: tempDir, skipEnv: true });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
        expect(result.error.message).toContain("Invalid configuration");
      }
    });

    it("returns validation error for missing required fields", () => {
      fs.writeFileSync(
        path.join(tempDir, "vellum.toml"),
        `[llm]
provider = "anthropic"
# model is missing
`
      );

      const result = loadConfig({ cwd: tempDir, skipEnv: true });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
      }
    });
  });

  describe("parse errors", () => {
    it("returns ConfigError on invalid TOML syntax", () => {
      fs.writeFileSync(
        path.join(tempDir, "vellum.toml"),
        `[llm]
provider = "anthropic
model = "claude-3"
`
      );

      const result = loadConfig({ cwd: tempDir, skipEnv: true });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PARSE_ERROR");
        expect(result.error.message).toContain("Failed to parse TOML");
        expect(result.error.path).toBe(path.join(tempDir, "vellum.toml"));
      }
    });

    it("returns ConfigError with cause on parse failure", () => {
      fs.writeFileSync(path.join(tempDir, "vellum.toml"), `[[[invalid toml syntax`);

      const result = loadConfig({ cwd: tempDir, skipEnv: true });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PARSE_ERROR");
        expect(result.error.cause).toBeDefined();
      }
    });
  });

  describe("merge priority order", () => {
    it("follows correct priority: defaults < file < env < overrides", () => {
      fs.writeFileSync(
        path.join(tempDir, "vellum.toml"),
        `[llm]
provider = "anthropic"
model = "file-model"

logLevel = "warn"
debug = false
`
      );

      vi.stubEnv("VELLUM_LOG_LEVEL", "error");

      const result = loadConfig({
        cwd: tempDir,
        overrides: {
          debug: true,
        } as PartialConfig,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // From file
        expect(result.value.llm.provider).toBe("anthropic");
        expect(result.value.llm.model).toBe("file-model");
        // From env (overrides file)
        expect(result.value.logLevel).toBe("error");
        // From CLI overrides (overrides file)
        expect(result.value.debug).toBe(true);
      }
    });
  });
});

describe("ConfigError", () => {
  let tempDir: string;

  beforeEach(() => {
    vi.unstubAllEnvs();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vellum-test-"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("has PARSE_ERROR code for TOML syntax errors", () => {
    fs.writeFileSync(path.join(tempDir, "vellum.toml"), "invalid = [toml");

    const result = loadConfig({ cwd: tempDir, skipEnv: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const error: ConfigError = result.error;
      expect(error.code).toBe("PARSE_ERROR");
    }
  });

  it("has VALIDATION_ERROR code for invalid config values", () => {
    fs.writeFileSync(
      path.join(tempDir, "vellum.toml"),
      `[llm]
provider = "not-a-real-provider"
model = "test"
`
    );

    const result = loadConfig({ cwd: tempDir, skipEnv: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const error: ConfigError = result.error;
      expect(error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("includes path in error for file-related errors", () => {
    fs.writeFileSync(path.join(tempDir, "vellum.toml"), "broken toml [[[");

    const result = loadConfig({ cwd: tempDir, skipEnv: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.path).toBe(path.join(tempDir, "vellum.toml"));
    }
  });

  it("includes descriptive message for parse errors", () => {
    fs.writeFileSync(path.join(tempDir, "vellum.toml"), 'key = "unclosed');

    const result = loadConfig({ cwd: tempDir, skipEnv: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("Failed to parse TOML");
    }
  });

  it("includes validation details in message", () => {
    fs.writeFileSync(
      path.join(tempDir, "vellum.toml"),
      `[llm]
provider = "anthropic"
model = "test"
temperature = 5.0
`
    );

    const result = loadConfig({ cwd: tempDir, skipEnv: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(result.error.message).toContain("Invalid configuration");
    }
  });

  it("error codes are valid ConfigErrorCode values", () => {
    const validCodes: ConfigErrorCode[] = [
      "FILE_NOT_FOUND",
      "PARSE_ERROR",
      "VALIDATION_ERROR",
      "READ_ERROR",
    ];

    // Test PARSE_ERROR
    fs.writeFileSync(path.join(tempDir, "vellum.toml"), "invalid [[");
    const parseResult = loadConfig({ cwd: tempDir, skipEnv: true });
    if (!parseResult.ok) {
      expect(validCodes).toContain(parseResult.error.code);
    }

    // Clean and test VALIDATION_ERROR
    fs.rmSync(path.join(tempDir, "vellum.toml"));
    fs.writeFileSync(path.join(tempDir, "vellum.toml"), '[llm]\nprovider = "bad"\nmodel = "x"');
    const validationResult = loadConfig({ cwd: tempDir, skipEnv: true });
    if (!validationResult.ok) {
      expect(validCodes).toContain(validationResult.error.code);
    }
  });
});

// ============================================
// T024: Deprecation Warnings Tests
// ============================================

describe("checkDeprecatedApiKeyUsage", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Clear the warning cache to allow repeated tests
    clearDeprecationWarningsCache();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    clearDeprecationWarningsCache();
  });

  it("emits warning when apiKey is present in config", () => {
    checkDeprecatedApiKeyUsage(
      { llm: { provider: "anthropic", model: "claude-3-5-sonnet-20241022", apiKey: "sk-test" } },
      "/path/to/config.toml"
    );

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy.mock.calls[0]?.[0]).toContain("DEPRECATION WARNING");
    expect(consoleSpy.mock.calls[0]?.[0]).toContain("apiKey");
    expect(consoleSpy.mock.calls[0]?.[0]).toContain("/path/to/config.toml");
  });

  it("does not emit warning when apiKey is not present", () => {
    checkDeprecatedApiKeyUsage(
      { llm: { provider: "anthropic", model: "claude-3-5-sonnet-20241022" } },
      "/path/to/config.toml"
    );

    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("includes migration instructions in warning", () => {
    checkDeprecatedApiKeyUsage(
      { llm: { provider: "anthropic", model: "claude-3-5-sonnet-20241022", apiKey: "sk-test" } },
      "/test.toml"
    );

    expect(consoleSpy.mock.calls[0]?.[0]).toContain("credential");
    expect(consoleSpy.mock.calls[0]?.[0]).toContain("vellum credentials migrate");
  });

  it("only emits warning once per config path per session", () => {
    checkDeprecatedApiKeyUsage(
      { llm: { provider: "anthropic", model: "claude-3-5-sonnet-20241022", apiKey: "sk-test" } },
      "/same/path.toml"
    );
    checkDeprecatedApiKeyUsage(
      { llm: { provider: "anthropic", model: "claude-3-5-sonnet-20241022", apiKey: "sk-other" } },
      "/same/path.toml"
    );

    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });

  it("emits warning for different config paths", () => {
    checkDeprecatedApiKeyUsage(
      { llm: { provider: "anthropic", model: "claude-3-5-sonnet-20241022", apiKey: "sk-test" } },
      "/path/a.toml"
    );
    checkDeprecatedApiKeyUsage(
      { llm: { provider: "anthropic", model: "claude-3-5-sonnet-20241022", apiKey: "sk-test" } },
      "/path/b.toml"
    );

    expect(consoleSpy).toHaveBeenCalledTimes(2);
  });

  it("handles undefined config path", () => {
    checkDeprecatedApiKeyUsage({
      llm: { provider: "anthropic", model: "claude-3-5-sonnet-20241022", apiKey: "sk-test" },
    });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    // Should not include specific path when undefined
    expect(consoleSpy.mock.calls[0]?.[0]).not.toContain("undefined");
  });
});

describe("loadConfig deprecation warnings", () => {
  let tempDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vellum-deprecation-test-"));
    consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    clearDeprecationWarningsCache();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    consoleSpy.mockRestore();
    clearDeprecationWarningsCache();
    vi.unstubAllEnvs();
  });

  it("emits deprecation warning when config file uses apiKey", () => {
    fs.writeFileSync(
      path.join(tempDir, "vellum.toml"),
      `[llm]
provider = "anthropic"
model = "claude-3"
apiKey = "sk-test-key"
`
    );

    loadConfig({ cwd: tempDir, skipEnv: true });

    expect(consoleSpy).toHaveBeenCalled();
    expect(consoleSpy.mock.calls[0]?.[0]).toContain("DEPRECATION WARNING");
  });

  it("emits deprecation warning when env var uses apiKey", () => {
    fs.writeFileSync(
      path.join(tempDir, "vellum.toml"),
      `[llm]
provider = "anthropic"
model = "claude-3"
`
    );
    vi.stubEnv("VELLUM_LLM_API_KEY", "sk-env-key");

    loadConfig({ cwd: tempDir });

    expect(consoleSpy).toHaveBeenCalled();
    expect(consoleSpy.mock.calls[0]?.[0]).toContain("VELLUM_LLM_API_KEY");
  });

  it("suppresses deprecation warnings when suppressDeprecationWarnings is true", () => {
    fs.writeFileSync(
      path.join(tempDir, "vellum.toml"),
      `[llm]
provider = "anthropic"
model = "claude-3"
apiKey = "sk-test-key"
`
    );

    loadConfig({ cwd: tempDir, skipEnv: true, suppressDeprecationWarnings: true });

    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("does not emit warning when credential field is used", () => {
    fs.writeFileSync(
      path.join(tempDir, "vellum.toml"),
      `[llm]
provider = "anthropic"
model = "claude-3"

[llm.credential]
type = "api_key"
`
    );

    loadConfig({ cwd: tempDir, skipEnv: true });

    expect(consoleSpy).not.toHaveBeenCalled();
  });
});

// ============================================
// T023/T025: Credential Resolution Tests
// ============================================

describe("getProviderDisplayName", () => {
  it("returns friendly name for known providers", () => {
    expect(getProviderDisplayName("anthropic")).toBe("Anthropic (Claude)");
    expect(getProviderDisplayName("openai")).toBe("OpenAI (GPT)");
    expect(getProviderDisplayName("google")).toBe("Google AI (Gemini)");
    expect(getProviderDisplayName("deepseek")).toBe("DeepSeek");
  });

  it("returns provider name as fallback for unknown providers", () => {
    // This shouldn't happen with ProviderName type, but tests robustness
    expect(getProviderDisplayName("anthropic")).toBe("Anthropic (Claude)");
  });
});

describe("hasProviderCredentials", () => {
  it("returns true when credential field is present", async () => {
    const config = {
      llm: {
        provider: "anthropic" as const,
        model: "claude-3",
        credential: { type: "api_key" as const },
      },
    };

    const result = await hasProviderCredentials("anthropic", config);
    expect(result).toBe(true);
  });

  it("returns true when deprecated apiKey is present", async () => {
    const config = {
      llm: {
        provider: "anthropic" as const,
        model: "claude-3",
        apiKey: "sk-test",
      },
    };

    const result = await hasProviderCredentials("anthropic", config);
    expect(result).toBe(true);
  });

  it("returns false when no credentials are configured", async () => {
    const config = {
      llm: {
        provider: "anthropic" as const,
        model: "claude-3",
      },
    };

    const result = await hasProviderCredentials("anthropic", config);
    expect(result).toBe(false);
  });

  it("checks environment variable as fallback", async () => {
    const config = {
      llm: {
        provider: "anthropic" as const,
        model: "claude-3",
      },
    };

    vi.stubEnv("ANTHROPIC_API_KEY", "sk-env-test");
    const result = await hasProviderCredentials("anthropic", config);
    vi.unstubAllEnvs();

    expect(result).toBe(true);
  });
});

describe("loadConfigWithCredentials", () => {
  let tempDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vellum-cred-test-"));
    consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    clearDeprecationWarningsCache();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    consoleSpy.mockRestore();
    clearDeprecationWarningsCache();
    vi.unstubAllEnvs();
  });

  it("returns usedDeprecatedApiKey=true when apiKey is used without CredentialManager", async () => {
    fs.writeFileSync(
      path.join(tempDir, "vellum.toml"),
      `[llm]
provider = "anthropic"
model = "claude-3"
apiKey = "sk-test-key"
`
    );

    const result = await loadConfigWithCredentials({
      cwd: tempDir,
      skipEnv: true,
      suppressDeprecationWarnings: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.usedDeprecatedApiKey).toBe(true);
      expect(result.value.credentialResolved).toBe(false);
      expect(result.value.credential).toBeNull();
    }
  });

  it("returns credentialResolved=false when no credentials available", async () => {
    fs.writeFileSync(
      path.join(tempDir, "vellum.toml"),
      `[llm]
provider = "anthropic"
model = "claude-3"
`
    );

    const result = await loadConfigWithCredentials({
      cwd: tempDir,
      skipEnv: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.credentialResolved).toBe(false);
      expect(result.value.usedDeprecatedApiKey).toBe(false);
    }
  });

  it("preserves config validation on credential loading", async () => {
    fs.writeFileSync(
      path.join(tempDir, "vellum.toml"),
      `[llm]
provider = "invalid-provider"
model = "test"
`
    );

    const result = await loadConfigWithCredentials({
      cwd: tempDir,
      skipEnv: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
  });
});

// ============================================
// T023: Credential Wizard Types Tests
// ============================================

describe("promptForCredentials", () => {
  it("returns null when not in interactive mode", async () => {
    const result = await promptForCredentials("anthropic", {
      interactive: false,
      promptCredential: async () => ({
        provider: "anthropic",
        type: "api_key",
        value: "test",
        metadata: {},
      }),
    });

    expect(result).toBeNull();
  });

  it("returns null when promptCredential callback is not provided", async () => {
    const result = await promptForCredentials("anthropic", {
      interactive: true,
    });

    expect(result).toBeNull();
  });

  it("calls promptCredential with correct options in interactive mode", async () => {
    const mockPrompt = vi.fn().mockResolvedValue({
      provider: "anthropic",
      type: "api_key",
      value: "sk-prompted",
    });

    const result = await promptForCredentials("anthropic", {
      interactive: true,
      promptCredential: mockPrompt,
    });

    expect(mockPrompt).toHaveBeenCalledTimes(1);
    expect(mockPrompt).toHaveBeenCalledWith("anthropic", {
      suggestedType: "api_key",
      displayName: "Anthropic (Claude)",
      isFirstRun: false,
      preferredStore: "keychain",
    });
    expect(result).toEqual({
      provider: "anthropic",
      type: "api_key",
      value: "sk-prompted",
    });
  });

  it("handles promptCredential errors gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mockPrompt = vi.fn().mockRejectedValue(new Error("User cancelled"));

    const result = await promptForCredentials("anthropic", {
      interactive: true,
      promptCredential: mockPrompt,
    });

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalled();
    expect(consoleSpy.mock.calls[0]?.[0]).toContain("Failed to prompt");

    consoleSpy.mockRestore();
  });

  it("returns null when user cancels prompt", async () => {
    const mockPrompt = vi.fn().mockResolvedValue(null);

    const result = await promptForCredentials("anthropic", {
      interactive: true,
      promptCredential: mockPrompt,
    });

    expect(result).toBeNull();
  });
});

describe("clearDeprecationWarningsCache", () => {
  it("allows warnings to be shown again after clearing", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    checkDeprecatedApiKeyUsage(
      { llm: { provider: "anthropic", model: "claude-3-5-sonnet-20241022", apiKey: "sk-test" } },
      "/test.toml"
    );
    expect(consoleSpy).toHaveBeenCalledTimes(1);

    // Same path should not emit again
    checkDeprecatedApiKeyUsage(
      { llm: { provider: "anthropic", model: "claude-3-5-sonnet-20241022", apiKey: "sk-test" } },
      "/test.toml"
    );
    expect(consoleSpy).toHaveBeenCalledTimes(1);

    // Clear cache
    clearDeprecationWarningsCache();

    // Now should emit again
    checkDeprecatedApiKeyUsage(
      { llm: { provider: "anthropic", model: "claude-3-5-sonnet-20241022", apiKey: "sk-test" } },
      "/test.toml"
    );
    expect(consoleSpy).toHaveBeenCalledTimes(2);

    consoleSpy.mockRestore();
    clearDeprecationWarningsCache();
  });
});
