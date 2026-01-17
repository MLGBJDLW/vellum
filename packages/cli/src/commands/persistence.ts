/**
 * Persistence Slash Commands
 *
 * Provides slash commands for session persistence management:
 * - /checkpoint [desc] - Create a new checkpoint
 * - /checkpoints - List all checkpoints
 * - /rollback [id] - Rollback to a checkpoint
 * - /save - Force save session
 *
 * @module cli/commands/persistence
 */

import type { SessionCheckpoint } from "@vellum/core";
import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { error, success } from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Persistence interface for slash commands.
 * Matches the relevant subset of UsePersistenceReturn.
 */
export interface PersistenceCommandsRef {
  /** Current persistence status */
  readonly status: "idle" | "saving" | "saved" | "error";
  /** Number of unsaved messages */
  readonly unsavedCount: number;
  /** All checkpoints for current session */
  readonly checkpoints: readonly SessionCheckpoint[];
  /** Whether advanced persistence is enabled */
  readonly isAdvancedEnabled: boolean;
  /** Create a checkpoint */
  createCheckpoint: (description?: string) => Promise<string | null>;
  /** Rollback to a checkpoint */
  rollbackToCheckpoint: (checkpointId: string) => Promise<boolean>;
  /** Delete a checkpoint */
  deleteCheckpoint: (checkpointId: string) => Promise<boolean>;
  /** Get messages that will be lost on rollback */
  getMessagesToLose: (checkpointId: string) => number;
  /** Force save */
  forceSave: () => Promise<void>;
}

// =============================================================================
// Module State
// =============================================================================

/**
 * Reference to the active persistence instance.
 * Set by the App component when initialized.
 */
let persistenceRef: PersistenceCommandsRef | null = null;

/**
 * Set the persistence instance for commands.
 *
 * @param ref - The persistence instance to use
 */
export function setPersistenceRef(ref: PersistenceCommandsRef | null): void {
  persistenceRef = ref;
}

/**
 * Get the current persistence instance.
 *
 * @returns The current persistence instance or null
 */
