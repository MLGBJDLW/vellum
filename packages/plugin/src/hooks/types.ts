/**
 * Hook System Type Definitions
 *
 * Defines Zod schemas for the plugin hook system that allows plugins
 * to execute custom logic at specific points in the agent lifecycle.
 *
 * @module plugin/hooks/types
 */

import { z } from "zod";

// =============================================================================
// Constants
// =============================================================================

/**
 * Default timeout for hook execution in milliseconds.
 */
export const DEFAULT_HOOK_TIMEOUT = 30000;

/**
 * Maximum timeout value allowed (5 minutes).
 */
export const MAX_HOOK_TIMEOUT = 300000;

/**
 * Minimum timeout value allowed (100ms).
 */
export const MIN_HOOK_TIMEOUT = 100;

// =============================================================================
// HookEvent - Lifecycle event types
// =============================================================================

/**
 * Schema for hook lifecycle events.
 *
 * Defines all points in the agent lifecycle where hooks can be triggered:
 *
 * - `SessionStart` - When a new session begins
 * - `SessionEnd` - When a session terminates
 * - `BeforeModel` - Before making an LLM API call
 * - `AfterModel` - After receiving LLM response
 * - `PreToolUse` - Before tool execution (fail-closed: rejection blocks tool)
 * - `PostToolResult` - After tool returns a result
 * - `BeforeAgent` - Before spawning a sub-agent
 * - `AfterAgent` - After sub-agent completes
 * - `OnError` - When an error occurs
 * - `OnApproval` - When user approves a pending action
 * - `BeforeCommit` - Before a git commit is made
 *
 * @example
 * ```typescript
 * const event = HookEventSchema.parse("PreToolUse");
 * ```
 */
export const HookEventSchema = z.enum([
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
]);

/** Inferred type for hook events */
export type HookEvent = z.infer<typeof HookEventSchema>;

// =============================================================================
// HookAction - Action types (discriminated union)
// =============================================================================

/**
 * Schema for command-type hook action.
 *
 * Executes an external command with optional arguments.
 *
 * @example
 * ```typescript
 * const action: HookCommandAction = {
 *   type: "command",
 *   command: "eslint",
 *   args: ["--fix", "./src"]
 * };
 * ```
 */
export const HookCommandActionSchema = z.object({
  /** Discriminator for command actions */
  type: z.literal("command"),

  /** Command to execute */
  command: z.string().min(1, "Command cannot be empty"),

  /** Optional arguments to pass to the command */
  args: z.array(z.string()).optional(),
});

/** Inferred type for command actions */
export type HookCommandAction = z.infer<typeof HookCommandActionSchema>;

/**
 * Schema for script-type hook action.
 *
 * Executes a script file with an optional interpreter.
 *
 * @example
 * ```typescript
 * const action: HookScriptAction = {
 *   type: "script",
 *   path: "./hooks/pre-commit.py",
 *   interpreter: "python3"
 * };
 * ```
 */
export const HookScriptActionSchema = z.object({
  /** Discriminator for script actions */
  type: z.literal("script"),

  /** Path to the script file (relative to plugin root) */
  path: z.string().min(1, "Script path cannot be empty"),

  /** Optional interpreter to run the script (e.g., "python3", "node") */
  interpreter: z.string().optional(),
});

/** Inferred type for script actions */
export type HookScriptAction = z.infer<typeof HookScriptActionSchema>;

/**
 * Schema for prompt-type hook action.
 *
 * Injects a prompt into the conversation context.
 *
 * @example
 * ```typescript
 * const action: HookPromptAction = {
 *   type: "prompt",
 *   content: "Remember to follow the code style guidelines."
 * };
 * ```
 */
export const HookPromptActionSchema = z.object({
  /** Discriminator for prompt actions */
  type: z.literal("prompt"),

  /** Prompt content to inject */
  content: z.string().min(1, "Prompt content cannot be empty"),
});

/** Inferred type for prompt actions */
export type HookPromptAction = z.infer<typeof HookPromptActionSchema>;

