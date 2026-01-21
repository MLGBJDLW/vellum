/**
 * Usage Command
 *
 * Display detailed token usage and cost breakdown for the current session.
 * Inspired by Aider's /tokens command.
 *
 * Usage:
 * - /usage - Show session token breakdown and costs
 * - /usage json - Output as JSON
 *
 * @module cli/commands/usage
 */

import { formatCost, formatTokenCount } from "@vellum/core";
import { getCostCommandsService } from "./cost.js";
import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { error, success } from "./types.js";

// =============================================================================
// Helpers
// =============================================================================

/**
 * Calculate estimated cost for tokens.
 */
function estimateCost(tokens: number, pricePerMillion: number): number {
  return (tokens / 1_000_000) * pricePerMillion;
}

/**
 * Format a visual bar for percentage.
 */
function formatBar(percentage: number, width = 20): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return "▓".repeat(filled) + "░".repeat(empty);
}

// =============================================================================
// Command Definition
// =============================================================================

/**
 * /usage command - Display token usage and cost breakdown.
 *
 * Shows detailed breakdown of:
 * - System prompt tokens
 * - Conversation history tokens
 * - File context tokens
 * - Current turn tokens
 * - Estimated costs
 */
export const usageCommand: SlashCommand = {
  name: "usage",
  description: "Show detailed token usage and cost breakdown",
  kind: "builtin",
  category: "system",
  aliases: ["tokens", "u"],
  positionalArgs: [
    {
      name: "format",
      type: "string",
      description: "Output format: default, json",
      required: false,
    },
  ],
  examples: [
    "/usage       - Show token breakdown",
    "/tokens      - Alias for /usage",
    "/usage json  - Output as JSON",
  ],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const format = (ctx.parsedArgs.positional[0] as string | undefined) ?? "default";
    const costService = getCostCommandsService();

    if (!costService) {
      return error(
        "RESOURCE_NOT_FOUND",
        "Usage tracking not available. Start a conversation first.",
        ["/cost - Alternative command for basic cost info"]
      );
    }

    const summary = costService.getSessionSummary();
    const sessionCost = costService.getSessionCost();

    // JSON format
    if (format === "json") {
      const data = {
        session: {
          requests: summary.totalRequests,
          inputTokens: summary.totalInputTokens,
          outputTokens: summary.totalOutputTokens,
          cacheReadTokens: summary.totalCacheReadTokens,
          cacheWriteTokens: summary.totalCacheWriteTokens,
          reasoningTokens: summary.totalReasoningTokens,
          totalTokens: summary.totalInputTokens + summary.totalOutputTokens,
        },
        cost: {
          input: sessionCost.input,
          output: sessionCost.output,
          cacheRead: sessionCost.cacheRead,
          cacheWrite: sessionCost.cacheWrite,
          reasoning: sessionCost.reasoning,
          total: sessionCost.total,
        },
        byProvider: summary.byProvider,
        byModel: summary.byModel,
      };
      return success(JSON.stringify(data, null, 2));
    }

    // Default formatted output
    const totalTokens = summary.totalInputTokens + summary.totalOutputTokens;
    const lines: string[] = [];

    lines.push("📊 Token Usage Breakdown");
    lines.push("");

    // Token counts with visual bars
    lines.push("─── Tokens ───");
    const maxTokens = Math.max(summary.totalInputTokens, summary.totalOutputTokens, 1);

    const inputPct = Math.round((summary.totalInputTokens / maxTokens) * 100);
    const outputPct = Math.round((summary.totalOutputTokens / maxTokens) * 100);

    lines.push(
      `  Input:    ${formatBar(inputPct, 15)} ${formatTokenCount(summary.totalInputTokens)}`
    );
    lines.push(
      `  Output:   ${formatBar(outputPct, 15)} ${formatTokenCount(summary.totalOutputTokens)}`
    );

    if (summary.totalCacheReadTokens > 0) {
      const cachePct = Math.round((summary.totalCacheReadTokens / maxTokens) * 100);
      lines.push(
        `  Cache(R): ${formatBar(cachePct, 15)} ${formatTokenCount(summary.totalCacheReadTokens)}`
      );
    }
    if (summary.totalCacheWriteTokens > 0) {
      const cachePct = Math.round((summary.totalCacheWriteTokens / maxTokens) * 100);
      lines.push(
        `  Cache(W): ${formatBar(cachePct, 15)} ${formatTokenCount(summary.totalCacheWriteTokens)}`
      );
    }
    if (summary.totalReasoningTokens > 0) {
      const reasonPct = Math.round((summary.totalReasoningTokens / maxTokens) * 100);
      lines.push(
        `  Reason:   ${formatBar(reasonPct, 15)} ${formatTokenCount(summary.totalReasoningTokens)}`
      );
    }

    lines.push(`  ─────────────────────────────────`);
    lines.push(`  Total:    ${" ".repeat(15)} ${formatTokenCount(totalTokens)}`);
    lines.push("");

    // Cost breakdown
    lines.push("─── Cost Breakdown ───");
    if (sessionCost.input > 0) {
      lines.push(`  Input:    ${formatCost(sessionCost.input)}`);
    }
    if (sessionCost.output > 0) {
      lines.push(`  Output:   ${formatCost(sessionCost.output)}`);
    }
    if (sessionCost.cacheRead > 0) {
      lines.push(`  Cache(R): ${formatCost(sessionCost.cacheRead)} (90% savings)`);
    }
    if (sessionCost.cacheWrite > 0) {
      lines.push(`  Cache(W): ${formatCost(sessionCost.cacheWrite)}`);
    }
    if (sessionCost.reasoning > 0) {
      lines.push(`  Reason:   ${formatCost(sessionCost.reasoning)}`);
    }
    lines.push(`  ─────────────────────────────────`);
    lines.push(`  Total:    ${formatCost(sessionCost.total)}`);
    lines.push("");

    // By model (if multiple)
    const models = Object.entries(summary.byModel);
    if (models.length > 1) {
      lines.push("─── By Model ───");
      for (const [model, usage] of models) {
        const modelTokens = usage.inputTokens + usage.outputTokens;
        lines.push(
          `  ${model}: ${formatTokenCount(modelTokens)} (${formatCost(usage.cost)}) - ${usage.requests} req`
        );
      }
      lines.push("");
    }

    // Session stats
    lines.push("─── Session Stats ───");
    lines.push(`  Requests: ${summary.totalRequests}`);

    // Cost efficiency tip
    if (summary.totalCacheReadTokens > 0) {
      const savedCost = estimateCost(summary.totalCacheReadTokens, 2.7); // ~90% savings
      lines.push(`  Cache savings: ~${formatCost(savedCost)}`);
    }

    lines.push("");
    lines.push("💡 Tip: Use /cost for a quick summary, /usage for detailed breakdown");

    return success(lines.join("\n"), {
      totalTokens,
      cost: sessionCost.total,
      requests: summary.totalRequests,
    });
  },
};

export default usageCommand;
