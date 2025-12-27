import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { gunzipSync } from "node:zlib";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createLoggingConfig,
  developmentConfig,
  getLoggingConfig,
  productionConfig,
  testConfig,
} from "../../config/logging.config.js";
import { createLogger } from "../factory.js";
import { RotatingFileTransport } from "../transports/rotating-file.js";
import type { LogEntry } from "../types.js";

describe("RotatingFileTransport", () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vellum-log-test-"));
    logPath = path.join(tempDir, "test.log");
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should write log entries to file", () => {
    const transport = new RotatingFileTransport({
      filepath: logPath,
      maxSize: 1024 * 1024, // 1MB
    });

    const entry: LogEntry = {
      level: "info",
      message: "Test log message",
      timestamp: new Date("2025-01-01T00:00:00Z"),
      context: { test: true },
    };

    transport.write(entry);

    expect(fs.existsSync(logPath)).toBe(true);
    const content = fs.readFileSync(logPath, "utf8");
    const parsed = JSON.parse(content.trim());
    expect(parsed.level).toBe("info");
    expect(parsed.message).toBe("Test log message");
  });

  it("should create directory if it does not exist", () => {
    const nestedPath = path.join(tempDir, "nested", "logs", "app.log");

    const transport = new RotatingFileTransport({
      filepath: nestedPath,
    });

    const entry: LogEntry = {
      level: "info",
      message: "Test",
      timestamp: new Date(),
    };

    transport.write(entry);

    expect(fs.existsSync(nestedPath)).toBe(true);
  });

  it("should rotate file when maxSize is exceeded", () => {
    const smallMaxSize = 100; // Very small for testing
    const transport = new RotatingFileTransport({
      filepath: logPath,
      maxSize: smallMaxSize,
      compress: false, // Disable compression for easier testing
    });

    // Write enough entries to trigger rotation
    for (let i = 0; i < 10; i++) {
      const entry: LogEntry = {
        level: "info",
        message: `Log message number ${i} with some padding to make it larger`,
        timestamp: new Date(),
      };
      transport.write(entry);
    }

    // Check that rotated file exists
    expect(fs.existsSync(`${logPath}.1`)).toBe(true);
  });

  it("should compress rotated files when compress is true", () => {
    const smallMaxSize = 100;
    const transport = new RotatingFileTransport({
      filepath: logPath,
      maxSize: smallMaxSize,
      compress: true,
    });

    // Write enough entries to trigger rotation
    for (let i = 0; i < 10; i++) {
      const entry: LogEntry = {
        level: "info",
        message: `Log message number ${i} with padding for size`,
        timestamp: new Date(),
      };
      transport.write(entry);
    }

    // Check that compressed rotated file exists
    expect(fs.existsSync(`${logPath}.1.gz`)).toBe(true);

    // Verify it's valid gzip
    const compressed = fs.readFileSync(`${logPath}.1.gz`);
    const decompressed = gunzipSync(compressed).toString("utf8");
    expect(decompressed.length).toBeGreaterThan(0);
  });

  it("should limit number of rotated files to maxFiles", () => {
    const smallMaxSize = 50;
    const maxFiles = 3;
    const transport = new RotatingFileTransport({
      filepath: logPath,
      maxSize: smallMaxSize,
      maxFiles,
      compress: false,
    });

    // Write many entries to trigger multiple rotations
    for (let i = 0; i < 50; i++) {
      const entry: LogEntry = {
        level: "info",
        message: `Message ${i} padding`,
        timestamp: new Date(),
      };
      transport.write(entry);
    }

    // Should have main file and up to maxFiles rotated files
    expect(fs.existsSync(logPath)).toBe(true);
    expect(fs.existsSync(`${logPath}.1`)).toBe(true);
    expect(fs.existsSync(`${logPath}.2`)).toBe(true);
    expect(fs.existsSync(`${logPath}.3`)).toBe(true);
    // Should not have more than maxFiles
    expect(fs.existsSync(`${logPath}.4`)).toBe(false);
  });

  it("should track current file size", () => {
    const transport = new RotatingFileTransport({
      filepath: logPath,
      maxSize: 1024 * 1024,
    });

    expect(transport.getCurrentSize()).toBe(0);

    const entry: LogEntry = {
      level: "info",
      message: "Test",
      timestamp: new Date(),
    };

    transport.write(entry);

    expect(transport.getCurrentSize()).toBeGreaterThan(0);
  });

  it("should implement LogTransport interface via log method", () => {
    const transport = new RotatingFileTransport({
      filepath: logPath,
    });

    const entry: LogEntry = {
      level: "debug",
      message: "Via log method",
      timestamp: new Date(),
    };

    transport.log(entry);

    const content = fs.readFileSync(logPath, "utf8");
    expect(content).toContain("Via log method");
  });
});

