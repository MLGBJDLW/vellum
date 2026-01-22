/**
 * @module builtin/__tests__/search-files.test
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../../types/index.js";
import { searchFilesTool } from "../search-files.js";

describe("searchFilesTool", { timeout: 60000 }, () => {
  let testDir: string;
  let mockContext: ToolContext;

  beforeEach(async () => {
    // Create a unique test directory
    testDir = join(tmpdir(), `search-files-test-${Date.now()}`);
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
      expect(searchFilesTool.definition.name).toBe("search_files");
    });

    it("should have correct kind", () => {
      expect(searchFilesTool.definition.kind).toBe("read");
    });

    it("should have description", () => {
      expect(searchFilesTool.definition.description).toBeTruthy();
    });
  });

  describe("execute", () => {
    it("should find pattern in files", async () => {
      await writeFile(join(testDir, "test.ts"), 'const foo = "bar";\nconst baz = "qux";\n');

      const result = await searchFilesTool.execute(
        {
          pattern: "foo",
          path: ".",
          isRegex: false,
          caseSensitive: false,
          maxResults: 100,
          contextLines: 2,
        },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.matches.length).toBe(1);
        expect(result.output.matches[0]?.file).toBe("test.ts");
        expect(result.output.matches[0]?.line).toBe(1);
        // match now contains the full line content (from facade)
        expect(result.output.matches[0]?.match).toContain("foo");
      }
    });

    it("should support regex patterns", async () => {
      await writeFile(join(testDir, "test.ts"), "function test() {}\nfunction another() {}\n");

      const result = await searchFilesTool.execute(
        {
          pattern: "function\\s+\\w+",
          path: ".",
          isRegex: true,
          caseSensitive: false,
          maxResults: 100,
          contextLines: 2,
        },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.matches.length).toBe(2);
      }
    });

    it("should support case-insensitive search", async () => {
      await writeFile(join(testDir, "test.ts"), "const FOO = 1;\nconst foo = 2;\n");

      const caseSensitive = await searchFilesTool.execute(
        {
          pattern: "foo",
          path: ".",
          isRegex: false,
          caseSensitive: true,
          maxResults: 100,
          contextLines: 2,
        },
        mockContext
      );

      const caseInsensitive = await searchFilesTool.execute(
        {
          pattern: "foo",
          path: ".",
          isRegex: false,
          caseSensitive: false,
          maxResults: 100,
          contextLines: 2,
        },
        mockContext
      );

      expect(caseSensitive.success).toBe(true);
      expect(caseInsensitive.success).toBe(true);

      if (caseSensitive.success && caseInsensitive.success) {
        expect(caseSensitive.output.matches.length).toBe(1);
        expect(caseInsensitive.output.matches.length).toBe(2);
      }
    });

    it("should respect maxResults", async () => {
      const content = Array(20)
        .fill(0)
        .map((_, i) => `const var${i} = ${i};`)
        .join("\n");
      await writeFile(join(testDir, "test.ts"), content);

      const result = await searchFilesTool.execute(
        {
          pattern: "var",
          path: ".",
          isRegex: false,
          caseSensitive: false,
          maxResults: 5,
          contextLines: 2,
        },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.matches.length).toBe(5);
        expect(result.output.truncated).toBe(true);
      }
    });

    it("should include context around matches", async () => {
      await writeFile(join(testDir, "test.ts"), "line1\nline2\nmatch here\nline4\nline5\n");

      const result = await searchFilesTool.execute(
        {
          pattern: "match",
          path: ".",
          isRegex: false,
          caseSensitive: false,
          maxResults: 100,
          contextLines: 2,
        },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.matches[0]?.context).toContain("line2");
        expect(result.output.matches[0]?.context).toContain("match here");
        expect(result.output.matches[0]?.context).toContain("line4");
      }
    });

    it("should skip ignored directories", async () => {
      await mkdir(join(testDir, "node_modules"));
      await writeFile(join(testDir, "node_modules", "test.js"), "const foo = 1;");
      await writeFile(join(testDir, "src.ts"), "const foo = 2;");

      const result = await searchFilesTool.execute(
        {
          pattern: "foo",
          path: ".",
          isRegex: false,
          caseSensitive: false,
          maxResults: 100,
          contextLines: 2,
        },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.matches.length).toBe(1);
        expect(result.output.matches[0]?.file).toBe("src.ts");
      }
    });

    it("should fail for invalid regex", async () => {
      const result = await searchFilesTool.execute(
        {
          pattern: "[invalid",
          path: ".",
          isRegex: true,
          caseSensitive: false,
          maxResults: 100,
          contextLines: 2,
        },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Invalid regex");
      }
    });

    it("should fail for non-existent path", async () => {
      const result = await searchFilesTool.execute(
        {
          pattern: "test",
          path: "nonexistent",
          isRegex: false,
          caseSensitive: false,
          maxResults: 100,
          contextLines: 2,
        },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not found");
      }
    });

    it("should fail when aborted", async () => {
      const abortController = new AbortController();
      abortController.abort();

      const result = await searchFilesTool.execute(
        {
          pattern: "test",
          path: ".",
          isRegex: false,
          caseSensitive: false,
          maxResults: 100,
          contextLines: 2,
        },
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
        searchFilesTool.shouldConfirm?.(
          {
            pattern: "test",
            path: ".",
            isRegex: false,
            caseSensitive: false,
            maxResults: 100,
            contextLines: 2,
          },
          mockContext
        )
      ).toBe(false);
    });
  });
});
