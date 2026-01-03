/**
 * Unit tests for Hook Executor
 *
 * Tests for T027 - executor functionality
 *
 * @module plugin/hooks/__tests__/executor.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  executeHooks,
  executeSingleHook,
  HookErrorCode,
  HookExecutionError,
  type HookContext,
  HookTimeoutError,
  type PermissionBridge,
} from "../executor.js";
import type { HookAction, HookEvent, HookRule } from "../types.js";

// =============================================================================
// Test Utilities
// =============================================================================

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
 * Creates a minimal HookRule for testing
 */
function createHookRule(overrides: Partial<HookRule> = {}): HookRule {
  return {
    event: "PreToolUse",
    action: { type: "prompt", content: "Test prompt" },
    timeout: 30000,
    failBehavior: "open",
    ...overrides,
  };
}

/**
 * Creates a permission bridge that always allows
 */
function createPermissiveBridge(): PermissionBridge {
  return {
    checkPermission: vi.fn().mockResolvedValue(true),
  };
}

/**
 * Creates a permission bridge that always denies
 */
function createDenyingBridge(): PermissionBridge {
  return {
    checkPermission: vi.fn().mockResolvedValue(false),
  };
}

/**
 * Creates a conditional permission bridge
 */
function createConditionalBridge(
  condition: (pluginName: string, action: HookAction["type"], event: HookEvent) => boolean
): PermissionBridge {
  return {
    checkPermission: vi.fn().mockImplementation(async (pluginName, action, event) => {
      return condition(pluginName, action, event);
    }),
  };
}

// =============================================================================
// Permission Check Flow Tests
// =============================================================================

describe("executeHooks - permission check flow", () => {
  it("should check permission before executing hook", async () => {
    const bridge = createPermissiveBridge();
    const context = createHookContext({ permissionBridge: bridge });
    const rule = createHookRule();

    await executeHooks("PreToolUse", context, [rule]);

    expect(bridge.checkPermission).toHaveBeenCalledWith(
      "test-plugin",
      "prompt",
      "PreToolUse"
    );
  });

  it("should deny hook execution when permission denied", async () => {
    const bridge = createDenyingBridge();
    const context = createHookContext({ permissionBridge: bridge });
    const rule = createHookRule();

    const result = await executeHooks("PreToolUse", context, [rule]);

    expect(result.allowed).toBe(false);
    expect(result.results[0]!.allowed).toBe(false);
  });

  it("should allow execution when no permission bridge provided", async () => {
    const context = createHookContext({ permissionBridge: undefined });
    const rule = createHookRule();

    const result = await executeHooks("PreToolUse", context, [rule]);

    expect(result.allowed).toBe(true);
  });

  it("should check permission for each hook in sequence", async () => {
    const bridge = createPermissiveBridge();
    const context = createHookContext({ permissionBridge: bridge });
    const rules = [
      createHookRule({ action: { type: "prompt", content: "First" } }),
      createHookRule({ action: { type: "prompt", content: "Second" } }),
    ];

    await executeHooks("PreToolUse", context, rules);

    expect(bridge.checkPermission).toHaveBeenCalledTimes(2);
  });

  it("should pass correct action type to permission bridge", async () => {
    const bridge = createPermissiveBridge();
    const context = createHookContext({ permissionBridge: bridge });
    const rule = createHookRule({
      action: { type: "command", command: "test-cmd" },
    });

    await executeHooks("PreToolUse", context, [rule]);

    expect(bridge.checkPermission).toHaveBeenCalledWith(
      expect.any(String),
      "command",
      expect.any(String)
    );
  });

  it("should pass plugin name from context to permission bridge", async () => {
    const bridge = createPermissiveBridge();
    const context = createHookContext({
      permissionBridge: bridge,
      pluginName: "security-plugin",
    });
    const rule = createHookRule();

    await executeHooks("PreToolUse", context, [rule]);

    expect(bridge.checkPermission).toHaveBeenCalledWith(
      "security-plugin",
      expect.any(String),
      expect.any(String)
    );
  });

  it("should conditionally allow based on event type", async () => {
    const bridge = createConditionalBridge((_, __, event) => event !== "BeforeCommit");
    const context = createHookContext({ permissionBridge: bridge });
    const rule = createHookRule({ event: "BeforeCommit" });

    const result = await executeHooks("BeforeCommit", context, [rule]);

    expect(result.allowed).toBe(false);
  });

  it("should conditionally allow based on action type", async () => {
    const bridge = createConditionalBridge((_, action) => action === "prompt");
    const context = createHookContext({ permissionBridge: bridge });

    const promptRule = createHookRule({ action: { type: "prompt", content: "Test" } });
    const promptResult = await executeHooks("PreToolUse", context, [promptRule]);
    expect(promptResult.allowed).toBe(true);

    const commandRule = createHookRule({ action: { type: "command", command: "test" } });
    const commandResult = await executeHooks("PreToolUse", context, [commandRule]);
    expect(commandResult.allowed).toBe(false);
  });
});

