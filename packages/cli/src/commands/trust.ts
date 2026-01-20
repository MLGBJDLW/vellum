/**
 * Trust Slash Commands (T060)
 *
 * Provides commands for managing trusted paths:
 * - /trust [path] - Add path to trusted paths
 * - /untrust [path] - Remove path from trusted paths
 * - /trusted - List all trusted paths
 *
 * @module cli/commands/trust
 */

import * as path from "node:path";
import { PathTrustManager } from "@vellum/core";
import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { error, success } from "./types.js";

// =============================================================================
// Module State
// =============================================================================

/**
 * Reference to the PathTrustManager instance
 */
let trustManager: PathTrustManager | null = null;

/**
 * Set the PathTrustManager instance for trust commands
 */
export function setTrustCommandsManager(manager: PathTrustManager | null): void {
  trustManager = manager;
}

/**
 * Get or create PathTrustManager instance
 */
function getTrustManager(): PathTrustManager {
  if (!trustManager) {
    trustManager = PathTrustManager.getInstance();
  }
  return trustManager;
}

// =============================================================================
// /trust Command - Add Path to Trusted
// =============================================================================

/**
 * /trust command - Add a path to trusted paths
 *
 * If no path is provided, trusts the current working directory.
 */
export const trustCommand: SlashCommand = {
  name: "trust",
  description: "Add a path to trusted paths for file access",
  kind: "builtin",
  category: "config",
  positionalArgs: [
    {
      name: "path",
      type: "path",
      description: "Path to trust (defaults to current directory)",
      required: false,
    },
  ],
  examples: [
    "/trust           - Trust current directory",
    "/trust .         - Trust current directory",
    "/trust ../other  - Trust relative path",
    '/trust "C:\\Projects\\myapp"  - Trust absolute path',
  ],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const manager = getTrustManager();
    const inputPath = ctx.parsedArgs.positional[0] as string | undefined;

    // Resolve path - use session.cwd
    const cwd = ctx.session.cwd;
    const targetPath = inputPath ? path.resolve(cwd, inputPath) : cwd;

    // Check if blocked
    if (manager.isBlocked(targetPath)) {
      return error("PERMISSION_DENIED", "Cannot trust system directory", [
        `Path: ${targetPath}`,
        "System directories are blocked for security.",
      ]);
    }

    // Check if already trusted
    if (manager.isTrusted(targetPath)) {
      return success(`✓ Path already trusted: ${targetPath}`);
    }

    try {
      await manager.trustPath(targetPath, "always", "new_project");
      return success(`✓ Added to trusted paths: ${targetPath}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return error("INTERNAL_ERROR", `Failed to trust path: ${message}`);
    }
  },
};

// =============================================================================
// /untrust Command - Remove Path from Trusted
// =============================================================================

/**
 * /untrust command - Remove a path from trusted paths
 */
export const untrustCommand: SlashCommand = {
  name: "untrust",
  description: "Remove a path from trusted paths",
  kind: "builtin",
  category: "config",
  positionalArgs: [
    {
      name: "path",
      type: "path",
      description: "Path to untrust (defaults to current directory)",
      required: false,
    },
  ],
  examples: [
    "/untrust           - Untrust current directory",
    "/untrust ../other  - Untrust relative path",
  ],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const manager = getTrustManager();
    const inputPath = ctx.parsedArgs.positional[0] as string | undefined;

    // Resolve path - use session.cwd
    const cwd = ctx.session.cwd;
    const targetPath = inputPath ? path.resolve(cwd, inputPath) : cwd;

    // Check if trusted
    if (!manager.isTrusted(targetPath)) {
      return success(`Path is not trusted: ${targetPath}`);
    }

    try {
      await manager.untrustPath(targetPath);
      return success(`✗ Removed from trusted paths: ${targetPath}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return error("INTERNAL_ERROR", `Failed to untrust path: ${message}`);
    }
  },
};

// =============================================================================
// /trusted Command - List Trusted Paths
// =============================================================================

/**
 * /trusted command - List all trusted paths
 */
export const trustedCommand: SlashCommand = {
  name: "trusted",
  description: "List all trusted paths",
  kind: "builtin",
  category: "config",
  aliases: ["trustlist", "trust-list"],
  examples: ["/trusted  - Show all trusted paths"],

  execute: async (_ctx: CommandContext): Promise<CommandResult> => {
    const manager = getTrustManager();
    const paths = manager.getTrustedPaths();

    if (paths.length === 0) {
      return success(
        [
          "Trusted Paths",
          "",
          "  No trusted paths configured.",
          "",
          "Use /trust <path> to add a path.",
        ].join("\n")
      );
    }

    const lines = [
      "Trusted Paths",
      "",
      ...paths.map((p: string, i: number) => {
        const decision = manager.getDecision(p);
        const scope = decision?.scope === "session" ? " (session)" : "";
        return `  ${i + 1}. ${p}${scope}`;
      }),
      "",
      `Total: ${paths.length} path${paths.length === 1 ? "" : "s"}`,
      "",
      "Use /untrust <path> to remove.",
    ];

    return success(lines.join("\n"));
  },
};

// =============================================================================
// Export All Trust Commands
// =============================================================================

/**
 * All trust-related slash commands
 */
export const trustSlashCommands: readonly SlashCommand[] = [
  trustCommand,
  untrustCommand,
  trustedCommand,
];
