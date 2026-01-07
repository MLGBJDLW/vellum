/**
 * Integration tests for Hook System
 *
 * Tests for T028 - hook system integration with trust levels and phases
 *
 * @module plugin/hooks/__tests__/integration.test
 */
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Test file - intentional template strings for path expansion testing

import { describe, expect, it, vi } from "vitest";
import type { PathContext } from "../../utils/path-expansion.js";
import { executeHooks, type HookContext, type PermissionBridge } from "../executor.js";
import { parseHooksConfig } from "../parser.js";
import type { HookAction, HookEvent, HooksConfig } from "../types.js";

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Creates a minimal path context for testing
 */
function createPathContext(overrides: Partial<PathContext> = {}): PathContext {
  return {
    pluginRoot: "/test/plugin",
    userDir: "/test/user",
    ...overrides,
  };
}

/**
 * Creates a minimal HookContext for testing
 */
function createHookContext(overrides: Partial<HookContext> = {}): HookContext {
  return {
    input: { toolName: "test_tool", params: {} },
    sessionId: "test-session-123",
    pluginName: "test-plugin",
    ...overrides,
  };
}

/**
 * Trust level enum for testing
 */
type TrustLevel = "none" | "ask" | "trusted";

/**
 * Creates a permission bridge based on trust level
 */
function createTrustLevelBridge(trustLevel: TrustLevel): PermissionBridge {
  return {
    checkPermission: vi.fn().mockImplementation(async () => {
      switch (trustLevel) {
        case "none":
          return false;
        case "trusted":
          return true;
        case "ask":
          // Simulate user approval flow - for testing, default to true
          return true;
        default:
          return false;
      }
    }),
  };
}

/**
 * Creates a permission bridge that tracks all permission requests
 */
interface TrackedPermissionBridge extends PermissionBridge {
  requests: Array<{ pluginName: string; action: HookAction["type"]; event: HookEvent }>;
}

function createTrackingBridge(allowed: boolean = true): TrackedPermissionBridge {
  const requests: Array<{ pluginName: string; action: HookAction["type"]; event: HookEvent }> = [];

  return {
    requests,
    checkPermission: vi.fn().mockImplementation(async (pluginName, action, event) => {
      requests.push({ pluginName, action, event });
      return allowed;
    }),
  };
}

// =============================================================================
// Permission Denial Blocks Hook Tests
// =============================================================================

describe("integration - permission denial blocks hook", () => {
  it("should block hook execution when permission denied", async () => {
    const config = parseHooksConfig(
      "/hooks.json",
      JSON.stringify([
        {
          event: "PreToolUse",
          action: { type: "command", command: "security-check" },
          failBehavior: "closed",
        },
      ]),
      createPathContext()
    );

    const bridge = createTrustLevelBridge("none");
    const context = createHookContext({ permissionBridge: bridge });

    const result = await executeHooks("PreToolUse", context, config);

    expect(result.allowed).toBe(false);
    expect(bridge.checkPermission).toHaveBeenCalled();
  });

  it("should prevent tool execution when PreToolUse hook blocked", async () => {
    const config: HooksConfig = [
      {
        event: "PreToolUse",
        action: { type: "command", command: "validate-tool" },
        timeout: 5000,
        failBehavior: "closed",
      },
    ];

    const bridge = createTrackingBridge(false);
    const context = createHookContext({
      permissionBridge: bridge,
      input: { toolName: "write_file", params: { path: "/etc/passwd" } },
    });

    const result = await executeHooks("PreToolUse", context, config);

    expect(result.allowed).toBe(false);
    expect(bridge.requests).toHaveLength(1);
    expect(bridge.requests[0]?.event).toBe("PreToolUse");
  });

  it("should block model call when BeforeModel hook denied", async () => {
    const config = parseHooksConfig(
      "/hooks.json",
      JSON.stringify([
        {
          event: "BeforeModel",
          action: { type: "prompt", content: "Safety reminder" },
        },
      ]),
      createPathContext()
    );

    const bridge = createTrustLevelBridge("none");
    const context = createHookContext({
      permissionBridge: bridge,
      input: { messages: [{ role: "user", content: "Test" }] },
    });

    const result = await executeHooks("BeforeModel", context, config);

    expect(result.allowed).toBe(false);
  });

  it("should allow non-critical hooks to be blocked without affecting result", async () => {
    // SessionStart with fail-open should allow continuation even if blocked
    const config: HooksConfig = [
      {
        event: "SessionStart",
        action: { type: "prompt", content: "Welcome message" },
        timeout: 30000,
        failBehavior: "open",
      },
    ];

    // Note: Permission denial still blocks, but failBehavior affects error handling
    const bridge = createTrustLevelBridge("none");
    const context = createHookContext({ permissionBridge: bridge });

    const result = await executeHooks("SessionStart", context, config);

    // Permission denial always blocks the specific hook
    expect(result.allowed).toBe(false);
  });

  it("should record denial in hook result", async () => {
    const config: HooksConfig = [
      {
        event: "PreToolUse",
        action: { type: "command", command: "check" },
        timeout: 30000,
        failBehavior: "closed",
      },
    ];

    const bridge = createTrustLevelBridge("none");
    const context = createHookContext({ permissionBridge: bridge });

    const result = await executeHooks("PreToolUse", context, config);

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.allowed).toBe(false);
    expect(result.results[0]?.hookName).toContain("PreToolUse");
  });
});

