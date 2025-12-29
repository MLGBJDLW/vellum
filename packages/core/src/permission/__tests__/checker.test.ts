import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ToolContext } from "../../types/tool.js";
import type { PermissionAskHandler } from "../ask-service.js";
import { createDefaultPermissionChecker, DefaultPermissionChecker } from "../checker.js";
import { SessionPermissionManager } from "../session-manager.js";
import { TrustManager } from "../trust-manager.js";
import type { PermissionResponse } from "../types.js";

describe("DefaultPermissionChecker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ============================================
  // Helper Functions
  // ============================================

  function createTestContext(overrides: Partial<ToolContext> = {}): ToolContext {
    return {
      workingDir: "/workspace",
      sessionId: "test-session",
      messageId: "test-message",
      callId: "test-call",
      abortSignal: new AbortController().signal,
      checkPermission: vi.fn().mockResolvedValue(true),
      ...overrides,
    };
  }

  function createMockHandler(response: PermissionResponse): PermissionAskHandler {
    return vi.fn().mockResolvedValue(response);
  }

  // ============================================
  // Constructor
  // ============================================

  describe("constructor", () => {
    it("should create with default components", () => {
      const c = new DefaultPermissionChecker();
      expect(c.askService).toBeDefined();
      expect(c.sessionManager).toBeDefined();
      expect(c.trustManager).toBeDefined();
      expect(c.eventBus).toBeDefined();
      expect(c.autoApprovalHandler).toBeDefined();
    });

    it("should accept custom components", () => {
      const trustManager = new TrustManager({ cliPreset: "cautious" });
      const sessionManager = new SessionPermissionManager();

      const c = new DefaultPermissionChecker({
        trustManager,
        sessionManager,
      });

      expect(c.trustManager).toBe(trustManager);
      expect(c.sessionManager).toBe(sessionManager);
    });

    it("should set initial ask handler", () => {
      const handler: PermissionAskHandler = vi.fn();
      const c = new DefaultPermissionChecker({ askHandler: handler });

      expect(c.askService.hasHandler()).toBe(true);
    });
  });

  // ============================================
  // checkPermission - Config-based
  // ============================================

  describe("checkPermission - config-based", () => {
    it("should allow based on config", async () => {
      const trustManager = new TrustManager({
        config: { edit: "allow" },
      });
      const c = new DefaultPermissionChecker({ trustManager });
      const context = createTestContext();

      const decision = await c.checkPermission("edit_file", { path: "test.ts" }, context);

      expect(decision).toBe("allow");
    });

    it("should deny based on config", async () => {
      const trustManager = new TrustManager({
        config: { preset: "paranoid" },
      });
      const c = new DefaultPermissionChecker({ trustManager });
      const context = createTestContext();

      const decision = await c.checkPermission("edit_file", { path: "test.ts" }, context);

      expect(decision).toBe("deny");
    });

    it("should handle pattern-based bash permissions", async () => {
      const trustManager = new TrustManager({
        config: {
          bash: {
            "git status": "allow",
            "rm -rf *": "deny",
            "*": "ask",
          },
        },
      });
      const handler = createMockHandler("once");
      const c = new DefaultPermissionChecker({ trustManager, askHandler: handler });
      const context = createTestContext();

      // Allowed by pattern
      const gitDecision = await c.checkPermission("bash", { command: "git status" }, context);
      expect(gitDecision).toBe("allow");
      expect(handler).not.toHaveBeenCalled();

      // Denied by pattern
      const rmDecision = await c.checkPermission("bash", { command: "rm -rf /" }, context);
      expect(rmDecision).toBe("deny");
    });
  });

  // ============================================
  // checkPermission - Session Cache
  // ============================================

  describe("checkPermission - session cache", () => {
    it("should use cached session permission", async () => {
      const handler = createMockHandler("once");
      const c = new DefaultPermissionChecker({ askHandler: handler });
      const context = createTestContext();

      // Pre-populate session cache
      c.sessionManager.grant({ type: "bash", pattern: "ls *" }, "allow", {
        source: "user",
      });

      const decision = await c.checkPermission("bash", { command: "ls -la" }, context);

      expect(decision).toBe("allow");
      expect(handler).not.toHaveBeenCalled();
    });

    it("should cache 'always' response", async () => {
      const handler = createMockHandler("always");
      const c = new DefaultPermissionChecker({
        askHandler: handler,
        trustManager: new TrustManager({ config: { bash: "ask" } }),
      });
      const context = createTestContext();

      // First call - should ask
      await c.checkPermission("bash", { command: "echo hello" }, context);
      expect(handler).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      await c.checkPermission("bash", { command: "echo hello" }, context);
      expect(handler).toHaveBeenCalledTimes(1); // Not called again
    });

    it("should not cache 'once' response", async () => {
      const handler = createMockHandler("once");
      const c = new DefaultPermissionChecker({
        askHandler: handler,
        trustManager: new TrustManager({ config: { bash: "ask" } }),
      });
      const context = createTestContext();

      // First call
      await c.checkPermission("bash", { command: "echo hello" }, context);
      expect(handler).toHaveBeenCalledTimes(1);

      // Second call - should ask again
      await c.checkPermission("bash", { command: "echo hello" }, context);
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================
  // checkPermission - Ask Flow
  // ============================================

  describe("checkPermission - ask flow", () => {
    it("should ask user when config says ask", async () => {
      const handler = createMockHandler("once");
      const trustManager = new TrustManager({ config: { bash: "ask" } });
      const c = new DefaultPermissionChecker({ trustManager, askHandler: handler });
      const context = createTestContext();

      const decision = await c.checkPermission("bash", { command: "ls" }, context);

      expect(handler).toHaveBeenCalled();
      expect(decision).toBe("allow");
    });

    it("should deny when user rejects", async () => {
      const handler = createMockHandler("reject");
      const trustManager = new TrustManager({ config: { bash: "ask" } });
      const c = new DefaultPermissionChecker({ trustManager, askHandler: handler });
      const context = createTestContext();

      const decision = await c.checkPermission("bash", { command: "ls" }, context);

      expect(decision).toBe("deny");
    });

    it("should deny when no handler is set", async () => {
      const trustManager = new TrustManager({ config: { bash: "ask" } });
      const c = new DefaultPermissionChecker({ trustManager });
      const context = createTestContext();

      const decision = await c.checkPermission("bash", { command: "ls" }, context);

      expect(decision).toBe("deny");
    });
  });

  // ============================================
  // checkPermission - Timeout (EC-006)
  // ============================================

  describe("checkPermission - timeout (EC-006)", () => {
    it("should deny on timeout", async () => {
      const handler = vi.fn().mockImplementation(() => new Promise(() => {}));
      const trustManager = new TrustManager({ config: { bash: "ask" } });
      const c = new DefaultPermissionChecker({ trustManager, askHandler: handler });
      const context = createTestContext();

      const decisionPromise = c.checkPermission("bash", { command: "ls" }, context);

      // Advance past timeout (30 seconds)
      await vi.advanceTimersByTimeAsync(31000);

      const decision = await decisionPromise;

      expect(decision).toBe("deny");
    });
  });

  // ============================================
  // checkPermission - Dangerous Operations
  // ============================================

  describe("checkPermission - dangerous operations", () => {
    it("should deny critical dangerous commands", async () => {
      const handler = createMockHandler("once");
      const c = new DefaultPermissionChecker({ askHandler: handler });
      const context = createTestContext();

      // rm -rf / is critical danger
      const decision = await c.checkPermission("bash", { command: "rm -rf /" }, context);

      expect(decision).toBe("deny");
      expect(handler).not.toHaveBeenCalled();
    });

    it("should deny pipe to dangerous commands", async () => {
      const handler = createMockHandler("once");
      const c = new DefaultPermissionChecker({ askHandler: handler });
      const context = createTestContext();

      const decision = await c.checkPermission("bash", { command: "cat file | rm -rf /" }, context);

      expect(decision).toBe("deny");
    });
  });

  // ============================================
  // checkPermission - Auto-Approval Limits
  // ============================================

  describe("checkPermission - auto-approval limits", () => {
    it("should deny when auto-approval limit reached", async () => {
      const handler = createMockHandler("once");
      const trustManager = new TrustManager({ config: { bash: "ask" } });
      const c = new DefaultPermissionChecker({ trustManager, askHandler: handler });
      const context = createTestContext();

      // Exhaust auto-approval limit (default 100)
      for (let i = 0; i < 100; i++) {
        await c.checkPermission("bash", { command: `echo ${i}` }, context);
      }

      // Next one should be denied
      const decision = await c.checkPermission("bash", { command: "echo 100" }, context);

      expect(decision).toBe("deny");
    });
  });

  // ============================================
  // checkPermissionWithDetails
  // ============================================

  describe("checkPermissionWithDetails", () => {
    it("should return full resolution details", async () => {
      const handler = createMockHandler("once");
      const trustManager = new TrustManager({ config: { edit: "allow" } });
      const c = new DefaultPermissionChecker({ trustManager, askHandler: handler });
      const context = createTestContext();

      const result = await c.checkPermissionWithDetails("edit_file", { path: "test.ts" }, context);

      expect(result.decision).toBe("allow");
      expect(result.source).toBe("config");
      expect(result.reason).toContain("Config permission");
      expect(result.cached).toBe(false);
    });

    it("should indicate cached decisions", async () => {
      const c = new DefaultPermissionChecker();
      c.sessionManager.grant({ type: "edit" }, "allow", { source: "user" });
      const context = createTestContext();

      const result = await c.checkPermissionWithDetails("edit_file", { path: "test.ts" }, context);

      expect(result.decision).toBe("allow");
      expect(result.cached).toBe(true);
      expect(result.source).toBe("session");
    });

    it("should include danger source for blocked commands", async () => {
      const c = new DefaultPermissionChecker();
      const context = createTestContext();

      const result = await c.checkPermissionWithDetails("bash", { command: "rm -rf /" }, context);

      expect(result.decision).toBe("deny");
      expect(result.source).toBe("danger");
    });

    it("should include timeout source", async () => {
      const handler = vi.fn().mockImplementation(() => new Promise(() => {}));
      const trustManager = new TrustManager({ config: { bash: "ask" } });
      const c = new DefaultPermissionChecker({ trustManager, askHandler: handler });
      const context = createTestContext();

      const resultPromise = c.checkPermissionWithDetails("bash", { command: "ls" }, context);

      await vi.advanceTimersByTimeAsync(31000);

      const result = await resultPromise;

      expect(result.decision).toBe("deny");
      expect(result.source).toBe("timeout");
    });
  });

  // ============================================
  // setAskHandler
  // ============================================

  describe("setAskHandler", () => {
    it("should update the ask handler", async () => {
      const trustManager = new TrustManager({ config: { bash: "ask" } });
      const c = new DefaultPermissionChecker({ trustManager });
      const context = createTestContext();

      // Initially no handler - should deny
      let decision = await c.checkPermission("bash", { command: "ls" }, context);
      expect(decision).toBe("deny");

      // Set handler
      c.setAskHandler(createMockHandler("once"));

      // Now should allow
      decision = await c.checkPermission("bash", { command: "ls" }, context);
      expect(decision).toBe("allow");
    });

    it("should allow clearing handler", async () => {
      const handler = createMockHandler("once");
      const trustManager = new TrustManager({ config: { bash: "ask" } });
      const c = new DefaultPermissionChecker({ trustManager, askHandler: handler });
      const context = createTestContext();

      // Clear handler
      c.setAskHandler(undefined);

      const decision = await c.checkPermission("bash", { command: "ls" }, context);
      expect(decision).toBe("deny");
    });
  });

  // ============================================
  // resetSession
  // ============================================

  describe("resetSession", () => {
    it("should clear session permissions", async () => {
      const c = new DefaultPermissionChecker();

      // Add session permission
      c.sessionManager.grant({ type: "bash" }, "allow");
      expect(c.sessionManager.size).toBe(1);

      // Reset
      c.resetSession();

      expect(c.sessionManager.size).toBe(0);
    });

    it("should reset auto-approval counter", async () => {
      const handler = createMockHandler("once");
      const trustManager = new TrustManager({ config: { bash: "ask" } });
      const c = new DefaultPermissionChecker({ trustManager, askHandler: handler });
      const context = createTestContext();

      // Record some approvals
      await c.checkPermission("bash", { command: "ls" }, context);
      await c.checkPermission("bash", { command: "pwd" }, context);

      expect(c.autoApprovalHandler.getCount()).toBe(2);

      // Reset
      c.resetSession();

      expect(c.autoApprovalHandler.getCount()).toBe(0);
    });
  });

  // ============================================
  // Event Emission
  // ============================================

  describe("event emission", () => {
    it("should emit permissionCheck event", async () => {
      const c = new DefaultPermissionChecker({
        trustManager: new TrustManager({ config: { edit: "allow" } }),
      });
      const context = createTestContext();

      const listener = vi.fn();
      c.eventBus.on("permissionCheck", listener);

      await c.checkPermission("edit_file", { path: "test.ts" }, context);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: "edit_file",
          permissionType: "edit",
        })
      );
    });

    it("should emit permissionGranted event on allow", async () => {
      const c = new DefaultPermissionChecker({
        trustManager: new TrustManager({ config: { edit: "allow" } }),
      });
      const context = createTestContext();

      const listener = vi.fn();
      c.eventBus.on("permissionGranted", listener);

      await c.checkPermission("edit_file", { path: "test.ts" }, context);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: "edit_file",
          permissionType: "edit",
          grantType: "config",
        })
      );
    });

    it("should emit permissionDenied event on deny", async () => {
      const c = new DefaultPermissionChecker();
      const context = createTestContext();

      const listener = vi.fn();
      c.eventBus.on("permissionDenied", listener);

      await c.checkPermission("bash", { command: "rm -rf /" }, context);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: "bash",
          permissionType: "bash",
          isAutoDenial: true,
        })
      );
    });

    it("should not emit events when disabled", async () => {
      const c = new DefaultPermissionChecker({
        trustManager: new TrustManager({ config: { edit: "allow" } }),
        emitEvents: false,
      });
      const context = createTestContext();

      const checkListener = vi.fn();
      const grantListener = vi.fn();
      c.eventBus.on("permissionCheck", checkListener);
      c.eventBus.on("permissionGranted", grantListener);

      await c.checkPermission("edit_file", { path: "test.ts" }, context);

      expect(checkListener).not.toHaveBeenCalled();
      expect(grantListener).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // createDefaultPermissionChecker factory
  // ============================================

  describe("createDefaultPermissionChecker", () => {
    it("should create checker with defaults", () => {
      const c = createDefaultPermissionChecker();
      expect(c).toBeInstanceOf(DefaultPermissionChecker);
    });

    it("should create checker with options", () => {
      const handler: PermissionAskHandler = vi.fn();
      const c = createDefaultPermissionChecker({
        askHandler: handler,
        emitEvents: false,
      });

      expect(c.askService.hasHandler()).toBe(true);
    });
  });

  // ============================================
  // Permission Type Inference
  // ============================================

  describe("permission type inference", () => {
    it("should infer bash from tool name", async () => {
      const c = new DefaultPermissionChecker({
        trustManager: new TrustManager({ config: { bash: "allow" } }),
      });
      const context = createTestContext();

      const decision = await c.checkPermission("bash_execute", {}, context);
      expect(decision).toBe("allow");
    });

    it("should infer edit from tool name", async () => {
      const c = new DefaultPermissionChecker({
        trustManager: new TrustManager({ config: { edit: "allow" } }),
      });
      const context = createTestContext();

      const decision = await c.checkPermission("edit_file", {}, context);
      expect(decision).toBe("allow");
    });

    it("should infer webfetch from tool name", async () => {
      const c = new DefaultPermissionChecker({
        trustManager: new TrustManager({ config: { webfetch: "allow" } }),
      });
      const context = createTestContext();

      const decision = await c.checkPermission("fetch_url", {}, context);
      expect(decision).toBe("allow");
    });

    it("should infer bash from command param", async () => {
      const c = new DefaultPermissionChecker({
        trustManager: new TrustManager({ config: { bash: "allow" } }),
      });
      const context = createTestContext();

      const decision = await c.checkPermission("execute", { command: "ls" }, context);
      expect(decision).toBe("allow");
    });
  });
});
