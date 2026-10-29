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
  getModelReplacement,
  getProviderModels,
  getSupportedProviders,
  type ModelInfo,
  ProviderRegistry,
  type ProviderType,
  updateDiscoveredModels,
} from "@vellum/provider";
import { authSet } from "./auth.js";
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
let onModelChange: ((provider: string, model: string) => void | Promise<void>) | null = null;

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
  onChange?: (provider: string, model: string) => void | Promise<void>
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
function formatPrice(pricePer1M: number | undefined): string {
  if (pricePer1M === undefined) return "Unknown";
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
  const priceIn = formatPrice(model.inputPrice);
  const priceOut = formatPrice(model.outputPrice);
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
    "/model anthropic/claude-opus-4-7 - Switch to Claude Opus 4.7",
    "/model openai/gpt-6.1-sol       - Switch to GPT-6.1 Sol",
    "/model refresh openrouter      - Discover current models from the provider",
  ],
  // Dynamic subcommands: list all providers for autocomplete
  subcommands: [
    { name: "refresh", description: "Refresh models from a provider" },
    ...getSupportedProviders().map((provider) => ({
      name: provider,
      description: `${provider} models`,
    })),
  ],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const positional = ctx.parsedArgs.positional as (string | undefined)[];
    if (positional[0] === "refresh")
      return refreshModels(positional[1] ?? currentConfig?.provider, ctx);

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
      return switchToModel(requestedModel, ctx.credentials);
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
        `Input: ${formatPrice(info.inputPrice)} | ` +
        `Output: ${formatPrice(info.outputPrice)}`
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
export async function switchToModel(
  modelSpec: string,
  credentials: CommandContext["credentials"]
): Promise<CommandResult> {
  // Parse provider/model format
  const parts = modelSpec.split("/");
  if (parts.length < 2) {
    return error("INVALID_ARGUMENT", `Invalid model format: ${modelSpec}`, [
      "Expected format: provider/model-id",
      "Example: anthropic/claude-sonnet-4-6",
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

  const normalizedProvider = provider.toLowerCase();
  const replacement = getModelReplacement(normalizedProvider, modelId);
  if (replacement)
    return error("INVALID_ARGUMENT", `${modelId} has been retired by ${normalizedProvider}.`, [
      `/model ${normalizedProvider}/${replacement}`,
    ]);
  const info = getModelInfo(normalizedProvider, modelId);

  // Resolve through the same stores used for inference before claiming selection succeeded.
  // Local servers are allowed without a secret; remote credentials are checked locally only.
  if (normalizedProvider !== "ollama" && normalizedProvider !== "lmstudio") {
    const resolved = await credentials.resolve(normalizedProvider).catch(() => null);
    if (!resolved?.ok) {
      return error("INTERNAL_ERROR", `Unable to read credentials for ${normalizedProvider}.`, [
        `/auth set ${normalizedProvider}`,
      ]);
    }
    if (!resolved.value?.value.trim()) {
      const setup = await authSet(credentials, normalizedProvider);
      if (setup.kind !== "interactive") return setup;
      const saveCredential = setup.prompt.handler;
      return {
        ...setup,
        prompt: {
          ...setup.prompt,
          helpText: `No local API key found for ${normalizedProvider}. Save a key to use ${info.name}.`,
          handler: async (value) => {
            const saved = await saveCredential(value);
            if (saved.kind !== "success") return saved;
            return switchToModel(modelSpec, credentials);
          },
        },
      };
    }
  }

  // Check if already using this model
  if (currentConfig?.provider === provider.toLowerCase() && currentConfig?.model === modelId) {
    return success(`Already using ${info.name}`);
  }

  // Update via callback if available
  if (onModelChange) {
    try {
      await onModelChange(normalizedProvider, modelId);
      currentConfig = { provider: normalizedProvider, model: modelId };
    } catch (cause) {
      return error(
        "INTERNAL_ERROR",
        cause instanceof Error ? cause.message : "Unable to switch models."
      );
    }
    return success(
      `Switched to ${info.name}\n` +
        `  Context: ${formatContextWindow(info.contextWindow)} | ` +
        `Input: ${formatPrice(info.inputPrice)} | ` +
        `Output: ${formatPrice(info.outputPrice)}`
    );
  }

  // No callback - just report what would happen
  return success(`Would switch to ${info.name}\n(Model system not fully initialized)`);
}

// =============================================================================
// Exports
// =============================================================================

export default modelCommand;

async function refreshModels(
  provider: string | undefined,
  ctx: CommandContext
): Promise<CommandResult> {
  const type = provider?.toLowerCase();
  if (!type || !getSupportedProviders().includes(type))
    return error("INVALID_ARGUMENT", "Choose a provider: /model refresh <provider>");
  try {
    const registry = new ProviderRegistry({
      credentialManager: ctx.credentials,
      enableCache: false,
    });
    const instance = await registry.get({ type: type as ProviderType });
    if (!instance.refreshModels)
      return error("INTERNAL_ERROR", `${type} does not expose model discovery.`);
    const models = await instance.refreshModels();
    updateDiscoveredModels(type as ProviderType, models);
    return success(
      `Refreshed ${models.length} models from ${type}. Use /model ${type} to select one. Availability does not verify inference access or billing.`
    );
  } catch {
    // Provider errors may include request details. Keep credentials out of UI logs.
    return error(
      "INTERNAL_ERROR",
      `Could not refresh ${type} models. Check the provider connection and API key; the previous catalog is retained.`,
      [`/auth set ${type}`, `/model ${type}`]
    );
  }
}