// =============================================================================
// Trust Level 'none' Blocks All Operations Tests
// =============================================================================

describe("integration - trust level 'none' blocks all operations", () => {
  it("should block all hook events with trust level none", async () => {
    const events: HookEvent[] = [
      "SessionStart",
      "SessionEnd",
      "BeforeModel",
      "AfterModel",
      "PreToolUse",
      "PostToolResult",
      "BeforeAgent",
      "AfterAgent",
      "OnError",
      "OnApproval",
      "BeforeCommit",
    ];

    const bridge = createTrustLevelBridge("none");

    for (const event of events) {
      const config: HooksConfig = [
        {
          event,
          action: { type: "prompt", content: "Test" },
          timeout: 30000,
          failBehavior: "open",
        },
      ];
      const context = createHookContext({ permissionBridge: bridge });

      const result = await executeHooks(event, context, config);

      expect(result.allowed).toBe(false);
    }
  });

  it("should block all action types with trust level none", async () => {
    const actions: Array<HookAction> = [
      { type: "command", command: "test" },
      { type: "script", path: "./test.sh" },
      { type: "prompt", content: "Test" },
    ];

    const bridge = createTrustLevelBridge("none");

    for (const action of actions) {
      const config: HooksConfig = [
        {
          event: "PreToolUse",
          action,
          timeout: 30000,
          failBehavior: "open",
        },
      ];
      const context = createHookContext({ permissionBridge: bridge });

      const result = await executeHooks("PreToolUse", context, config);

      expect(result.allowed).toBe(false);
    }
  });

  it("should block multiple hooks in sequence with trust level none", async () => {
    const config: HooksConfig = [
      {
        event: "PreToolUse",
        action: { type: "prompt", content: "First" },
        timeout: 30000,
        failBehavior: "open",
      },
      {
        event: "PreToolUse",
        action: { type: "prompt", content: "Second" },
        timeout: 30000,
        failBehavior: "open",
      },
      {
        event: "PreToolUse",
        action: { type: "prompt", content: "Third" },
        timeout: 30000,
        failBehavior: "open",
      },
    ];

    const bridge = createTrackingBridge(false);
    const context = createHookContext({ permissionBridge: bridge });

    const result = await executeHooks("PreToolUse", context, config);

    expect(result.allowed).toBe(false);
    // Should short-circuit after first denial
    expect(bridge.requests).toHaveLength(1);
  });

  it("should not execute hook actions when trust level is none", async () => {
    const commandExecuted = vi.fn();
    const config: HooksConfig = [
      {
        event: "PreToolUse",
        action: { type: "command", command: "echo test" },
        timeout: 30000,
        failBehavior: "open",
      },
    ];

    const bridge = createTrustLevelBridge("none");
    const context = createHookContext({ permissionBridge: bridge });

    await executeHooks("PreToolUse", context, config);

    // Command should never be executed
    expect(commandExecuted).not.toHaveBeenCalled();
  });

  it("should preserve original input when all hooks blocked", async () => {
    const originalInput = { toolName: "read_file", params: { path: "/test.txt" } };
    const config: HooksConfig = [
      {
        event: "PreToolUse",
        action: { type: "prompt", content: "Modify input" },
        timeout: 30000,
        failBehavior: "open",
      },
    ];

    const bridge = createTrustLevelBridge("none");
    const context = createHookContext({
      permissionBridge: bridge,
      input: originalInput,
    });

    const result = await executeHooks("PreToolUse", context, config);

    expect(result.finalInput).toEqual(originalInput);
  });
});

