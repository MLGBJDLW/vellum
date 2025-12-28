/**
 * Context Integration Tests
 *
 * Tests for the context management integration with the agent loop.
 */

import { describe, expect, it, vi } from "vitest";
import { type ContextMessage, MessagePriority } from "../../context/index.js";
import type { SessionMessage } from "../../session/index.js";
import {
  contextsToSessions,
  contextToSession,
  createContextIntegration,
  createContextIntegrationFromLoopConfig,
  sessionsToContexts,
  sessionToContext,
} from "../context-integration.js";

// ============================================================================
// Test Fixtures
// ============================================================================

function createSessionMessage(overrides: Partial<SessionMessage> = {}): SessionMessage {
  return {
    id: "msg-1",
    role: "user",
    parts: [{ type: "text", text: "Hello, world!" }],
    metadata: {
      createdAt: Date.now(),
    },
    ...overrides,
  };
}

function createContextMessage(overrides: Partial<ContextMessage> = {}): ContextMessage {
  return {
    id: "ctx-1",
    role: "user",
    content: "Hello, world!",
    priority: MessagePriority.NORMAL,
    ...overrides,
  };
}

// ============================================================================
// sessionToContext Tests
// ============================================================================

describe("sessionToContext", () => {
  it("should convert simple text message", () => {
    const session = createSessionMessage();
    const context = sessionToContext(session);

    expect(context.id).toBe("msg-1");
    expect(context.role).toBe("user");
    expect(context.content).toBe("Hello, world!");
    expect(context.priority).toBe(MessagePriority.RECENT);
  });

  it("should use NORMAL priority for assistant messages", () => {
    const session = createSessionMessage({
      role: "assistant",
      parts: [{ type: "text", text: "Response" }],
    });
    const context = sessionToContext(session);

    expect(context.role).toBe("assistant");
    expect(context.priority).toBe(MessagePriority.NORMAL);
  });

  it("should handle multiple text parts", () => {
    const session = createSessionMessage({
      parts: [
        { type: "text", text: "Line 1" },
        { type: "text", text: "Line 2" },
      ],
    });
    const context = sessionToContext(session);

    expect(context.content).toBe("Line 1\nLine 2");
  });

  it("should convert tool call parts to content blocks", () => {
    const session = createSessionMessage({
      role: "assistant",
      parts: [
        { type: "text", text: "Using tool" },
        { type: "tool", id: "tool-1", name: "read_file", input: { path: "/test" } },
      ],
    });
    const context = sessionToContext(session);

    expect(Array.isArray(context.content)).toBe(true);
    const content = context.content as Array<{ type: string }>;
    expect(content).toHaveLength(2);
    expect(content[0]?.type).toBe("text");
    expect(content[1]?.type).toBe("tool_use");
  });

  it("should convert tool result parts", () => {
    const session = createSessionMessage({
      parts: [{ type: "tool_result", toolId: "tool-1", content: "File contents", isError: false }],
    });
    const context = sessionToContext(session);

    expect(Array.isArray(context.content)).toBe(true);
    const content = context.content as Array<{ type: string; is_error?: boolean }>;
    expect(content[0]?.type).toBe("tool_result");
    expect(content[0]?.is_error).toBe(false);
  });

  it("should preserve token count from metadata", () => {
    const session = createSessionMessage({
      metadata: {
        createdAt: Date.now(),
        tokens: { input: 100, output: 50 },
      },
    });
    const context = sessionToContext(session);

    expect(context.tokens).toBe(150);
  });

  it("should preserve createdAt timestamp", () => {
    const timestamp = Date.now() - 1000;
    const session = createSessionMessage({
      metadata: { createdAt: timestamp },
    });
    const context = sessionToContext(session);

    expect(context.createdAt).toBe(timestamp);
  });
});

// ============================================================================
// contextToSession Tests
// ============================================================================

describe("contextToSession", () => {
  it("should convert context message to session message", () => {
    const context = createContextMessage();
    const session = contextToSession(context);

    expect(session.id).toBe("ctx-1");
    expect(session.role).toBe("user");
    expect(session.parts).toHaveLength(1);
    expect(session.parts[0]?.type).toBe("text");
  });

  it("should preserve original parts when provided", () => {
    const context = createContextMessage();
    const original = createSessionMessage({
      parts: [
        { type: "text", text: "Original" },
        { type: "tool", id: "t1", name: "test", input: {} },
      ],
    });
    const session = contextToSession(context, original);

    expect(session.parts).toHaveLength(2);
    expect(session.parts[0]?.type).toBe("text");
    expect(session.parts[1]?.type).toBe("tool");
  });

  it("should add context management metadata", () => {
    const context = createContextMessage();
    const session = contextToSession(context);

    expect(session.metadata.extra?._contextManaged).toBe(true);
    expect(session.metadata.extra?._contextState).toBe("original");
  });

  it("should mark summary messages", () => {
    const context = createContextMessage({ isSummary: true });
    const session = contextToSession(context);

    expect(session.metadata.extra?._contextState).toBe("summary");
  });

  it("should use context createdAt or fallback to now", () => {
    const timestamp = Date.now() - 5000;
    const context = createContextMessage({ createdAt: timestamp });
    const session = contextToSession(context);

    expect(session.metadata.createdAt).toBe(timestamp);
  });
});

