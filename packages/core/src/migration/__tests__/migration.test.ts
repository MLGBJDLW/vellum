/**
 * Migration Tests
 *
 * Tests for migration utilities that convert legacy message formats
 * to the new Vellum type system.
 */

import { describe, expect, it } from "vitest";
import {
  isLegacyMessage,
  type LegacyMessage,
  migrateMessage,
  migrateMessages,
} from "../message.js";

describe("migrateMessage", () => {
  describe("string content", () => {
    it("should convert string content to TextPart array", () => {
      const legacy: LegacyMessage = {
        role: "user",
        content: "Hello, world!",
      };

      const result = migrateMessage(legacy);

      expect(result.role).toBe("user");
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: "text",
        content: "Hello, world!",
      });
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeDefined();
    });

    it("should handle empty string content", () => {
      const legacy: LegacyMessage = {
        role: "assistant",
        content: "",
      };

      const result = migrateMessage(legacy);

      expect(result.role).toBe("assistant");
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: "text",
        content: "",
      });
    });

    it("should handle null content", () => {
      const legacy: LegacyMessage = {
        role: "assistant",
        content: null,
      };

      const result = migrateMessage(legacy);

      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.type).toBe("text");
    });
  });

  describe("array content", () => {
    it("should convert text parts from array", () => {
      const legacy: LegacyMessage = {
        role: "user",
        content: [
          { type: "text", text: "First part" },
          { type: "text", text: "Second part" },
        ],
      };

      const result = migrateMessage(legacy);

      expect(result.content).toHaveLength(2);
      expect(result.content[0]).toMatchObject({
        type: "text",
        content: "First part",
      });
      expect(result.content[1]).toMatchObject({
        type: "text",
        content: "Second part",
      });
    });

    it("should convert image_url parts", () => {
      const legacy: LegacyMessage = {
        role: "user",
        content: [
          { type: "text", text: "Look at this image:" },
          { type: "image_url", image_url: { url: "https://example.com/image.png" } },
        ],
      };

      const result = migrateMessage(legacy);

      expect(result.content).toHaveLength(2);
      expect(result.content[1]).toMatchObject({
        type: "image",
        url: "https://example.com/image.png",
        mimeType: "image/png",
      });
    });

    it("should infer MIME type from image extension", () => {
      const legacy: LegacyMessage = {
        role: "user",
        content: [{ type: "image_url", image_url: { url: "https://example.com/photo.jpg" } }],
      };

      const result = migrateMessage(legacy);

      expect(result.content[0]).toMatchObject({
        type: "image",
        mimeType: "image/jpeg",
      });
    });
  });

  describe("tool_call parts", () => {
    it("should convert OpenAI tool_calls array", () => {
      const legacy: LegacyMessage = {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_123",
            type: "function",
            function: {
              name: "read_file",
              arguments: '{"path": "/test.txt"}',
            },
          },
        ],
      };

      const result = migrateMessage(legacy);

      expect(result.role).toBe("assistant");
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: "tool",
        toolName: "read_file",
        toolCallId: "call_123",
        input: { path: "/test.txt" },
        state: { status: "pending" },
      });
    });

    it("should convert multiple tool calls", () => {
      const legacy: LegacyMessage = {
        role: "assistant",
        content: "Let me check those files.",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "read_file", arguments: '{"path": "/a.txt"}' },
          },
          {
            id: "call_2",
            type: "function",
            function: { name: "read_file", arguments: '{"path": "/b.txt"}' },
          },
        ],
      };

      const result = migrateMessage(legacy);

      expect(result.content).toHaveLength(3);
      expect(result.content[0]?.type).toBe("text");
      expect(result.content[1]).toMatchObject({
        type: "tool",
        toolCallId: "call_1",
      });
      expect(result.content[2]).toMatchObject({
        type: "tool",
        toolCallId: "call_2",
      });
    });

    it("should handle legacy function_call format", () => {
      const legacy: LegacyMessage = {
        role: "assistant",
        content: null,
        function_call: {
          name: "get_weather",
          arguments: '{"location": "NYC"}',
        },
      };

      const result = migrateMessage(legacy);

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: "tool",
        toolName: "get_weather",
        input: { location: "NYC" },
      });
    });

    it("should convert Anthropic tool_use format", () => {
      const legacy: LegacyMessage = {
        role: "assistant",
        content: [
          { type: "text", text: "I'll read that file." },
          {
            type: "tool_use",
            id: "toolu_123",
            name: "read_file",
            input: { path: "/test.txt" },
          },
        ],
      };

      const result = migrateMessage(legacy);

      expect(result.content).toHaveLength(2);
      expect(result.content[1]).toMatchObject({
        type: "tool",
        toolName: "read_file",
        toolCallId: "toolu_123",
        input: { path: "/test.txt" },
      });
    });

    it("should handle invalid JSON in tool arguments", () => {
      const legacy: LegacyMessage = {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "test", arguments: "invalid json {" },
          },
        ],
      };

      const result = migrateMessage(legacy);

      expect(result.content[0]).toMatchObject({
        type: "tool",
        input: { raw: "invalid json {" },
      });
    });
  });

  describe("tool_result parts", () => {
    it("should convert OpenAI tool result message", () => {
      const legacy: LegacyMessage = {
        role: "tool",
        content: "File contents here",
        tool_call_id: "call_123",
      };

      const result = migrateMessage(legacy);

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: "tool-result",
        toolCallId: "call_123",
        output: "File contents here",
      });
    });

    it("should convert function result message", () => {
      const legacy: LegacyMessage = {
        role: "function",
        name: "get_weather",
        content: '{"temp": 72}',
      };

      const result = migrateMessage(legacy);

      expect(result.content[0]).toMatchObject({
        type: "tool-result",
        toolCallId: "get_weather",
        output: '{"temp": 72}',
      });
    });

    it("should convert Anthropic tool_result format", () => {
      const legacy: LegacyMessage = {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_call_id: "toolu_123",
            content: "Operation completed",
          },
        ],
      };

      const result = migrateMessage(legacy);

      expect(result.content[0]).toMatchObject({
        type: "tool-result",
        toolCallId: "toolu_123",
        output: "Operation completed",
      });
    });

    it("should detect error in tool result content", () => {
      const legacy: LegacyMessage = {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_call_id: "call_1",
            content: "Error: File not found",
          },
        ],
      };

      const result = migrateMessage(legacy);

      expect(result.content[0]).toMatchObject({
        type: "tool-result",
        isError: true,
      });
    });
  });

  describe("role normalization", () => {
    it("should normalize 'human' to 'user'", () => {
      const legacy: LegacyMessage = {
        role: "human",
        content: "Hello",
      };

      expect(migrateMessage(legacy).role).toBe("user");
    });

    it("should normalize 'ai' to 'assistant'", () => {
      const legacy: LegacyMessage = {
        role: "ai",
        content: "Hello",
      };

      expect(migrateMessage(legacy).role).toBe("assistant");
    });

    it("should normalize 'bot' to 'assistant'", () => {
      const legacy: LegacyMessage = {
        role: "bot",
        content: "Hello",
      };

      expect(migrateMessage(legacy).role).toBe("assistant");
    });

    it("should handle case insensitivity", () => {
      const legacy: LegacyMessage = {
        role: "SYSTEM",
        content: "You are helpful",
      };

      expect(migrateMessage(legacy).role).toBe("system");
    });

    it("should default unknown roles to 'user'", () => {
      const legacy: LegacyMessage = {
        role: "unknown_role",
        content: "Hello",
      };

      expect(migrateMessage(legacy).role).toBe("user");
    });
  });
});

