/**
 * Unit tests for Hook Parser
 *
 * Tests for T026 - parser functionality
 *
 * @module plugin/hooks/__tests__/parser.test
 */
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Test file - intentional template strings for path expansion testing

import { describe, expect, it } from "vitest";

import type { PathContext } from "../../utils/path-expansion.js";
import {
  HooksParseError,
  parseHooksConfig,
  parseHooksConfigRaw,
  validateHookRule,
} from "../parser.js";
import { DEFAULT_HOOK_TIMEOUT, type HookEvent } from "../types.js";

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

// =============================================================================
// Valid Config Parsing Tests
// =============================================================================

describe("parseHooksConfig - valid config parsing", () => {
  it("should parse empty array config", () => {
    const config = parseHooksConfig("/hooks.json", "[]", createPathContext());

    expect(config).toEqual([]);
  });

  it("should parse single command rule", () => {
    const content = JSON.stringify([
      {
        event: "PreToolUse",
        action: { type: "command", command: "lint" },
      },
    ]);

    const config = parseHooksConfig("/hooks.json", content, createPathContext());

    expect(config).toHaveLength(1);
    expect(config[0]?.event).toBe("PreToolUse");
    expect(config[0]?.action.type).toBe("command");
    expect((config[0]?.action as { command: string }).command).toBe("lint");
  });

  it("should parse script action with path expansion", () => {
    const content = JSON.stringify([
      {
        event: "SessionStart",
        action: {
          type: "script",
          path: "${VELLUM_PLUGIN_ROOT}/scripts/init.py",
        },
      },
    ]);

    const ctx = createPathContext({ pluginRoot: "/home/user/plugins/my-plugin" });
    const config = parseHooksConfig("/hooks.json", content, ctx);

    expect(config[0]?.action.type).toBe("script");
    expect((config[0]?.action as { path: string }).path).toBe(
      "/home/user/plugins/my-plugin/scripts/init.py"
    );
  });

  it("should parse prompt action", () => {
    const content = JSON.stringify([
      {
        event: "BeforeModel",
        action: { type: "prompt", content: "Remember the coding guidelines." },
      },
    ]);

    const config = parseHooksConfig("/hooks.json", content, createPathContext());

    expect(config[0]?.action.type).toBe("prompt");
    expect((config[0]?.action as { content: string }).content).toBe(
      "Remember the coding guidelines."
    );
  });

  it("should apply default timeout when not specified", () => {
    const content = JSON.stringify([
      {
        event: "PreToolUse",
        action: { type: "command", command: "test" },
      },
    ]);

    const config = parseHooksConfig("/hooks.json", content, createPathContext());

    expect(config[0]?.timeout).toBe(DEFAULT_HOOK_TIMEOUT);
  });

  it("should apply default failBehavior when not specified", () => {
    const content = JSON.stringify([
      {
        event: "PostToolResult",
        action: { type: "command", command: "log" },
      },
    ]);

    const config = parseHooksConfig("/hooks.json", content, createPathContext());

    expect(config[0]?.failBehavior).toBe("open");
  });

  it("should preserve explicit timeout value", () => {
    const content = JSON.stringify([
      {
        event: "PreToolUse",
        action: { type: "command", command: "lint" },
        timeout: 5000,
      },
    ]);

    const config = parseHooksConfig("/hooks.json", content, createPathContext());

    expect(config[0]?.timeout).toBe(5000);
  });

  it("should preserve explicit failBehavior", () => {
    const content = JSON.stringify([
      {
        event: "PreToolUse",
        action: { type: "command", command: "security-check" },
        failBehavior: "closed",
      },
    ]);

    const config = parseHooksConfig("/hooks.json", content, createPathContext());

    expect(config[0]?.failBehavior).toBe("closed");
  });

  it("should parse multiple rules", () => {
    const content = JSON.stringify([
      { event: "SessionStart", action: { type: "prompt", content: "Hello" } },
      { event: "PreToolUse", action: { type: "command", command: "validate" } },
      { event: "BeforeCommit", action: { type: "script", path: "./hooks/pre-commit.sh" } },
    ]);

    const config = parseHooksConfig("/hooks.json", content, createPathContext());

    expect(config).toHaveLength(3);
    expect(config[0]?.event).toBe("SessionStart");
    expect(config[1]?.event).toBe("PreToolUse");
    expect(config[2]?.event).toBe("BeforeCommit");
  });

  it("should parse command action with args", () => {
    const content = JSON.stringify([
      {
        event: "PreToolUse",
        action: { type: "command", command: "eslint", args: ["--fix", "./src"] },
      },
    ]);

    const config = parseHooksConfig("/hooks.json", content, createPathContext());

    expect((config[0]?.action as { args?: string[] }).args).toEqual(["--fix", "./src"]);
  });

  it("should parse script action with interpreter", () => {
    const content = JSON.stringify([
      {
        event: "SessionStart",
        action: { type: "script", path: "./init.py", interpreter: "python3" },
      },
    ]);

    const config = parseHooksConfig("/hooks.json", content, createPathContext());

    expect((config[0]?.action as { interpreter?: string }).interpreter).toBe("python3");
  });
});

