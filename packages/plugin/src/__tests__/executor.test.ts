/**
 * Unit tests for Command Executor
 *
 * Tests for T017 - executor functionality
 *
 * @module plugin/__tests__/executor.test
 */

import { describe, expect, it } from "vitest";

import { type ExecutionContext, executeCommand } from "../commands/executor.js";
import type { ParsedCommand } from "../commands/parser.js";

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Creates a minimal ParsedCommand for testing
 */
function createParsedCommand(overrides: Partial<ParsedCommand> = {}): ParsedCommand {
  return {
    name: "test-cmd",
    description: "Test command description",
    content: "Test content",
    filePath: "/plugins/test-plugin/commands/test-cmd.md",
    hasArgumentsVariable: false,
    ...overrides,
  };
}

/**
 * Creates a minimal ExecutionContext for testing
 */
function createExecutionContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    availableTools: ["read_file", "write_file", "grep_search", "run_in_terminal"],
    sessionId: "test-session-123",
    ...overrides,
  };
}

// =============================================================================
// $ARGUMENTS Substitution Tests
// =============================================================================

describe("executeCommand - $ARGUMENTS substitution", () => {
  it("should substitute single $ARGUMENTS occurrence", () => {
    const command = createParsedCommand({
      content: "Analyze branch: $ARGUMENTS",
      hasArgumentsVariable: true,
    });

    const result = executeCommand(command, "feature/new-ui", createExecutionContext());

    expect(result.content).toBe("Analyze branch: feature/new-ui");
    expect(result.metadata.substitutionCount).toBe(1);
  });

  it("should substitute multiple $ARGUMENTS occurrences", () => {
    const command = createParsedCommand({
      content: "First: $ARGUMENTS, Second: $ARGUMENTS, Third: $ARGUMENTS",
      hasArgumentsVariable: true,
    });

    const result = executeCommand(command, "value", createExecutionContext());

    expect(result.content).toBe("First: value, Second: value, Third: value");
    expect(result.metadata.substitutionCount).toBe(3);
  });

  it("should preserve content when hasArgumentsVariable is false", () => {
    const command = createParsedCommand({
      content: "Fixed content without variables",
      hasArgumentsVariable: false,
    });

    const result = executeCommand(command, "ignored-args", createExecutionContext());

    expect(result.content).toBe("Fixed content without variables");
    expect(result.metadata.substitutionCount).toBe(0);
  });

  it("should count zero substitutions when no $ARGUMENTS in content", () => {
    const command = createParsedCommand({
      content: "No placeholders here",
      hasArgumentsVariable: false,
    });

    const result = executeCommand(command, "args", createExecutionContext());

    expect(result.metadata.substitutionCount).toBe(0);
  });

  it("should preserve original args in metadata", () => {
    const command = createParsedCommand({
      content: "Content: $ARGUMENTS",
      hasArgumentsVariable: true,
    });

    const result = executeCommand(command, "original-value", createExecutionContext());

    expect(result.metadata.originalArgs).toBe("original-value");
  });
});

// =============================================================================
// Empty Arguments Handling Tests
// =============================================================================

describe("executeCommand - empty args handling", () => {
  it("should handle empty string args", () => {
    const command = createParsedCommand({
      content: "Prefix: $ARGUMENTS :Suffix",
      hasArgumentsVariable: true,
    });

    const result = executeCommand(command, "", createExecutionContext());

    expect(result.content).toBe("Prefix:  :Suffix");
    expect(result.metadata.originalArgs).toBe("");
    expect(result.metadata.substitutionCount).toBe(1);
  });

  it("should handle whitespace-only args", () => {
    const command = createParsedCommand({
      content: "Value: $ARGUMENTS",
      hasArgumentsVariable: true,
    });

    const result = executeCommand(command, "   ", createExecutionContext());

    expect(result.content).toBe("Value:    ");
  });

  it("should return unchanged content for no-args command", () => {
    const command = createParsedCommand({
      content: "Static prompt content",
      hasArgumentsVariable: false,
    });

    const result = executeCommand(command, "", createExecutionContext());

    expect(result.content).toBe("Static prompt content");
  });
});

// =============================================================================
// Tool Filtering Tests
// =============================================================================

