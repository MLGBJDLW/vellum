/**
 * Cost Slash Command (Phase 35)
 *
 * Provides the /cost command for displaying session cost information.
 *
 * @module cli/commands/cost
 */

import type { CostService, ModelUsage, ProviderUsage } from "@vellum/core";
import { formatCost, formatCostBreakdown, formatTokenCount } from "@vellum/core";
import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { error, success } from "./types.js";

// =============================================================================
// Module State
// =============================================================================

/**
 * Reference to the active CostService instance.
 * Set by the App component when initialized.
 */
let costService: CostService | null = null;

/**
 * Set the CostService instance for cost commands.
 * Called by the App component during initialization.
 *
 * @param service - The CostService instance to use
 */
export function setCostCommandsService(service: CostService | null): void {
  costService = service;
}

/**
 * Get the current CostService instance.
 * Returns null if not yet initialized.
 */
export function getCostCommandsService(): CostService | null {
  return costService;
}

// =============================================================================
// /cost Command
// =============================================================================

/**
 * /cost command - Display session cost information.
 *
 * Shows current session's token usage and cost breakdown.
 * Without a CostService, shows a placeholder indicating
 * cost tracking is not initialized.
 */
export const costCommand: SlashCommand = {
  name: "cost",
  description: "Show session cost breakdown",
  kind: "builtin",
  category: "system",
  aliases: ["costs", "usage"],
  positionalArgs: [
    {
      name: "format",
      type: "string",
      description: "Output format: brief, full, json",
      required: false,
    },
  ],
  examples: [
    "/cost         - Show brief cost summary",
    "/cost full    - Show detailed breakdown",
    "/cost json    - Output as JSON",
  ],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const format = (ctx.parsedArgs.positional[0] as string | undefined) ?? "brief";

    if (!costService) {
      return error("RESOURCE_NOT_FOUND", "Cost tracking not initialized. Start a session first.");
    }

    const sessionCost = costService.getSessionCost();
    const inputTokens = costService.totalInputTokens;
    const outputTokens = costService.totalOutputTokens;
    const requestCount = costService.requestCount;

    // JSON output
    if (format === "json") {
      const summary = costService.getSessionSummary();
      return success(JSON.stringify(summary, null, 2));
    }

    // Brief output (default)
    if (format === "brief" || format !== "full") {
      const totalTokens = inputTokens + outputTokens;
      const lines = [
        "💰 Session Cost",
        "",
        `  Requests: ${requestCount}`,
        `  Tokens:   ${formatTokenCount(totalTokens)} (${formatTokenCount(inputTokens)} in / ${formatTokenCount(outputTokens)} out)`,
        `  Cost:     ${formatCost(sessionCost.total)}`,
        "",
        "Use /cost full for detailed breakdown.",
      ];
      return success(lines.join("\n"));
    }

    // Full output
    const summary = costService.getSessionSummary();
    const lines = [
      "💰 Session Cost Details",
      "",
      "─── Token Usage ───",
      `  Input:     ${formatTokenCount(inputTokens)}`,
      `  Output:    ${formatTokenCount(outputTokens)}`,
    ];

    if (summary.totalCacheReadTokens > 0) {
      lines.push(`  Cache (R): ${formatTokenCount(summary.totalCacheReadTokens)}`);
    }
    if (summary.totalCacheWriteTokens > 0) {
      lines.push(`  Cache (W): ${formatTokenCount(summary.totalCacheWriteTokens)}`);
    }
    if (summary.totalReasoningTokens > 0) {
      lines.push(`  Reasoning: ${formatTokenCount(summary.totalReasoningTokens)}`);
    }

    lines.push("");
    lines.push("─── Cost Breakdown ───");
    lines.push(formatCostBreakdown(sessionCost));

    // By provider
    const providers = Object.entries(summary.byProvider) as [string, ProviderUsage][];
    if (providers.length > 0) {
      lines.push("");
      lines.push("─── By Provider ───");
      for (const [provider, usage] of providers) {
        lines.push(`  ${provider}: ${formatCost(usage.cost)} (${usage.requests} requests)`);
      }
    }

    // By model
    const models = Object.entries(summary.byModel) as [string, ModelUsage][];
    if (models.length > 0) {
      lines.push("");
      lines.push("─── By Model ───");
      for (const [model, usage] of models) {
        lines.push(`  ${model}: ${formatCost(usage.cost)} (${usage.requests} requests)`);
      }
    }

    return success(lines.join("\n"));
  },
};

/**
 * /cost reset command - Reset session cost tracking.
 */
export const costResetCommand: SlashCommand = {
  name: "cost-reset",
  description: "Reset session cost tracking",
  kind: "builtin",
  category: "system",
  aliases: ["reset-cost"],
  examples: ["/cost-reset  - Clear session cost data"],

  execute: async (_ctx: CommandContext): Promise<CommandResult> => {
    if (!costService) {
      return error("RESOURCE_NOT_FOUND", "Cost tracking not initialized.");
    }

    costService.reset();
    return success("✅ Session cost tracking reset.");
  },
};

// =============================================================================
// Export
// =============================================================================

export default costCommand;