describe("createLogger factory", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vellum-factory-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should create a logger with default options", () => {
    const logger = createLogger();

    expect(logger).toBeDefined();
    expect(logger.getLevel()).toBe("info");
  });

  it("should create a logger with custom level", () => {
    const logger = createLogger({ level: "debug" });

    expect(logger.getLevel()).toBe("debug");
  });

  it("should create a logger with file transport", () => {
    const logPath = path.join(tempDir, "app.log");

    const logger = createLogger({
      name: "test-app",
      level: "info",
      console: false, // Disable console for cleaner test
      file: {
        enabled: true,
        path: logPath,
        maxSize: 1024,
        maxFiles: 3,
        compress: false,
      },
    });

    logger.info("Test message");

    expect(fs.existsSync(logPath)).toBe(true);
    const content = fs.readFileSync(logPath, "utf8");
    expect(content).toContain("Test message");
  });

  it("should create a logger with JSON output", () => {
    // Capture console.log output (JsonTransport uses console.log by default)
    const originalLog = console.log;
    const output: string[] = [];
    console.log = (...args: unknown[]): void => {
      output.push(args.map(String).join(" "));
    };

    try {
      const logger = createLogger({
        json: true,
        console: true,
      });

      logger.info("JSON test message");

      // Restore console.log before assertions
      console.log = originalLog;

      // Check that output is JSON
      const jsonOutput = output.find((o) => o.includes("JSON test message"));
      expect(jsonOutput).toBeDefined();
      // JSON output should be parseable
      if (jsonOutput) {
        const parsed = JSON.parse(jsonOutput.trim());
        expect(parsed.message).toBe("JSON test message");
      }
    } finally {
      console.log = originalLog;
    }
  });

  it("should disable console output when console is false", () => {
    const originalWrite = process.stdout.write;
    const output: string[] = [];
    process.stdout.write = (chunk: string | Uint8Array): boolean => {
      output.push(chunk.toString());
      return true;
    };

    try {
      const logger = createLogger({
        console: false,
      });

      logger.info("Should not appear");

      process.stdout.write = originalWrite;

      // Should have no output containing our message
      const hasMessage = output.some((o) => o.includes("Should not appear"));
      expect(hasMessage).toBe(false);
    } finally {
      process.stdout.write = originalWrite;
    }
  });

  it("should include logger name in context", () => {
    const logPath = path.join(tempDir, "named.log");

    const logger = createLogger({
      name: "my-component",
      console: false,
      file: {
        enabled: true,
        path: logPath,
      },
    });

    logger.info("Named logger test");

    const content = fs.readFileSync(logPath, "utf8");
    const parsed = JSON.parse(content.trim());
    expect(parsed.context?.logger).toBe("my-component");
  });
});

describe("getLoggingConfig", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("should return development config by default", () => {
    delete process.env.NODE_ENV;

    const config = getLoggingConfig();

    expect(config).toEqual(developmentConfig);
    expect(config.level).toBe("debug");
    expect(config.colors).toBe(true);
    expect(config.json).toBe(false);
    expect(config.telemetry.enabled).toBe(false);
  });

  it("should return production config for production env", () => {
    const config = getLoggingConfig("production");

    expect(config).toEqual(productionConfig);
    expect(config.level).toBe("info");
    expect(config.colors).toBe(false);
    expect(config.json).toBe(true);
    expect(config.telemetry.enabled).toBe(true);
    expect(config.telemetry.samplingRatio).toBe(0.1);
  });

  it("should return test config for test env", () => {
    const config = getLoggingConfig("test");

    expect(config).toEqual(testConfig);
    expect(config.level).toBe("warn");
    expect(config.telemetry.enabled).toBe(false);
  });

  it("should use NODE_ENV when no argument provided", () => {
    process.env.NODE_ENV = "production";

    const config = getLoggingConfig();

    expect(config).toEqual(productionConfig);
  });

  it("should return development config for unknown environments", () => {
    const config = getLoggingConfig("staging");

    expect(config).toEqual(developmentConfig);
  });
});

describe("createLoggingConfig", () => {
  it("should merge overrides with development defaults", () => {
    // Explicitly pass 'development' since NODE_ENV is 'test' during vitest
    const config = createLoggingConfig(
      {
        level: "trace",
        json: true,
      },
      "development"
    );

    expect(config.level).toBe("trace");
    expect(config.json).toBe(true);
    // Should keep other defaults from development config
    expect(config.colors).toBe(true);
    expect(config.timestamps).toBe(true);
  });

  it("should merge telemetry overrides", () => {
    const config = createLoggingConfig({
      telemetry: {
        enabled: true,
        samplingRatio: 0.5,
      },
    });

    expect(config.telemetry.enabled).toBe(true);
    expect(config.telemetry.samplingRatio).toBe(0.5);
  });

  it("should use specified base environment", () => {
    const config = createLoggingConfig(
      {
        level: "error",
      },
      "production"
    );

    expect(config.level).toBe("error");
    // Should inherit production defaults
    expect(config.colors).toBe(false);
    expect(config.json).toBe(true);
  });
});