/**
 * Schema for hook actions (discriminated union).
 *
 * A hook action can be one of:
 * - `command`: Execute an external command
 * - `script`: Run a script file
 * - `prompt`: Inject a prompt into context
 *
 * @example
 * ```typescript
 * const action = HookActionSchema.parse({
 *   type: "command",
 *   command: "npm",
 *   args: ["run", "lint"]
 * });
 * ```
 */
export const HookActionSchema = z.discriminatedUnion("type", [
  HookCommandActionSchema,
  HookScriptActionSchema,
  HookPromptActionSchema,
]);

/** Inferred type for hook actions */
export type HookAction = z.infer<typeof HookActionSchema>;

// =============================================================================
// HookFailBehavior - Failure handling mode
// =============================================================================

/**
 * Schema for hook failure behavior.
 *
 * Determines what happens when a hook fails:
 * - `open`: Continue execution despite hook failure (fail-open)
 * - `closed`: Block execution if hook fails (fail-closed)
 *
 * @example
 * ```typescript
 * const behavior = HookFailBehaviorSchema.parse("closed");
 * ```
 */
export const HookFailBehaviorSchema = z.enum(["open", "closed"]);

/** Inferred type for fail behavior */
export type HookFailBehavior = z.infer<typeof HookFailBehaviorSchema>;

// =============================================================================
// HookRule - Individual hook rule definition
// =============================================================================

/**
 * Schema for a hook rule definition.
 *
 * Defines when and how a hook should execute:
 * - `event`: The lifecycle event that triggers this hook
 * - `action`: What to execute when triggered
 * - `matcher`: Optional regex to filter when hook applies
 * - `timeout`: Maximum execution time in milliseconds
 * - `failBehavior`: How to handle hook failures
 *
 * @example
 * ```typescript
 * const rule = HookRuleSchema.parse({
 *   event: "PreToolUse",
 *   action: {
 *     type: "command",
 *     command: "security-check",
 *     args: ["--strict"]
 *   },
 *   matcher: "^(write_file|delete_file)$",
 *   timeout: 5000,
 *   failBehavior: "closed"
 * });
 * ```
 */
export const HookRuleSchema = z.object({
  /** The lifecycle event that triggers this hook */
  event: HookEventSchema,

  /** The action to execute when triggered */
  action: HookActionSchema,

  /**
   * Optional regex pattern to filter when the hook applies.
   * The pattern is matched against context-specific data (e.g., tool name, file path).
   */
  matcher: z
    .string()
    .optional()
    .refine(
      (pattern) => {
        if (!pattern) return true;
        try {
          new RegExp(pattern);
          return true;
        } catch {
          return false;
        }
      },
      { message: "Matcher must be a valid regex pattern" }
    ),

  /**
   * Maximum time in milliseconds to wait for hook execution.
   * @default 30000
   */
  timeout: z
    .number()
    .int()
    .min(MIN_HOOK_TIMEOUT, `Timeout must be at least ${MIN_HOOK_TIMEOUT}ms`)
    .max(MAX_HOOK_TIMEOUT, `Timeout cannot exceed ${MAX_HOOK_TIMEOUT}ms`)
    .default(DEFAULT_HOOK_TIMEOUT),

  /**
   * How to handle hook execution failures.
   * - 'open': Continue despite failure (default for most events)
   * - 'closed': Block execution on failure (default for PreToolUse)
   */
  failBehavior: HookFailBehaviorSchema.optional(),
});

/** Inferred type for hook rules */
export type HookRule = z.infer<typeof HookRuleSchema>;

// =============================================================================
// HooksConfig - Complete hooks configuration
// =============================================================================

/**
 * Schema for hooks configuration.
 *
 * An array of hook rules that define the plugin's hook behavior.
 *
 * @example
 * ```typescript
 * const config = HooksConfigSchema.parse([
 *   {
 *     event: "SessionStart",
 *     action: { type: "prompt", content: "Welcome to the session!" }
 *   },
 *   {
 *     event: "PreToolUse",
 *     action: { type: "command", command: "validate-tool" },
 *     matcher: "^dangerous_",
 *     failBehavior: "closed"
 *   }
 * ]);
 * ```
 */
export const HooksConfigSchema = z.array(HookRuleSchema);

/** Inferred type for hooks configuration */
export type HooksConfig = z.infer<typeof HooksConfigSchema>;
