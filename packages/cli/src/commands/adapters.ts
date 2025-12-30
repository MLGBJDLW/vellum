/**
 * Command System Adapters
 *
 * Provides adapter functions for backward compatibility between:
 * - Legacy SlashCommandResult format (auth.ts original)
 * - New CommandResult discriminated union (types.ts)
 *
 * Enables gradual migration of existing commands to the new interface.
 *
 * @module cli/commands/adapters
 */

import type { CommandContext, CommandError, CommandResult, InteractivePrompt } from "./types.js";

// =============================================================================
// T032/T033: Legacy Type Definition
// =============================================================================

/**
 * Legacy SlashCommandResult format
 *
 * Used by existing auth commands before migration to enhanced interface.
 */
export interface LegacySlashCommandResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Message to display to user */
  message: string;
  /** Additional data (for programmatic use) */
  data?: Record<string, unknown>;
  /** Whether to prompt for input */
  promptForInput?: {
    type: "api_key";
    provider: string;
    placeholder: string;
    onSubmit: (value: string) => Promise<LegacySlashCommandResult>;
  };
}

// =============================================================================
// T032: toSlashCommandResult - New → Legacy Adapter
// =============================================================================

/**
 * Convert new CommandResult to legacy SlashCommandResult format
 *
 * Maps the discriminated union result to the legacy format:
 * - success: kind === 'success'
 * - error: kind === 'error'
 * - interactive: converted to promptForInput if password type
 *
 * @param result - New CommandResult to convert
 * @returns Legacy SlashCommandResult format
 *
 * @example
 * ```typescript
 * const newResult: CommandResult = { kind: 'success', message: 'Done' };
 * const legacy = toSlashCommandResult(newResult);
 * // { success: true, message: 'Done' }
 * ```
 */
export function toSlashCommandResult(result: CommandResult): LegacySlashCommandResult {
  switch (result.kind) {
    case "success":
      return {
        success: true,
        message: result.message ?? "",
        data: result.data as Record<string, unknown> | undefined,
      };

    case "error":
      return {
        success: false,
        message: result.message,
        data: {
          code: result.code,
          suggestions: result.suggestions,
        },
      };

    case "interactive": {
      const { prompt } = result;

      // Convert interactive prompt to legacy promptForInput if applicable
      if (prompt.inputType === "password" || prompt.inputType === "text") {
        return {
          success: true,
          message: prompt.message,
          promptForInput: {
            type: "api_key",
            provider: prompt.provider ?? "",
            placeholder: prompt.placeholder ?? "",
            onSubmit: async (value: string): Promise<LegacySlashCommandResult> => {
              const handlerResult = await prompt.handler(value);
              return toSlashCommandResult(handlerResult);
            },
          },
        };
      }

      // For confirm/select, return message only
      return {
        success: true,
        message: prompt.message,
      };
    }

    case "pending":
      return {
        success: true,
        message: result.operation.message,
        data: {
          pending: true,
        },
      };

    default: {
      // Exhaustive check - result should never reach here
      result satisfies never;
      return {
        success: false,
        message: "Unknown result type",
      };
    }
  }
}

// =============================================================================
// T033: fromSlashCommandResult - Legacy → New Adapter
// =============================================================================

/**
 * Convert legacy SlashCommandResult to new CommandResult format
 *
 * Maps the legacy result to the discriminated union:
 * - success: true → CommandSuccess
 * - success: false → CommandError
 * - promptForInput → CommandInteractive
 *
 * @param legacy - Legacy SlashCommandResult to convert
 * @returns New CommandResult discriminated union
 *
 * @example
 * ```typescript
 * const legacy = { success: true, message: 'Done' };
 * const result = fromSlashCommandResult(legacy);
 * // { kind: 'success', message: 'Done' }
 * ```
 */
export function fromSlashCommandResult(legacy: LegacySlashCommandResult): CommandResult {
  // Handle interactive prompts
  if (legacy.promptForInput) {
    const { promptForInput } = legacy;

    const prompt: InteractivePrompt = {
      inputType: "password",
      message: legacy.message,
      placeholder: promptForInput.placeholder,
      provider: promptForInput.provider,
      handler: async (value: string): Promise<CommandResult> => {
        const legacyResult = await promptForInput.onSubmit(value);
        return fromSlashCommandResult(legacyResult);
      },
      onCancel: () => ({
        kind: "error" as const,
        code: "COMMAND_ABORTED" as const,
        message: "Operation cancelled",
      }),
    };

    return {
      kind: "interactive",
      prompt,
    };
  }

  // Handle success
  if (legacy.success) {
    return {
      kind: "success",
      message: legacy.message || undefined,
      data: legacy.data,
    };
  }

  // Handle error
  return {
    kind: "error",
    code: (legacy.data?.code as CommandError["code"]) ?? "UNKNOWN_ERROR",
    message: legacy.message,
    suggestions: legacy.data?.suggestions as readonly string[] | undefined,
  };
}

// =============================================================================
// T034A: wrapLegacyHandler - Legacy Handler Wrapper
// =============================================================================

/**
 * Legacy command handler function signature
 */
export type LegacyHandler = (
  args: string[],
  context: { currentProvider?: string; credentialManager: CommandContext["credentials"] }
) => Promise<LegacySlashCommandResult>;

/**
 * Wrap a legacy handler to work with the new command system
 *
 * Converts CommandContext to legacy context format,
 * calls the legacy handler, then converts the result.
 *
 * @param legacyHandler - Legacy handler function
 * @returns New-style command handler
 *
 * @example
 * ```typescript
 * const newHandler = wrapLegacyHandler(handleLogin);
 *
 * const command: SlashCommand = {
 *   name: 'login',
 *   execute: newHandler,
 * };
 * ```
 */
export function wrapLegacyHandler(
  legacyHandler: LegacyHandler
): (ctx: CommandContext) => Promise<CommandResult> {
  return async (ctx: CommandContext): Promise<CommandResult> => {
    // Extract positional args as string array
    const args = ctx.parsedArgs.positional.map((arg) => String(arg));

    // Build legacy context
    const legacyContext = {
      currentProvider: ctx.session.provider,
      credentialManager: ctx.credentials,
    };

    // Call legacy handler
    const legacyResult = await legacyHandler(args, legacyContext);

    // Convert to new result format
    return fromSlashCommandResult(legacyResult);
  };
}

// =============================================================================
// Utility: Create Legacy Context from CommandContext
// =============================================================================

/**
 * Extract legacy context from CommandContext
 *
 * Useful when calling legacy handlers directly within new commands.
 *
 * @param ctx - New CommandContext
 * @returns Legacy context object
 */
export function toLegacyContext(ctx: CommandContext): {
  currentProvider?: string;
  credentialManager: CommandContext["credentials"];
} {
  return {
    currentProvider: ctx.session.provider,
    credentialManager: ctx.credentials,
  };
}