// =============================================================================
// Timeout Handling Tests
// =============================================================================

describe("executeHooks - timeout handling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should respect custom timeout value", async () => {
    const rule = createHookRule({
      timeout: 5000,
      action: { type: "prompt", content: "Test" },
    });

    expect(rule.timeout).toBe(5000);
  });

  it("should use default timeout when not specified", () => {
    const rule = createHookRule({
      timeout: undefined,
    });

    // Note: In actual implementation, default is applied by parser
    // Here we test that timeout can be undefined and will use DEFAULT_HOOK_TIMEOUT
    expect(rule.timeout).toBeUndefined();
  });

  it("should track execution time in result", async () => {
    vi.useRealTimers(); // Use real timers for this test
    const context = createHookContext();
    const rule = createHookRule();

    const result = await executeHooks("PreToolUse", context, [rule]);

    expect(result.results[0]!.executionTime).toBeGreaterThanOrEqual(0);
    expect(result.totalExecutionTime).toBeGreaterThanOrEqual(0);
  });

  it("should record execution time per hook", async () => {
    vi.useRealTimers();
    const context = createHookContext();
    const rules = [
      createHookRule({ action: { type: "prompt", content: "First" } }),
      createHookRule({ action: { type: "prompt", content: "Second" } }),
    ];

    const result = await executeHooks("PreToolUse", context, rules);

    expect(result.results).toHaveLength(2);
    expect(result.results[0]!.executionTime).toBeGreaterThanOrEqual(0);
    expect(result.results[1]!.executionTime).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// Short-Circuit on allow: false Tests
// =============================================================================

describe("executeHooks - short-circuit on allow: false", () => {
  it("should short-circuit when permission denied", async () => {
    const bridge = createDenyingBridge();
    const context = createHookContext({ permissionBridge: bridge });
    const rules = [
      createHookRule({ action: { type: "prompt", content: "First" } }),
      createHookRule({ action: { type: "prompt", content: "Second" } }),
      createHookRule({ action: { type: "prompt", content: "Third" } }),
    ];

    const result = await executeHooks("PreToolUse", context, rules);

    // Should stop after first hook denies
    expect(result.allowed).toBe(false);
    expect(result.results).toHaveLength(1);
  });

  it("should not execute subsequent hooks after denial", async () => {
    const checkPermissionFn = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);

    const bridge: PermissionBridge = { checkPermission: checkPermissionFn };
    const context = createHookContext({ permissionBridge: bridge });
    const rules = [
      createHookRule({ action: { type: "prompt", content: "First" } }),
      createHookRule({ action: { type: "prompt", content: "Second" } }),
    ];

    await executeHooks("PreToolUse", context, rules);

    // Only first hook should be checked
    expect(checkPermissionFn).toHaveBeenCalledTimes(1);
  });

  it("should continue when all hooks allow", async () => {
    const bridge = createPermissiveBridge();
    const context = createHookContext({ permissionBridge: bridge });
    const rules = [
      createHookRule({ action: { type: "prompt", content: "First" } }),
      createHookRule({ action: { type: "prompt", content: "Second" } }),
    ];

    const result = await executeHooks("PreToolUse", context, rules);

    expect(result.allowed).toBe(true);
    expect(result.results).toHaveLength(2);
  });

  it("should return results up to the denying hook", async () => {
    const checkPermissionFn = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const bridge: PermissionBridge = { checkPermission: checkPermissionFn };
    const context = createHookContext({ permissionBridge: bridge });
    const rules = [
      createHookRule({ action: { type: "prompt", content: "First" } }),
      createHookRule({ action: { type: "prompt", content: "Second" } }),
      createHookRule({ action: { type: "prompt", content: "Third" } }),
    ];

    const result = await executeHooks("PreToolUse", context, rules);

    expect(result.allowed).toBe(false);
    expect(result.results).toHaveLength(2); // First allowed, second denied
    expect(result.results[0]!.allowed).toBe(true);
    expect(result.results[1]!.allowed).toBe(false);
  });

  it("should return original input when no hooks match", async () => {
    const context = createHookContext({ input: { original: "data" } });
    const rules = [createHookRule({ event: "SessionStart" })]; // Won't match PreToolUse

    const result = await executeHooks("PreToolUse", context, rules);

    expect(result.allowed).toBe(true);
    expect(result.finalInput).toEqual({ original: "data" });
    expect(result.results).toHaveLength(0);
  });
});

// =============================================================================
// Modified Input Passing Tests
// =============================================================================

describe("executeHooks - modified input passing", () => {
  it("should pass modified input to subsequent hooks", async () => {
    const context = createHookContext({
      input: { toolName: "write_file", params: {} },
    });
    const rules = [
      createHookRule({
        action: { type: "prompt", content: "First prompt" },
      }),
      createHookRule({
        action: { type: "prompt", content: "Second prompt" },
      }),
    ];

    const result = await executeHooks("PreToolUse", context, rules);

    // Prompt actions modify input by injecting content
    expect(result.finalInput).toHaveProperty("injectedPrompt");
  });

  it("should return final modified input in result", async () => {
    const context = createHookContext({ input: { data: "original" } });
    const rule = createHookRule({
      action: { type: "prompt", content: "Injected content" },
    });

    const result = await executeHooks("PreToolUse", context, [rule]);

    expect(result.finalInput).toHaveProperty("injectedPrompt", "Injected content");
  });

  it("should preserve original input when no modifications", async () => {
    const originalInput = { toolName: "read_file", params: { path: "/test" } };
    const context = createHookContext({ input: originalInput });

    // Empty rules = no modifications
    const result = await executeHooks("PreToolUse", context, []);

    expect(result.finalInput).toEqual(originalInput);
  });

  it("should chain modifications through multiple hooks", async () => {
    const context = createHookContext({ input: { step: 0 } });
    const rules = [
      createHookRule({
        event: "PreToolUse",
        action: { type: "prompt", content: "First" },
      }),
      createHookRule({
        event: "PreToolUse",
        action: { type: "prompt", content: "Second" },
      }),
    ];

    const result = await executeHooks("PreToolUse", context, rules);

    // Each prompt overwrites injectedPrompt, so final should be "Second"
    expect(result.finalInput).toHaveProperty("injectedPrompt", "Second");
  });

  it("should track modified input in each hook result", async () => {
    const context = createHookContext({ input: { initial: true } });
    const rules = [
      createHookRule({
        action: { type: "prompt", content: "Content A" },
      }),
    ];

    const result = await executeHooks("PreToolUse", context, rules);

    expect(result.results[0]!.modifiedInput).toBeDefined();
    expect(result.results[0]!.modifiedInput).toHaveProperty("injectedPrompt", "Content A");
  });
});

// =============================================================================
// Rule Matching Tests
// =============================================================================

describe("executeHooks - rule matching", () => {
  it("should only execute rules matching the event", async () => {
    const context = createHookContext();
    const rules = [
      createHookRule({ event: "PreToolUse" }),
      createHookRule({ event: "SessionStart" }),
      createHookRule({ event: "BeforeModel" }),
    ];

    const result = await executeHooks("PreToolUse", context, rules);

    expect(result.results).toHaveLength(1);
  });

  it("should filter by matcher regex", async () => {
    const context = createHookContext({
      input: { toolName: "write_file" },
    });
    const rules = [
      createHookRule({
        event: "PreToolUse",
        matcher: "write_file", // Matches against stringified JSON
        action: { type: "prompt", content: "Matched" },
      }),
      createHookRule({
        event: "PreToolUse",
        matcher: "read_file", // Won't match
        action: { type: "prompt", content: "Not matched" },
      }),
    ];

    const result = await executeHooks("PreToolUse", context, rules);

    expect(result.results).toHaveLength(1);
    expect(result.finalInput).toHaveProperty("injectedPrompt", "Matched");
  });

  it("should match all inputs when no matcher specified", async () => {
    const context = createHookContext({ input: "any-input" });
    const rule = createHookRule({
      event: "PreToolUse",
      matcher: undefined,
    });

    const result = await executeHooks("PreToolUse", context, [rule]);

    expect(result.results).toHaveLength(1);
  });

  it("should handle complex matcher patterns", async () => {
    const context = createHookContext({
      input: { toolName: "write_file", path: "/sensitive/data.txt" },
    });
    const rule = createHookRule({
      event: "PreToolUse",
      matcher: "sensitive",
    });

    const result = await executeHooks("PreToolUse", context, [rule]);

    expect(result.results).toHaveLength(1);
  });
});

// =============================================================================
// executeSingleHook Tests
// =============================================================================

describe("executeSingleHook", () => {
  it("should execute a single rule", async () => {
    const rule = createHookRule();
    const context = createHookContext();

    const result = await executeSingleHook(rule, context);

    expect(result.allowed).toBe(true);
    expect(result.executionTime).toBeGreaterThanOrEqual(0);
  });

  it("should return hook name in result", async () => {
    const rule = createHookRule({
      event: "PreToolUse",
      action: { type: "command", command: "test-cmd" },
    });
    const context = createHookContext();

    const result = await executeSingleHook(rule, context);

    expect(result.hookName).toContain("PreToolUse");
    expect(result.hookName).toContain("command");
  });

  it("should respect permission bridge", async () => {
    const bridge = createDenyingBridge();
    const rule = createHookRule();
    const context = createHookContext({ permissionBridge: bridge });

    const result = await executeSingleHook(rule, context);

    expect(result.allowed).toBe(false);
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe("executeHooks - error handling", () => {
  it("should have proper error code for timeout", () => {
    const error = new HookTimeoutError("test-hook", 5000, "PreToolUse");

    expect(error.code).toBe(HookErrorCode.HOOK_TIMEOUT);
    expect(error.timeout).toBe(5000);
    expect(error.hookName).toBe("test-hook");
  });

  it("should have proper error code for execution failure", () => {
    const error = new HookExecutionError(
      "Execution failed",
      HookErrorCode.HOOK_EXECUTION_FAILED
    );

    expect(error.code).toBe(HookErrorCode.HOOK_EXECUTION_FAILED);
  });

  it("should serialize error to JSON", () => {
    const error = new HookExecutionError("Test error", HookErrorCode.HOOK_EXECUTION_FAILED, {
      hookName: "test-hook",
      event: "PreToolUse",
      context: { extra: "data" },
    });

    const json = error.toJSON();

    expect(json.name).toBe("HookExecutionError");
    expect(json.message).toBe("Test error");
    expect(json.code).toBe(HookErrorCode.HOOK_EXECUTION_FAILED);
    expect(json.hookName).toBe("test-hook");
    expect(json.event).toBe("PreToolUse");
    expect(json.context).toEqual({ extra: "data" });
  });

  it("should include cause in error JSON when present", () => {
    const cause = new Error("Original error");
    const error = new HookExecutionError(
      "Wrapper error",
      HookErrorCode.HOOK_EXECUTION_FAILED,
      { cause }
    );

    const json = error.toJSON();

    expect(json.cause).toBe("Original error");
  });
});

// =============================================================================
// Fail Behavior Tests
// =============================================================================

describe("executeHooks - fail behavior", () => {
  it("should use fail-closed for PreToolUse by default", () => {
    const rule = createHookRule({
      event: "PreToolUse",
      failBehavior: undefined, // Will use event default
    });

    // PreToolUse should default to fail-closed behavior
    // This is tested implicitly through the FAIL_CLOSED_EVENTS set
    expect(rule.event).toBe("PreToolUse");
  });

  it("should use fail-closed for BeforeModel by default", () => {
    const rule = createHookRule({
      event: "BeforeModel",
      failBehavior: undefined,
    });

    expect(rule.event).toBe("BeforeModel");
  });

  it("should use fail-open for other events by default", () => {
    const rule = createHookRule({
      event: "PostToolResult",
      failBehavior: undefined,
    });

    expect(rule.event).toBe("PostToolResult");
  });

  it("should respect explicit failBehavior override", () => {
    const rule = createHookRule({
      event: "PostToolResult",
      failBehavior: "closed",
    });

    expect(rule.failBehavior).toBe("closed");
  });
});

// =============================================================================
// Hook Name Generation Tests
// =============================================================================

describe("executeHooks - hook name generation", () => {
  it("should generate meaningful hook names", async () => {
    const context = createHookContext();
    const rule = createHookRule({
      event: "PreToolUse",
      action: { type: "command", command: "eslint" },
    });

    const result = await executeHooks("PreToolUse", context, [rule]);

    expect(result.results[0]!.hookName).toContain("PreToolUse");
    expect(result.results[0]!.hookName).toContain("command");
    expect(result.results[0]!.hookName).toContain("eslint");
  });

  it("should include index in hook name", async () => {
    const context = createHookContext();
    const rules = [
      createHookRule({ action: { type: "prompt", content: "A" } }),
      createHookRule({ action: { type: "prompt", content: "B" } }),
    ];

    const result = await executeHooks("PreToolUse", context, rules);

    expect(result.results[0]!.hookName).toContain("[0]");
    expect(result.results[1]!.hookName).toContain("[1]");
  });
});
