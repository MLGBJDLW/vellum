/**
 * Tests for recall_memory tool
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../../types/tool.js";
import { recallMemoryTool } from "../recall-memory.js";
import type { SavedMemoryEntry } from "../save-memory.js";

describe("recallMemoryTool", () => {
  let ctx: ToolContext;
  let testDir: string;

  beforeEach(async () => {
    testDir = join(process.cwd(), `.test-recall-${Date.now()}`);
    await mkdir(join(testDir, ".vellum", "memory", "default"), { recursive: true });
    await mkdir(join(testDir, ".vellum", "memory", "custom"), { recursive: true });

    ctx = {
      workingDir: testDir,
      sessionId: "test-session",
      messageId: "test-message",
      callId: "test-call",
      abortSignal: new AbortController().signal,
      checkPermission: vi.fn().mockResolvedValue(true),
    };
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("tool definition", () => {
    it("should have correct metadata", () => {
      expect(recallMemoryTool.definition.name).toBe("recall_memory");
      expect(recallMemoryTool.definition.kind).toBe("read");
      expect(recallMemoryTool.definition.category).toBe("memory");
    });

    it("should not require confirmation", () => {
      expect(recallMemoryTool.shouldConfirm?.({ key: "test", namespace: "default" }, ctx)).toBe(
        false
      );
    });
  });

  describe("execute", () => {
    it("should recall existing memory from default namespace", async () => {
      // Create a memory file
      const memoryEntry: SavedMemoryEntry = {
        value: "stored-value",
        storedAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        namespace: "default",
        key: "test-key",
      };
      const filePath = join(testDir, ".vellum", "memory", "default", "test-key.json");
      await writeFile(filePath, JSON.stringify(memoryEntry));

      const result = await recallMemoryTool.execute({ key: "test-key", namespace: "default" }, ctx);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.found).toBe(true);
        expect(result.output.value).toBe("stored-value");
        expect(result.output.storedAt).toBe("2025-01-01T00:00:00Z");
        expect(result.output.key).toBe("test-key");
        expect(result.output.namespace).toBe("default");
      }
    });

    it("should recall memory from custom namespace", async () => {
      const memoryEntry: SavedMemoryEntry = {
        value: "custom-value",
        storedAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        namespace: "custom",
        key: "config",
      };
      const filePath = join(testDir, ".vellum", "memory", "custom", "config.json");
      await writeFile(filePath, JSON.stringify(memoryEntry));

      const result = await recallMemoryTool.execute({ key: "config", namespace: "custom" }, ctx);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.found).toBe(true);
        expect(result.output.value).toBe("custom-value");
        expect(result.output.namespace).toBe("custom");
      }
    });

    it("should return found: false for missing memory (not error)", async () => {
      const result = await recallMemoryTool.execute(
        { key: "nonexistent", namespace: "default" },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.found).toBe(false);
        expect(result.output.value).toBeUndefined();
        expect(result.output.key).toBe("nonexistent");
        expect(result.output.namespace).toBe("default");
      }
    });

    it("should return found: false for missing namespace", async () => {
      const result = await recallMemoryTool.execute(
        { key: "test", namespace: "nonexistent-namespace" },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.found).toBe(false);
      }
    });

    it("should include updatedAt in output", async () => {
      const memoryEntry: SavedMemoryEntry = {
        value: "value",
        storedAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-02T00:00:00Z",
        namespace: "default",
        key: "updated-key",
      };
      const filePath = join(testDir, ".vellum", "memory", "default", "updated-key.json");
      await writeFile(filePath, JSON.stringify(memoryEntry));

      const result = await recallMemoryTool.execute(
        { key: "updated-key", namespace: "default" },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.updatedAt).toBe("2025-01-02T00:00:00Z");
      }
    });
  });

  describe("error handling", () => {
    it("should fail on invalid JSON", async () => {
      const filePath = join(testDir, ".vellum", "memory", "default", "bad-json.json");
      await writeFile(filePath, "not valid json");

      const result = await recallMemoryTool.execute({ key: "bad-json", namespace: "default" }, ctx);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Failed to recall memory");
      }
    });
  });

  describe("key validation", () => {
    it("should accept alphanumeric keys", async () => {
      const result = await recallMemoryTool.execute({ key: "abc123", namespace: "default" }, ctx);

      expect(result.success).toBe(true);
    });

    it("should accept keys with dashes", async () => {
      const result = await recallMemoryTool.execute({ key: "my-key", namespace: "default" }, ctx);

      expect(result.success).toBe(true);
    });

    it("should accept single character key", async () => {
      const result = await recallMemoryTool.execute({ key: "x", namespace: "default" }, ctx);

      expect(result.success).toBe(true);
    });
  });

  describe("cancellation", () => {
    it("should return error when cancelled", async () => {
      const controller = new AbortController();
      controller.abort();
      ctx.abortSignal = controller.signal;

      const result = await recallMemoryTool.execute({ key: "test", namespace: "default" }, ctx);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("cancelled");
      }
    });
  });
});
