/**
 * Model Slash Command (Chain 22)
 *
 * Provides slash commands for AI model management:
 * - /model - Show current model and options
 * - /model <provider>/<model> - Switch to a specific model
 *
 * @module cli/commands/model
 */

import {
  getModelInfo,
  getProviderModels,
  getSupportedProviders,
  type ModelInfo,
} from "@vellum/provider";
import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { error, success } from "./types.js";

// =============================================================================
// Module State
// =============================================================================

/**
 * Current model configuration.
 * Set by the App component when initialized.
 */
interface ModelConfig {
  provider: string;
  model: string;
}

let currentConfig: ModelConfig | null = null;

/**
 * Callback to update model selection.
 */
let onModelChange: ((provider: string, model: string) => void) | null = null;

/**
 * Set the current model configuration.
 *
 * @param provider - Current provider
 * @param model - Current model ID
 * @param onChange - Callback when model changes
 */
export function setModelCommandConfig(
  provider: string,
  model: string,
  onChange?: (provider: string, model: string) => void
): void {
  currentConfig = { provider, model };
  onModelChange = onChange ?? null;
}

/**
 * Get the current model configuration.
 */
export function getModelCommandConfig(): ModelConfig | null {
  return currentConfig;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format context window for display.
 */
function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(0)}K`;
  }
  return `${tokens}`;
}

/**
 * Format price for display.
 */
function formatPrice(pricePer1M: number): string {
  if (pricePer1M === 0) {
    return "Free";
  }
  return `$${pricePer1M.toFixed(2)}/M`;
}

/**
 * Format model info for display.
 */
function formatModelInfo(_provider: string, model: ModelInfo, isCurrent: boolean): string {
  const marker = isCurrent ? " (current)" : "";
  const ctx = formatContextWindow(model.contextWindow);
  const priceIn = formatPrice(model.inputPrice ?? 0);
  const priceOut = formatPrice(model.outputPrice ?? 0);
  return `    ${model.name}${marker} [${ctx} ctx, ${priceIn}/${priceOut}]`;
}

// =============================================================================
// /model Command
// =============================================================================

/**
 * /model command - Display current model and available options.
 *
 * Usage:
 * - /model - Show current model and list all available models
 * - /model <provider>/<model> - Switch to a specific model
 */
export const modelCommand: SlashCommand = {
  name: "model",
  description: "Show or change the current AI model",
  kind: "builtin",
  category: "system",
  aliases: ["models"],
  positionalArgs: [
    {
      name: "model",
      type: "string",
      description: "Model to switch to (format: provider/model-id)",
      required: false,
    },
  ],
  examples: [
    "/model                         - Show current model and options",
    "/model anthropic/claude-sonnet-4-20250514  - Switch to Claude Sonnet 4",
    "/model openai/gpt-4o           - Switch to GPT-4o",
  ],
  // Dynamic subcommands: list all providers for autocomplete
  subcommands: getSupportedProviders().map((provider) => ({
    name: provider,
    description: `${provider} models`,
  })),

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const positional = ctx.parsedArgs.positional as (string | undefined)[];

    let requestedModel: string | undefined;

    if (positional[0] && positional[1]) {
      // Two args: provider and model from autocomplete flow
      requestedModel = `${positional[0]}/${positional[1]}`;
    } else if (positional[0]?.includes("/")) {
      // Single arg with / separator (backwards compatible)
      requestedModel = positional[0];
    } else if (positional[0]) {
      // Provider only - show available models for that provider
      return showProviderModels(positional[0]);
    }

    if (requestedModel) {
      return switchToModel(requestedModel);
    }

    // Show current model and options
    return showModelInfo();
  },
};

/**
 * Show current model and available options.
 */
function showModelInfo(): CommandResult {
  const providers = getSupportedProviders();
  const lines: string[] = ["AI Models", ""];

  // Show current model if configured
  if (currentConfig) {
    const info = getModelInfo(currentConfig.provider, currentConfig.model);
    lines.push(`Current: ${currentConfig.provider}/${info.name}`);
    lines.push(
      `  Context: ${formatContextWindow(info.contextWindow)} | ` +
        `Input: ${formatPrice(info.inputPrice ?? 0)} | ` +
        `Output: ${formatPrice(info.outputPrice ?? 0)}`
    );
    lines.push("");
  } else {
    lines.push("Current: Not configured");
    lines.push("");
  }

  lines.push("Available models:");
  lines.push("");

  // List all providers and their models
  for (const provider of providers) {
    const models = getProviderModels(provider);

    if (models.length === 0) continue;

    lines.push(`  ${provider}`);

    for (const model of models) {
      const isCurrent = currentConfig?.provider === provider && currentConfig?.model === model.id;
      lines.push(formatModelInfo(provider, model, isCurrent));
    }
    lines.push("");
  }

  lines.push("Usage: /model <provider>/<model-id>");

  return success(lines.join("\n"));
}

/**
 * Show available models for a specific provider.
 */
function showProviderModels(provider: string): CommandResult {
  const providers = getSupportedProviders();
  const normalizedProvider = provider.toLowerCase();

  if (!providers.includes(normalizedProvider)) {
    return error("INVALID_ARGUMENT", `Unknown provider: ${provider}`, [
      `Valid providers: ${providers.join(", ")}`,
    ]);
  }

  const models = getProviderModels(normalizedProvider);

  if (models.length === 0) {
    return error("INVALID_ARGUMENT", `No models available for ${provider}`);
  }

  const lines: string[] = [`${provider} Models`, ""];

  for (const model of models) {
    const isCurrent =
      currentConfig?.provider === normalizedProvider && currentConfig?.model === model.id;
    lines.push(formatModelInfo(normalizedProvider, model, isCurrent));
  }

  lines.push("");
  lines.push(`Usage: /model ${provider}/<model-id>`);
  lines.push(`Example: /model ${provider}/${models[0]?.id ?? "model-id"}`);

  return success(lines.join("\n"));
}

/**
 * Switch to a specified model.
 */
function switchToModel(modelSpec: string): CommandResult {
  // Parse provider/model format
  const parts = modelSpec.split("/");
  if (parts.length < 2) {
    return error("INVALID_ARGUMENT", `Invalid model format: ${modelSpec}`, [
      "Expected format: provider/model-id",
      "Example: anthropic/claude-sonnet-4-20250514",
    ]);
  }

  const [provider, ...modelParts] = parts;
  const modelId = modelParts.join("/"); // Handle models with / in name

  if (!provider || !modelId) {
    return error("INVALID_ARGUMENT", `Invalid model format: ${modelSpec}`, [
      "Expected format: provider/model-id",
    ]);
  }

  // Validate provider
  const providers = getSupportedProviders();
  if (!providers.includes(provider.toLowerCase())) {
    return error("INVALID_ARGUMENT", `Unknown provider: ${provider}`, [
      `Valid providers: ${providers.join(", ")}`,
    ]);
  }

  // Get model info (validates model exists or returns default)
  const info = getModelInfo(provider, modelId);

  // Check if already using this model
  if (currentConfig?.provider === provider.toLowerCase() && currentConfig?.model === modelId) {
    return success(`Already using ${info.name}`);
  }

  // Update via callback if available
  if (onModelChange) {
    onModelChange(provider.toLowerCase(), modelId);
    return success(
      `Switched to ${info.name}\n` +
        `  Context: ${formatContextWindow(info.contextWindow)} | ` +
        `Input: ${formatPrice(info.inputPrice ?? 0)} | ` +
        `Output: ${formatPrice(info.outputPrice ?? 0)}`
    );
  }

  // No callback - just report what would happen
  return success(`Would switch to ${info.name}\n(Model system not fully initialized)`);
}

// =============================================================================
// Exports
// =============================================================================

export default modelCommand;
