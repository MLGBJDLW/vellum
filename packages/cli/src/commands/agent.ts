/**
 * Agent Level Slash Commands (T046c)
 *
 * Provides slash commands for agent level management:
 * - /agent - Show current agent level and options
 * - /agent l0 - Switch to orchestrator level
 * - /agent l1 - Switch to workflow level
 * - /agent l2 - Switch to worker level
 * - /agent clear - Clear level override
 * - /agent list - List registered agents
 *
 * @module cli/commands/agent
 */

import { AgentLevel, type ModeManager } from "@vellum/core";
import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { error, success } from "./types.js";

// =============================================================================
// Module State
// =============================================================================

/**
 * Reference to the active ModeManager instance.
 * Set by the App component when initialized.
 */
let modeManager: ModeManager | null = null;

/**
 * Set the ModeManager instance for agent commands.
 * Called by the App component during initialization.
 *
 * @param manager - The ModeManager instance to use
 */
export function setAgentCommandsManager(manager: ModeManager | null): void {
  modeManager = manager;
}

/**
 * Get the current ModeManager instance.
 * Returns null if not yet initialized.
 */
export function getAgentCommandsManager(): ModeManager | null {
  return modeManager;
}

// =============================================================================
// Agent Level Constants
// =============================================================================

/**
 * Agent level names for display.
 */
const AGENT_LEVEL_NAMES: Record<AgentLevel, string> = {
  [AgentLevel.orchestrator]: "Orchestrator",
  [AgentLevel.workflow]: "Workflow",
  [AgentLevel.worker]: "Worker",
} as const;

/**
 * Agent level descriptions.
 */
const AGENT_LEVEL_DESCRIPTIONS: Record<AgentLevel, string> = {
  [AgentLevel.orchestrator]: "Top-level coordinator, spawns workflow agents",
  [AgentLevel.workflow]: "Mid-level manager, spawns worker agents",
  [AgentLevel.worker]: "Leaf-level executor, cannot spawn agents",
} as const;

/**
 * Agent level icons.
 */
const AGENT_LEVEL_ICONS: Record<AgentLevel, string> = {
  [AgentLevel.orchestrator]: "[L0]",
  [AgentLevel.workflow]: "[L1]",
  [AgentLevel.worker]: "[L2]",
} as const;

/**
 * Subcommand to AgentLevel mapping.
 */
const SUBCOMMAND_TO_LEVEL: Record<string, AgentLevel> = {
  l0: AgentLevel.orchestrator,
  l1: AgentLevel.workflow,
  l2: AgentLevel.worker,
  orchestrator: AgentLevel.orchestrator,
  workflow: AgentLevel.workflow,
  worker: AgentLevel.worker,
} as const;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format agent level info for display.
 */
function formatLevelInfo(level: AgentLevel, isCurrent: boolean): string {
  const icon = AGENT_LEVEL_ICONS[level];
  const name = AGENT_LEVEL_NAMES[level];
  const desc = AGENT_LEVEL_DESCRIPTIONS[level];
  const marker = isCurrent ? " (current)" : "";
  return `  ${icon} ${name}${marker} - ${desc}`;
}

/**
 * Get numeric level from AgentLevel.
 */
function getLevelNumber(level: AgentLevel): number {
  return level; // AgentLevel enum values are 0, 1, 2
}

// =============================================================================
// /agent Command - Show Current Level and Options
// =============================================================================

/**
 * /agent command - Display current agent level and available options.
 *
 * Shows the current agent level and lists all available levels
 * with their descriptions. Supports subcommands for switching levels.
 */
