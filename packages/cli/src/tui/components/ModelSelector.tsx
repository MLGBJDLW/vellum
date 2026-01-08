/**
 * ModelSelector Component (Chain 22)
 *
 * TUI component for selecting AI models with keyboard navigation.
 * Similar to ModeSelector but for model selection.
 *
 * @module tui/components/ModelSelector
 */

import { getIcons } from "@vellum/shared";
import { Box, Text, useInput } from "ink";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import {
  getProviderModels,
  getSupportedProviders,
  type ModelMetadata,
} from "../../utils/model-info.js";
import { useTUITranslation } from "../i18n/index.js";
import { useTheme } from "../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the ModelSelector component.
 */
export interface ModelSelectorProps {
  /** Currently selected model ID */
  readonly currentModel: string;
  /** Currently selected provider */
  readonly currentProvider: string;
  /** Callback when a model is selected */
  readonly onSelect: (provider: string, model: string) => void;
  /** Whether the selector is focused/active */
  readonly isActive?: boolean;
  /** Whether to show model details (context window, pricing) */
  readonly showDetails?: boolean;
  /** Filter to specific providers (optional) */
  readonly providers?: readonly string[];
}

/**
 * Internal type for flattened model list with provider info.
 */
interface ModelOption {
  provider: string;
  model: ModelMetadata;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Provider display names and icons.
 */
const PROVIDER_INFO: Record<string, { name: string; icon: string }> = {
  anthropic: { name: "Anthropic", icon: "[A]" },
  openai: { name: "OpenAI", icon: "[O]" },
  google: { name: "Google", icon: "[G]" },
  copilot: { name: "GitHub Copilot", icon: "[C]" },
  deepseek: { name: "DeepSeek", icon: "[D]" },
  groq: { name: "Groq", icon: "[Q]" },
  xai: { name: "xAI", icon: "[X]" },
  qwen: { name: "Qwen", icon: "[W]" },
  ollama: { name: "Ollama", icon: "[L]" },
  lmstudio: { name: "LM Studio", icon: "[S]" },
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format context window size for display.
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
 * Get provider info with fallback.
 */
function getProviderInfo(provider: string): { name: string; icon: string } {
  return (
    PROVIDER_INFO[provider.toLowerCase()] ?? {
      name: provider,
      icon: "📦",
    }
  );
}

// =============================================================================
// ModelSelector Component
// =============================================================================

/**
 * ModelSelector - Interactive component for selecting AI models.
 *
 * Features:
 * - Arrow key navigation (up/down or j/k)
 * - Enter to confirm selection
 * - Visual indication of current model
 * - Shows model details (context window, pricing)
 * - Groups by provider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const [provider, setProvider] = useState('anthropic');
 *   const [model, setModel] = useState('claude-sonnet-4-20250514');
 *
 *   return (
 *     <ModelSelector
 *       currentProvider={provider}
 *       currentModel={model}
 *       onSelect={(p, m) => {
 *         setProvider(p);
 *         setModel(m);
 *       }}
 *       isActive
 *     />
 *   );
 * }
 * ```
 */
export function ModelSelector({
  currentModel,
  currentProvider,
  onSelect,
  isActive = true,
  showDetails = true,
  providers,
}: ModelSelectorProps): React.ReactElement {
  const { theme } = useTheme();
  const { t } = useTUITranslation();
  const icons = getIcons();

  // Build flattened list of model options
  const modelOptions = useMemo<ModelOption[]>(() => {
    const providerList = providers ?? getSupportedProviders();
    const options: ModelOption[] = [];

    for (const provider of providerList) {
      const models = getProviderModels(provider);
      for (const model of models) {
        options.push({ provider, model });
      }
    }

    return options;
  }, [providers]);

  // Find current index
  const currentIndex = useMemo(() => {
    return modelOptions.findIndex(
      (opt) => opt.provider === currentProvider && opt.model.id === currentModel
    );
  }, [modelOptions, currentProvider, currentModel]);

  // Track focused index for keyboard navigation
  const [focusedIndex, setFocusedIndex] = useState(() => (currentIndex >= 0 ? currentIndex : 0));

  // Handle keyboard input
  useInput(
    useCallback(
      (input: string, key) => {
        if (!isActive || modelOptions.length === 0) return;

        // Arrow navigation
        if (key.upArrow || input === "k") {
          setFocusedIndex((prev) => (prev > 0 ? prev - 1 : modelOptions.length - 1));
          return;
        }

        if (key.downArrow || input === "j") {
          setFocusedIndex((prev) => (prev < modelOptions.length - 1 ? prev + 1 : 0));
          return;
        }

        // Confirm selection
        if (key.return) {
          const selected = modelOptions[focusedIndex];
          if (selected) {
            onSelect(selected.provider, selected.model.id);
          }
        }
      },
      [isActive, focusedIndex, modelOptions, onSelect]
    ),
    { isActive }
  );

  // Group models by provider for display
  const groupedByProvider = useMemo(() => {
    const groups = new Map<string, { options: ModelOption[]; startIndex: number }>();
    let index = 0;

    for (const option of modelOptions) {
      const existing = groups.get(option.provider);
      if (existing) {
        existing.options.push(option);
      } else {
        groups.set(option.provider, {
          options: [option],
          startIndex: index,
        });
      }
      index++;
    }

    return groups;
  }, [modelOptions]);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold>{t("modelSelector.title")}</Text>
      </Box>

      {Array.from(groupedByProvider.entries()).map(([provider, { options, startIndex }]) => {
        const providerInfo = getProviderInfo(provider);

        return (
          <Box key={provider} flexDirection="column" marginBottom={1}>
            {/* Provider header */}
            <Box>
              <Text color={theme.colors.primary} bold>
                {providerInfo.icon} {providerInfo.name}
              </Text>
            </Box>

            {/* Models in this provider */}
            {options.map((opt, idx) => {
              const globalIndex = startIndex + idx;
              const isFocused = globalIndex === focusedIndex && isActive;
              const isCurrent = opt.provider === currentProvider && opt.model.id === currentModel;

              return (
                <Box key={opt.model.id} flexDirection="column" marginLeft={2}>
                  <Box>
                    {/* Focus indicator */}
                    <Text color={isFocused ? theme.colors.info : undefined}>
                      {isFocused ? "❯ " : "  "}
                    </Text>

                    {/* Model name */}
                    <Text color={isCurrent ? theme.colors.success : undefined} bold={isCurrent}>
                      {opt.model.name}
                    </Text>

                    {/* Current indicator */}
                    {isCurrent && (
                      <Text color={theme.semantic.text.muted}> {t("modeSelector.current")}</Text>
                    )}
                  </Box>

                  {/* Details (when enabled and focused) */}
                  {showDetails && isFocused && (
                    <Box marginLeft={4}>
                      <Text dimColor>
                        {icons.context} {formatContextWindow(opt.model.contextWindow)} ctx •{" "}
                        {formatPrice(opt.model.inputPricePer1M)} in •{" "}
                        {formatPrice(opt.model.outputPricePer1M)} out
                      </Text>
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        );
      })}

      {/* Help text */}
      <Box marginTop={1}>
        <Text dimColor>{t("modelSelector.keybindings")}</Text>
      </Box>
    </Box>
  );
}

// =============================================================================
// Exports
// =============================================================================

export default ModelSelector;