// =============================================================================
// All 11 Hook Events Tests
// =============================================================================

describe("parseHooksConfig - all 11 hook events supported", () => {
  const ALL_EVENTS: HookEvent[] = [
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

  it.each(ALL_EVENTS)("should parse %s event", (event) => {
    const content = JSON.stringify([
      {
        event,
        action: { type: "command", command: "test" },
      },
    ]);

    const config = parseHooksConfig("/hooks.json", content, createPathContext());

    expect(config[0]?.event).toBe(event);
  });

  it("should have exactly 11 supported events", () => {
    expect(ALL_EVENTS).toHaveLength(11);
  });

  it("should parse config with all event types", () => {
    const rules = ALL_EVENTS.map((event) => ({
      event,
      action: { type: "command" as const, command: `${event.toLowerCase()}-handler` },
    }));

    const content = JSON.stringify(rules);
    const config = parseHooksConfig("/hooks.json", content, createPathContext());

    expect(config).toHaveLength(11);
    const parsedEvents = config.map((r) => r.event);
    expect(parsedEvents).toEqual(ALL_EVENTS);
  });
});

// =============================================================================
// Matcher Regex Validation Tests
// =============================================================================

describe("parseHooksConfig - matcher regex validation", () => {
  it("should parse valid simple matcher regex", () => {
    const content = JSON.stringify([
      {
        event: "PreToolUse",
        action: { type: "command", command: "validate" },
        matcher: "^write_file$",
      },
    ]);

    const config = parseHooksConfig("/hooks.json", content, createPathContext());

    expect(config[0]?.matcher).toBe("^write_file$");
  });

  it("should parse matcher with alternation", () => {
    const content = JSON.stringify([
      {
        event: "PreToolUse",
        action: { type: "command", command: "validate" },
        matcher: "^(read_file|write_file|delete_file)$",
      },
    ]);

    const config = parseHooksConfig("/hooks.json", content, createPathContext());

    expect(config[0]?.matcher).toBe("^(read_file|write_file|delete_file)$");
  });

  it("should parse matcher with character classes", () => {
    const content = JSON.stringify([
      {
        event: "PreToolUse",
        action: { type: "command", command: "validate" },
        matcher: "^dangerous_[a-z]+$",
      },
    ]);

    const config = parseHooksConfig("/hooks.json", content, createPathContext());

    expect(config[0]?.matcher).toBe("^dangerous_[a-z]+$");
  });

  it("should reject invalid regex in matcher", () => {
    const content = JSON.stringify([
      {
        event: "PreToolUse",
        action: { type: "command", command: "validate" },
        matcher: "[invalid(regex",
      },
    ]);

    expect(() => parseHooksConfig("/hooks.json", content, createPathContext())).toThrow(
      HooksParseError
    );
  });

  it("should reject unbalanced parentheses in matcher", () => {
    const content = JSON.stringify([
      {
        event: "PreToolUse",
        action: { type: "command", command: "validate" },
        matcher: "^(unclosed$",
      },
    ]);

    expect(() => parseHooksConfig("/hooks.json", content, createPathContext())).toThrow(
      HooksParseError
    );
  });

  it("should allow optional matcher (undefined)", () => {
    const content = JSON.stringify([
      {
        event: "PreToolUse",
        action: { type: "command", command: "validate" },
      },
    ]);

    const config = parseHooksConfig("/hooks.json", content, createPathContext());

    expect(config[0]?.matcher).toBeUndefined();
  });
});

// =============================================================================
// Invalid Config Rejection Tests
// =============================================================================

describe("parseHooksConfig - invalid config rejection", () => {
  it("should reject invalid JSON", () => {
    const content = "{ invalid json }";

    expect(() => parseHooksConfig("/hooks.json", content, createPathContext())).toThrow(
      HooksParseError
    );
  });

  it("should include file path in error for invalid JSON", () => {
    try {
      parseHooksConfig("/path/to/hooks.json", "{ invalid }", createPathContext());
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(HooksParseError);
      expect((error as HooksParseError).filePath).toBe("/path/to/hooks.json");
    }
  });

  it("should reject non-array config", () => {
    const content = JSON.stringify({ event: "PreToolUse" });

    expect(() => parseHooksConfig("/hooks.json", content, createPathContext())).toThrow(
      HooksParseError
    );
  });

  it("should reject invalid event type", () => {
    const content = JSON.stringify([
      {
        event: "InvalidEvent",
        action: { type: "command", command: "test" },
      },
    ]);

    expect(() => parseHooksConfig("/hooks.json", content, createPathContext())).toThrow(
      HooksParseError
    );
  });

  it("should reject missing event field", () => {
    const content = JSON.stringify([
      {
        action: { type: "command", command: "test" },
      },
    ]);

    expect(() => parseHooksConfig("/hooks.json", content, createPathContext())).toThrow(
      HooksParseError
    );
  });

  it("should reject missing action field", () => {
    const content = JSON.stringify([
      {
        event: "PreToolUse",
      },
    ]);

    expect(() => parseHooksConfig("/hooks.json", content, createPathContext())).toThrow(
      HooksParseError
    );
  });

  it("should reject invalid action type", () => {
    const content = JSON.stringify([
      {
        event: "PreToolUse",
        action: { type: "invalid-action" },
      },
    ]);

    expect(() => parseHooksConfig("/hooks.json", content, createPathContext())).toThrow(
      HooksParseError
    );
  });

  it("should reject command action without command", () => {
    const content = JSON.stringify([
      {
        event: "PreToolUse",
        action: { type: "command" },
      },
    ]);

    expect(() => parseHooksConfig("/hooks.json", content, createPathContext())).toThrow(
      HooksParseError
    );
  });

  it("should reject script action without path", () => {
    const content = JSON.stringify([
      {
        event: "PreToolUse",
        action: { type: "script" },
      },
    ]);

    expect(() => parseHooksConfig("/hooks.json", content, createPathContext())).toThrow(
      HooksParseError
    );
  });

  it("should reject prompt action without content", () => {
    const content = JSON.stringify([
      {
        event: "BeforeModel",
        action: { type: "prompt" },
      },
    ]);

    expect(() => parseHooksConfig("/hooks.json", content, createPathContext())).toThrow(
      HooksParseError
    );
  });

  it("should reject empty command string", () => {
    const content = JSON.stringify([
      {
        event: "PreToolUse",
        action: { type: "command", command: "" },
      },
    ]);

    expect(() => parseHooksConfig("/hooks.json", content, createPathContext())).toThrow(
      HooksParseError
    );
  });

  it("should reject timeout below minimum", () => {
    const content = JSON.stringify([
      {
        event: "PreToolUse",
        action: { type: "command", command: "test" },
        timeout: 50, // Below MIN_HOOK_TIMEOUT (100ms)
      },
    ]);

    expect(() => parseHooksConfig("/hooks.json", content, createPathContext())).toThrow(
      HooksParseError
    );
  });

  it("should reject timeout above maximum", () => {
    const content = JSON.stringify([
      {
        event: "PreToolUse",
        action: { type: "command", command: "test" },
        timeout: 400000, // Above MAX_HOOK_TIMEOUT (300000ms)
      },
    ]);

    expect(() => parseHooksConfig("/hooks.json", content, createPathContext())).toThrow(
      HooksParseError
    );
  });

  it("should reject invalid failBehavior value", () => {
    const content = JSON.stringify([
      {
        event: "PreToolUse",
        action: { type: "command", command: "test" },
        failBehavior: "invalid",
      },
    ]);

    expect(() => parseHooksConfig("/hooks.json", content, createPathContext())).toThrow(
      HooksParseError
    );
  });

  it("should include validation errors in error details", () => {
    const content = JSON.stringify([
      {
        event: "InvalidEvent",
        action: { type: "command", command: "test" },
      },
    ]);

    try {
      parseHooksConfig("/hooks.json", content, createPathContext());
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(HooksParseError);
      expect((error as HooksParseError).details).toBeDefined();
    }
  });
});

// =============================================================================
// parseHooksConfigRaw Tests
// =============================================================================

describe("parseHooksConfigRaw", () => {
  it("should parse without path expansion", () => {
    const content = JSON.stringify([
      {
        event: "SessionStart",
        action: {
          type: "script",
          path: "${VELLUM_PLUGIN_ROOT}/scripts/init.py",
        },
      },
    ]);

    const config = parseHooksConfigRaw("/hooks.json", content);

    // Path should NOT be expanded
    expect((config[0]?.action as { path: string }).path).toBe(
      "${VELLUM_PLUGIN_ROOT}/scripts/init.py"
    );
  });

  it("should still apply defaults", () => {
    const content = JSON.stringify([
      {
        event: "PreToolUse",
        action: { type: "command", command: "test" },
      },
    ]);

    const config = parseHooksConfigRaw("/hooks.json", content);

    expect(config[0]?.timeout).toBe(DEFAULT_HOOK_TIMEOUT);
    expect(config[0]?.failBehavior).toBe("open");
  });

  it("should reject invalid config same as parseHooksConfig", () => {
    const content = "invalid json";

    expect(() => parseHooksConfigRaw("/hooks.json", content)).toThrow(HooksParseError);
  });
});

// =============================================================================
// validateHookRule Tests
// =============================================================================

describe("validateHookRule", () => {
  it("should validate valid rule", () => {
    const rule = {
      event: "PreToolUse",
      action: { type: "command", command: "lint" },
    };

    const result = validateHookRule(rule);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should return errors for invalid rule", () => {
    const rule = {
      event: "InvalidEvent",
      action: { type: "command", command: "lint" },
    };

    const result = validateHookRule(rule);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("should return errors for missing required fields", () => {
    const rule = {
      event: "PreToolUse",
    };

    const result = validateHookRule(rule);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("should validate all action types", () => {
    const rules = [
      { event: "PreToolUse", action: { type: "command", command: "cmd" } },
      { event: "PreToolUse", action: { type: "script", path: "./script.sh" } },
      { event: "PreToolUse", action: { type: "prompt", content: "Hello" } },
    ];

    for (const rule of rules) {
      const result = validateHookRule(rule);
      expect(result.valid).toBe(true);
    }
  });

  it("should catch invalid regex in matcher", () => {
    const rule = {
      event: "PreToolUse",
      action: { type: "command", command: "lint" },
      matcher: "[invalid(regex",
    };

    const result = validateHookRule(rule);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("regex"))).toBe(true);
  });
});