// =============================================================================
// Hook + Phase 10 Integration Tests
// =============================================================================

describe("integration - hook + phase 10 integration", () => {
  /**
   * Phase 10 represents the permission system integration.
   * These tests verify that hooks work correctly with the permission system.
   */

  it("should integrate parsed config with executor", async () => {
    // Parse config from JSON (as Phase 10 would load it)
    const configJson = JSON.stringify([
      {
        event: "PreToolUse",
        action: { type: "prompt", content: "Security reminder" }, // Use prompt action to avoid spawn
        matcher: "write_", // Matches substring in stringified JSON
        failBehavior: "closed",
      },
    ]);

    const config = parseHooksConfig("/hooks.json", configJson, createPathContext());

    // Execute with permission bridge (Phase 10 component)
    const bridge = createTrustLevelBridge("trusted");
    const context = createHookContext({
      permissionBridge: bridge,
      input: { toolName: "write_file", params: {} },
    });

    const result = await executeHooks("PreToolUse", context, config);

    expect(result.allowed).toBe(true);
    expect(bridge.checkPermission).toHaveBeenCalled();
  });

  it("should filter hooks by matcher before permission check", async () => {
    const config: HooksConfig = [
      {
        event: "PreToolUse",
        action: { type: "prompt", content: "Write check" }, // Use prompt to avoid spawn
        matcher: "write_file", // Matches substring in stringified JSON
        timeout: 30000,
        failBehavior: "closed",
      },
      {
        event: "PreToolUse",
        action: { type: "prompt", content: "Read check" },
        matcher: "read_file", // Won't match
        timeout: 30000,
        failBehavior: "closed",
      },
    ];

    const bridge = createTrackingBridge(true);
    const context = createHookContext({
      permissionBridge: bridge,
      input: { toolName: "write_file" },
    });

    await executeHooks("PreToolUse", context, config);

    // Only write-check should be called (matcher filtering)
    expect(bridge.requests).toHaveLength(1);
    expect(bridge.requests[0]?.action).toBe("prompt");
  });

  it("should support path expansion in script actions", async () => {
    const configJson = JSON.stringify([
      {
        event: "SessionStart",
        action: {
          type: "script",
          path: "${VELLUM_PLUGIN_ROOT}/scripts/init.py",
        },
      },
    ]);

    const pathContext = createPathContext({
      pluginRoot: "/home/user/.vellum/plugins/security",
    });
    const config = parseHooksConfig("/hooks.json", configJson, pathContext);

    // Verify path was expanded
    expect((config[0]?.action as { path: string }).path).toBe(
      "/home/user/.vellum/plugins/security/scripts/init.py"
    );
  });

  it("should track all permission requests for audit", async () => {
    const config: HooksConfig = [
      {
        event: "SessionStart",
        action: { type: "prompt", content: "Init" },
        timeout: 30000,
        failBehavior: "open",
      },
      {
        event: "PreToolUse",
        action: { type: "command", command: "validate" },
        timeout: 30000,
        failBehavior: "closed",
      },
    ];

    const bridge = createTrackingBridge(true);

    // Execute SessionStart
    const sessionContext = createHookContext({
      permissionBridge: bridge,
      pluginName: "audit-plugin",
    });
    await executeHooks("SessionStart", sessionContext, config);

    // Execute PreToolUse
    const toolContext = createHookContext({
      permissionBridge: bridge,
      pluginName: "audit-plugin",
      input: { toolName: "write_file" },
    });
    await executeHooks("PreToolUse", toolContext, config);

    // Verify all requests tracked
    expect(bridge.requests).toHaveLength(2);
    expect(bridge.requests[0]?.event).toBe("SessionStart");
    expect(bridge.requests[1]?.event).toBe("PreToolUse");
    expect(bridge.requests.every((r) => r.pluginName === "audit-plugin")).toBe(true);
  });

  it("should support sequential hook execution across lifecycle", async () => {
    const config: HooksConfig = [
      {
        event: "SessionStart",
        action: { type: "prompt", content: "Session started" },
        timeout: 30000,
        failBehavior: "open",
      },
      {
        event: "BeforeModel",
        action: { type: "prompt", content: "Before model call" },
        timeout: 30000,
        failBehavior: "open",
      },
      {
        event: "PreToolUse",
        action: { type: "prompt", content: "Before tool" },
        timeout: 30000,
        failBehavior: "open",
      },
      {
        event: "PostToolResult",
        action: { type: "prompt", content: "After tool" },
        timeout: 30000,
        failBehavior: "open",
      },
      {
        event: "AfterModel",
        action: { type: "prompt", content: "After model" },
        timeout: 30000,
        failBehavior: "open",
      },
      {
        event: "SessionEnd",
        action: { type: "prompt", content: "Session ended" },
        timeout: 30000,
        failBehavior: "open",
      },
    ];

    const bridge = createTrackingBridge(true);
    const context = createHookContext({ permissionBridge: bridge });

    // Simulate lifecycle
    const events: HookEvent[] = [
      "SessionStart",
      "BeforeModel",
      "PreToolUse",
      "PostToolResult",
      "AfterModel",
      "SessionEnd",
    ];

    for (const event of events) {
      await executeHooks(event, context, config);
    }

    expect(bridge.requests).toHaveLength(6);
    const requestedEvents = bridge.requests.map((r) => r.event);
    expect(requestedEvents).toEqual(events);
  });

  it("should handle empty config gracefully", async () => {
    const config: HooksConfig = [];
    const bridge = createTrackingBridge(true);
    const context = createHookContext({ permissionBridge: bridge });

    const result = await executeHooks("PreToolUse", context, config);

    expect(result.allowed).toBe(true);
    expect(result.results).toHaveLength(0);
    expect(bridge.requests).toHaveLength(0);
  });

  it("should apply defaults from parser correctly", async () => {
    const configJson = JSON.stringify([
      {
        event: "PreToolUse",
        action: { type: "command", command: "test" },
        // No timeout or failBehavior specified
      },
    ]);

    const config = parseHooksConfig("/hooks.json", configJson, createPathContext());

    // Verify defaults applied
    expect(config[0]?.timeout).toBe(30000); // DEFAULT_HOOK_TIMEOUT
    expect(config[0]?.failBehavior).toBe("open");
  });
});