export const agentCommand: SlashCommand = {
  name: "agent",
  description: "Switch agent level or show current level",
  kind: "builtin",
  category: "workflow",
  aliases: ["ag"],
  positionalArgs: [
    {
      name: "subcommand",
      type: "string",
      description: "Subcommand: l0, l1, l2, clear, or list",
      required: false,
    },
  ],
  examples: [
    "/agent        - Show current agent level and options",
    "/agent l0     - Switch to orchestrator level (L0)",
    "/agent l1     - Switch to workflow level (L1)",
    "/agent l2     - Switch to worker level (L2)",
    "/agent clear  - Clear level override, restore mode default",
    "/agent list   - List registered agents",
  ],
  subcommands: [
    { name: "l0", description: "Switch to orchestrator level" },
    { name: "l1", description: "Switch to workflow level" },
    { name: "l2", description: "Switch to worker level" },
    { name: "clear", description: "Clear level override" },
    { name: "list", description: "List registered agents" },
  ],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const subcommand = ctx.parsedArgs.positional[0] as string | undefined;

    // Handle subcommands
    if (subcommand) {
      const normalized = subcommand.toLowerCase();

      // Check for level switch commands
      const level = SUBCOMMAND_TO_LEVEL[normalized as keyof typeof SUBCOMMAND_TO_LEVEL];
      if (level !== undefined) {
        return switchToLevel(level);
      }

      // Handle clear command
      if (normalized === "clear") {
        return clearLevelOverride();
      }

      // Handle list command
      if (normalized === "list") {
        return listAgents();
      }

      // Unknown subcommand
      return error("INVALID_ARGUMENT", `Unknown subcommand: ${subcommand}`, [
        "Valid subcommands: l0, l1, l2, clear, list",
      ]);
    }

    // No subcommand - show current level and options
    return showCurrentLevel();
  },
};

// =============================================================================
// Subcommand Handlers
// =============================================================================

/**
 * Show current agent level and available options.
 */
function showCurrentLevel(): CommandResult {
  if (!modeManager) {
    const lines = [
      "Agent Levels",
      "",
      "Available levels:",
      formatLevelInfo(AgentLevel.orchestrator, false),
      formatLevelInfo(AgentLevel.workflow, false),
      formatLevelInfo(AgentLevel.worker, true), // Default
      "",
      "Mode system not initialized. Using default: L2 (Worker)",
      "",
      "Use /agent l0, /agent l1, or /agent l2 to switch levels.",
    ];
    return success(lines.join("\n"));
  }

  const effectiveLevel = modeManager.getEffectiveAgentLevel();
  const override = modeManager.getAgentLevelOverride();
  const hasOverride = modeManager.hasAgentLevelOverride();

  const levelIcon = AGENT_LEVEL_ICONS[effectiveLevel];
  const levelName = AGENT_LEVEL_NAMES[effectiveLevel];

  const lines = [
    "Agent Levels",
    "",
    `Current level: ${levelIcon} ${levelName} (L${getLevelNumber(effectiveLevel)})`,
  ];

  if (hasOverride && override) {
    lines.push(`Override source: ${override.source}`);
    lines.push("");
    lines.push("[INFO] Use /agent clear to restore mode default.");
  } else {
    lines.push("(Mode-derived, no override active)");
  }

  lines.push("");
  lines.push("Available levels:");
  lines.push(formatLevelInfo(AgentLevel.orchestrator, effectiveLevel === AgentLevel.orchestrator));
  lines.push(formatLevelInfo(AgentLevel.workflow, effectiveLevel === AgentLevel.workflow));
  lines.push(formatLevelInfo(AgentLevel.worker, effectiveLevel === AgentLevel.worker));
  lines.push("");
  lines.push("Use /agent l0, /agent l1, or /agent l2 to switch levels.");

  return success(lines.join("\n"));
}

/**
 * Switch to a specific agent level.
 */
function switchToLevel(level: AgentLevel): CommandResult {
  if (!modeManager) {
    return error("OPERATION_NOT_ALLOWED", "Mode system not initialized", [
      "Cannot set agent level override without ModeManager.",
    ]);
  }

  const currentLevel = modeManager.getEffectiveAgentLevel();

  // Check if already at this level with override
  if (modeManager.hasAgentLevelOverride()) {
    const override = modeManager.getAgentLevelOverride();
    if (override?.level === level) {
      const icon = AGENT_LEVEL_ICONS[level];
      const name = AGENT_LEVEL_NAMES[level];
      return success(`Already at ${icon} ${name} level (L${getLevelNumber(level)}).`);
    }
  }

  // Set the override
  modeManager.setAgentLevelOverride(level, "command");

  const icon = AGENT_LEVEL_ICONS[level];
  const name = AGENT_LEVEL_NAMES[level];
  const prevIcon = AGENT_LEVEL_ICONS[currentLevel];
  const prevName = AGENT_LEVEL_NAMES[currentLevel];

  return success(
    `${icon} Switched to ${name} level (L${getLevelNumber(level)}).\n` +
      `Previous: ${prevIcon} ${prevName} (L${getLevelNumber(currentLevel)})`
  );
}

