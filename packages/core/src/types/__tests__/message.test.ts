/**
 * Unit tests for message types
 *
 * @see packages/core/src/types/message.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import {
  createMessage,
  FilePartSchema,
  ImagePartSchema,
  MessageContentSchema,
  MessageSchema,
  PartBaseSchema,
  Parts,
  ReasoningPartSchema,
  RoleSchema,
  TextPartSchema,
  ToolPartSchema,
  ToolResultPartSchema,
  type ToolState,
  ToolStateCompletedSchema,
  ToolStateErrorSchema,
  ToolStatePendingSchema,
  ToolStateRunningSchema,
  ToolStateSchema,
  ToolStates,
} from "../message.js";

// =============================================================================
// Test 1: RoleSchema
// =============================================================================
describe("RoleSchema", () => {
  it("should validate 'system' role", () => {
    expect(RoleSchema.parse("system")).toBe("system");
  });

  it("should validate 'user' role", () => {
    expect(RoleSchema.parse("user")).toBe("user");
  });

  it("should validate 'assistant' role", () => {
    expect(RoleSchema.parse("assistant")).toBe("assistant");
  });

  it("should reject invalid role", () => {
    expect(() => RoleSchema.parse("admin")).toThrow(ZodError);
  });

  it("should reject empty string", () => {
    expect(() => RoleSchema.parse("")).toThrow(ZodError);
  });

  it("should reject non-string values", () => {
    expect(() => RoleSchema.parse(123)).toThrow(ZodError);
    expect(() => RoleSchema.parse(null)).toThrow(ZodError);
    expect(() => RoleSchema.parse(undefined)).toThrow(ZodError);
  });
});

// =============================================================================
// Test 2: PartBaseSchema
// =============================================================================
describe("PartBaseSchema", () => {
  it("should validate with type only", () => {
    const result = PartBaseSchema.parse({ type: "text" });
    expect(result).toEqual({ type: "text" });
  });

  it("should validate with type and id", () => {
    const result = PartBaseSchema.parse({ type: "tool", id: "part-123" });
    expect(result).toEqual({ type: "tool", id: "part-123" });
  });

  it("should allow any string for type field", () => {
    const result = PartBaseSchema.parse({ type: "custom-type" });
    expect(result.type).toBe("custom-type");
  });

  it("should reject missing type field", () => {
    expect(() => PartBaseSchema.parse({})).toThrow(ZodError);
  });

  it("should reject non-string type", () => {
    expect(() => PartBaseSchema.parse({ type: 123 })).toThrow(ZodError);
  });

  it("should strip unknown fields", () => {
    const result = PartBaseSchema.parse({ type: "text", extra: "field" });
    expect(result).not.toHaveProperty("extra");
  });
});

// =============================================================================
// Test 3: ToolStateSchema (Discriminated Union)
// =============================================================================
describe("ToolStateSchema", () => {
  describe("ToolStatePendingSchema", () => {
    it("should validate pending state", () => {
      const result = ToolStatePendingSchema.parse({ status: "pending" });
      expect(result).toEqual({ status: "pending" });
    });

    it("should reject missing status", () => {
      expect(() => ToolStatePendingSchema.parse({})).toThrow(ZodError);
    });
  });

  describe("ToolStateRunningSchema", () => {
    it("should validate running state with startedAt", () => {
      const startedAt = Date.now();
      const result = ToolStateRunningSchema.parse({ status: "running", startedAt });
      expect(result).toEqual({ status: "running", startedAt });
    });

    it("should reject running state without startedAt", () => {
      expect(() => ToolStateRunningSchema.parse({ status: "running" })).toThrow(ZodError);
    });

    it("should reject non-number startedAt", () => {
      expect(() => ToolStateRunningSchema.parse({ status: "running", startedAt: "now" })).toThrow(
        ZodError
      );
    });
  });

  describe("ToolStateCompletedSchema", () => {
    it("should validate completed state with completedAt", () => {
      const completedAt = Date.now();
      const result = ToolStateCompletedSchema.parse({ status: "completed", completedAt });
      expect(result).toEqual({ status: "completed", completedAt });
    });

    it("should reject completed state without completedAt", () => {
      expect(() => ToolStateCompletedSchema.parse({ status: "completed" })).toThrow(ZodError);
    });
  });

  describe("ToolStateErrorSchema", () => {
    it("should validate error state with error and failedAt", () => {
      const failedAt = Date.now();
      const result = ToolStateErrorSchema.parse({
        status: "error",
        error: "Something went wrong",
        failedAt,
      });
      expect(result).toEqual({ status: "error", error: "Something went wrong", failedAt });
    });

    it("should reject error state without error message", () => {
      expect(() => ToolStateErrorSchema.parse({ status: "error", failedAt: Date.now() })).toThrow(
        ZodError
      );
    });

    it("should reject error state without failedAt", () => {
      expect(() => ToolStateErrorSchema.parse({ status: "error", error: "msg" })).toThrow(ZodError);
    });
  });

  describe("discriminated union", () => {
    it("should parse pending state", () => {
      const result = ToolStateSchema.parse({ status: "pending" });
      expect(result.status).toBe("pending");
    });

    it("should parse running state", () => {
      const result = ToolStateSchema.parse({ status: "running", startedAt: 1000 });
      expect(result.status).toBe("running");
      if (result.status === "running") {
        expect(result.startedAt).toBe(1000);
      }
    });

    it("should parse completed state", () => {
      const result = ToolStateSchema.parse({ status: "completed", completedAt: 2000 });
      expect(result.status).toBe("completed");
      if (result.status === "completed") {
        expect(result.completedAt).toBe(2000);
      }
    });

    it("should parse error state", () => {
      const result = ToolStateSchema.parse({
        status: "error",
        error: "fail",
        failedAt: 3000,
      });
      expect(result.status).toBe("error");
      if (result.status === "error") {
        expect(result.error).toBe("fail");
        expect(result.failedAt).toBe(3000);
      }
    });

    it("should reject invalid status", () => {
      expect(() => ToolStateSchema.parse({ status: "unknown" })).toThrow(ZodError);
    });
  });
});

// =============================================================================
// Test 4: Part Schemas (6 types)
// =============================================================================
describe("Part Schemas", () => {
  describe("TextPartSchema", () => {
    it("should validate text part with required fields", () => {
      const result = TextPartSchema.parse({ type: "text", content: "Hello" });
      expect(result.type).toBe("text");
      expect(result.content).toBe("Hello");
    });

    it("should validate text part with optional id", () => {
      const result = TextPartSchema.parse({ type: "text", content: "Hi", id: "txt-1" });
      expect(result.id).toBe("txt-1");
    });

    it("should reject missing content", () => {
      expect(() => TextPartSchema.parse({ type: "text" })).toThrow(ZodError);
    });

    it("should reject wrong type literal", () => {
      expect(() => TextPartSchema.parse({ type: "tool", content: "Hi" })).toThrow(ZodError);
    });

    it("should allow empty string content", () => {
      const result = TextPartSchema.parse({ type: "text", content: "" });
      expect(result.content).toBe("");
    });
  });

  describe("ToolPartSchema", () => {
    const validToolPart = {
      type: "tool",
      toolName: "read_file",
      toolCallId: "call-123",
      input: { path: "/src/index.ts" },
      state: { status: "pending" },
    };

    it("should validate tool part with all required fields", () => {
      const result = ToolPartSchema.parse(validToolPart);
      expect(result.type).toBe("tool");
      expect(result.toolName).toBe("read_file");
      expect(result.toolCallId).toBe("call-123");
      expect(result.input).toEqual({ path: "/src/index.ts" });
      expect(result.state.status).toBe("pending");
    });

    it("should validate tool part with optional id", () => {
      const result = ToolPartSchema.parse({ ...validToolPart, id: "tool-1" });
      expect(result.id).toBe("tool-1");
    });

    it("should accept any input type", () => {
      expect(ToolPartSchema.parse({ ...validToolPart, input: null }).input).toBeNull();
      expect(ToolPartSchema.parse({ ...validToolPart, input: 42 }).input).toBe(42);
      expect(ToolPartSchema.parse({ ...validToolPart, input: ["a", "b"] }).input).toEqual([
        "a",
        "b",
      ]);
    });

    it("should accept running state", () => {
      const result = ToolPartSchema.parse({
        ...validToolPart,
        state: { status: "running", startedAt: Date.now() },
      });
      expect(result.state.status).toBe("running");
    });

    it("should reject missing toolName", () => {
      const { toolName, ...invalid } = validToolPart;
      expect(() => ToolPartSchema.parse(invalid)).toThrow(ZodError);
    });

    it("should reject missing toolCallId", () => {
      const { toolCallId, ...invalid } = validToolPart;
      expect(() => ToolPartSchema.parse(invalid)).toThrow(ZodError);
    });

    it("should reject missing state", () => {
      const { state, ...invalid } = validToolPart;
      expect(() => ToolPartSchema.parse(invalid)).toThrow(ZodError);
    });
  });

  describe("ToolResultPartSchema", () => {
    const validToolResult = {
      type: "tool-result",
      toolCallId: "call-123",
      output: { data: "result" },
    };

    it("should validate tool result with required fields", () => {
      const result = ToolResultPartSchema.parse(validToolResult);
      expect(result.type).toBe("tool-result");
      expect(result.toolCallId).toBe("call-123");
      expect(result.output).toEqual({ data: "result" });
    });

    it("should validate with optional id", () => {
      const result = ToolResultPartSchema.parse({ ...validToolResult, id: "res-1" });
      expect(result.id).toBe("res-1");
    });

    it("should validate with optional isError", () => {
      const result = ToolResultPartSchema.parse({ ...validToolResult, isError: true });
      expect(result.isError).toBe(true);
    });

    it("should default isError to undefined", () => {
      const result = ToolResultPartSchema.parse(validToolResult);
      expect(result.isError).toBeUndefined();
    });

    it("should accept any output type", () => {
      expect(ToolResultPartSchema.parse({ ...validToolResult, output: null }).output).toBeNull();
      expect(ToolResultPartSchema.parse({ ...validToolResult, output: "string" }).output).toBe(
        "string"
      );
    });

    it("should reject missing toolCallId", () => {
      const { toolCallId, ...invalid } = validToolResult;
      expect(() => ToolResultPartSchema.parse(invalid)).toThrow(ZodError);
    });
  });

  describe("ReasoningPartSchema", () => {
    it("should validate reasoning part with content", () => {
      const result = ReasoningPartSchema.parse({
        type: "reasoning",
        content: "Let me think...",
      });
      expect(result.type).toBe("reasoning");
      expect(result.content).toBe("Let me think...");
    });

    it("should validate with optional id", () => {
      const result = ReasoningPartSchema.parse({
        type: "reasoning",
        content: "Thinking",
        id: "reas-1",
      });
      expect(result.id).toBe("reas-1");
    });

    it("should reject missing content", () => {
      expect(() => ReasoningPartSchema.parse({ type: "reasoning" })).toThrow(ZodError);
    });
  });

  describe("FilePartSchema", () => {
    it("should validate file part with required path", () => {
      const result = FilePartSchema.parse({ type: "file", path: "/src/index.ts" });
      expect(result.type).toBe("file");
      expect(result.path).toBe("/src/index.ts");
    });

    it("should validate with optional id", () => {
      const result = FilePartSchema.parse({ type: "file", path: "/a.ts", id: "file-1" });
      expect(result.id).toBe("file-1");
    });

    it("should validate with optional mimeType", () => {
      const result = FilePartSchema.parse({
        type: "file",
        path: "/a.ts",
        mimeType: "text/typescript",
      });
      expect(result.mimeType).toBe("text/typescript");
    });

    it("should validate with optional content", () => {
      const result = FilePartSchema.parse({
        type: "file",
        path: "/a.ts",
        content: "export const x = 1;",
      });
      expect(result.content).toBe("export const x = 1;");
    });

    it("should validate with all optional fields", () => {
      const result = FilePartSchema.parse({
        type: "file",
        path: "/a.ts",
        id: "file-1",
        mimeType: "text/typescript",
        content: "code",
      });
      expect(result).toEqual({
        type: "file",
        path: "/a.ts",
        id: "file-1",
        mimeType: "text/typescript",
        content: "code",
      });
    });

    it("should reject missing path", () => {
      expect(() => FilePartSchema.parse({ type: "file" })).toThrow(ZodError);
    });
  });

  describe("ImagePartSchema", () => {
    it("should validate image part with mimeType only", () => {
      const result = ImagePartSchema.parse({ type: "image", mimeType: "image/png" });
      expect(result.type).toBe("image");
      expect(result.mimeType).toBe("image/png");
    });

    it("should validate with url", () => {
      const result = ImagePartSchema.parse({
        type: "image",
        mimeType: "image/jpeg",
        url: "https://example.com/img.jpg",
      });
      expect(result.url).toBe("https://example.com/img.jpg");
    });

    it("should validate with base64", () => {
      const result = ImagePartSchema.parse({
        type: "image",
        mimeType: "image/png",
        base64: "iVBORw0KGgo=",
      });
      expect(result.base64).toBe("iVBORw0KGgo=");
    });

    it("should validate with both url and base64", () => {
      const result = ImagePartSchema.parse({
        type: "image",
        mimeType: "image/png",
        url: "https://example.com/img.png",
        base64: "base64data",
      });
      expect(result.url).toBe("https://example.com/img.png");
      expect(result.base64).toBe("base64data");
    });

    it("should validate with optional id", () => {
      const result = ImagePartSchema.parse({
        type: "image",
        mimeType: "image/png",
        id: "img-1",
      });
      expect(result.id).toBe("img-1");
    });

    it("should reject missing mimeType", () => {
      expect(() => ImagePartSchema.parse({ type: "image" })).toThrow(ZodError);
    });
  });
});

// =============================================================================
// Test 5: MessageContentSchema (Discriminated Union)
// =============================================================================
describe("MessageContentSchema", () => {
  it("should parse text part", () => {
    const result = MessageContentSchema.parse({ type: "text", content: "Hello" });
    expect(result.type).toBe("text");
  });

  it("should parse tool part", () => {
    const result = MessageContentSchema.parse({
      type: "tool",
      toolName: "test",
      toolCallId: "tc-1",
      input: {},
      state: { status: "pending" },
    });
    expect(result.type).toBe("tool");
  });

  it("should parse tool-result part", () => {
    const result = MessageContentSchema.parse({
      type: "tool-result",
      toolCallId: "tc-1",
      output: "result",
    });
    expect(result.type).toBe("tool-result");
  });

  it("should parse reasoning part", () => {
    const result = MessageContentSchema.parse({
      type: "reasoning",
      content: "Thinking...",
    });
    expect(result.type).toBe("reasoning");
  });

  it("should parse file part", () => {
    const result = MessageContentSchema.parse({
      type: "file",
      path: "/test.ts",
    });
    expect(result.type).toBe("file");
  });

  it("should parse image part", () => {
    const result = MessageContentSchema.parse({
      type: "image",
      mimeType: "image/png",
    });
    expect(result.type).toBe("image");
  });

  it("should reject unknown type", () => {
    expect(() => MessageContentSchema.parse({ type: "unknown", data: "test" })).toThrow(ZodError);
  });

  it("should reject missing type", () => {
    expect(() => MessageContentSchema.parse({ content: "test" })).toThrow(ZodError);
  });
});

// =============================================================================
// Test 6: MessageSchema
// =============================================================================
describe("MessageSchema", () => {
  const validMessage = {
    id: "msg-123",
    role: "user" as const,
    content: [{ type: "text" as const, content: "Hello" }],
    createdAt: "2025-12-26T00:00:00.000Z",
  };

  it("should validate complete message", () => {
    const result = MessageSchema.parse(validMessage);
    expect(result.id).toBe("msg-123");
    expect(result.role).toBe("user");
    expect(result.content).toHaveLength(1);
    expect(result.createdAt).toBe("2025-12-26T00:00:00.000Z");
  });

  it("should validate message with optional metadata", () => {
    const result = MessageSchema.parse({
      ...validMessage,
      metadata: { source: "cli", version: 1 },
    });
    expect(result.metadata).toEqual({ source: "cli", version: 1 });
  });

  it("should validate message with empty metadata", () => {
    const result = MessageSchema.parse({
      ...validMessage,
      metadata: {},
    });
    expect(result.metadata).toEqual({});
  });

  it("should validate message with multiple content parts", () => {
    const result = MessageSchema.parse({
      ...validMessage,
      content: [
        { type: "text", content: "Look at this file:" },
        { type: "file", path: "/test.ts" },
        { type: "image", mimeType: "image/png" },
      ],
    });
    expect(result.content).toHaveLength(3);
    expect(result.content[0]?.type).toBe("text");
    expect(result.content[1]?.type).toBe("file");
    expect(result.content[2]?.type).toBe("image");
  });

  it("should validate message with empty content array", () => {
    const result = MessageSchema.parse({ ...validMessage, content: [] });
    expect(result.content).toEqual([]);
  });

  it("should validate all roles", () => {
    expect(MessageSchema.parse({ ...validMessage, role: "system" }).role).toBe("system");
    expect(MessageSchema.parse({ ...validMessage, role: "user" }).role).toBe("user");
    expect(MessageSchema.parse({ ...validMessage, role: "assistant" }).role).toBe("assistant");
  });

  it("should reject missing id", () => {
    const { id, ...invalid } = validMessage;
    expect(() => MessageSchema.parse(invalid)).toThrow(ZodError);
  });

  it("should reject missing role", () => {
    const { role, ...invalid } = validMessage;
    expect(() => MessageSchema.parse(invalid)).toThrow(ZodError);
  });

  it("should reject missing content", () => {
    const { content, ...invalid } = validMessage;
    expect(() => MessageSchema.parse(invalid)).toThrow(ZodError);
  });

  it("should reject missing createdAt", () => {
    const { createdAt, ...invalid } = validMessage;
    expect(() => MessageSchema.parse(invalid)).toThrow(ZodError);
  });

  it("should reject invalid role", () => {
    expect(() => MessageSchema.parse({ ...validMessage, role: "admin" })).toThrow(ZodError);
  });

  it("should reject invalid content part", () => {
    expect(() =>
      MessageSchema.parse({
        ...validMessage,
        content: [{ type: "invalid" }],
      })
    ).toThrow(ZodError);
  });
});

// =============================================================================
// Test 7: createMessage() Factory
// =============================================================================
describe("createMessage()", () => {
  const mockUUID = "550e8400-e29b-41d4-a716-446655440000";
  const mockDate = new Date("2025-12-26T12:00:00.000Z");

  beforeEach(() => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(mockUUID);
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("should generate UUID for id", () => {
    const message = createMessage("user", [{ type: "text", content: "Hi" }]);
    expect(message.id).toBe(mockUUID);
  });

  it("should generate ISO timestamp for createdAt", () => {
    const message = createMessage("user", [{ type: "text", content: "Hi" }]);
    expect(message.createdAt).toBe("2025-12-26T12:00:00.000Z");
  });

  it("should set provided role", () => {
    expect(createMessage("system", []).role).toBe("system");
    expect(createMessage("user", []).role).toBe("user");
    expect(createMessage("assistant", []).role).toBe("assistant");
  });

  it("should set provided content", () => {
    const content = [
      { type: "text" as const, content: "Hello" },
      { type: "file" as const, path: "/test.ts" },
    ];
    const message = createMessage("user", content);
    expect(message.content).toHaveLength(2);
    expect(message.content[0]?.type).toBe("text");
    expect(message.content[1]?.type).toBe("file");
  });

  it("should include metadata when provided", () => {
    const message = createMessage("user", [], { source: "test", count: 5 });
    expect(message.metadata).toEqual({ source: "test", count: 5 });
  });

  it("should not include metadata field when undefined", () => {
    const message = createMessage("user", []);
    expect(message).not.toHaveProperty("metadata");
  });

  it("should return validated message", () => {
    const message = createMessage("assistant", [{ type: "text", content: "Response" }]);
    // If invalid, MessageSchema.parse would throw
    expect(MessageSchema.safeParse(message).success).toBe(true);
  });

  it("should throw on invalid role", () => {
    // @ts-expect-error - Testing runtime validation
    expect(() => createMessage("invalid", [])).toThrow(ZodError);
  });

  it("should throw on invalid content", () => {
    // @ts-expect-error - Testing runtime validation
    expect(() => createMessage("user", [{ type: "invalid" }])).toThrow(ZodError);
  });
});

// =============================================================================
// Test 8: Parts Factory Object
// =============================================================================
describe("Parts factory", () => {
  const mockUUID = "550e8400-e29b-41d4-a716-446655440000";

  beforeEach(() => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(mockUUID);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Parts.text()", () => {
    it("should create valid TextPart", () => {
      const result = Parts.text("Hello world");
      expect(result.type).toBe("text");
      expect(result.content).toBe("Hello world");
      expect(result.id).toBe(mockUUID);
    });

    it("should pass TextPartSchema validation", () => {
      const result = Parts.text("Test");
      expect(TextPartSchema.safeParse(result).success).toBe(true);
    });

    it("should handle empty string content", () => {
      const result = Parts.text("");
      expect(result.content).toBe("");
    });
  });

  describe("Parts.tool()", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-12-26T12:00:00.000Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should create valid ToolPart with default pending state", () => {
      const result = Parts.tool("read_file", "call-1", { path: "/test.ts" });
      expect(result.type).toBe("tool");
      expect(result.toolName).toBe("read_file");
      expect(result.toolCallId).toBe("call-1");
      expect(result.input).toEqual({ path: "/test.ts" });
      expect(result.state.status).toBe("pending");
      expect(result.id).toBe(mockUUID);
    });

    it("should use provided state", () => {
      const state: ToolState = { status: "running", startedAt: 1000 };
      const result = Parts.tool("write_file", "call-2", {}, state);
      expect(result.state).toEqual(state);
    });

    it("should pass ToolPartSchema validation", () => {
      const result = Parts.tool("test_tool", "tc-1", null);
      expect(ToolPartSchema.safeParse(result).success).toBe(true);
    });
  });

  describe("Parts.toolResult()", () => {
    it("should create valid ToolResultPart", () => {
      const result = Parts.toolResult("call-1", { data: "output" });
      expect(result.type).toBe("tool-result");
      expect(result.toolCallId).toBe("call-1");
      expect(result.output).toEqual({ data: "output" });
      expect(result.id).toBe(mockUUID);
    });

    it("should include isError when provided", () => {
      const result = Parts.toolResult("call-1", "error message", true);
      expect(result.isError).toBe(true);
    });

    it("should not include isError when undefined", () => {
      const result = Parts.toolResult("call-1", "output");
      expect(result).not.toHaveProperty("isError");
    });

    it("should pass ToolResultPartSchema validation", () => {
      const result = Parts.toolResult("tc-1", null, false);
      expect(ToolResultPartSchema.safeParse(result).success).toBe(true);
    });
  });

  describe("Parts.reasoning()", () => {
    it("should create valid ReasoningPart", () => {
      const result = Parts.reasoning("Let me analyze this...");
      expect(result.type).toBe("reasoning");
      expect(result.content).toBe("Let me analyze this...");
      expect(result.id).toBe(mockUUID);
    });

    it("should pass ReasoningPartSchema validation", () => {
      const result = Parts.reasoning("Thinking");
      expect(ReasoningPartSchema.safeParse(result).success).toBe(true);
    });
  });

  describe("Parts.file()", () => {
    it("should create valid FilePart with path only", () => {
      const result = Parts.file("/src/index.ts");
      expect(result.type).toBe("file");
      expect(result.path).toBe("/src/index.ts");
      expect(result.id).toBe(mockUUID);
    });

    it("should include mimeType when provided", () => {
      const result = Parts.file("/test.ts", "text/typescript");
      expect(result.mimeType).toBe("text/typescript");
    });

    it("should include content when provided", () => {
      const result = Parts.file("/test.ts", "text/typescript", "export const x = 1;");
      expect(result.content).toBe("export const x = 1;");
    });

    it("should not include optional fields when undefined", () => {
      const result = Parts.file("/test.ts");
      expect(result).not.toHaveProperty("mimeType");
      expect(result).not.toHaveProperty("content");
    });

    it("should pass FilePartSchema validation", () => {
      const result = Parts.file("/a.ts", "text/typescript", "code");
      expect(FilePartSchema.safeParse(result).success).toBe(true);
    });
  });

  describe("Parts.image()", () => {
    it("should create valid ImagePart with url", () => {
      const result = Parts.image("https://example.com/img.png", undefined, "image/png");
      expect(result.type).toBe("image");
      expect(result.url).toBe("https://example.com/img.png");
      expect(result.mimeType).toBe("image/png");
      expect(result.id).toBe(mockUUID);
    });

    it("should create valid ImagePart with base64", () => {
      const result = Parts.image(undefined, "base64data", "image/jpeg");
      expect(result.base64).toBe("base64data");
      expect(result).not.toHaveProperty("url");
    });

    it("should create valid ImagePart with both url and base64", () => {
      const result = Parts.image("https://example.com/img.png", "base64data", "image/png");
      expect(result.url).toBe("https://example.com/img.png");
      expect(result.base64).toBe("base64data");
    });

    it("should not include url when undefined", () => {
      const result = Parts.image(undefined, "b64", "image/png");
      expect(result).not.toHaveProperty("url");
    });

    it("should not include base64 when undefined", () => {
      const result = Parts.image("https://example.com/img.png", undefined, "image/png");
      expect(result).not.toHaveProperty("base64");
    });

    it("should pass ImagePartSchema validation", () => {
      const result = Parts.image("https://test.com/img.jpg", undefined, "image/jpeg");
      expect(ImagePartSchema.safeParse(result).success).toBe(true);
    });
  });
});

// =============================================================================
// Test 9: ToolStates Helper Object
// =============================================================================
describe("ToolStates helper", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-12-26T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("ToolStates.pending()", () => {
    it("should return pending state", () => {
      const result = ToolStates.pending();
      expect(result).toEqual({ status: "pending" });
    });

    it("should pass ToolStatePendingSchema validation", () => {
      const result = ToolStates.pending();
      expect(ToolStatePendingSchema.safeParse(result).success).toBe(true);
    });
  });

  describe("ToolStates.running()", () => {
    it("should return running state with current timestamp", () => {
      const result = ToolStates.running();
      expect(result.status).toBe("running");
      if (result.status === "running") {
        expect(result.startedAt).toBe(Date.now());
      }
    });

    it("should pass ToolStateRunningSchema validation", () => {
      const result = ToolStates.running();
      expect(ToolStateRunningSchema.safeParse(result).success).toBe(true);
    });
  });

  describe("ToolStates.completed()", () => {
    it("should return completed state with current timestamp", () => {
      const result = ToolStates.completed();
      expect(result.status).toBe("completed");
      if (result.status === "completed") {
        expect(result.completedAt).toBe(Date.now());
      }
    });

    it("should pass ToolStateCompletedSchema validation", () => {
      const result = ToolStates.completed();
      expect(ToolStateCompletedSchema.safeParse(result).success).toBe(true);
    });
  });

  describe("ToolStates.error()", () => {
    it("should return error state with message and current timestamp", () => {
      const result = ToolStates.error("Something went wrong");
      expect(result.status).toBe("error");
      if (result.status === "error") {
        expect(result.error).toBe("Something went wrong");
        expect(result.failedAt).toBe(Date.now());
      }
    });

    it("should pass ToolStateErrorSchema validation", () => {
      const result = ToolStates.error("Test error");
      expect(ToolStateErrorSchema.safeParse(result).success).toBe(true);
    });

    it("should handle empty error message", () => {
      const result = ToolStates.error("");
      if (result.status === "error") {
        expect(result.error).toBe("");
      }
    });
  });
});

// =============================================================================
// Test 10: Validation Errors
// =============================================================================
describe("Validation errors", () => {
  describe("ZodError structure", () => {
    it("should include path information in error", () => {
      try {
        MessageSchema.parse({ id: "123", role: "user", content: [], createdAt: 123 });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.issues[0]?.path).toContain("createdAt");
      }
    });

    it("should include expected type in error", () => {
      try {
        RoleSchema.parse(123);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        // Zod v4 uses 'invalid_value' for enum/literal type mismatches
        expect(["invalid_type", "invalid_value"]).toContain(zodError.issues[0]?.code);
      }
    });
  });

  describe("complex validation failures", () => {
    it("should fail on nested invalid content", () => {
      expect(() =>
        MessageSchema.parse({
          id: "msg-1",
          role: "user",
          content: [
            { type: "text", content: "valid" },
            { type: "tool", toolName: "test" }, // Missing required fields
          ],
          createdAt: "2025-12-26T00:00:00Z",
        })
      ).toThrow(ZodError);
    });

    it("should fail on invalid tool state in tool part", () => {
      expect(() =>
        ToolPartSchema.parse({
          type: "tool",
          toolName: "test",
          toolCallId: "tc-1",
          input: {},
          state: { status: "invalid-status" },
        })
      ).toThrow(ZodError);
    });

    it("should fail on wrong discriminator value", () => {
      expect(() =>
        MessageContentSchema.parse({
          type: "video", // Not a valid type
          content: "test",
        })
      ).toThrow(ZodError);
    });
  });

  describe("safeParse for non-throwing validation", () => {
    it("should return success: false for invalid data", () => {
      const result = RoleSchema.safeParse("invalid");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ZodError);
      }
    });

    it("should return success: true for valid data", () => {
      const result = RoleSchema.safeParse("user");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("user");
      }
    });
  });
});