describe("migrateMessages", () => {
  it("should migrate array of legacy messages", () => {
    const legacyMessages: LegacyMessage[] = [
      { role: "system", content: "You are helpful" },
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!" },
    ];

    const results = migrateMessages(legacyMessages);

    expect(results).toHaveLength(3);
    expect(results[0]?.role).toBe("system");
    expect(results[1]?.role).toBe("user");
    expect(results[2]?.role).toBe("assistant");
  });

  it("should handle empty array", () => {
    expect(migrateMessages([])).toEqual([]);
  });
});

describe("isLegacyMessage", () => {
  it("should return true for string content", () => {
    expect(
      isLegacyMessage({
        role: "user",
        content: "Hello",
      })
    ).toBe(true);
  });

  it("should return true for messages with tool_calls", () => {
    expect(
      isLegacyMessage({
        role: "assistant",
        content: null,
        tool_calls: [],
      })
    ).toBe(true);
  });

  it("should return true for messages with function_call", () => {
    expect(
      isLegacyMessage({
        role: "assistant",
        content: null,
        function_call: { name: "test", arguments: "{}" },
      })
    ).toBe(true);
  });

  it("should return true for messages with tool_call_id", () => {
    expect(
      isLegacyMessage({
        role: "tool",
        content: "result",
        tool_call_id: "123",
      })
    ).toBe(true);
  });

  it("should return true for legacy array format", () => {
    expect(
      isLegacyMessage({
        role: "user",
        content: [{ type: "text", text: "Hello" }],
      })
    ).toBe(true);
  });

  it("should return false for non-object", () => {
    expect(isLegacyMessage("string")).toBe(false);
    expect(isLegacyMessage(null)).toBe(false);
    expect(isLegacyMessage(undefined)).toBe(false);
  });

  it("should return false for object without role", () => {
    expect(isLegacyMessage({ content: "Hello" })).toBe(false);
  });

  it("should return false for new format messages", () => {
    expect(
      isLegacyMessage({
        id: "123",
        role: "user",
        content: [{ type: "text", content: "Hello" }],
        createdAt: "2024-01-01",
      })
    ).toBe(false);
  });
});

describe("type compatibility", () => {
  it("should produce valid Message objects", () => {
    const legacy: LegacyMessage = {
      role: "user",
      content: "Test",
    };

    const message = migrateMessage(legacy);

    // Verify all required Message fields
    expect(typeof message.id).toBe("string");
    expect(message.id.length).toBeGreaterThan(0);
    expect(typeof message.role).toBe("string");
    expect(["system", "user", "assistant"]).toContain(message.role);
    expect(Array.isArray(message.content)).toBe(true);
    expect(typeof message.createdAt).toBe("string");
    expect(new Date(message.createdAt).getTime()).not.toBeNaN();
  });

  it("should produce valid content parts", () => {
    const legacy: LegacyMessage = {
      role: "assistant",
      content: [
        { type: "text", text: "Hello" },
        { type: "tool_use", id: "1", name: "test", input: {} },
      ],
      tool_calls: [{ id: "2", type: "function", function: { name: "test2", arguments: "{}" } }],
    };

    const message = migrateMessage(legacy);

    // All parts should have type and id
    for (const part of message.content) {
      expect(typeof part.type).toBe("string");
      expect(typeof part.id).toBe("string");
    }
  });
});
