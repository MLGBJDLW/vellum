import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Err, Ok } from "../../../types/result.js";
import {
  AgentDiscovery,
  createAgentDiscovery,
  DEFAULT_DEBOUNCE_MS,
  DiscoverySource,
} from "../discovery.js";
import { AgentLoader } from "../loader.js";
import type { CustomAgentDefinition } from "../types.js";

// ============================================
// AgentDiscovery Tests (T014)
// ============================================

/**
 * Helper to create a minimal agent definition.
 */
function createTestAgent(
  slug: string,
  name: string,
  extras: Partial<CustomAgentDefinition> = {}
): CustomAgentDefinition {
  return {
    slug,
    name,
    ...extras,
  };
}

describe("AgentDiscovery", () => {
  let discovery: AgentDiscovery;
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = path.join(os.tmpdir(), `vellum-test-${Date.now()}`);
  });

  afterEach(async () => {
    if (discovery?.watching) {
      await discovery.stop();
    }
    vi.restoreAllMocks();
  });

  // ============================================
  // Constructor and Options Tests
  // ============================================

  describe("constructor and options", () => {
    it("uses default debounce delay", () => {
      discovery = new AgentDiscovery();
      expect((discovery as any).options.debounceMs).toBe(DEFAULT_DEBOUNCE_MS);
    });

    it("accepts custom debounce delay", () => {
      discovery = new AgentDiscovery({
        debounceMs: 500,
      });
      expect((discovery as any).options.debounceMs).toBe(500);
    });

    it("accepts custom paths", () => {
      const customPaths = ["/path/one", "/path/two"];
      discovery = new AgentDiscovery({
        paths: customPaths,
      });
      expect((discovery as any).options.paths).toEqual(customPaths);
    });

    it("accepts custom loader", () => {
      const customLoader = new AgentLoader();
      discovery = new AgentDiscovery({
        loader: customLoader,
      });
      expect((discovery as any).loader).toBe(customLoader);
    });

    it("defaults watchEnabled to true", () => {
      discovery = new AgentDiscovery();
      expect((discovery as any).options.watchEnabled).toBe(true);
    });

    it("can disable watch", () => {
      discovery = new AgentDiscovery({
        watchEnabled: false,
      });
      expect((discovery as any).options.watchEnabled).toBe(false);
    });
  });

  // ============================================
  // Priority Ordering Tests
  // ============================================

  describe("priority ordering", () => {
    it("assigns correct source priorities based on path", () => {
      const userHome = os.homedir();
      const cwd = process.cwd();

      discovery = new AgentDiscovery({
        watchEnabled: false,
      });

      const getSourceFromPath = (discovery as any).getSourceFromPath.bind(discovery);

      expect(getSourceFromPath(path.join(cwd, ".vellum", "agents", "test.yaml"))).toBe(
        DiscoverySource.PROJECT
      );
      expect(getSourceFromPath(path.join(userHome, ".vellum", "agents", "test.yaml"))).toBe(
        DiscoverySource.USER
      );
      expect(getSourceFromPath("/some/other/path/test.yaml")).toBe(DiscoverySource.SYSTEM);
    });

    it("calculates source priority from index", () => {
      discovery = new AgentDiscovery({
        watchEnabled: false,
      });

      const getSourcePriority = (discovery as any).getSourcePriority.bind(discovery);

      // Implementation uses: ratio = index / totalPaths
      // ratio > 0.75 → CLI, > 0.5 → ENV, > 0.25 → PROJECT, else SYSTEM

      // index=0, total=4: ratio = 0.00 → SYSTEM
      expect(getSourcePriority("/unknown", 0, 4)).toBe(DiscoverySource.SYSTEM);
      // index=1, total=4: ratio = 0.25 → NOT > 0.25 → SYSTEM
      expect(getSourcePriority("/unknown", 1, 4)).toBe(DiscoverySource.SYSTEM);
      // index=2, total=4: ratio = 0.50 → NOT > 0.50 but > 0.25 → PROJECT
      expect(getSourcePriority("/unknown", 2, 4)).toBe(DiscoverySource.PROJECT);
      // index=3, total=4: ratio = 0.75 → NOT > 0.75 but > 0.50 → ENV
      expect(getSourcePriority("/unknown", 3, 4)).toBe(DiscoverySource.ENV);
    });
  });

  // ============================================
  // Hot-Reload Events Tests
  // ============================================

  describe("hot-reload events", () => {
    it("emits agent:added event for new agents via reload", async () => {
      const mockLoader = new AgentLoader();
      vi.spyOn(mockLoader, "loadFile").mockResolvedValue(
        Ok(createTestAgent("new-agent", "New Agent"))
      );

      const addedHandler = vi.fn();

      discovery = new AgentDiscovery({
        paths: [path.join(tempDir, "agents")],
        watchEnabled: false,
        loader: mockLoader,
      });

      discovery.on("agent:added", addedHandler);

      await discovery.reload(path.join(tempDir, "agents", "new-agent.yaml"));

      expect(addedHandler).toHaveBeenCalledTimes(1);
      expect(addedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          definition: expect.objectContaining({ slug: "new-agent" }),
        })
      );
    });

    it("emits agent:changed event for modified agents via reload", async () => {
      const mockLoader = new AgentLoader();
      let callCount = 0;
      vi.spyOn(mockLoader, "loadFile").mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return Ok(createTestAgent("existing", "Original Name"));
        }
        return Ok(createTestAgent("existing", "Modified Name"));
      });

      const changedHandler = vi.fn();

      discovery = new AgentDiscovery({
        paths: [path.join(tempDir, "agents")],
        watchEnabled: false,
        loader: mockLoader,
      });

      discovery.on("agent:changed", changedHandler);

      // First load
      await discovery.reload(path.join(tempDir, "agents", "existing.yaml"));
      // Second load (same file = change)
      await discovery.reload(path.join(tempDir, "agents", "existing.yaml"));

      expect(changedHandler).toHaveBeenCalledTimes(1);
      expect(changedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          definition: expect.objectContaining({ name: "Modified Name" }),
        })
      );
    });

    it("emits discovery:error for invalid files during reload", async () => {
      const mockLoader = new AgentLoader();
      vi.spyOn(mockLoader, "loadFile").mockResolvedValue(
        Err({
          code: "PARSE_ERROR",
          message: "Invalid YAML",
          filePath: "invalid.yaml",
        })
      );

      const errorHandler = vi.fn();

      discovery = new AgentDiscovery({
        paths: [path.join(tempDir, "agents")],
        watchEnabled: false,
        loader: mockLoader,
      });

      discovery.on("discovery:error", errorHandler);

      await discovery.reload(path.join(tempDir, "agents", "invalid.yaml"));

      expect(errorHandler).toHaveBeenCalled();
    });

    it("does not reload non-agent files", async () => {
      const mockLoader = new AgentLoader();
      const loadSpy = vi.spyOn(mockLoader, "loadFile");

      discovery = new AgentDiscovery({
        paths: [path.join(tempDir, "agents")],
        watchEnabled: false,
        loader: mockLoader,
      });

      await discovery.reload(path.join(tempDir, "agents", "readme.txt"));
      await discovery.reload(path.join(tempDir, "agents", "config.json"));

      expect(loadSpy).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // Windows Path Handling Tests
  // ============================================

  describe("Windows path handling", () => {
    it("normalizes Windows paths correctly", () => {
      const windowsPath = "C:\\Users\\test\\.vellum\\agents\\agent.yaml";

      discovery = new AgentDiscovery({
        paths: [path.join(tempDir, "agents")],
        watchEnabled: false,
      });

      const normalizedPath = (discovery as any).normalizePath(windowsPath);
      // Should be normalized (no double backslashes)
      expect(normalizedPath).not.toContain("\\\\");
    });

    it("handles mixed path separators", () => {
      const mixedPath = "C:/Users/test\\.vellum/agents\\agent.yaml";

      discovery = new AgentDiscovery({
        paths: [path.join(tempDir, "agents")],
        watchEnabled: false,
      });

      const normalizedPath = (discovery as any).normalizePath(mixedPath);
      expect(normalizedPath).toBeDefined();
    });
  });

  // ============================================
  // Event Debouncing Tests
  // ============================================

  describe("event debouncing", () => {
    it("queues file change events", async () => {
      discovery = new AgentDiscovery({
        paths: [path.join(tempDir, "agents")],
        debounceMs: 100,
        watchEnabled: false,
      });

      // Simulate file events using private method
      const handleFileEvent = (discovery as any).handleFileEvent.bind(discovery);
      handleFileEvent(path.join(tempDir, "agents", "test.yaml"), "add");

      expect((discovery as any).pendingChanges.size).toBe(1);
    });

    it("overwrites pending changes for same file", async () => {
      discovery = new AgentDiscovery({
        paths: [path.join(tempDir, "agents")],
        debounceMs: 100,
        watchEnabled: false,
      });

      const handleFileEvent = (discovery as any).handleFileEvent.bind(discovery);
      const testFile = path.join(tempDir, "agents", "test.yaml");

      handleFileEvent(testFile, "add");
      handleFileEvent(testFile, "change");
      handleFileEvent(testFile, "change");

      // Should still be just 1 pending change
      expect((discovery as any).pendingChanges.size).toBe(1);
      // Latest type should be 'change'
      const pending = (discovery as any).pendingChanges.get(
        (discovery as any).normalizePath(testFile)
      );
      expect(pending?.type).toBe("change");
    });

    it("sets debounce timer on file event", async () => {
      vi.useFakeTimers();

      discovery = new AgentDiscovery({
        paths: [path.join(tempDir, "agents")],
        debounceMs: 100,
        watchEnabled: false,
      });

      const handleFileEvent = (discovery as any).handleFileEvent.bind(discovery);
      handleFileEvent(path.join(tempDir, "agents", "test.yaml"), "add");

      expect((discovery as any).debounceTimer).not.toBeNull();

      vi.useRealTimers();
    });

    it("clears pending changes after processing", async () => {
      vi.useFakeTimers();

      discovery = new AgentDiscovery({
        paths: [path.join(tempDir, "agents")],
        debounceMs: 50,
        watchEnabled: false,
      });

      const handleFileEvent = (discovery as any).handleFileEvent.bind(discovery);
      handleFileEvent(path.join(tempDir, "agents", "test.yaml"), "add");

      expect((discovery as any).pendingChanges.size).toBe(1);

      // Advance past debounce period
      await vi.advanceTimersByTimeAsync(100);

      expect((discovery as any).pendingChanges.size).toBe(0);

      vi.useRealTimers();
    });
  });

  // ============================================
  // Watcher Lifecycle Tests
  // ============================================

  describe("watcher lifecycle", () => {
    it("does not start watcher when watchEnabled is false", () => {
      discovery = new AgentDiscovery({
        paths: [path.join(tempDir, "agents")],
        watchEnabled: false,
      });

      discovery.watch();

      expect(discovery.watching).toBe(false);
    });

    it("handles multiple stop calls gracefully", async () => {
      discovery = new AgentDiscovery({
        paths: [path.join(tempDir, "agents")],
        watchEnabled: false,
      });

      // Multiple stops should not throw
      await discovery.stop();
      await discovery.stop();
      await discovery.stop();

      expect(discovery.watching).toBe(false);
    });

    it("clears state on stop", async () => {
      vi.useFakeTimers();

      discovery = new AgentDiscovery({
        paths: [path.join(tempDir, "agents")],
        debounceMs: 1000,
        watchEnabled: true, // Must be true to start watching
      });

      // Manually set isWatching to true so stop() processes cleanup
      (discovery as any).isWatching = true;

      // Queue a change to create timer
      const handleFileEvent = (discovery as any).handleFileEvent.bind(discovery);
      handleFileEvent(path.join(tempDir, "agents", "test.yaml"), "add");

      expect((discovery as any).pendingChanges.size).toBe(1);

      await discovery.stop();

      // stop() clears pendingChanges when isWatching was true
      expect((discovery as any).pendingChanges.size).toBe(0);

      vi.useRealTimers();
    });
  });

  // ============================================
  // Public API Tests
  // ============================================

  describe("public API", () => {
    beforeEach(async () => {
      const mockLoader = new AgentLoader();
      vi.spyOn(mockLoader, "loadFile").mockResolvedValue(
        Ok(createTestAgent("api-agent", "API Agent"))
      );

      discovery = new AgentDiscovery({
        paths: [path.join(tempDir, "agents")],
        watchEnabled: false,
        loader: mockLoader,
      });

      // Manually add an agent via reload to populate the internal state
      await discovery.reload(path.join(tempDir, "agents", "api-agent.yaml"));
    });

    it("get() returns agent by slug", () => {
      const agent = discovery.get("api-agent");
      expect(agent).toBeDefined();
      expect(agent?.definition.slug).toBe("api-agent");
    });

    it("get() returns undefined for unknown slug", () => {
      const agent = discovery.get("unknown");
      expect(agent).toBeUndefined();
    });

    it("has() returns true for existing agent", () => {
      expect(discovery.has("api-agent")).toBe(true);
    });

    it("has() returns false for unknown agent", () => {
      expect(discovery.has("unknown")).toBe(false);
    });

    it("count returns correct agent count", () => {
      expect(discovery.count).toBe(1);
    });

    it("getAll() returns copy of agents map", () => {
      const all = discovery.getAll();
      expect(all.size).toBe(1);
      expect(all.has("api-agent")).toBe(true);

      // Modifying returned map should not affect internal state
      all.delete("api-agent");
      expect(discovery.has("api-agent")).toBe(true);
    });

    it("watching getter returns correct state", () => {
      expect(discovery.watching).toBe(false);
    });
  });

  // ============================================
  // Factory Function Tests
  // ============================================

  describe("createAgentDiscovery", () => {
    it("creates a new AgentDiscovery instance", () => {
      const newDiscovery = createAgentDiscovery();
      expect(newDiscovery).toBeInstanceOf(AgentDiscovery);
    });

    it("passes options to instance", () => {
      const newDiscovery = createAgentDiscovery({
        debounceMs: 500,
        watchEnabled: false,
      });

      expect((newDiscovery as any).options.debounceMs).toBe(500);
      expect((newDiscovery as any).options.watchEnabled).toBe(false);
    });
  });

  // ============================================
  // DiscoverySource Enum Tests
  // ============================================

  describe("DiscoverySource enum", () => {
    it("has correct priority values", () => {
      expect(DiscoverySource.SYSTEM).toBe(0);
      expect(DiscoverySource.USER).toBe(1);
      expect(DiscoverySource.PROJECT).toBe(2);
      expect(DiscoverySource.ENV).toBe(3);
      expect(DiscoverySource.CLI).toBe(4);
    });

    it("CLI has highest priority", () => {
      expect(DiscoverySource.CLI).toBeGreaterThan(DiscoverySource.ENV);
      expect(DiscoverySource.ENV).toBeGreaterThan(DiscoverySource.PROJECT);
      expect(DiscoverySource.PROJECT).toBeGreaterThan(DiscoverySource.USER);
      expect(DiscoverySource.USER).toBeGreaterThan(DiscoverySource.SYSTEM);
    });
  });

  // ============================================
  // Default Paths Tests
  // ============================================

  describe("default paths", () => {
    it("generates default paths when none provided", () => {
      discovery = new AgentDiscovery({
        watchEnabled: false,
      });

      const getDefaultPaths = (discovery as any).getDefaultPaths.bind(discovery);
      const paths = getDefaultPaths();

      expect(paths).toBeInstanceOf(Array);
      expect(paths.length).toBeGreaterThan(0);
      // Should include user home .vellum/agents
      expect(paths.some((p: string) => p.includes(".vellum"))).toBe(true);
    });
  });
});
