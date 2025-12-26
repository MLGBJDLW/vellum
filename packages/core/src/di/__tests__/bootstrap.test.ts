/**
 * T108 - Integration Tests for Bootstrap/Shutdown
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrap, hasGlobalHandlers, shutdown } from "../bootstrap.js";
import { Container } from "../container.js";
import { Tokens } from "../tokens.js";

/**
 * Helper to create a valid test config file
 */
function createValidConfig(dir: string): string {
  const configFile = path.join(dir, "vellum.toml");
  fs.writeFileSync(
    configFile,
    `
[llm]
provider = "anthropic"
model = "claude-3-5-sonnet-latest"

[permissions]
mode = "auto"
`
  );
  return dir;
}

describe("bootstrap", () => {
  let container: Container | undefined;
  let tempDir: string;

  beforeEach(() => {
    // Create temp directory for config files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vellum-bootstrap-test-"));
    // Create valid config file for all tests
    createValidConfig(tempDir);
    container = undefined;
  });

  afterEach(async () => {
    // Clean up container
    if (container) {
      await shutdown(container);
    }
    // Ensure handlers are removed
    await shutdown();
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("container creation", () => {
    it("should create container with all core tokens", async () => {
      container = await bootstrap({ skipGlobalHandlers: true, configPath: tempDir });

      expect(container).toBeInstanceOf(Container);
      expect(container.has(Tokens.Config)).toBe(true);
      expect(container.has(Tokens.ConfigManager)).toBe(true);
      expect(container.has(Tokens.Logger)).toBe(true);
      expect(container.has(Tokens.EventBus)).toBe(true);
      expect(container.has(Tokens.ErrorHandler)).toBe(true);
    });

    it("should resolve Config token", async () => {
      container = await bootstrap({ skipGlobalHandlers: true, configPath: tempDir });

      const config = container.resolve(Tokens.Config);
      expect(config).toBeDefined();
      expect(config).toHaveProperty("llm");
      expect(config).toHaveProperty("permissions");
    });

    it("should resolve ConfigManager token", async () => {
      container = await bootstrap({ skipGlobalHandlers: true, configPath: tempDir });

      const configManager = container.resolve(Tokens.ConfigManager);
      expect(configManager).toBeDefined();
      expect(typeof configManager.get).toBe("function");
      expect(typeof configManager.dispose).toBe("function");
    });

    it("should resolve Logger token", async () => {
      container = await bootstrap({ skipGlobalHandlers: true, configPath: tempDir });

      const logger = container.resolve(Tokens.Logger);
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.error).toBe("function");
      expect(typeof logger.debug).toBe("function");
    });

    it("should resolve EventBus token", async () => {
      container = await bootstrap({ skipGlobalHandlers: true, configPath: tempDir });

      const eventBus = container.resolve(Tokens.EventBus);
      expect(eventBus).toBeDefined();
      expect(typeof eventBus.on).toBe("function");
      expect(typeof eventBus.emit).toBe("function");
    });

    it("should resolve ErrorHandler token", async () => {
      container = await bootstrap({ skipGlobalHandlers: true, configPath: tempDir });

      const errorHandler = container.resolve(Tokens.ErrorHandler);
      expect(errorHandler).toBeDefined();
      expect(typeof errorHandler.handle).toBe("function");
      expect(typeof errorHandler.isRecoverable).toBe("function");
    });
  });

  describe("global exception handlers", () => {
    it("should install global handlers by default", async () => {
      container = await bootstrap({ configPath: tempDir });

      expect(hasGlobalHandlers()).toBe(true);
    });

    it("should skip global handlers when skipGlobalHandlers is true", async () => {
      container = await bootstrap({ skipGlobalHandlers: true, configPath: tempDir });

      expect(hasGlobalHandlers()).toBe(false);
    });

    it("should remove handlers on shutdown", async () => {
      container = await bootstrap({ configPath: tempDir });
      expect(hasGlobalHandlers()).toBe(true);

      await shutdown(container);
      expect(hasGlobalHandlers()).toBe(false);
    });
  });

  describe("debug option", () => {
    it("should set logger to debug level when debug is true", async () => {
      container = await bootstrap({ skipGlobalHandlers: true, debug: true, configPath: tempDir });

      const logger = container.resolve(Tokens.Logger);
      expect(logger.getLevel()).toBe("debug");
    });

    it("should use info level by default", async () => {
      container = await bootstrap({ skipGlobalHandlers: true, debug: false, configPath: tempDir });

      const logger = container.resolve(Tokens.Logger);
      expect(logger.getLevel()).toBe("info");
    });
  });

  describe("logFile option", () => {
    it("should create logger without file transport by default", async () => {
      container = await bootstrap({ skipGlobalHandlers: true, configPath: tempDir });

      // Logger should be created successfully without file transport
      const logger = container.resolve(Tokens.Logger);
      expect(logger).toBeDefined();
    });

    it("should add file transport when logFile is specified", async () => {
      const logFile = path.join(tempDir, "test.log");
      container = await bootstrap({
        skipGlobalHandlers: true,
        logFile,
        configPath: tempDir,
      });

      const logger = container.resolve(Tokens.Logger);
      expect(logger).toBeDefined();

      // Write a log entry to trigger file creation
      logger.info("Test message");
      await logger.flush();

      // File should be created
      expect(fs.existsSync(logFile)).toBe(true);
    });
  });

  describe("configPath option", () => {
    it("should use custom config path when specified", async () => {
      // Create a custom config file with different settings
      const customDir = fs.mkdtempSync(path.join(os.tmpdir(), "vellum-custom-config-"));
      const configFile = path.join(customDir, "vellum.toml");
      fs.writeFileSync(
        configFile,
        `
[llm]
provider = "openai"
model = "gpt-4"

[permissions]
mode = "auto"
`
      );

      try {
        container = await bootstrap({
          skipGlobalHandlers: true,
          configPath: customDir,
        });

        const config = container.resolve(Tokens.Config);
        expect(config.llm.provider).toBe("openai");
        expect(config.llm.model).toBe("gpt-4");
      } finally {
        fs.rmSync(customDir, { recursive: true, force: true });
      }
    });
  });
});

describe("shutdown", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vellum-shutdown-test-"));
    createValidConfig(tempDir);
  });

  afterEach(async () => {
    // Ensure handlers are removed
    await shutdown();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should handle undefined container gracefully", async () => {
    await expect(shutdown(undefined)).resolves.not.toThrow();
  });

  it("should handle multiple shutdown calls gracefully", async () => {
    const container = await bootstrap({ skipGlobalHandlers: true, configPath: tempDir });

    await shutdown(container);
    await expect(shutdown(container)).resolves.not.toThrow();
  });

  it("should flush logger on shutdown", async () => {
    const logFile = path.join(tempDir, "flush-test.log");
    const container = await bootstrap({
      skipGlobalHandlers: true,
      logFile,
      configPath: tempDir,
    });

    const logger = container.resolve(Tokens.Logger);
    logger.info("Message before shutdown");

    await shutdown(container);

    // After flush, file should exist and contain the message
    const content = fs.readFileSync(logFile, "utf-8");
    expect(content).toContain("Message before shutdown");
  });

  it("should dispose ConfigManager on shutdown", async () => {
    const container = await bootstrap({ skipGlobalHandlers: true, configPath: tempDir });
    const configManager = container.resolve(Tokens.ConfigManager);

    // Spy on dispose
    const disposeSpy = vi.spyOn(configManager, "dispose");

    await shutdown(container);

    expect(disposeSpy).toHaveBeenCalled();
  });

  it("should clear container on shutdown", async () => {
    const container = await bootstrap({ skipGlobalHandlers: true, configPath: tempDir });

    expect(container.has(Tokens.Logger)).toBe(true);

    await shutdown(container);

    expect(container.has(Tokens.Logger)).toBe(false);
    expect(container.has(Tokens.Config)).toBe(false);
    expect(container.has(Tokens.EventBus)).toBe(false);
  });

  it("should remove global handlers on shutdown", async () => {
    const container = await bootstrap({ configPath: tempDir }); // Installs handlers

    expect(hasGlobalHandlers()).toBe(true);

    await shutdown(container);

    expect(hasGlobalHandlers()).toBe(false);
  });

  it("should remove global handlers even without container", async () => {
    await bootstrap({ configPath: tempDir }); // Installs handlers
    expect(hasGlobalHandlers()).toBe(true);

    await shutdown(); // No container
    expect(hasGlobalHandlers()).toBe(false);
  });
});

describe("hasGlobalHandlers", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vellum-handlers-test-"));
    createValidConfig(tempDir);
  });

  afterEach(async () => {
    await shutdown();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should return false initially", async () => {
    // Ensure clean state
    await shutdown();
    expect(hasGlobalHandlers()).toBe(false);
  });

  it("should return true after bootstrap with handlers", async () => {
    await bootstrap({ configPath: tempDir });
    expect(hasGlobalHandlers()).toBe(true);
  });

  it("should return false after shutdown", async () => {
    const container = await bootstrap({ configPath: tempDir });
    await shutdown(container);
    expect(hasGlobalHandlers()).toBe(false);
  });
});
