/**
 * FileMemoryManager Unit Tests
 *
 * Tests for file-based memory management.
 *
 * @see packages/core/src/agent/memory/file-memory-manager.ts
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFileMemoryManager, FileMemoryManager } from "../file-memory-manager.js";
import {
  DEFAULT_FILE_MEMORY_CONFIG,
  MEMORY_FILE_NAMES,
  MEMORY_SECTIONS,
  type MemorySection,
} from "../types.js";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Creates a temporary directory for testing.
 */
async function createTempDir(): Promise<string> {
  const prefix = path.join(os.tmpdir(), "vellum-memory-test-");
  return await fs.mkdtemp(prefix);
}

/**
 * Recursively removes a directory.
 */
async function removeTempDir(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Reads a file's content.
 */
async function readFile(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath, "utf-8");
  return content;
}

/**
 * Checks if a file exists.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Test Suite
// =============================================================================

describe("FileMemoryManager", () => {
  let tempDir: string;
  let manager: FileMemoryManager;

  beforeEach(async () => {
    tempDir = await createTempDir();
    // Disable auto-snapshot for most tests to avoid git dependency
    manager = new FileMemoryManager({ autoSnapshot: false });
  });

  afterEach(async () => {
    await removeTempDir(tempDir);
  });

  // ===========================================================================
  // Initialization Tests
  // ===========================================================================

  describe("initialize", () => {
    it("should create memory directory structure", async () => {
      await manager.initialize(tempDir);

      const memoryPath = manager.getMemoryPath();
      expect(memoryPath).toBe(path.join(tempDir, ".vellum", "memory"));

      const exists = await fileExists(memoryPath);
      expect(exists).toBe(true);
    });

    it("should create all memory files with initial content", async () => {
      await manager.initialize(tempDir, "test-session-123");

      for (const section of MEMORY_SECTIONS) {
        const filePath = path.join(manager.getMemoryPath(), MEMORY_FILE_NAMES[section]);
        const exists = await fileExists(filePath);
        expect(exists).toBe(true);

        const content = await readFile(filePath);
        expect(content).toContain("test-session-123");
      }
    });

    it("should not overwrite existing memory files", async () => {
      // First initialization
      await manager.initialize(tempDir, "session-1");
      const planPath = path.join(manager.getMemoryPath(), MEMORY_FILE_NAMES.plan);
      await fs.writeFile(planPath, "# Custom Content\n\nKeep this!", "utf-8");

      // Second initialization (should preserve content)
      const manager2 = new FileMemoryManager({ autoSnapshot: false });
      await manager2.initialize(tempDir, "session-2");

      const content = await readFile(planPath);
      expect(content).toContain("Custom Content");
      expect(content).not.toContain("session-2");
    });

    it("should throw when calling getMemoryPath before initialize", () => {
      const uninitManager = new FileMemoryManager();
      expect(() => uninitManager.getMemoryPath()).toThrow("not initialized");
    });
  });

  // ===========================================================================
  // Read/Write Tests
  // ===========================================================================

  describe("write", () => {
    beforeEach(async () => {
      await manager.initialize(tempDir);
    });

    it("should write content to plan section", async () => {
      const content = "## Phase 1\n- Task A\n- Task B";
      await manager.write("plan", content);

      const filePath = path.join(manager.getMemoryPath(), MEMORY_FILE_NAMES.plan);
      const readContent = await readFile(filePath);
      expect(readContent).toBe(content);
    });

    it("should write content to findings section", async () => {
      const content = "## Discovery\nFound interesting pattern";
      await manager.write("findings", content);

      const result = await manager.read("findings");
      expect(result).toBe(content);
    });

    it("should write content to progress section", async () => {
      const content = "## Log\nSession started";
      await manager.write("progress", content);

      const result = await manager.read("progress");
      expect(result).toBe(content);
    });

    it("should replace existing content on write", async () => {
      await manager.write("plan", "Original content");
      await manager.write("plan", "New content");

      const result = await manager.read("plan");
      expect(result).toBe("New content");
    });

    it("should reject invalid section names", async () => {
      await expect(manager.write("invalid" as MemorySection, "content")).rejects.toThrow();
    });
  });

  describe("read", () => {
    beforeEach(async () => {
      await manager.initialize(tempDir);
    });

    it("should read existing content", async () => {
      await manager.write("findings", "Test findings");
      const result = await manager.read("findings");
      expect(result).toBe("Test findings");
    });

    it("should return initial content for new files", async () => {
      const result = await manager.read("plan");
      expect(result).not.toBeNull();
      expect(result).toContain("# Task Plan");
    });

    it("should return null for non-existent files", async () => {
      // Delete the file manually
      const filePath = path.join(manager.getMemoryPath(), MEMORY_FILE_NAMES.plan);
      await fs.unlink(filePath);

      const result = await manager.read("plan");
      expect(result).toBeNull();
    });
  });

  describe("append", () => {
    beforeEach(async () => {
      await manager.initialize(tempDir);
    });

    it("should append to findings section", async () => {
      await manager.write("findings", "Initial");
      await manager.append("findings", "Additional finding");

      const result = await manager.read("findings");
      expect(result).toContain("Initial");
      expect(result).toContain("Additional finding");
    });

    it("should append to progress section with timestamp", async () => {
      await manager.write("progress", "Log start");
      await manager.append("progress", "Test completed");

      const result = await manager.read("progress");
      expect(result).toContain("Log start");
      expect(result).toContain("Test completed");
      // Should have timestamp format [MM/DD/YYYY, HH:MM:SS]
      expect(result).toMatch(/\[\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}:\d{2}\]/);
    });

    it("should reject append to plan section", async () => {
      await expect(
        // @ts-expect-error - Testing runtime validation
        manager.append("plan", "Should fail")
      ).rejects.toThrow("Cannot append to section: plan");
    });
  });

  // ===========================================================================
  // Status Tests
  // ===========================================================================

  describe("getStatus", () => {
    beforeEach(async () => {
      await manager.initialize(tempDir);
    });

    it("should return status for all sections", async () => {
      const status = await manager.getStatus();

      expect(status.initialized).toBe(true);
      expect(status.memoryPath).toBe(manager.getMemoryPath());
      expect(status.sections.plan).toBeDefined();
      expect(status.sections.findings).toBeDefined();
      expect(status.sections.progress).toBeDefined();
    });

    it("should report correct file sizes", async () => {
      const content = "x".repeat(1000);
      await manager.write("plan", content);

      const status = await manager.getStatus();
      expect(status.sections.plan.sizeBytes).toBe(1000);
      expect(status.sections.plan.exists).toBe(true);
    });

    it("should report size status correctly", async () => {
      // Default warning threshold is 10KB
      const smallContent = "x".repeat(100);
      await manager.write("plan", smallContent);

      let status = await manager.getStatus();
      expect(status.sections.plan.status).toBe("ok");

      // Write content at warning threshold
      const warningContent = "x".repeat(10 * 1024);
      await manager.write("plan", warningContent);

      status = await manager.getStatus();
      expect(status.sections.plan.status).toBe("warning");

      // Write content at compaction threshold
      const largeContent = "x".repeat(20 * 1024);
      await manager.write("plan", largeContent);

      status = await manager.getStatus();
      expect(status.sections.plan.status).toBe("needs_compaction");
    });

    it("should calculate total size across sections", async () => {
      await manager.write("plan", "x".repeat(100));
      await manager.write("findings", "x".repeat(200));
      await manager.write("progress", "x".repeat(300));

      const status = await manager.getStatus();
      expect(status.totalSizeBytes).toBe(600);
    });
  });

  // ===========================================================================
  // Compaction Tests
  // ===========================================================================

  describe("compact", () => {
    beforeEach(async () => {
      await manager.initialize(tempDir);
    });

    it("should not compact small files", async () => {
      await manager.write("findings", "Small content");

      const result = await manager.compact("findings");
      expect(result.linesRemoved).toBe(0);
      expect(result.originalSize).toBe(result.compactedSize);
    });

    it("should compact large files by keeping last N lines", async () => {
      // Create content with many lines (default max is 100)
      const lines = Array.from({ length: 200 }, (_, i) => `Line ${i + 1}`).join("\n");
      await manager.write("progress", lines);

      const result = await manager.compact("progress");
      expect(result.linesRemoved).toBe(100);
      expect(result.compactedSize).toBeLessThan(result.originalSize);
    });

    it("should add compaction marker after compacting", async () => {
      const lines = Array.from({ length: 200 }, (_, i) => `Line ${i + 1}`).join("\n");
      await manager.write("findings", lines);

      await manager.compact("findings");

      const content = await manager.read("findings");
      expect(content).toContain("[COMPACTED]");
      expect(content).toContain("Removed 100 lines");
    });

    it("should emit onCompacted event", async () => {
      const onCompacted = vi.fn();
      manager.setEvents({ onCompacted });

      const lines = Array.from({ length: 200 }, (_, i) => `Line ${i + 1}`).join("\n");
      await manager.write("progress", lines);

      await manager.compact("progress");

      expect(onCompacted).toHaveBeenCalledTimes(1);
      expect(onCompacted).toHaveBeenCalledWith(
        expect.objectContaining({
          section: "progress",
          linesRemoved: 100,
        })
      );
    });
  });

  // ===========================================================================
  // Events Tests
  // ===========================================================================

  describe("events", () => {
    beforeEach(async () => {
      await manager.initialize(tempDir);
    });

    it("should emit onWarning when size exceeds warning threshold", async () => {
      const onWarning = vi.fn();
      manager.setEvents({ onWarning });

      // Write content just over warning threshold (10KB)
      const content = "x".repeat(10 * 1024 + 1);
      await manager.write("plan", content);

      expect(onWarning).toHaveBeenCalledTimes(1);
      expect(onWarning).toHaveBeenCalledWith("plan", expect.any(Number));
    });

    it("should emit onError when operations fail", async () => {
      const onError = vi.fn();
      manager.setEvents({ onError });

      // Make the file read-only to trigger error
      const filePath = path.join(manager.getMemoryPath(), MEMORY_FILE_NAMES.plan);
      await fs.chmod(filePath, 0o444);

      try {
        await manager.write("plan", "Should fail");
      } catch {
        // Expected to fail
      }

      // Restore permissions for cleanup
      await fs.chmod(filePath, 0o644);

      expect(onError).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // Configuration Tests
  // ===========================================================================

  describe("configuration", () => {
    it("should use custom warning threshold", async () => {
      const customManager = new FileMemoryManager({
        autoSnapshot: false,
        warningSizeBytes: 500,
      });
      await customManager.initialize(tempDir);

      const content = "x".repeat(600);
      await customManager.write("plan", content);

      const status = await customManager.getStatus();
      expect(status.sections.plan.status).toBe("warning");
    });

    it("should use custom compaction threshold", async () => {
      const customManager = new FileMemoryManager({
        autoSnapshot: false,
        compactionSizeBytes: 1000,
      });
      await customManager.initialize(tempDir);

      const content = "x".repeat(1001);
      await customManager.write("plan", content);

      const status = await customManager.getStatus();
      expect(status.sections.plan.status).toBe("needs_compaction");
    });

    it("should use custom compaction max lines", async () => {
      const customManager = new FileMemoryManager({
        autoSnapshot: false,
        compactionMaxLines: 50,
      });
      await customManager.initialize(tempDir);

      const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`).join("\n");
      await customManager.write("progress", lines);

      const result = await customManager.compact("progress");
      expect(result.linesRemoved).toBe(50);
    });

    it("should return config via getConfig", async () => {
      const customManager = new FileMemoryManager({
        autoSnapshot: false,
        warningSizeBytes: 5000,
        compactionSizeBytes: 15000,
      });

      const config = customManager.getConfig();
      expect(config.warningSizeBytes).toBe(5000);
      expect(config.compactionSizeBytes).toBe(15000);
      expect(config.autoSnapshot).toBe(false);
    });
  });

  // ===========================================================================
  // Factory Function Tests
  // ===========================================================================

  describe("createFileMemoryManager", () => {
    it("should create manager with default config", () => {
      const manager = createFileMemoryManager();
      const config = manager.getConfig();
      expect(config).toEqual(DEFAULT_FILE_MEMORY_CONFIG);
    });

    it("should create manager with custom config", () => {
      const manager = createFileMemoryManager({
        warningSizeBytes: 5000,
        autoSnapshot: false,
      });
      const config = manager.getConfig();
      expect(config.warningSizeBytes).toBe(5000);
      expect(config.autoSnapshot).toBe(false);
    });
  });
});
