/**
 * Unit tests for tool types and factory functions
 *
 * @module
 */

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Result } from "../result.js";
import {
  defineTool,
  fail,
  ok,
  type ToolContext,
  type ToolDefinition,
  type ToolKind,
  ToolKindSchema,
  type ToolResult,
} from "../tool.js";

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Create a mock ToolContext for testing
 */
function createMockContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    workingDir: "/test/working/dir",
    sessionId: "test-session-123",
    messageId: "test-message-456",
    callId: "test-call-789",
    abortSignal: new AbortController().signal,
    checkPermission: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

// =============================================================================
// ToolKindSchema Tests
// =============================================================================

describe("ToolKindSchema", () => {
  const validKinds: ToolKind[] = ["read", "write", "shell", "mcp", "browser", "agent"];

  describe("valid kinds", () => {
    it.each(validKinds)("should accept '%s' as valid kind", (kind) => {
      const result = ToolKindSchema.safeParse(kind);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(kind);
      }
    });

    it("should accept all 6 kinds", () => {
      expect(validKinds).toHaveLength(6);
      for (const kind of validKinds) {
        expect(ToolKindSchema.safeParse(kind).success).toBe(true);
      }
    });
  });

  describe("invalid kinds", () => {
    const invalidKinds = [
      "invalid",
      "reading",
      "writing",
      "exec",
      "",
      "READ",
      "Write",
      "SHELL",
      123,
      null,
      undefined,
      {},
      [],
    ];

    it.each(invalidKinds)("should reject '%s' as invalid", (kind) => {
      const result = ToolKindSchema.safeParse(kind);
      expect(result.success).toBe(false);
    });
  });

  describe("type inference", () => {
    it("should infer correct union type", () => {
      // Type assertion test - this verifies compile-time behavior
      const kind: ToolKind = "read";
      expect(ToolKindSchema.parse(kind)).toBe("read");
    });
  });
});

// =============================================================================
// ToolDefinition Tests
// =============================================================================

describe("ToolDefinition", () => {
  describe("required fields", () => {
    it("should accept valid definition with all required fields", () => {
      const definition: ToolDefinition<z.ZodObject<{ path: z.ZodString }>> = {
        name: "test_tool",
        description: "A test tool",
        parameters: z.object({ path: z.string() }),
        kind: "read",
      };

      expect(definition.name).toBe("test_tool");
      expect(definition.description).toBe("A test tool");
      expect(definition.kind).toBe("read");
      expect(definition.parameters).toBeDefined();
    });
  });

  describe("optional fields", () => {
    it("should accept definition with category", () => {
      const definition: ToolDefinition<z.ZodObject<{ path: z.ZodString }>> = {
        name: "test_tool",
        description: "A test tool",
        parameters: z.object({ path: z.string() }),
        kind: "write",
        category: "file-operations",
      };

      expect(definition.category).toBe("file-operations");
    });

    it("should accept definition with enabled flag", () => {
      const definition: ToolDefinition<z.ZodObject<{ path: z.ZodString }>> = {
        name: "test_tool",
        description: "A test tool",
        parameters: z.object({ path: z.string() }),
        kind: "shell",
        enabled: false,
      };

      expect(definition.enabled).toBe(false);
    });

    it("should accept definition with all optional fields", () => {
      const definition: ToolDefinition<z.ZodObject<{ query: z.ZodString }>> = {
        name: "search_tool",
        description: "Search for something",
        parameters: z.object({ query: z.string() }),
        kind: "browser",
        category: "search",
        enabled: true,
      };

      expect(definition.category).toBe("search");
      expect(definition.enabled).toBe(true);
    });
  });

  describe("type inference from parameters", () => {
    it("should infer parameter types from Zod schema", () => {
      const params = z.object({
        path: z.string(),
        lines: z.number().optional(),
      });

      const definition: ToolDefinition<typeof params> = {
        name: "read_file",
        description: "Read a file",
        parameters: params,
        kind: "read",
      };

      // Validate the schema works correctly
      const validInput = { path: "/test/file.txt" };
      const parsed = definition.parameters.parse(validInput);
      expect(parsed.path).toBe("/test/file.txt");
      expect(parsed.lines).toBeUndefined();
    });
  });
});