// ============================================================================
// Batch Conversion Tests
// ============================================================================

describe("sessionsToContexts", () => {
  it("should convert array of session messages", () => {
    const sessions = [
      createSessionMessage({ id: "msg-1" }),
      createSessionMessage({ id: "msg-2", role: "assistant" }),
    ];
    const contexts = sessionsToContexts(sessions);

    expect(contexts).toHaveLength(2);
    expect(contexts[0]?.id).toBe("msg-1");
    expect(contexts[1]?.id).toBe("msg-2");
  });
});

describe("contextsToSessions", () => {
  it("should convert array of context messages preserving originals", () => {
    const originals = [
      createSessionMessage({ id: "msg-1" }),
      createSessionMessage({ id: "msg-2" }),
    ];
    const contexts = [createContextMessage({ id: "msg-1" }), createContextMessage({ id: "msg-2" })];
    const sessions = contextsToSessions(contexts, originals);

    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.parts).toEqual(originals[0]?.parts);
    expect(sessions[1]?.parts).toEqual(originals[1]?.parts);
  });
});

// ============================================================================
// createContextIntegration Tests
// ============================================================================

describe("createContextIntegration", () => {
  it("should create disabled integration when enabled is false", () => {
    const integration = createContextIntegration({
      model: "claude-sonnet-4-20250514",
      enabled: false,
    });

    expect(integration.enabled).toBe(false);
    expect(integration.manager).toBeNull();
    expect(integration.getState()).toBeNull();
  });

  it("should create enabled integration with manager", () => {
    const integration = createContextIntegration({
      model: "claude-sonnet-4-20250514",
      enabled: true,
    });

    expect(integration.enabled).toBe(true);
    expect(integration.manager).not.toBeNull();
  });

  describe("beforeApiCall", () => {
    it("should return messages unchanged when disabled", async () => {
      const integration = createContextIntegration({
        model: "claude-sonnet-4-20250514",
        enabled: false,
      });

      const messages = [createSessionMessage()];
      const result = await integration.beforeApiCall(messages);

      expect(result.messages).toEqual(messages);
      expect(result.state).toBe("healthy");
      expect(result.actions).toEqual([]);
      expect(result.modified).toBe(false);
    });

    it("should process messages when enabled", async () => {
      const integration = createContextIntegration({
        model: "claude-sonnet-4-20250514",
        enabled: true,
      });

      const messages = [
        createSessionMessage({ id: "msg-1" }),
        createSessionMessage({ id: "msg-2", role: "assistant" }),
      ];
      const result = await integration.beforeApiCall(messages);

      // Messages should be returned (possibly modified)
      expect(result.messages.length).toBeGreaterThan(0);
      expect(typeof result.state).toBe("string");
      expect(Array.isArray(result.actions)).toBe(true);
    });

    it("should handle errors gracefully", async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const integration = createContextIntegration({
        model: "invalid-model-that-will-cause-issues",
        enabled: true,
        logger: mockLogger as any,
      });

      // Even with an edge case, should not throw
      const messages = [createSessionMessage()];
      const result = await integration.beforeApiCall(messages);

      // Should return original messages on any processing error
      expect(result.messages).toBeDefined();
      expect(result.state).toBeDefined();
    });
  });

  describe("getApiMessages", () => {
    it("should return messages unchanged when disabled", () => {
      const integration = createContextIntegration({
        model: "claude-sonnet-4-20250514",
        enabled: false,
      });

      const messages = [createSessionMessage()];
      const result = integration.getApiMessages(messages);

      expect(result).toEqual(messages);
    });
  });

  describe("reset", () => {
    it("should reset state to healthy", () => {
      const integration = createContextIntegration({
        model: "claude-sonnet-4-20250514",
        enabled: true,
      });

      integration.reset();
      expect(integration.getState()).toBe("healthy");
    });
  });
});

// ============================================================================
// createContextIntegrationFromLoopConfig Tests
// ============================================================================

describe("createContextIntegrationFromLoopConfig", () => {
  it("should create disabled integration when config is undefined", () => {
    const integration = createContextIntegrationFromLoopConfig("claude-sonnet-4-20250514");

    expect(integration.enabled).toBe(false);
  });

  it("should create disabled integration when enabled is false", () => {
    const integration = createContextIntegrationFromLoopConfig("claude-sonnet-4-20250514", {
      enabled: false,
    });

    expect(integration.enabled).toBe(false);
  });

  it("should create enabled integration when enabled is true", () => {
    const integration = createContextIntegrationFromLoopConfig("claude-sonnet-4-20250514", {
      enabled: true,
    });

    expect(integration.enabled).toBe(true);
    expect(integration.manager).not.toBeNull();
  });

  it("should pass config overrides", () => {
    const integration = createContextIntegrationFromLoopConfig("claude-sonnet-4-20250514", {
      enabled: true,
      configOverrides: {
        // Custom config values would go here
      },
    });

    expect(integration.enabled).toBe(true);
  });
});