/**
 * Clear agent level override.
 */
function clearLevelOverride(): CommandResult {
  if (!modeManager) {
    return error("OPERATION_NOT_ALLOWED", "Mode system not initialized", [
      "Cannot clear agent level override without ModeManager.",
    ]);
  }

  if (!modeManager.hasAgentLevelOverride()) {
    const effectiveLevel = modeManager.getEffectiveAgentLevel();
    const icon = AGENT_LEVEL_ICONS[effectiveLevel];
    const name = AGENT_LEVEL_NAMES[effectiveLevel];
    return success(
      `No override active. Current level: ${icon} ${name} (L${getLevelNumber(effectiveLevel)})`
    );
  }

  const previousOverride = modeManager.getAgentLevelOverride();
  const prevLevel: AgentLevel = previousOverride?.level ?? AgentLevel.worker;
  modeManager.clearAgentLevelOverride();

  const newLevel = modeManager.getEffectiveAgentLevel();
  const newIcon = AGENT_LEVEL_ICONS[newLevel];
  const newName = AGENT_LEVEL_NAMES[newLevel];

  const prevIcon = AGENT_LEVEL_ICONS[prevLevel];
  const prevName = AGENT_LEVEL_NAMES[prevLevel];

  return success(
    `Override cleared.\n` +
      `Previous: ${prevIcon} ${prevName} (L${getLevelNumber(prevLevel)})\n` +
      `Now: ${newIcon} ${newName} (L${getLevelNumber(newLevel)}) (mode-derived)`
  );
}

/**
 * List registered agents.
 *
 * Currently returns a placeholder as agent registry is not yet implemented.
 */
function listAgents(): CommandResult {
  // TODO: Once agent registry is implemented, list actual agents
  const lines = [
    "Registered Agents",
    "",
    "Built-in agent configurations:",
    "  [L2] Vibe Agent - Fast autonomous worker",
    "  [L1] Plan Agent - Plan-then-execute workflow",
    "  [L0] Spec Orchestrator - 6-phase structured workflow",
    "",
    "Use /mode to switch between agent configurations.",
    "Use /agent l0|l1|l2 to manually override agent level.",
  ];
  return success(lines.join("\n"));
}

// =============================================================================
// Shortcut Commands
// =============================================================================

/**
 * /l0 command - Quick switch to orchestrator level.
 */
export const l0Command: SlashCommand = {
  name: "l0",
  description: "Switch to orchestrator level (L0)",
  kind: "builtin",
  category: "workflow",
  aliases: ["orchestrator"],
  examples: ["/l0 - Switch to orchestrator level"],

  execute: async (_ctx: CommandContext): Promise<CommandResult> => {
    return switchToLevel(AgentLevel.orchestrator);
  },
};

/**
 * /l1 command - Quick switch to workflow level.
 */
export const l1Command: SlashCommand = {
  name: "l1",
  description: "Switch to workflow level (L1)",
  kind: "builtin",
  category: "workflow",
  aliases: ["workflow"],
  examples: ["/l1 - Switch to workflow level"],

  execute: async (_ctx: CommandContext): Promise<CommandResult> => {
    return switchToLevel(AgentLevel.workflow);
  },
};

/**
 * /l2 command - Quick switch to worker level.
 */
export const l2Command: SlashCommand = {
  name: "l2",
  description: "Switch to worker level (L2)",
  kind: "builtin",
  category: "workflow",
  aliases: ["worker"],
  examples: ["/l2 - Switch to worker level"],

  execute: async (_ctx: CommandContext): Promise<CommandResult> => {
    return switchToLevel(AgentLevel.worker);
  },
};

// =============================================================================
// Export All Agent Commands
// =============================================================================

/**
 * All agent-related slash commands for registration.
 */
export const agentSlashCommands: SlashCommand[] = [agentCommand, l0Command, l1Command, l2Command];