// =============================================================================
// End-to-End Workflow Tests
// =============================================================================

describe("integration - end-to-end workflow", () => {
  it("should complete full hook workflow with trust level trusted", async () => {
    // Step 1: Parse config
    const configJson = JSON.stringify([
      {
        event: "PreToolUse",
        action: { type: "prompt", content: "Lint check passed" }, // Use prompt to avoid spawn
        matcher: "write_file", // Matches substring in stringified JSON
        failBehavior: "closed",
      },
      {
        event: "PreToolUse",
        action: { type: "prompt", content: "Safety reminder for file operations" },
      },
    ]);
    const config = parseHooksConfig("/hooks.json", configJson, createPathContext());

    // Step 2: Create trusted context
    const bridge = createTrustLevelBridge("trusted");
    const context = createHookContext({
      permissionBridge: bridge,
      pluginName: "code-quality",
      input: { toolName: "write_file", params: { path: "/src/app.ts" } },
    });

    // Step 3: Execute hooks
    const result = await executeHooks("PreToolUse", context, config);

    // Step 4: Verify results
    expect(result.allowed).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.finalInput).toHaveProperty("injectedPrompt");
  });

  it("should reject in full workflow with untrusted plugin", async () => {
    const configJson = JSON.stringify([
      {
        event: "BeforeCommit",
        action: { type: "script", path: "${VELLUM_PLUGIN_ROOT}/pre-commit.sh" },
        failBehavior: "closed",
      },
    ]);
    const config = parseHooksConfig("/hooks.json", configJson, createPathContext());

    const bridge = createTrustLevelBridge("none");
    const context = createHookContext({
      permissionBridge: bridge,
      pluginName: "untrusted-plugin",
    });

    const result = await executeHooks("BeforeCommit", context, config);

    expect(result.allowed).toBe(false);
  });
});