describe("executeCommand - tool filtering", () => {
  it("should return all available tools when command has no allowedTools", () => {
    const command = createParsedCommand({
      allowedTools: undefined,
    });

    const context = createExecutionContext({
      availableTools: ["tool1", "tool2", "tool3"],
    });

    const result = executeCommand(command, "", context);

    expect(result.filteredTools).toEqual(["tool1", "tool2", "tool3"]);
  });

  it("should return all available tools when allowedTools is empty array", () => {
    const command = createParsedCommand({
      allowedTools: [],
    });

    const context = createExecutionContext({
      availableTools: ["tool1", "tool2"],
    });

    const result = executeCommand(command, "", context);

    expect(result.filteredTools).toEqual(["tool1", "tool2"]);
  });

  it("should filter to intersection of allowedTools and availableTools", () => {
    const command = createParsedCommand({
      allowedTools: ["read_file", "grep_search", "nonexistent_tool"],
    });

    const context = createExecutionContext({
      availableTools: ["read_file", "write_file", "grep_search", "run_in_terminal"],
    });

    const result = executeCommand(command, "", context);

    expect(result.filteredTools).toEqual(["read_file", "grep_search"]);
    expect(result.filteredTools).not.toContain("nonexistent_tool");
    expect(result.filteredTools).not.toContain("write_file");
  });

  it("should return empty array when no tools match", () => {
    const command = createParsedCommand({
      allowedTools: ["tool_a", "tool_b"],
    });

    const context = createExecutionContext({
      availableTools: ["tool_x", "tool_y"],
    });

    const result = executeCommand(command, "", context);

    expect(result.filteredTools).toEqual([]);
  });

  it("should preserve order from allowedTools", () => {
    const command = createParsedCommand({
      allowedTools: ["grep_search", "read_file", "write_file"],
    });

    const context = createExecutionContext({
      availableTools: ["write_file", "read_file", "grep_search"],
    });

    const result = executeCommand(command, "", context);

    // Order should match allowedTools, not availableTools
    expect(result.filteredTools).toEqual(["grep_search", "read_file", "write_file"]);
  });

  it("should handle single allowed tool", () => {
    const command = createParsedCommand({
      allowedTools: ["read_file"],
    });

    const context = createExecutionContext({
      availableTools: ["read_file", "write_file"],
    });

    const result = executeCommand(command, "", context);

    expect(result.filteredTools).toEqual(["read_file"]);
  });
});

// =============================================================================
// Combined Functionality Tests
// =============================================================================

describe("executeCommand - combined functionality", () => {
  it("should perform both substitution and filtering", () => {
    const command = createParsedCommand({
      content: "Analyze $ARGUMENTS with limited tools",
      hasArgumentsVariable: true,
      allowedTools: ["read_file", "grep_search"],
    });

    const context = createExecutionContext({
      availableTools: ["read_file", "write_file", "grep_search", "run_in_terminal"],
    });

    const result = executeCommand(command, "src/**/*.ts", context);

    expect(result.content).toBe("Analyze src/**/*.ts with limited tools");
    expect(result.filteredTools).toEqual(["read_file", "grep_search"]);
    expect(result.metadata.substitutionCount).toBe(1);
    expect(result.metadata.originalArgs).toBe("src/**/*.ts");
  });

  it("should return correct ExecutionResult shape", () => {
    const command = createParsedCommand();
    const context = createExecutionContext();

    const result = executeCommand(command, "args", context);

    // Verify shape
    expect(result).toHaveProperty("content");
    expect(result).toHaveProperty("filteredTools");
    expect(result).toHaveProperty("metadata");
    expect(result.metadata).toHaveProperty("originalArgs");
    expect(result.metadata).toHaveProperty("substitutionCount");

    // Verify types
    expect(typeof result.content).toBe("string");
    expect(Array.isArray(result.filteredTools)).toBe(true);
    expect(typeof result.metadata.originalArgs).toBe("string");
    expect(typeof result.metadata.substitutionCount).toBe("number");
  });

  it("should handle complex multi-line content", () => {
    const command = createParsedCommand({
      content: `# Task: Review
      
Please review the following: $ARGUMENTS

## Steps
1. Check for errors
2. Verify $ARGUMENTS is correct
3. Provide feedback`,
      hasArgumentsVariable: true,
    });

    const result = executeCommand(command, "main-branch", createExecutionContext());

    expect(result.content).toContain("Please review the following: main-branch");
    expect(result.content).toContain("Verify main-branch is correct");
    expect(result.metadata.substitutionCount).toBe(2);
  });

  it("should handle special characters in args", () => {
    const command = createParsedCommand({
      content: "Query: $ARGUMENTS",
      hasArgumentsVariable: true,
    });

    const result = executeCommand(
      command,
      'src/**/*.{ts,tsx} --exclude="node_modules"',
      createExecutionContext()
    );

    expect(result.content).toBe('Query: src/**/*.{ts,tsx} --exclude="node_modules"');
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe("executeCommand - edge cases", () => {
  it("should handle $ARGUMENTS at start of content", () => {
    const command = createParsedCommand({
      content: "$ARGUMENTS is the target",
      hasArgumentsVariable: true,
    });

    const result = executeCommand(command, "file.ts", createExecutionContext());

    expect(result.content).toBe("file.ts is the target");
  });

  it("should handle $ARGUMENTS at end of content", () => {
    const command = createParsedCommand({
      content: "The target is $ARGUMENTS",
      hasArgumentsVariable: true,
    });

    const result = executeCommand(command, "file.ts", createExecutionContext());

    expect(result.content).toBe("The target is file.ts");
  });

  it("should handle consecutive $ARGUMENTS", () => {
    const command = createParsedCommand({
      content: "$ARGUMENTS$ARGUMENTS",
      hasArgumentsVariable: true,
    });

    const result = executeCommand(command, "X", createExecutionContext());

    expect(result.content).toBe("XX");
    expect(result.metadata.substitutionCount).toBe(2);
  });

  it("should handle empty available tools", () => {
    const command = createParsedCommand({
      allowedTools: ["read_file"],
    });

    const context = createExecutionContext({
      availableTools: [],
    });

    const result = executeCommand(command, "", context);

    expect(result.filteredTools).toEqual([]);
  });

  it("should handle unicode in args", () => {
    const command = createParsedCommand({
      content: "Message: $ARGUMENTS",
      hasArgumentsVariable: true,
    });

    const result = executeCommand(command, "Hello 世界 🌍", createExecutionContext());

    expect(result.content).toBe("Message: Hello 世界 🌍");
  });
});
