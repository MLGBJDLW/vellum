/**
 * Hook Configuration Parser
 *
 * Parses and validates hooks.json configuration files for the plugin hook system.
 * Handles JSON parsing, schema validation, and path variable expansion.
 *
 * @module plugin/hooks/parser
 */

import type { z } from "zod";

import { expandPaths, type PathContext } from "../utils/path-expansion.js";
import {
  DEFAULT_HOOK_TIMEOUT,
  type HookRule,
  HookRuleSchema,
  type HooksConfig,
  HooksConfigSchema,
} from "./types.js";

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Error thrown when parsing hooks.json fails.
 *
 * Contains detailed information about the parse failure including
 * the file path and specific error details.
 *
 * @example
 * ```typescript
 * try {
 *   parseHooksConfig('/path/to/hooks.json', content, context);
 * } catch (error) {
 *   if (error instanceof HooksParseError) {
 *     console.error(`Failed to parse ${error.filePath}: ${error.message}`);
 *   }
 * }
 * ```
 */
export class HooksParseError extends Error {
  /** Path to the hooks.json file that failed to parse */
  public readonly filePath: string;

  /** Additional error details (validation errors, etc.) */
  public readonly details: unknown;

  constructor(message: string, filePath: string, details?: unknown) {
    super(message);
    this.name = "HooksParseError";
    this.filePath = filePath;
    this.details = details;

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HooksParseError);
    }
  }
}

// =============================================================================
// Validation Types
// =============================================================================

/**
 * Result of validating a hook rule.
 */
export interface HookRuleValidationResult {
  /** Whether the rule is valid */
  valid: boolean;
  /** List of validation errors (empty if valid) */
  errors: string[];
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Formats Zod validation errors into human-readable messages.
 *
 * @param error - Zod error object
 * @returns Array of formatted error messages
 */
function formatZodErrors(error: z.ZodError): string[] {
  return error.issues.map((issue: z.ZodIssue) => {
    const path = issue.path.length > 0 ? `[${issue.path.join(".")}] ` : "";
    return `${path}${issue.message}`;
  });
}

/**
 * Applies default values to a hook rule.
 *
 * Sets default timeout and failBehavior if not specified.
 *
 * @param rule - The hook rule to apply defaults to
 * @returns Rule with defaults applied
 */
function applyRuleDefaults(rule: HookRule): HookRule {
  return {
    ...rule,
    timeout: rule.timeout ?? DEFAULT_HOOK_TIMEOUT,
    failBehavior: rule.failBehavior ?? "open",
  };
}

/**
 * Expands path variables in script action paths.
 *
 * @param rule - The hook rule to process
 * @param context - Path context for variable expansion
 * @returns Rule with expanded paths
 */
function expandRulePaths(rule: HookRule, context: PathContext): HookRule {
  if (rule.action.type === "script") {
    return {
      ...rule,
      action: {
        ...rule.action,
        path: expandPaths(rule.action.path, context),
      },
    };
  }
  return rule;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Parses and validates a hooks.json configuration file.
 *
 * Performs the following steps:
 * 1. Parses JSON content
 * 2. Validates against HooksConfigSchema
 * 3. Applies default values for optional fields
 * 4. Expands path variables in script paths
 *
 * @param filePath - Path to the hooks.json file (for error reporting)
 * @param content - Raw JSON content of the file
 * @param context - Path context for variable expansion
 * @returns Validated and processed HooksConfig
 * @throws {HooksParseError} If JSON parsing fails or schema validation fails
 *
 * @example
 * ```typescript
 * const content = `[
 *   {
 *     "event": "PreToolUse",
 *     "action": {
 *       "type": "script",
 *       "path": "\${VELLUM_PLUGIN_ROOT}/scripts/validate.py"
 *     },
 *     "failBehavior": "closed"
 *   }
 * ]`;
 *
 * const config = parseHooksConfig('/plugin/hooks.json', content, {
 *   pluginRoot: '/home/user/.vellum/plugins/my-plugin',
 *   userDir: '/home/user/.vellum'
 * });
 * ```
 */
export function parseHooksConfig(
  filePath: string,
  content: string,
  context: PathContext
): HooksConfig {
  // Step 1: Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new HooksParseError(`Invalid JSON: ${message}`, filePath, { parseError: message });
  }

  // Step 2: Validate against schema
  const result = HooksConfigSchema.safeParse(parsed);

  if (!result.success) {
    const errors = formatZodErrors(result.error);
    throw new HooksParseError(`Schema validation failed:\n  - ${errors.join("\n  - ")}`, filePath, {
      validationErrors: errors,
    });
  }

  // Step 3 & 4: Apply defaults and expand paths
  const config: HooksConfig = result.data.map((rule) => {
    const withDefaults = applyRuleDefaults(rule);
    return expandRulePaths(withDefaults, context);
  });

  return config;
}

/**
 * Validates an individual hook rule.
 *
 * Useful for validating rules before adding them to a configuration
 * or for providing detailed validation feedback in editors.
 *
 * @param rule - The rule object to validate
 * @returns Validation result with errors if invalid
 *
 * @example
 * ```typescript
 * const rule = {
 *   event: "PreToolUse",
 *   action: { type: "command", command: "lint" }
 * };
 *
 * const result = validateHookRule(rule);
 * if (!result.valid) {
 *   console.error("Invalid rule:", result.errors);
 * }
 * ```
 */
export function validateHookRule(rule: unknown): HookRuleValidationResult {
  const result = HookRuleSchema.safeParse(rule);

  if (result.success) {
    return { valid: true, errors: [] };
  }

  return {
    valid: false,
    errors: formatZodErrors(result.error),
  };
}

/**
 * Parses hooks.json content without path expansion.
 *
 * Useful when you only need to validate the configuration
 * without a full path context.
 *
 * @param filePath - Path to the hooks.json file (for error reporting)
 * @param content - Raw JSON content of the file
 * @returns Validated HooksConfig with defaults applied
 * @throws {HooksParseError} If JSON parsing fails or schema validation fails
 *
 * @example
 * ```typescript
 * const config = parseHooksConfigRaw('/plugin/hooks.json', content);
 * // Returns config without path expansion
 * ```
 */
export function parseHooksConfigRaw(filePath: string, content: string): HooksConfig {
  // Step 1: Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new HooksParseError(`Invalid JSON: ${message}`, filePath, { parseError: message });
  }

  // Step 2: Validate against schema
  const result = HooksConfigSchema.safeParse(parsed);

  if (!result.success) {
    const errors = formatZodErrors(result.error);
    throw new HooksParseError(`Schema validation failed:\n  - ${errors.join("\n  - ")}`, filePath, {
      validationErrors: errors,
    });
  }

  // Step 3: Apply defaults only (no path expansion)
  return result.data.map(applyRuleDefaults);
}