// =============================================================================
// ToolContext Tests
// =============================================================================

describe("ToolContext", () => {
  describe("interface structure", () => {
    it("should have all required properties", () => {
      const ctx = createMockContext();

      expect(ctx.workingDir).toBeDefined();
      expect(typeof ctx.workingDir).toBe("string");

      expect(ctx.sessionId).toBeDefined();
      expect(typeof ctx.sessionId).toBe("string");

      expect(ctx.messageId).toBeDefined();
      expect(typeof ctx.messageId).toBe("string");

      expect(ctx.callId).toBeDefined();
      expect(typeof ctx.callId).toBe("string");

      expect(ctx.abortSignal).toBeInstanceOf(AbortSignal);
      expect(typeof ctx.checkPermission).toBe("function");
    });

    it("should allow custom values via overrides", () => {
      const ctx = createMockContext({
        workingDir: "/custom/path",
        sessionId: "custom-session",
      });

      expect(ctx.workingDir).toBe("/custom/path");
      expect(ctx.sessionId).toBe("custom-session");
    });
  });

  describe("checkPermission method", () => {
    it("should be callable with action only", async () => {
      const ctx = createMockContext();
      const result = await ctx.checkPermission("write");
      expect(result).toBe(true);
    });

    it("should be callable with action and resource", async () => {
      const ctx = createMockContext();
      const result = await ctx.checkPermission("write", "/some/file.txt");
      expect(result).toBe(true);
    });

    it("should support custom permission logic", async () => {
      const mockCheckPermission = vi
        .fn()
        .mockImplementation(async (action: string, resource?: string) => {
          if (action === "delete" && resource?.includes("system")) {
            return false;
          }
          return true;
        });

      const ctx = createMockContext({ checkPermission: mockCheckPermission });

      expect(await ctx.checkPermission("read", "/user/file.txt")).toBe(true);
      expect(await ctx.checkPermission("delete", "/system/config")).toBe(false);
    });
  });

  describe("abortSignal", () => {
    it("should support abort signal for cancellation", () => {
      const controller = new AbortController();
      const ctx = createMockContext({ abortSignal: controller.signal });

      expect(ctx.abortSignal.aborted).toBe(false);
      controller.abort();
      expect(ctx.abortSignal.aborted).toBe(true);
    });
  });
});

// =============================================================================
// ok/fail Helper Tests
// =============================================================================

describe("ok helper", () => {
  it("should create success result with primitive output", () => {
    const result = ok("test output");
    expect(result).toEqual({ success: true, output: "test output" });
  });

  it("should create success result with object output", () => {
    const output = { files: ["a.txt", "b.txt"], count: 2 };
    const result = ok(output);
    expect(result).toEqual({ success: true, output });
  });

  it("should create success result with array output", () => {
    const result = ok([1, 2, 3]);
    expect(result).toEqual({ success: true, output: [1, 2, 3] });
  });

  it("should create success result with null output", () => {
    const result = ok(null);
    expect(result).toEqual({ success: true, output: null });
  });

  it("should create success result with undefined output", () => {
    const result = ok(undefined);
    expect(result).toEqual({ success: true, output: undefined });
  });

  it("should infer correct type from output", () => {
    const result: ToolResult<{ content: string }> = ok({ content: "file data" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.content).toBe("file data");
    }
  });
});

describe("fail helper", () => {
  it("should create failure result with error message", () => {
    const result = fail("Something went wrong");
    expect(result).toEqual({ success: false, error: "Something went wrong" });
  });

  it("should create failure result with empty error message", () => {
    const result = fail("");
    expect(result).toEqual({ success: false, error: "" });
  });

  it("should create failure result with detailed error", () => {
    const result = fail("File not found: /path/to/file.txt");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("File not found");
    }
  });

  it("should be usable as ToolResult<never>", () => {
    const result: ToolResult<string> = fail("error");
    expect(result.success).toBe(false);
  });
});

