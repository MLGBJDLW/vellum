/**
 * End-to-End Tool System Tests (T071)
 *
 * Integration tests for the complete tool system flow:
 * - Registry creation and tool registration
 * - Direct tool execution
 * - Read → Edit → Write file workflow
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  listDirTool,
  readFileTool,
  searchAndReplaceTool,
  writeFileTool,
} from "../../builtin/index.js";
import { createToolRegistry, type ToolRegistry } from "../../tool/index.js";
import type { ToolContext } from "../../types/tool.js";

describe("Tool System E2E (T071)", { timeout: 60000 }, () => {
  let testDir: string;
  let registry: ToolRegistry;
  let ctx: ToolContext;

  beforeEach(async () => {
    // Create isolated test directory
    testDir = join(process.cwd(), `.test-tool-e2e-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    // Create registry and register tools
    registry = createToolRegistry();
    registry.register(readFileTool);
    registry.register(writeFileTool);
    registry.register(searchAndReplaceTool);
    registry.register(listDirTool);

    // Create context
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
    await rm(testDir, { recursive: true, force: true });
  });

  describe("Registry → Register → Execute Flow", () => {
    it("should register tools and retrieve their definitions", () => {
      // Verify registration
      expect(registry.has("read_file")).toBe(true);
      expect(registry.has("write_file")).toBe(true);
      expect(registry.has("search_and_replace")).toBe(true);
      expect(registry.has("list_dir")).toBe(true);

      // Verify definitions
      const definitions = registry.getDefinitions();
      expect(definitions.length).toBeGreaterThanOrEqual(4);

      const readDef = definitions.find((d) => d.name === "read_file");
      expect(readDef).toBeDefined();
      expect(readDef?.description).toContain("file");
      expect(readDef?.kind).toBe("read");
    });

    it("should execute a simple read operation", async () => {
      // Setup: create a test file
      const testFile = join(testDir, "test.txt");
      await writeFile(testFile, "Hello, World!");

      // Execute read_file tool directly
      const tool = registry.get("read_file");
      expect(tool).toBeDefined();

      const result = await tool?.execute({ path: testFile }, ctx);

      expect(result).toBeDefined();
      expect(result?.success).toBe(true);
      if (result?.success) {
        expect(result.output.content).toContain("Hello, World!");
      }
    });
  });

  describe("Read → Edit → Write Flow", () => {
    it("should complete a full read-edit-write cycle", async () => {
      // Setup: create initial file
      const targetFile = join(testDir, "code.ts");
      const initialContent = `function greet(name: string): string {
  return "Hello, " + name;
}

export { greet };
`;
      await writeFile(targetFile, initialContent);

      // Step 1: Read the file
      const readTool = registry.get("read_file");
      if (!readTool) throw new Error("read_file tool not found");
      const readResult = await readTool.execute({ path: targetFile }, ctx);

      expect(readResult.success).toBe(true);
      if (readResult.success) {
        expect(readResult.output.content).toContain("function greet");
      }

      // Step 2: Edit the file (change string concatenation to template literal)
      // Note: search_and_replace expects pattern, replacement, paths[]
      const editTool = registry.get("search_and_replace");
      if (!editTool) throw new Error("search_and_replace tool not found");
      const editResult = await editTool.execute(
        {
          pattern: '"Hello, " \\+ name',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: Intentionally testing template string replacement
          replacement: "`Hello, ${name}!`",
          paths: [targetFile],
          isRegex: true,
        },
        ctx
      );

      expect(editResult.success).toBe(true);

      // Step 3: Read again to verify
      const verifyResult = await readTool.execute({ path: targetFile }, ctx);

      expect(verifyResult.success).toBe(true);
      if (verifyResult.success) {
        // biome-ignore lint/suspicious/noTemplateCurlyInString: Verifying template string replacement
        expect(verifyResult.output.content).toContain("`Hello, ${name}!`");
        expect(verifyResult.output.content).not.toContain('"Hello, " + name');
      }
    });

    it("should handle write_file for new files", async () => {
      const newFile = join(testDir, "new-file.ts");
      const content = `export const VERSION = "1.0.0";
`;

      // Write new file
      const writeTool = registry.get("write_file");
      if (!writeTool) throw new Error("write_file tool not found");
      const writeResult = await writeTool.execute({ path: newFile, content }, ctx);

      expect(writeResult.success).toBe(true);

      // Verify content
      const actual = await readFile(newFile, "utf-8");
      expect(actual).toBe(content);
    });

    it("should handle multiple sequential edits", async () => {
      const targetFile = join(testDir, "multi-edit.ts");
      await writeFile(
        targetFile,
        `const a = 1;
const b = 2;
const c = 3;
`
      );

      const editTool = registry.get("search_and_replace");
      if (!editTool) throw new Error("search_and_replace tool not found");

      // Edit 1: change a
      const r1 = await editTool.execute(
        {
          pattern: "const a = 1;",
          replacement: "const a = 10;",
          paths: [targetFile],
        },
        ctx
      );
      expect(r1.success).toBe(true);

      // Edit 2: change b
      const r2 = await editTool.execute(
        {
          pattern: "const b = 2;",
          replacement: "const b = 20;",
          paths: [targetFile],
        },
        ctx
      );
      expect(r2.success).toBe(true);

      // Edit 3: change c
      const r3 = await editTool.execute(
        {
          pattern: "const c = 3;",
          replacement: "const c = 30;",
          paths: [targetFile],
        },
        ctx
      );
      expect(r3.success).toBe(true);

      // Verify all edits applied
      const final = await readFile(targetFile, "utf-8");
      expect(final).toContain("const a = 10;");
      expect(final).toContain("const b = 20;");
      expect(final).toContain("const c = 30;");
    });
  });

  describe("Error Handling", () => {
    it("should handle tool not found gracefully", () => {
      const missingTool = registry.get("nonexistent_tool");
      expect(missingTool).toBeUndefined();
    });

    it("should handle file not found gracefully", async () => {
      const readTool = registry.get("read_file");
      if (!readTool) throw new Error("read_file tool not found");
      const result = await readTool.execute({ path: join(testDir, "nonexistent.txt") }, ctx);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it("should handle edit with non-matching search string", async () => {
      const testFile = join(testDir, "no-match.txt");
      await writeFile(testFile, "original content");

      const editTool = registry.get("search_and_replace");
      if (!editTool) throw new Error("search_and_replace tool not found");
      const result = await editTool.execute(
        {
          pattern: "this text does not exist",
          replacement: "replacement",
          paths: [testFile],
        },
        ctx
      );

      // Note: search_and_replace succeeds with 0 replacements when pattern not found
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.totalReplacements).toBe(0);
      }
    });
  });

  describe("Tool Definition Filtering", () => {
    it("should filter tools by kind", () => {
      const readTools = registry.getDefinitions({ kinds: ["read"] });
      const writeTools = registry.getDefinitions({ kinds: ["write"] });

      expect(readTools.every((t) => t.kind === "read")).toBe(true);
      expect(writeTools.every((t) => t.kind === "write")).toBe(true);
    });
  });

  describe("Concurrent Operations", () => {
    it("should handle concurrent reads correctly", async () => {
      // Create multiple test files
      const files = await Promise.all(
        [1, 2, 3, 4, 5].map(async (i) => {
          const path = join(testDir, `file-${i}.txt`);
          await writeFile(path, `Content of file ${i}`);
          return path;
        })
      );

      const readTool = registry.get("read_file");
      if (!readTool) throw new Error("read_file tool not found");

      // Read all concurrently
      const results = await Promise.all(files.map((path) => readTool.execute({ path }, ctx)));

      // All should succeed
      expect(results.every((r) => r.success)).toBe(true);
      results.forEach((result, i) => {
        if (result.success) {
          expect(result.output.content).toContain(`Content of file ${i + 1}`);
        }
      });
    });
  });

  describe("Tool Context Usage", () => {
    it("should provide context to tools", async () => {
      // list_dir uses workingDir for relative paths
      const listTool = registry.get("list_dir");
      if (!listTool) throw new Error("list_dir tool not found");
      const result = await listTool.execute({ path: "." }, ctx);

      expect(result.success).toBe(true);
      // Should list contents of testDir (which is workingDir)
    });
  });
});
