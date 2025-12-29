/**
 * @module builtin/__tests__/codebase-search.test
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../../types/index.js";
import { codebaseSearchTool } from "../codebase-search.js";

describe("codebaseSearchTool", () => {
  let testDir: string;
  let mockContext: ToolContext;

  beforeEach(async () => {
    // Create a unique test directory
    testDir = join(tmpdir(), `codebase-search-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    mockContext = {
      workingDir: testDir,
      sessionId: "test-session",
      messageId: "test-message",
      callId: "test-call",
      abortSignal: new AbortController().signal,
      checkPermission: vi.fn().mockResolvedValue(true),
    };
  });

  afterEach(async () => {
    // Clean up test directory
    await rm(testDir, { recursive: true, force: true });
  });

  describe("definition", () => {
    it("should have correct name", () => {
      expect(codebaseSearchTool.definition.name).toBe("codebase_search");
    });

    it("should have correct kind", () => {
      expect(codebaseSearchTool.definition.kind).toBe("read");
    });

    it("should have description", () => {
      expect(codebaseSearchTool.definition.description).toBeTruthy();
    });
  });

  describe("execute", () => {
    it("should find content matching natural language query", async () => {
      await writeFile(
        join(testDir, "auth.ts"),
        "export function authenticateUser(username: string, password: string) {\n  // authenticate logic\n}\n"
      );

      const result = await codebaseSearchTool.execute(
        { query: "user authentication function", maxResults: 20 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.results.length).toBeGreaterThan(0);
        expect(result.output.results[0]?.file).toBe("auth.ts");
      }
    });

    it("should tokenize query and remove stop words", async () => {
      await writeFile(join(testDir, "test.ts"), "const handler = () => {};\n");

      const result = await codebaseSearchTool.execute(
        { query: "the handler function", maxResults: 20 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        // Stop words like "the" should be removed
        expect(result.output.tokens).not.toContain("the");
        expect(result.output.tokens).toContain("handler");
      }
    });

    it("should rank results by relevance", async () => {
      // File with more matches should rank higher
      await writeFile(
        join(testDir, "high.ts"),
        "const handler = {};\nconst anotherHandler = {};\nfunction getHandler() {}\n"
      );
      await writeFile(join(testDir, "low.ts"), "const something = 1;\n");

      const result = await codebaseSearchTool.execute(
        { query: "handler", maxResults: 20 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const highRanked = result.output.results.find((r) => r.file === "high.ts");
        const lowRanked = result.output.results.find((r) => r.file === "low.ts");
        expect(highRanked!).toBeDefined();
        expect(lowRanked).toBeUndefined();
      }
    });

    it("should respect path scope", async () => {
      await mkdir(join(testDir, "src"));
      await mkdir(join(testDir, "tests"));
      await writeFile(join(testDir, "src", "main.ts"), "const target = 1;\n");
      await writeFile(join(testDir, "tests", "test.ts"), "const target = 2;\n");

      const result = await codebaseSearchTool.execute(
        { query: "target", path: "src", maxResults: 20 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.results.length).toBe(1);
        expect(result.output.results[0]?.file).toBe("main.ts");
      }
    });

    it("should respect maxResults", async () => {
      const content = Array(30)
        .fill(0)
        .map((_, i) => `const item${i} = ${i};`)
        .join("\n");
      await writeFile(join(testDir, "large.ts"), content);

      const result = await codebaseSearchTool.execute(
        { query: "item", maxResults: 5 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.results.length).toBeLessThanOrEqual(5);
      }
    });

    it("should fail for empty query after tokenization", async () => {
      const result = await codebaseSearchTool.execute(
        { query: "the a an", maxResults: 20 }, // All stop words
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("searchable tokens");
      }
    });

    it("should fail for non-existent path", async () => {
      const result = await codebaseSearchTool.execute(
        { query: "test", path: "nonexistent", maxResults: 20 },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not found");
      }
    });

    it("should skip ignored directories", async () => {
      await mkdir(join(testDir, "node_modules"));
      await writeFile(join(testDir, "node_modules", "lib.js"), "const target = 1;\n");
      await writeFile(join(testDir, "src.ts"), "const target = 2;\n");

      const result = await codebaseSearchTool.execute(
        { query: "target", maxResults: 20 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const nodeModulesResult = result.output.results.find((r) =>
          r.file.includes("node_modules")
        );
        expect(nodeModulesResult).toBeUndefined();
      }
    });

    it("should fail when aborted", async () => {
      const abortController = new AbortController();
      abortController.abort();

      const result = await codebaseSearchTool.execute(
        { query: "test", maxResults: 20 },
        { ...mockContext, abortSignal: abortController.signal }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("cancelled");
      }
    });
  });

  describe("shouldConfirm", () => {
    it("should not require confirmation for read operations", () => {
      expect(
        codebaseSearchTool.shouldConfirm?.({ query: "test", maxResults: 20 }, mockContext)
      ).toBe(false);
    });
  });
});
