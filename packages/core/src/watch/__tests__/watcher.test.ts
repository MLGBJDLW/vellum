// ============================================
// File Watcher Tests
// ============================================
// Unit tests for the general file watching system.
// @see REQ-036: General file watching system

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createWatcher,
  createWatcherRegistry,
  FileWatcher,
  getWatcherPreset,
  getWatcherPresetIds,
  WATCHER_PRESETS,
  WatcherRegistry,
} from "../index.js";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a temporary directory structure for testing.
 */
async function createTempDir(): Promise<string> {
  const tempDir = path.join(
    os.tmpdir(),
    `vellum-watch-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Create a file with optional content.
 */
async function createFile(filePath: string, content = ""): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
}

/**
 * Clean up a directory recursively.
 */
async function cleanupDir(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Wait for a specified duration.
 */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// FileWatcher Tests
// =============================================================================

describe("FileWatcher", () => {
  let tempDir: string;
  let watcher: FileWatcher | null = null;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    if (watcher?.running) {
      await watcher.stop();
    }
    watcher = null;
    await cleanupDir(tempDir);
  });

  describe("constructor", () => {
    it("should create watcher with default options", () => {
      watcher = new FileWatcher({ path: tempDir });
      expect(watcher.debounceMs).toBe(300);
      expect(watcher.running).toBe(false);
      expect(watcher.recursive).toBe(true);
    });

    it("should accept custom debounce delay", () => {
      watcher = new FileWatcher({ path: tempDir, debounceMs: 500 });
      expect(watcher.debounceMs).toBe(500);
    });

    it("should accept include patterns", () => {
      watcher = new FileWatcher({ path: tempDir, include: ["*.ts", "*.tsx"] });
      expect(watcher.includePatterns).toEqual(["*.ts", "*.tsx"]);
    });

    it("should accept custom ID and name", () => {
      watcher = new FileWatcher({ path: tempDir, id: "test-watcher", name: "Test Watcher" });
      expect(watcher.id).toBe("test-watcher");
      expect(watcher.name).toBe("Test Watcher");
    });

    it("should generate unique ID if not provided", () => {
      const watcher1 = new FileWatcher({ path: tempDir });
      const watcher2 = new FileWatcher({ path: tempDir });
      expect(watcher1.id).not.toBe(watcher2.id);
    });
  });

  describe("start()", () => {
    it("should start watching and emit ready event", async () => {
      watcher = new FileWatcher({ path: tempDir });

      const readyPromise = new Promise<void>((resolve) => {
        watcher?.once("ready", () => resolve());
      });

      await watcher.start();
      await readyPromise;

      expect(watcher.running).toBe(true);
    });

    it("should throw if already running", async () => {
      watcher = new FileWatcher({ path: tempDir });
      await watcher.start();

      await expect(watcher.start()).rejects.toThrow("already running");
    });

    it("should set startedAt timestamp", async () => {
      watcher = new FileWatcher({ path: tempDir });
      const before = Date.now();
      await watcher.start();
      const after = Date.now();

      expect(watcher.state.startedAt).toBeDefined();
      expect(watcher.state.startedAt).toBeGreaterThanOrEqual(before);
      expect(watcher.state.startedAt).toBeLessThanOrEqual(after);
    });
  });

  describe("stop()", () => {
    it("should stop watching and clean up resources", async () => {
      watcher = new FileWatcher({ path: tempDir });
      await watcher.start();

      expect(watcher.running).toBe(true);

      await watcher.stop();

      expect(watcher.running).toBe(false);
    });

    it("should be safe to call stop() when not running", async () => {
      watcher = new FileWatcher({ path: tempDir });
      await watcher.stop();
      expect(watcher.running).toBe(false);
    });
  });

  describe("file watching", () => {
    it("should detect file creation", async () => {
      watcher = new FileWatcher({ path: tempDir, debounceMs: 50 });
      await watcher.start();

      const changePromise = new Promise<string[]>((resolve) => {
        watcher?.once("change", (events) => resolve(events.map((e) => e.relativePath)));
      });

      const testFile = path.join(tempDir, "test.txt");
      await createFile(testFile, "hello");

      const changedPaths = await changePromise;
      expect(changedPaths).toContain("test.txt");
    });

    it("should detect file modification", async () => {
      const testFile = path.join(tempDir, "existing.txt");
      await createFile(testFile, "initial");

      watcher = new FileWatcher({ path: tempDir, debounceMs: 50 });
      await watcher.start();

      const changePromise = new Promise<string[]>((resolve) => {
        watcher?.once("change", (events) => resolve(events.map((e) => e.type)));
      });

      await fs.writeFile(testFile, "modified", "utf-8");

      const changeTypes = await changePromise;
      expect(changeTypes).toContain("change");
    });

    it("should detect file deletion", async () => {
      const testFile = path.join(tempDir, "to-delete.txt");
      await createFile(testFile, "content");

      watcher = new FileWatcher({ path: tempDir, debounceMs: 50 });
      await watcher.start();

      const changePromise = new Promise<string[]>((resolve) => {
        watcher?.once("change", (events) => resolve(events.map((e) => e.type)));
      });

      await fs.unlink(testFile);

      const changeTypes = await changePromise;
      expect(changeTypes).toContain("unlink");
    });

    it("should debounce multiple rapid changes", async () => {
      watcher = new FileWatcher({
        path: tempDir,
        debounceMs: 100,
        awaitWriteFinish: false, // Disable for test reliability
      });
      await watcher.start();

      let changeCount = 0;
      watcher.on("change", () => changeCount++);

      // Create multiple files rapidly
      await createFile(path.join(tempDir, "file1.txt"), "1");
      await createFile(path.join(tempDir, "file2.txt"), "2");
      await createFile(path.join(tempDir, "file3.txt"), "3");

      // Wait for debounce + buffer
      await wait(300);

      // Should coalesce into single event (or at most 2 due to timing)
      expect(changeCount).toBeGreaterThanOrEqual(1);
      expect(changeCount).toBeLessThanOrEqual(2);
    });

    it("should filter by include patterns", async () => {
      watcher = new FileWatcher({
        path: tempDir,
        include: ["*.ts"],
        debounceMs: 50,
        awaitWriteFinish: false, // Disable for test reliability
      });
      await watcher.start();

      let tsChanged = false;
      let jsChanged = false;

      watcher.on("change", (events) => {
        for (const e of events) {
          if (e.relativePath.endsWith(".ts")) tsChanged = true;
          if (e.relativePath.endsWith(".js")) jsChanged = true;
        }
      });

      await createFile(path.join(tempDir, "test.ts"), "ts content");
      await createFile(path.join(tempDir, "test.js"), "js content");

      await wait(250);

      expect(tsChanged).toBe(true);
      expect(jsChanged).toBe(false);
    });
  });

  describe("state", () => {
    it("should track event count", async () => {
      watcher = new FileWatcher({
        path: tempDir,
        debounceMs: 50,
        awaitWriteFinish: false, // Disable for test reliability
      });
      await watcher.start();

      expect(watcher.state.eventCount).toBe(0);

      await createFile(path.join(tempDir, "test.txt"), "content");
      await wait(250);

      expect(watcher.state.eventCount).toBeGreaterThanOrEqual(1);
    });

    it("should track pending events", async () => {
      watcher = new FileWatcher({
        path: tempDir,
        debounceMs: 5000,
        awaitWriteFinish: false, // Disable for test reliability
      });
      await watcher.start();

      await createFile(path.join(tempDir, "test.txt"), "content");
      await wait(100); // Wait for event to be detected

      expect(watcher.state.pendingEvents).toBeGreaterThan(0);

      watcher.flush();
      expect(watcher.state.pendingEvents).toBe(0);
    });
  });

  describe("flush()", () => {
    it("should immediately emit pending events", async () => {
      watcher = new FileWatcher({
        path: tempDir,
        debounceMs: 10000,
        awaitWriteFinish: false, // Disable for test reliability
      });
      await watcher.start();

      const changePromise = new Promise<void>((resolve) => {
        watcher?.once("change", () => resolve());
      });

      await createFile(path.join(tempDir, "test.txt"), "content");
      await wait(100); // Wait for event to be detected

      watcher.flush();

      await changePromise;
      expect(watcher.state.pendingEvents).toBe(0);
    });
  });
});

// =============================================================================
// createWatcher Factory Tests
// =============================================================================

describe("createWatcher", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupDir(tempDir);
  });

  it("should create a FileWatcher instance", () => {
    const watcher = createWatcher({ path: tempDir });
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it("should pass through all options", () => {
    const watcher = createWatcher({
      path: tempDir,
      debounceMs: 500,
      include: ["*.ts"],
      id: "test",
      name: "Test",
    });

    expect(watcher.debounceMs).toBe(500);
    expect(watcher.includePatterns).toEqual(["*.ts"]);
    expect(watcher.id).toBe("test");
    expect(watcher.name).toBe("Test");
  });
});

// =============================================================================
// WatcherRegistry Tests
// =============================================================================

describe("WatcherRegistry", () => {
  let tempDir: string;
  let registry: WatcherRegistry;

  beforeEach(async () => {
    tempDir = await createTempDir();
    registry = new WatcherRegistry();
  });

  afterEach(async () => {
    await registry.clear();
    await cleanupDir(tempDir);
  });

  describe("register()", () => {
    it("should register a new watcher", () => {
      const watcher = registry.register({ path: tempDir, id: "test" });

      expect(watcher).toBeInstanceOf(FileWatcher);
      expect(registry.size).toBe(1);
      expect(registry.has("test")).toBe(true);
    });

    it("should throw if ID already exists", () => {
      registry.register({ path: tempDir, id: "test" });

      expect(() => registry.register({ path: tempDir, id: "test" })).toThrow(
        'Watcher with ID "test" already registered'
      );
    });

    it("should emit register event", () => {
      let registeredId: string | undefined;
      registry.on("register", (id) => {
        registeredId = id;
      });

      registry.register({ path: tempDir, id: "test" });

      expect(registeredId).toBe("test");
    });
  });

  describe("unregister()", () => {
    it("should unregister and stop a watcher", async () => {
      const watcher = registry.register({ path: tempDir, id: "test" });
      await watcher.start();

      const result = await registry.unregister("test");

      expect(result).toBe(true);
      expect(registry.has("test")).toBe(false);
      expect(watcher.running).toBe(false);
    });

    it("should return false if watcher not found", async () => {
      const result = await registry.unregister("nonexistent");
      expect(result).toBe(false);
    });

    it("should emit unregister event", async () => {
      let unregisteredId: string | undefined;
      registry.on("unregister", (id) => {
        unregisteredId = id;
      });

      registry.register({ path: tempDir, id: "test" });
      await registry.unregister("test");

      expect(unregisteredId).toBe("test");
    });
  });

  describe("get()", () => {
    it("should return watcher by ID", () => {
      const watcher = registry.register({ path: tempDir, id: "test" });
      expect(registry.get("test")).toBe(watcher);
    });

    it("should return undefined for unknown ID", () => {
      expect(registry.get("nonexistent")).toBeUndefined();
    });
  });

  describe("startAll() / stopAll()", () => {
    it("should start all watchers", async () => {
      registry.register({ path: tempDir, id: "watcher1" });
      registry.register({ path: tempDir, id: "watcher2" });

      const started = await registry.startAll();

      expect(started).toHaveLength(2);
      expect(registry.get("watcher1")?.running).toBe(true);
      expect(registry.get("watcher2")?.running).toBe(true);
    });

    it("should stop all watchers", async () => {
      registry.register({ path: tempDir, id: "watcher1" });
      registry.register({ path: tempDir, id: "watcher2" });
      await registry.startAll();

      const stopped = await registry.stopAll();

      expect(stopped).toHaveLength(2);
      expect(registry.get("watcher1")?.running).toBe(false);
      expect(registry.get("watcher2")?.running).toBe(false);
    });

    it("should not start already running watchers", async () => {
      const watcher = registry.register({ path: tempDir, id: "test" });
      await watcher.start();

      const started = await registry.startAll();

      expect(started).toHaveLength(0);
    });
  });

  describe("event forwarding", () => {
    it("should forward change events from watchers", async () => {
      registry.register({ path: tempDir, id: "test", debounceMs: 50 });
      await registry.startAll();

      const changePromise = new Promise<{ watcherId: string; count: number }>((resolve) => {
        registry.on("change", (watcherId, events) => {
          resolve({ watcherId, count: events.length });
        });
      });

      await createFile(path.join(tempDir, "test.txt"), "content");

      const result = await changePromise;
      expect(result.watcherId).toBe("test");
      expect(result.count).toBeGreaterThan(0);
    });
  });

  describe("getStatus()", () => {
    it("should return status of all watchers", async () => {
      registry.register({ path: tempDir, id: "running" });
      registry.register({ path: tempDir, id: "stopped" });
      await registry.start("running");

      const status = registry.getStatus();

      expect(status.get("running")).toEqual({ running: true, eventCount: 0 });
      expect(status.get("stopped")).toEqual({ running: false, eventCount: 0 });
    });
  });
});

// =============================================================================
// createWatcherRegistry Factory Tests
// =============================================================================

describe("createWatcherRegistry", () => {
  it("should create a WatcherRegistry instance", () => {
    const registry = createWatcherRegistry();
    expect(registry).toBeInstanceOf(WatcherRegistry);
  });
});

// =============================================================================
// Presets Tests
// =============================================================================

describe("Presets", () => {
  describe("WATCHER_PRESETS", () => {
    it("should have all expected presets", () => {
      expect(WATCHER_PRESETS.config).toBeDefined();
      expect(WATCHER_PRESETS.agents).toBeDefined();
      expect(WATCHER_PRESETS.skills).toBeDefined();
      expect(WATCHER_PRESETS.source).toBeDefined();
      expect(WATCHER_PRESETS.tests).toBeDefined();
      expect(WATCHER_PRESETS.docs).toBeDefined();
    });

    it("should have required fields in each preset", () => {
      for (const preset of Object.values(WATCHER_PRESETS)) {
        expect(preset.id).toBeDefined();
        expect(preset.name).toBeDefined();
        expect(preset.description).toBeDefined();
        expect(preset.include).toBeDefined();
        expect(Array.isArray(preset.include)).toBe(true);
      }
    });
  });

  describe("getWatcherPreset()", () => {
    it("should return preset by ID", () => {
      const preset = getWatcherPreset("config");
      expect(preset?.id).toBe("config");
    });

    it("should return undefined for unknown ID", () => {
      expect(getWatcherPreset("nonexistent")).toBeUndefined();
    });
  });

  describe("getWatcherPresetIds()", () => {
    it("should return all preset IDs", () => {
      const ids = getWatcherPresetIds();
      expect(ids).toContain("config");
      expect(ids).toContain("agents");
      expect(ids).toContain("skills");
    });
  });
});