describe("ToolResult discriminated union", () => {
  it("should narrow type correctly on success check", () => {
    const successResult: ToolResult<number> = ok(42);
    const failResult: ToolResult<number> = fail("error");

    if (successResult.success) {
      expect(successResult.output).toBe(42);
    }

    if (!failResult.success) {
      expect(failResult.error).toBe("error");
    }
  });

  it("should support type guards in conditional logic", () => {
    function processResult(result: ToolResult<string>): string {
      if (result.success) {
        return `Success: ${result.output}`;
      }
      return `Error: ${result.error}`;
    }

    expect(processResult(ok("data"))).toBe("Success: data");
    expect(processResult(fail("oops"))).toBe("Error: oops");
  });
});

// =============================================================================
// defineTool Factory Tests
// =============================================================================

describe("defineTool factory", () => {
  describe("basic creation", () => {
    it("should create a valid Tool with required config", () => {
      const inputSchema = z.object({ input: z.string() });
      const tool = defineTool({
        name: "test_tool",
        description: "A test tool",
        parameters: inputSchema,
        kind: "read",
        execute: async (_input: z.infer<typeof inputSchema>) => ok({ result: "done" }),
      });

      expect(tool.definition.name).toBe("test_tool");
      expect(tool.definition.description).toBe("A test tool");
      expect(tool.definition.kind).toBe("read");
      expect(tool.definition.enabled).toBe(true); // Default value
      expect(typeof tool.execute).toBe("function");
    });

    it("should create tool with all optional config", () => {
      const dataSchema = z.object({ data: z.string() });
      const tool = defineTool({
        name: "full_tool",
        description: "Full featured tool",
        parameters: dataSchema,
        kind: "write",
        category: "file-ops",
        enabled: false,
        execute: async (_input: z.infer<typeof dataSchema>) => ok(null),
        shouldConfirm: (_input: z.infer<typeof dataSchema>, _ctx: ToolContext) => true,
        validate: (_input: z.infer<typeof dataSchema>) => ({ ok: true as const, value: undefined }),
      });

      expect(tool.definition.category).toBe("file-ops");
      expect(tool.definition.enabled).toBe(false);
      expect(tool.shouldConfirm).toBeDefined();
      expect(tool.validate).toBeDefined();
    });
  });

  describe("type inference", () => {
    it("should infer input type from Zod schema", async () => {
      const paramSchema = z.object({
        path: z.string(),
        encoding: z.enum(["utf-8", "ascii"]).default("utf-8"),
      });

      const tool = defineTool({
        name: "typed_tool",
        description: "Tool with typed input",
        parameters: paramSchema,
        kind: "read",
        execute: async (input: z.infer<typeof paramSchema>) => {
          // Type inference test: input should have .path and .encoding
          return ok({ path: input.path, enc: input.encoding });
        },
      });

      const ctx = createMockContext();
      const result = await tool.execute({ path: "/test", encoding: "utf-8" }, ctx);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.path).toBe("/test");
        expect(result.output.enc).toBe("utf-8");
      }
    });

    it("should infer output type from execute return", async () => {
      interface FileContent {
        content: string;
        size: number;
      }

      const pathSchema = z.object({ path: z.string() });
      const tool = defineTool({
        name: "read_file",
        description: "Read file contents",
        parameters: pathSchema,
        kind: "read",
        execute: async (_input: z.infer<typeof pathSchema>): Promise<ToolResult<FileContent>> => {
          return ok({ content: "hello", size: 5 });
        },
      });

      const ctx = createMockContext();
      const result = await tool.execute({ path: "/test" }, ctx);

      if (result.success) {
        // Type inference test
        const content: string = result.output.content;
        const size: number = result.output.size;
        expect(content).toBe("hello");
        expect(size).toBe(5);
      }
    });
  });

  describe("execute method", () => {
    it("should execute and return success result", async () => {
      const messageSchema = z.object({ message: z.string() });
      const tool = defineTool({
        name: "echo_tool",
        description: "Echo input back",
        parameters: messageSchema,
        kind: "read",
        execute: async (input: z.infer<typeof messageSchema>) => ok({ echo: input.message }),
      });

      const ctx = createMockContext();
      const result = await tool.execute({ message: "hello" }, ctx);

      expect(result).toEqual({ success: true, output: { echo: "hello" } });
    });

    it("should execute and return failure result", async () => {
      const emptySchema = z.object({});
      const tool = defineTool({
        name: "failing_tool",
        description: "Always fails",
        parameters: emptySchema,
        kind: "read",
        execute: async (_input: z.infer<typeof emptySchema>) => fail("Intentional failure"),
      });

      const ctx = createMockContext();
      const result = await tool.execute({}, ctx);

      expect(result).toEqual({ success: false, error: "Intentional failure" });
    });

    it("should receive context in execute", async () => {
      let capturedCtx: ToolContext | null = null;

      const emptySchema = z.object({});
      const tool = defineTool({
        name: "ctx_tool",
        description: "Captures context",
        parameters: emptySchema,
        kind: "read",
        execute: async (_input: z.infer<typeof emptySchema>, ctx: ToolContext) => {
          capturedCtx = ctx;
          return ok({ workingDir: ctx.workingDir });
        },
      });

      const ctx = createMockContext({ workingDir: "/captured/dir" });
      await tool.execute({}, ctx);

      expect(capturedCtx).not.toBeNull();
      expect(capturedCtx!.workingDir).toBe("/captured/dir");
    });

    it("should support async operations in execute", async () => {
      const delaySchema = z.object({ delay: z.number() });
      const tool = defineTool({
        name: "async_tool",
        description: "Async operations",
        parameters: delaySchema,
        kind: "read",
        execute: async (input: z.infer<typeof delaySchema>) => {
          await new Promise((resolve) => setTimeout(resolve, input.delay));
          return ok({ waited: input.delay });
        },
      });

      const ctx = createMockContext();
      const start = Date.now();
      const result = await tool.execute({ delay: 10 }, ctx);
      const elapsed = Date.now() - start;

      expect(result.success).toBe(true);
      expect(elapsed).toBeGreaterThanOrEqual(10);
    });
  });

  describe("shouldConfirm method", () => {
    it("should be undefined when not provided", () => {
      const emptySchema = z.object({});
      const tool = defineTool({
        name: "no_confirm",
        description: "No confirmation",
        parameters: emptySchema,
        kind: "read",
        execute: async (_input: z.infer<typeof emptySchema>) => ok(null),
      });

      expect(tool.shouldConfirm).toBeUndefined();
    });

    it("should return confirmation requirement when provided", () => {
      const dangerSchema = z.object({ dangerous: z.boolean() });
      const tool = defineTool({
        name: "confirm_tool",
        description: "Requires confirmation",
        parameters: dangerSchema,
        kind: "write",
        execute: async (_input: z.infer<typeof dangerSchema>) => ok(null),
        shouldConfirm: (input: z.infer<typeof dangerSchema>) => input.dangerous,
      });

      const ctx = createMockContext();

      expect(tool.shouldConfirm?.({ dangerous: true }, ctx)).toBe(true);
      expect(tool.shouldConfirm?.({ dangerous: false }, ctx)).toBe(false);
    });

    it("should receive context in shouldConfirm", () => {
      const pathSchema = z.object({ path: z.string() });
      const tool = defineTool({
        name: "ctx_confirm",
        description: "Context-based confirmation",
        parameters: pathSchema,
        kind: "write",
        execute: async (_input: z.infer<typeof pathSchema>) => ok(null),
        shouldConfirm: (input: z.infer<typeof pathSchema>, ctx: ToolContext) => {
          // Require confirmation for system paths
          return input.path.startsWith("/system") || ctx.workingDir === "/root";
        },
      });

      const normalCtx = createMockContext({ workingDir: "/home/user" });
      const rootCtx = createMockContext({ workingDir: "/root" });

      expect(tool.shouldConfirm?.({ path: "/user/file" }, normalCtx)).toBe(false);
      expect(tool.shouldConfirm?.({ path: "/system/file" }, normalCtx)).toBe(true);
      expect(tool.shouldConfirm?.({ path: "/user/file" }, rootCtx)).toBe(true);
    });
  });

  describe("validate method", () => {
    it("should be undefined when not provided", () => {
      const emptySchema = z.object({});
      const tool = defineTool({
        name: "no_validate",
        description: "No validation",
        parameters: emptySchema,
        kind: "read",
        execute: async (_input: z.infer<typeof emptySchema>) => ok(null),
      });

      expect(tool.validate).toBeUndefined();
    });

    it("should return success result for valid input", () => {
      const valueSchema = z.object({ value: z.number() });
      const tool = defineTool({
        name: "validate_tool",
        description: "With validation",
        parameters: valueSchema,
        kind: "read",
        execute: async (_input: z.infer<typeof valueSchema>) => ok(null),
        validate: (input: z.infer<typeof valueSchema>): Result<void, string> => {
          if (input.value >= 0) {
            return { ok: true, value: undefined };
          }
          return { ok: false, error: "Value must be non-negative" };
        },
      });

      const validResult = tool.validate?.({ value: 10 });
      expect(validResult?.ok).toBe(true);
    });

    it("should return error result for invalid input", () => {
      const valueSchema = z.object({ value: z.number() });
      const tool = defineTool({
        name: "validate_tool",
        description: "With validation",
        parameters: valueSchema,
        kind: "read",
        execute: async (_input: z.infer<typeof valueSchema>) => ok(null),
        validate: (input: z.infer<typeof valueSchema>): Result<void, string> => {
          if (input.value >= 0) {
            return { ok: true, value: undefined };
          }
          return { ok: false, error: "Value must be non-negative" };
        },
      });

      const invalidResult = tool.validate?.({ value: -5 });
      expect(invalidResult?.ok).toBe(false);
      if (invalidResult && !invalidResult.ok) {
        expect(invalidResult.error).toBe("Value must be non-negative");
      }
    });
  });
});

