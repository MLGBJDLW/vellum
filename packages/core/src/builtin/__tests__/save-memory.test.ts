/**
 * Tests for save_memory tool
 */

import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../../types/tool.js";
import { type SavedMemoryEntry, saveMemoryTool } from "../save-memory.js";

describe("saveMemoryTool", () => {
  let ctx: ToolContext;
  let testDir: string;

  beforeEach(async () => {
    testDir = join(process.cwd(), `.test-memory-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

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
      expect(saveMemoryTool.definition.name).toBe("save_memory");
      expect(saveMemoryTool.definition.kind).toBe("write");
      expect(saveMemoryTool.definition.category).toBe("memory");
    });

    it("should not require confirmation", () => {
      expect(
        saveMemoryTool.shouldConfirm?.({ key: "test", value: "value", namespace: "default" }, ctx)
      ).toBe(false);
    });
  });

  describe("execute", () => {
    it("should save memory to default namespace", async () => {
      const result = await saveMemoryTool.execute(
        { key: "test-key", value: "test-value", namespace: "default" },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.key).toBe("test-key");
        expect(result.output.namespace).toBe("default");
        expect(result.output.created).toBe(true);
        expect(result.output.path).toContain("test-key.json");
      }

      // Verify file was created
      const filePath = join(testDir, ".vellum", "memory", "default", "test-key.json");
      const content = await readFile(filePath, "utf-8");
      const entry = JSON.parse(content) as SavedMemoryEntry;
      expect(entry.value).toBe("test-value");
      expect(entry.key).toBe("test-key");
      expect(entry.namespace).toBe("default");
    });

    it("should save memory to custom namespace", async () => {
      const result = await saveMemoryTool.execute(
        { key: "config-key", value: "config-value", namespace: "settings" },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.namespace).toBe("settings");
      }

      // Verify file location
      const filePath = join(testDir, ".vellum", "memory", "settings", "config-key.json");
      const content = await readFile(filePath, "utf-8");
      const entry = JSON.parse(content) as SavedMemoryEntry;
      expect(entry.namespace).toBe("settings");
    });

    it("should update existing memory", async () => {
      // Create initial memory
      await saveMemoryTool.execute(
        { key: "update-key", value: "original", namespace: "default" },
        ctx
      );

      // Update memory
      const result = await saveMemoryTool.execute(
        { key: "update-key", value: "updated", namespace: "default" },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.created).toBe(false);
        expect(result.output.message).toContain("Updated");
      }

      // Verify updated value
      const filePath = join(testDir, ".vellum", "memory", "default", "update-key.json");
      const content = await readFile(filePath, "utf-8");
      const entry = JSON.parse(content) as SavedMemoryEntry;
      expect(entry.value).toBe("updated");
    });

    it("should preserve original storedAt on update", async () => {
      await saveMemoryTool.execute(
        { key: "timestamp-key", value: "v1", namespace: "default" },
        ctx
      );

      // Wait a tiny bit to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      await saveMemoryTool.execute(
        { key: "timestamp-key", value: "v2", namespace: "default" },
        ctx
      );

      const filePath = join(testDir, ".vellum", "memory", "default", "timestamp-key.json");
      const content = await readFile(filePath, "utf-8");
      const entry = JSON.parse(content) as SavedMemoryEntry;

      expect(entry.storedAt).not.toBe(entry.updatedAt);
    });

    it("should create directories if they don't exist", async () => {
      const result = await saveMemoryTool.execute(
        { key: "nested", value: "value", namespace: "deep-namespace" },
        ctx
      );

      expect(result.success).toBe(true);

      const filePath = join(testDir, ".vellum", "memory", "deep-namespace", "nested.json");
      const content = await readFile(filePath, "utf-8");
      expect(content).toContain("value");
    });
  });

  describe("key validation", () => {
    it("should accept alphanumeric keys", async () => {
      const result = await saveMemoryTool.execute(
        { key: "abc123", value: "test", namespace: "default" },
        ctx
      );

      expect(result.success).toBe(true);
    });

    it("should accept keys with dashes", async () => {
      const result = await saveMemoryTool.execute(
        { key: "my-test-key", value: "test", namespace: "default" },
        ctx
      );

      expect(result.success).toBe(true);
    });

    it("should accept single character key", async () => {
      const result = await saveMemoryTool.execute(
        { key: "x", value: "test", namespace: "default" },
        ctx
      );

      expect(result.success).toBe(true);
    });
  });

  describe("permission checks", () => {
    it("should check write permission", async () => {
      await saveMemoryTool.execute({ key: "test", value: "value", namespace: "default" }, ctx);

      expect(ctx.checkPermission).toHaveBeenCalledWith(
        "write",
        expect.stringContaining("test.json")
      );
    });

    it("should fail when permission denied", async () => {
      ctx.checkPermission = vi.fn().mockResolvedValue(false);

      const result = await saveMemoryTool.execute(
        { key: "test", value: "value", namespace: "default" },
        ctx
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Permission denied");
      }
    });
  });

  describe("cancellation", () => {
    it("should return error when cancelled", async () => {
      const controller = new AbortController();
      controller.abort();
      ctx.abortSignal = controller.signal;

      const result = await saveMemoryTool.execute(
        { key: "test", value: "value", namespace: "default" },
        ctx
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("cancelled");
      }
    });
  });
});
