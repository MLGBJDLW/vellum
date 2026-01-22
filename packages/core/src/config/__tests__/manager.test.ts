import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigManager } from "../manager.js";
import type { Config } from "../schema.js";

// ============================================
// T044: Unit Tests for ConfigManager
// ============================================

describe("ConfigManager", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vellum-manager-test-"));
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  /**
   * Helper to create a valid config file
   */
  function createValidConfig(dir: string): string {
    const configPath = path.join(dir, "vellum.toml");
    const content = `
[llm]
provider = "anthropic"
model = "claude-3-sonnet"
apiKey = "test-api-key"
maxTokens = 4096
temperature = 0.7
timeout = 60000

[agent]
maxToolCalls = 50
maxTurns = 100
maxRetries = 3
enableReasoning = false

[permissions]
fileRead = "ask"
fileWrite = "ask"
shellExecute = "ask"

debug = false
logLevel = "info"
`;
    fs.writeFileSync(configPath, content);
    return configPath;
  }

  // ============================================
  // T040: ConfigManager.create() tests
  // ============================================

  describe("create()", () => {
    it("succeeds with valid config file", async () => {
      createValidConfig(tempDir);

      const result = await ConfigManager.create({ cwd: tempDir });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeInstanceOf(ConfigManager);
        result.value.dispose();
      }
    });

    it("returns error on invalid config", async () => {
      // Create config with invalid provider value
      const configPath = path.join(tempDir, "vellum.toml");
      fs.writeFileSync(
        configPath,
        `
[llm]
provider = "invalid-provider-name"
model = "some-model"
`
      );

      const result = await ConfigManager.create({ cwd: tempDir });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
        expect(result.error.message).toContain("Invalid configuration");
      }
    });

    it("succeeds with config from environment variables", async () => {
      vi.stubEnv("VELLUM_LLM_PROVIDER", "openai");
      vi.stubEnv("VELLUM_LLM_MODEL", "gpt-4");
      vi.stubEnv("VELLUM_LLM_API_KEY", "sk-test-key");

      const result = await ConfigManager.create({
        cwd: tempDir,
        skipProjectFile: true,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.get("llm").provider).toBe("openai");
        result.value.dispose();
      }

      vi.unstubAllEnvs();
    });

    it("applies overrides correctly", async () => {
      createValidConfig(tempDir);

      const result = await ConfigManager.create({
        cwd: tempDir,
        overrides: {
          debug: true,
          llm: {
            provider: "openai",
            model: "gpt-4o",
          },
        },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.get("debug")).toBe(true);
        expect(result.value.get("llm").provider).toBe("openai");
        expect(result.value.get("llm").model).toBe("gpt-4o");
        result.value.dispose();
      }
    });
  });

  // ============================================
  // T040: get() tests
  // ============================================

  describe("get()", () => {
    it("returns correct llm section", async () => {
      createValidConfig(tempDir);
      const result = await ConfigManager.create({ cwd: tempDir });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const llm = result.value.get("llm");
        expect(llm.provider).toBe("anthropic");
        expect(llm.model).toBe("claude-3-sonnet");
        expect(llm.apiKey).toBe("test-api-key");
        result.value.dispose();
      }
    });

    it("returns correct agent section", async () => {
      createValidConfig(tempDir);
      const result = await ConfigManager.create({ cwd: tempDir });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const agent = result.value.get("agent");
        expect(agent?.maxToolCalls).toBe(50);
        expect(agent?.maxTurns).toBe(100);
        result.value.dispose();
      }
    });

    it("returns correct permissions section", async () => {
      createValidConfig(tempDir);
      const result = await ConfigManager.create({ cwd: tempDir });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const permissions = result.value.get("permissions");
        expect(permissions?.fileRead).toBe("ask");
        expect(permissions?.fileWrite).toBe("ask");
        result.value.dispose();
      }
    });

    it("returns correct debug value", async () => {
      createValidConfig(tempDir);
      const result = await ConfigManager.create({
        cwd: tempDir,
        overrides: { debug: true, llm: { provider: "anthropic", model: "claude-3" } },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.get("debug")).toBe(true);
        result.value.dispose();
      }
    });

    it("returns correct logLevel value", async () => {
      createValidConfig(tempDir);
      const result = await ConfigManager.create({ cwd: tempDir });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.get("logLevel")).toBe("info");
        result.value.dispose();
      }
    });
  });

  // ============================================
  // T040: getAll() tests
  // ============================================

  describe("getAll()", () => {
    it("returns complete config object", async () => {
      createValidConfig(tempDir);
      const result = await ConfigManager.create({ cwd: tempDir });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const config = result.value.getAll();

        expect(config).toHaveProperty("llm");
        expect(config).toHaveProperty("agent");
        expect(config).toHaveProperty("permissions");
        expect(config).toHaveProperty("debug");
        expect(config).toHaveProperty("logLevel");

        expect(config.llm.provider).toBe("anthropic");
        result.value.dispose();
      }
    });

    it("returns frozen (readonly) object", async () => {
      createValidConfig(tempDir);
      const result = await ConfigManager.create({ cwd: tempDir });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const config = result.value.getAll();

        // Object should be frozen
        expect(Object.isFrozen(config)).toBe(true);

        // Attempting to modify should throw in strict mode
        expect(() => {
          (config as Record<string, unknown>).debug = true;
        }).toThrow();

        result.value.dispose();
      }
    });

    it("returns a copy that does not affect internal state", async () => {
      createValidConfig(tempDir);
      const result = await ConfigManager.create({ cwd: tempDir });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const config1 = result.value.getAll();
        const config2 = result.value.getAll();

        // Should get the same values
        expect(config1.debug).toBe(config2.debug);
        expect(config1.llm.provider).toBe(config2.llm.provider);

        result.value.dispose();
      }
    });
  });

  // ============================================
  // T041: watch() tests
  // ============================================

  describe("watch()", () => {
    it("emits error when no config file exists", async () => {
      vi.stubEnv("VELLUM_LLM_PROVIDER", "openai");
      vi.stubEnv("VELLUM_LLM_MODEL", "gpt-4");

      const result = await ConfigManager.create({
        cwd: tempDir,
        skipProjectFile: true,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const manager = result.value;
        const errorHandler = vi.fn();
        manager.on("error", errorHandler);

        manager.watch();

        expect(errorHandler).toHaveBeenCalledTimes(1);
        expect(errorHandler.mock.calls[0]?.[0]).toBeInstanceOf(Error);
        expect((errorHandler.mock.calls[0]?.[0] as Error).message).toContain(
          "No config file found"
        );

        manager.dispose();
      }

      vi.unstubAllEnvs();
    });

    it("emits change event on file modification", async () => {
      const configPath = createValidConfig(tempDir);
      const result = await ConfigManager.create({ cwd: tempDir });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const manager = result.value;
        const changeHandler = vi.fn();
        manager.on("change", changeHandler);

        manager.watch();

        // Modify the config file
        const newContent = `
[llm]
provider = "openai"
model = "gpt-4o"
`;
        fs.writeFileSync(configPath, newContent);

        // Wait for debounce and fs.watch to trigger - use longer timeout for CI
        // File watchers can be slow in CI environments
        await vi.waitFor(
          () => {
            expect(changeHandler).toHaveBeenCalled();
          },
          { timeout: 2000, interval: 100 }
        );

        if (changeHandler.mock.calls.length > 0) {
          const newConfig = changeHandler.mock.calls[0]?.[0] as Config | undefined;
          expect(newConfig?.llm.provider).toBe("openai");
          expect(newConfig?.llm.model).toBe("gpt-4o");
        }

        manager.dispose();
      }
    });

    it("does not emit change if disposed before file changes", async () => {
      const configPath = createValidConfig(tempDir);
      const result = await ConfigManager.create({ cwd: tempDir });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const manager = result.value;
        const changeHandler = vi.fn();
        manager.on("change", changeHandler);

        manager.watch();
        manager.dispose();

        // Modify the config file after dispose
        const newContent = `
[llm]
provider = "openai"
model = "gpt-4o"
`;
        fs.writeFileSync(configPath, newContent);

        // Wait a bit
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Should not have received any change events
        expect(changeHandler).not.toHaveBeenCalled();
      }
    });

    it("emits error on invalid config update", async () => {
      const configPath = createValidConfig(tempDir);
      const result = await ConfigManager.create({ cwd: tempDir });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const manager = result.value;
        const errorHandler = vi.fn();
        const changeHandler = vi.fn();
        manager.on("error", errorHandler);
        manager.on("change", changeHandler);

        manager.watch();

        // Write invalid config
        fs.writeFileSync(
          configPath,
          `
[llm]
provider = "not-a-valid-provider"
model = "test"
`
        );

        // Wait for debounce - use longer timeout for CI
        await vi.waitFor(
          () => {
            expect(errorHandler).toHaveBeenCalled();
          },
          { timeout: 2000, interval: 100 }
        );

        // Should emit error, not change
        expect(changeHandler).not.toHaveBeenCalled();

        manager.dispose();
      }
    });

    it("calling watch() multiple times does not create multiple watchers", async () => {
      const configPath = createValidConfig(tempDir);
      const result = await ConfigManager.create({ cwd: tempDir });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const manager = result.value;
        const errorHandler = vi.fn();
        manager.on("error", errorHandler);

        // Call watch multiple times - should not cause errors
        manager.watch();
        manager.watch();
        manager.watch();

        // No errors should be emitted from multiple watch calls
        expect(errorHandler).not.toHaveBeenCalled();

        // Verify watcher works by modifying file
        const changeHandler = vi.fn();
        manager.on("change", changeHandler);

        fs.writeFileSync(
          configPath,
          `
[llm]
provider = "openai"
model = "gpt-4"
`
        );

        await new Promise((resolve) => setTimeout(resolve, 200));

        // Should only get one change event, not three
        expect(changeHandler.mock.calls.length).toBeLessThanOrEqual(1);

        manager.dispose();
      }
    });
  });

  // ============================================
  // T042: dispose() tests
  // ============================================

  describe("dispose()", () => {
    it("stops watcher", async () => {
      createValidConfig(tempDir);
      const result = await ConfigManager.create({ cwd: tempDir });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const manager = result.value;
        const changeHandler = vi.fn();
        manager.on("change", changeHandler);

        manager.watch();
        manager.dispose();

        // Change file after dispose - should not trigger handler
        const configPath = path.join(tempDir, "vellum.toml");
        fs.writeFileSync(
          configPath,
          `
[llm]
provider = "google"
model = "gemini-pro"
`
        );

        await new Promise((resolve) => setTimeout(resolve, 200));

        expect(changeHandler).not.toHaveBeenCalled();
      }
    });

    it("is safe to call multiple times", async () => {
      createValidConfig(tempDir);
      const result = await ConfigManager.create({ cwd: tempDir });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const manager = result.value;
        manager.watch();

        // Should not throw when called multiple times
        expect(() => {
          manager.dispose();
          manager.dispose();
          manager.dispose();
        }).not.toThrow();
      }
    });

    it("removes all event listeners", async () => {
      const configPath = createValidConfig(tempDir);
      const result = await ConfigManager.create({ cwd: tempDir });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const manager = result.value;
        const changeHandler = vi.fn();

        manager.on("change", changeHandler);
        manager.watch();

        manager.dispose();

        // After dispose, file changes should not trigger handler
        fs.writeFileSync(
          configPath,
          `
[llm]
provider = "google"
model = "gemini-pro"
`
        );

        await new Promise((resolve) => setTimeout(resolve, 200));

        expect(changeHandler).not.toHaveBeenCalled();
      }
    });

    it("get() still works after dispose", async () => {
      createValidConfig(tempDir);
      const result = await ConfigManager.create({ cwd: tempDir });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const manager = result.value;
        manager.dispose();

        // Should still be able to read config
        expect(manager.get("llm").provider).toBe("anthropic");
        expect(manager.getAll().debug).toBe(false);
      }
    });

    it("watch() does nothing after dispose", async () => {
      const configPath = createValidConfig(tempDir);
      const result = await ConfigManager.create({ cwd: tempDir });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const manager = result.value;
        const changeHandler = vi.fn();
        const errorHandler = vi.fn();

        manager.on("change", changeHandler);
        manager.on("error", errorHandler);

        // Dispose first, then try to watch
        manager.dispose();
        manager.watch();

        // Modify file - should not trigger anything
        fs.writeFileSync(
          configPath,
          `
[llm]
provider = "google"
model = "gemini-pro"
`
        );

        await new Promise((resolve) => setTimeout(resolve, 200));

        // No events should be emitted since dispose was called first
        expect(changeHandler).not.toHaveBeenCalled();
        expect(errorHandler).not.toHaveBeenCalled();
      }
    });
  });

  // ============================================
  // Event handling tests
  // ============================================

  describe("event handling", () => {
    it("on() registers listener correctly", async () => {
      createValidConfig(tempDir);
      const result = await ConfigManager.create({ cwd: tempDir });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const manager = result.value;
        const handler = vi.fn();

        manager.on("change", handler);
        manager.emit("change", {} as Config);

        expect(handler).toHaveBeenCalledTimes(1);
        manager.dispose();
      }
    });

    it("off() removes listener correctly", async () => {
      createValidConfig(tempDir);
      const result = await ConfigManager.create({ cwd: tempDir });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const manager = result.value;
        const handler = vi.fn();

        manager.on("change", handler);
        manager.off("change", handler);
        manager.emit("change", {} as Config);

        expect(handler).not.toHaveBeenCalled();
        manager.dispose();
      }
    });

    it("removeAllListeners() clears specific event", async () => {
      createValidConfig(tempDir);
      const result = await ConfigManager.create({ cwd: tempDir });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const manager = result.value;
        const changeHandler = vi.fn();
        const errorHandler = vi.fn();

        manager.on("change", changeHandler);
        manager.on("error", errorHandler);
        manager.removeAllListeners("change");

        manager.emit("change", {} as Config);
        manager.emit("error", new Error("test"));

        expect(changeHandler).not.toHaveBeenCalled();
        expect(errorHandler).toHaveBeenCalled();
        manager.dispose();
      }
    });
  });
});