export function getPersistenceRef(): PersistenceCommandsRef | null {
  return persistenceRef;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format a checkpoint for display.
 */
function formatCheckpoint(checkpoint: SessionCheckpoint, index: number): string {
  const date = new Date(checkpoint.createdAt);
  const timeStr = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateStr = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const desc = checkpoint.description ?? "(no description)";
  const idShort = checkpoint.id.slice(0, 8);

  return `  ${index + 1}. [${idShort}] ${desc} | ${dateStr} ${timeStr} | msg #${checkpoint.messageIndex}`;
}

/**
 * Format checkpoints as a table.
 */
function formatCheckpointsTable(checkpoints: readonly SessionCheckpoint[]): string {
  if (checkpoints.length === 0) {
    return "📌 No checkpoints found.\n\nUse /checkpoint [description] to create one.";
  }

  const lines = [
    "📌 Checkpoints",
    "",
    "  #  ID        Description          Date       Time   Msg",
    "  ─────────────────────────────────────────────────────────",
    ...checkpoints.map((cp, i) => formatCheckpoint(cp, i)),
    "",
    "Use /rollback <id> to restore to a checkpoint.",
  ];

  return lines.join("\n");
}

// =============================================================================
// /checkpoint Command
// =============================================================================

/**
 * /checkpoint [desc] - Create a new checkpoint.
 */
export const checkpointCommand: SlashCommand = {
  name: "checkpoint",
  description: "Create a checkpoint at current conversation state",
  kind: "builtin",
  category: "session",
  aliases: ["cp"],
  positionalArgs: [
    {
      name: "description",
      type: "string",
      description: "Optional description for the checkpoint",
      required: false,
    },
  ],
  examples: [
    "/checkpoint                    - Create checkpoint without description",
    "/checkpoint 'Before refactor' - Create checkpoint with description",
  ],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    if (!persistenceRef) {
      return error("OPERATION_NOT_ALLOWED", "Persistence system not initialized", [
        "Try again after the app is fully loaded.",
      ]);
    }

    if (!persistenceRef.isAdvancedEnabled) {
      return error("OPERATION_NOT_ALLOWED", "Checkpoints require advanced persistence mode", [
        "Enable advanced persistence in your configuration.",
      ]);
    }

    const description = ctx.parsedArgs.positional[0] as string | undefined;

    try {
      const checkpointId = await persistenceRef.createCheckpoint(description);

      if (!checkpointId) {
        return error("INTERNAL_ERROR", "Failed to create checkpoint", [
          "Try again or check the session state.",
        ]);
      }

      return success(
        `✅ Checkpoint created: ${checkpointId.slice(0, 8)}${description ? ` - "${description}"` : ""}`
      );
    } catch (err) {
      return error(
        "INTERNAL_ERROR",
        `Failed to create checkpoint: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  },
};

// =============================================================================
// /checkpoints Command
// =============================================================================

/**
 * /checkpoints - List all checkpoints for current session.
 */
export const checkpointsCommand: SlashCommand = {
  name: "checkpoints",
  description: "List all checkpoints for current session",
  kind: "builtin",
  category: "session",
  aliases: ["cps", "listcp"],
  examples: ["/checkpoints - Show all checkpoints"],

  execute: async (_ctx: CommandContext): Promise<CommandResult> => {
    if (!persistenceRef) {
      return error("OPERATION_NOT_ALLOWED", "Persistence system not initialized", [
        "Try again after the app is fully loaded.",
      ]);
    }

    if (!persistenceRef.isAdvancedEnabled) {
      return error("OPERATION_NOT_ALLOWED", "Checkpoints require advanced persistence mode", [
        "Enable advanced persistence in your configuration.",
      ]);
    }

    const checkpoints = persistenceRef.checkpoints;
    return success(formatCheckpointsTable(checkpoints));
  },
};

// =============================================================================
// /rollback Command
// =============================================================================

/**
 * /rollback [id] - Rollback to a checkpoint.
 */
export const rollbackCommand: SlashCommand = {
  name: "rollback",
  description: "Rollback to a previous checkpoint",
  kind: "builtin",
  category: "session",
  aliases: ["rb", "restore"],
  positionalArgs: [
    {
      name: "checkpointId",
      type: "string",
      description: "Checkpoint ID (first 8 characters or full ID)",
      required: true,
    },
  ],
  examples: [
    "/rollback abc12345           - Rollback to checkpoint with ID starting with abc12345",
  ],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    if (!persistenceRef) {
      return error("OPERATION_NOT_ALLOWED", "Persistence system not initialized", [
        "Try again after the app is fully loaded.",
      ]);
    }

    if (!persistenceRef.isAdvancedEnabled) {
      return error("OPERATION_NOT_ALLOWED", "Rollback requires advanced persistence mode", [
        "Enable advanced persistence in your configuration.",
      ]);
    }

    const checkpointIdArg = ctx.parsedArgs.positional[0] as string | undefined;

    if (!checkpointIdArg) {
      return error("MISSING_ARGUMENT", "Checkpoint ID is required", [
        "Usage: /rollback <checkpoint-id>",
        "Use /checkpoints to list available checkpoints.",
      ]);
    }

    // Find checkpoint by ID or ID prefix
    const checkpoint = persistenceRef.checkpoints.find(
      (cp) => cp.id === checkpointIdArg || cp.id.startsWith(checkpointIdArg)
    );

    if (!checkpoint) {
      return error("RESOURCE_NOT_FOUND", `Checkpoint not found: ${checkpointIdArg}`, [
        "Use /checkpoints to list available checkpoints.",
      ]);
    }

    // Calculate messages that will be lost
    const messagesToLose = persistenceRef.getMessagesToLose(checkpoint.id);

    if (messagesToLose === 0) {
      return success("Already at this checkpoint. No changes needed.");
    }

    // Perform rollback
    try {
      const result = await persistenceRef.rollbackToCheckpoint(checkpoint.id);

      if (!result) {
        return error("INTERNAL_ERROR", "Rollback operation failed", [
          "The checkpoint may have been deleted or corrupted.",
        ]);
      }

      return success(
        `✅ Rolled back to checkpoint ${checkpoint.id.slice(0, 8)}\n` +
          `   Removed ${messagesToLose} message${messagesToLose === 1 ? "" : "s"}.`
      );
    } catch (err) {
      return error(
        "INTERNAL_ERROR",
        `Rollback failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  },
};

// =============================================================================
// /save Command
// =============================================================================

/**
 * /save - Force save the current session.
 */
export const saveCommand: SlashCommand = {
  name: "save",
  description: "Force save the current session",
  kind: "builtin",
  category: "session",
  aliases: ["s"],
  examples: ["/save - Save session immediately"],

  execute: async (_ctx: CommandContext): Promise<CommandResult> => {
    if (!persistenceRef) {
      return error("OPERATION_NOT_ALLOWED", "Persistence system not initialized", [
        "Try again after the app is fully loaded.",
      ]);
    }

    try {
      await persistenceRef.forceSave();

      const unsaved = persistenceRef.unsavedCount;
      if (unsaved > 0) {
        return success(`💾 Session saved. ${unsaved} changes synced.`);
      }
      return success("💾 Session saved.");
    } catch (err) {
      return error(
        "INTERNAL_ERROR",
        `Save failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  },
};

// =============================================================================
// Export Command Array
// =============================================================================

/**
 * All persistence-related slash commands.
 */
export const persistenceCommands: readonly SlashCommand[] = [
  checkpointCommand,
  checkpointsCommand,
  rollbackCommand,
  saveCommand,
];

export default persistenceCommands;
