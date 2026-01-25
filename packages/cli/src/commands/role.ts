/**
 * Role Slash Commands
 *
 * Commands for managing agent specialist roles.
 * Follows the same pattern as mode.ts for consistency.
 *
 * @module cli/commands/role
 */

import { type AgentRole, AVAILABLE_ROLES, type RoleInfo, RoleManager } from "@vellum/core";
import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { error, success } from "./types.js";

// =============================================================================
// Module State
// =============================================================================

/**
 * Reference to the active RoleManager instance.
 * Set by the App component when initialized.
 */
let roleManager: RoleManager | null = null;

/**
 * Set the RoleManager instance for role commands.
 * Called by the App component during initialization.
 *
 * @param manager - The RoleManager instance to use
 */
export function setRoleManager(manager: RoleManager | null): void {
  roleManager = manager;
}

/**
 * Get the current RoleManager instance.
 * Returns null if not yet initialized.
 */
export function getRoleManager(): RoleManager | null {
  return roleManager;
}

// =============================================================================
// Role Description Helpers
// =============================================================================

/**
 * Format role information for display.
 */
function formatRoleInfo(role: RoleInfo, isCurrent: boolean): string {
  const marker = isCurrent ? " (current)" : "";
  return `  ${role.icon} /${role.name}${marker} - ${role.description}`;
}

// =============================================================================
// Role Switch Helper
// =============================================================================

/**
 * Switch to a specified role with validation.
 *
 * @param role - Role name to switch to
 * @param _ctx - Command context (unused but required for interface)
 * @returns Command result
 */
async function switchToRole(role: AgentRole, _ctx: CommandContext): Promise<CommandResult> {
  if (!roleManager) {
    return error("OPERATION_NOT_ALLOWED", "Role manager not initialized", []);
  }

  const result = roleManager.switchRole(role);

  if (!result.success) {
    return error("INVALID_ARGUMENT", result.message, []);
  }

  const roleInfo = AVAILABLE_ROLES[role];
  return success(`${roleInfo.icon} ${result.message}`, {
    previousRole: result.previousRole,
    currentRole: result.currentRole,
  });
}

// =============================================================================
// /role Command - Show Current Role and Options
// =============================================================================

/**
 * /role command - Display current role and available options.
 *
 * Shows the current specialist role and lists all available roles
 * with their descriptions. Without a RoleManager, shows a
 * placeholder indicating the role system is not initialized.
 */
export const roleCommand: SlashCommand = {
  name: "role",
  description: "Show current role or switch to a new one",
  kind: "builtin",
  category: "workflow",
  aliases: ["roles"],
  positionalArgs: [
    {
      name: "role",
      type: "string",
      description:
        "Role to switch to (coder, qa, security, analyst, architect, writer, orchestrator)",
      required: false,
    },
  ],
  examples: [
    "/role          - Show current role and options",
    "/role coder    - Switch to coder role",
    "/coder         - Shortcut for /role coder",
  ],
  subcommands: [
    { name: "coder", description: "Implementation specialist" },
    { name: "qa", description: "Testing and debugging" },
    { name: "security", description: "Security review" },
    { name: "analyst", description: "Read-only analysis" },
    { name: "architect", description: "System design" },
    { name: "writer", description: "Documentation" },
    { name: "orchestrator", description: "Multi-agent coordination" },
  ],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const requestedRole = ctx.parsedArgs.positional[0] as string | undefined;

    // If a role is specified, delegate to switch logic
    if (requestedRole) {
      if (!RoleManager.isValidRole(requestedRole)) {
        return error("INVALID_ARGUMENT", `Unknown role: ${requestedRole}`, [
          "Use /role to see available options.",
        ]);
      }
      return switchToRole(requestedRole, ctx);
    }

    // Show current role and options
    if (!roleManager) {
      // No manager available - show static info
      const lines = [
        "Specialist Roles",
        "",
        "Available roles:",
        ...Object.values(AVAILABLE_ROLES).map((r) => formatRoleInfo(r, r.name === "coder")),
        "",
        "Role system not yet initialized. Using default: coder",
        "",
        "Use /role <name> or /<role> to switch roles.",
      ];
      return success(lines.join("\n"));
    }

    const current = roleManager.currentRoleInfo;
    const lines = [
      "Specialist Roles",
      "",
      `Current role: ${current.icon} ${current.displayName}`,
      "",
      "Available roles:",
      ...Object.values(AVAILABLE_ROLES).map((r) => formatRoleInfo(r, r.name === current.name)),
      "",
      "Use /role <name> or /<role> to switch roles.",
    ];

    return success(lines.join("\n"));
  },
};

// =============================================================================
// Individual Role Shortcut Commands
// =============================================================================

/**
 * /coder command - Switch to coder role.
 */
export const coderCommand: SlashCommand = {
  name: "coder",
  description: "Switch to coder role (implementation)",
  kind: "builtin",
  category: "workflow",
  aliases: [],
  examples: ["/coder - Switch to implementation specialist"],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    return switchToRole("coder", ctx);
  },
};

/**
 * /qa command - Switch to QA role.
 */
export const qaCommand: SlashCommand = {
  name: "qa",
  description: "Switch to QA role (testing)",
  kind: "builtin",
  category: "workflow",
  aliases: [],
  examples: ["/qa - Switch to testing and debugging"],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    return switchToRole("qa", ctx);
  },
};

/**
 * /security command - Switch to security role.
 */
export const securityCommand: SlashCommand = {
  name: "security",
  description: "Switch to security role",
  kind: "builtin",
  category: "workflow",
  aliases: [],
  examples: ["/security - Switch to security review"],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    return switchToRole("security", ctx);
  },
};

/**
 * /analyst command - Switch to analyst role.
 */
export const analystCommand: SlashCommand = {
  name: "analyst",
  description: "Switch to analyst role (read-only)",
  kind: "builtin",
  category: "workflow",
  aliases: [],
  examples: ["/analyst - Switch to read-only analysis"],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    return switchToRole("analyst", ctx);
  },
};

/**
 * /architect command - Switch to architect role.
 */
export const architectCommand: SlashCommand = {
  name: "architect",
  description: "Switch to architect role (design)",
  kind: "builtin",
  category: "workflow",
  aliases: [],
  examples: ["/architect - Switch to system design"],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    return switchToRole("architect", ctx);
  },
};

/**
 * /writer command - Switch to writer role.
 */
export const writerCommand: SlashCommand = {
  name: "writer",
  description: "Switch to writer role (docs)",
  kind: "builtin",
  category: "workflow",
  aliases: [],
  examples: ["/writer - Switch to documentation"],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    return switchToRole("writer", ctx);
  },
};

/**
 * /orchestrator command - Switch to orchestrator role.
 */
export const orchestratorCommand: SlashCommand = {
  name: "orchestrator",
  description: "Switch to orchestrator role (L0)",
  kind: "builtin",
  category: "workflow",
  aliases: [],
  examples: ["/orchestrator - Switch to multi-agent coordination"],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    return switchToRole("orchestrator", ctx);
  },
};

// =============================================================================
// Export All Role Commands
// =============================================================================

/**
 * All role-related slash commands for registration.
 */
export const roleSlashCommands: SlashCommand[] = [
  roleCommand,
  coderCommand,
  qaCommand,
  securityCommand,
  analystCommand,
  architectCommand,
  writerCommand,
  orchestratorCommand,
];