// =============================================================================
// Zod Parameter Validation Tests
// =============================================================================

describe("Zod parameter validation", () => {
  describe("basic validation", () => {
    it("should validate required string parameter", () => {
      const params = z.object({ name: z.string() });

      expect(params.safeParse({ name: "test" }).success).toBe(true);
      expect(params.safeParse({}).success).toBe(false);
      expect(params.safeParse({ name: 123 }).success).toBe(false);
    });

    it("should validate optional parameter with default", () => {
      const params = z.object({
        count: z.number().default(10),
      });

      const result = params.parse({});
      expect(result.count).toBe(10);
    });

    it("should validate enum parameter", () => {
      const params = z.object({
        mode: z.enum(["read", "write", "append"]),
      });

      expect(params.safeParse({ mode: "read" }).success).toBe(true);
      expect(params.safeParse({ mode: "invalid" }).success).toBe(false);
    });
  });

  describe("complex schemas", () => {
    it("should validate nested object parameters", () => {
      const params = z.object({
        file: z.object({
          path: z.string(),
          encoding: z.string().optional(),
        }),
      });

      expect(params.safeParse({ file: { path: "/test" } }).success).toBe(true);
      expect(params.safeParse({ file: {} }).success).toBe(false);
    });

    it("should validate array parameters", () => {
      const params = z.object({
        paths: z.array(z.string()).min(1),
      });

      expect(params.safeParse({ paths: ["/a", "/b"] }).success).toBe(true);
      expect(params.safeParse({ paths: [] }).success).toBe(false);
    });

    it("should validate union parameters", () => {
      const params = z.object({
        target: z.union([z.string(), z.number()]),
      });

      expect(params.safeParse({ target: "file" }).success).toBe(true);
      expect(params.safeParse({ target: 42 }).success).toBe(true);
      expect(params.safeParse({ target: true }).success).toBe(false);
    });
  });

  describe("tool with Zod validation", () => {
    it("should validate input before execution", async () => {
      const validatedSchema = z.object({
        path: z.string().min(1),
        lines: z.number().int().positive().optional(),
      });
      const tool = defineTool({
        name: "validated_tool",
        description: "Tool with strict validation",
        parameters: validatedSchema,
        kind: "read",
        execute: async (input: z.infer<typeof validatedSchema>) => ok({ path: input.path }),
      });

      // Valid inputs pass schema
      const validResult = tool.definition.parameters.safeParse({
        path: "/test/file.txt",
        lines: 10,
      });
      expect(validResult.success).toBe(true);

      // Invalid inputs fail schema
      const invalidPath = tool.definition.parameters.safeParse({ path: "" });
      expect(invalidPath.success).toBe(false);

      const invalidLines = tool.definition.parameters.safeParse({
        path: "/test",
        lines: -1,
      });
      expect(invalidLines.success).toBe(false);

      const invalidType = tool.definition.parameters.safeParse({
        path: "/test",
        lines: "ten",
      });
      expect(invalidType.success).toBe(false);
    });

    it("should provide descriptive error messages", () => {
      const params = z.object({
        email: z.string().email("Invalid email format"),
        age: z.number().min(0, "Age must be non-negative"),
      });

      const result = params.safeParse({ email: "invalid", age: -5 });

      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.errors;
        expect(errors).toHaveLength(2);
        expect(errors[0]?.message).toBe("Invalid email format");
        expect(errors[1]?.message).toBe("Age must be non-negative");
      }
    });
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe("Tool integration", () => {
  it("should work end-to-end: define, validate, execute", async () => {
    // 1. Define the tool
    const readFileSchema = z.object({
      path: z.string().min(1).describe("Path to the file"),
      encoding: z.enum(["utf-8", "ascii", "binary"]).default("utf-8"),
    });

    const readFileTool = defineTool({
      name: "read_file",
      description: "Read the contents of a file",
      parameters: readFileSchema,
      kind: "read",
      category: "filesystem",
      execute: async (input: z.infer<typeof readFileSchema>, ctx: ToolContext) => {
        // Mock file read
        if (input.path === "/nonexistent") {
          return fail(`File not found: ${input.path}`);
        }
        return ok({
          content: `Contents of ${input.path}`,
          encoding: input.encoding,
          workingDir: ctx.workingDir,
        });
      },
      shouldConfirm: (input: z.infer<typeof readFileSchema>) => input.path.includes("sensitive"),
    });

    // 2. Validate input
    const validInput = readFileTool.definition.parameters.safeParse({
      path: "/test/file.txt",
    });
    expect(validInput.success).toBe(true);

    // 3. Check confirmation
    const ctx = createMockContext();
    const shouldConfirm = readFileTool.shouldConfirm;
    expect(shouldConfirm).toBeDefined();
    if (shouldConfirm) {
      expect(shouldConfirm({ path: "/test/file.txt", encoding: "utf-8" }, ctx)).toBe(false);
      expect(shouldConfirm({ path: "/sensitive/data", encoding: "utf-8" }, ctx)).toBe(true);
    }

    // 4. Execute - success case
    if (validInput.success) {
      const result = await readFileTool.execute(validInput.data, ctx);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.content).toContain("/test/file.txt");
        expect(result.output.encoding).toBe("utf-8");
      }
    }

    // 5. Execute - failure case
    const failResult = await readFileTool.execute({ path: "/nonexistent", encoding: "utf-8" }, ctx);
    expect(failResult.success).toBe(false);
    if (!failResult.success) {
      expect(failResult.error).toContain("File not found");
    }
  });

  it("should support checkPermission in tool execution", async () => {
    const writeFileSchema = z.object({
      path: z.string(),
      content: z.string(),
    });

    const writeFileTool = defineTool({
      name: "write_file",
      description: "Write to a file",
      parameters: writeFileSchema,
      kind: "write",
      execute: async (input: z.infer<typeof writeFileSchema>, ctx: ToolContext) => {
        const permitted = await ctx.checkPermission("write", input.path);
        if (!permitted) {
          return fail(`Permission denied: cannot write to ${input.path}`);
        }
        return ok({ written: true, path: input.path });
      },
    });

    // Test with permission granted
    const permittedCtx = createMockContext({
      checkPermission: vi.fn().mockResolvedValue(true),
    });
    const successResult = await writeFileTool.execute(
      { path: "/allowed/file.txt", content: "data" },
      permittedCtx
    );
    expect(successResult.success).toBe(true);

    // Test with permission denied
    const deniedCtx = createMockContext({
      checkPermission: vi.fn().mockResolvedValue(false),
    });
    const failedResult = await writeFileTool.execute(
      { path: "/protected/file.txt", content: "data" },
      deniedCtx
    );
    expect(failedResult.success).toBe(false);
    if (!failedResult.success) {
      expect(failedResult.error).toContain("Permission denied");
    }
  });
});
