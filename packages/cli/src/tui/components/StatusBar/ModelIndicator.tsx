/**
 * ModelIndicator Component (T035)
 *
 * Displays the current AI provider icon and model name in the status bar.
 * Uses provider-specific icons for visual identification.
 *
 * @module tui/components/StatusBar/ModelIndicator
 */

import { Box, Text } from "ink";
import { useMemo } from "react";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the ModelIndicator component.
 */
export interface ModelIndicatorProps {
  /** AI provider name (e.g., 'anthropic', 'openai', 'google') */
  readonly provider: string;
  /** Model name (e.g., 'claude-3-opus', 'gpt-4') */
  readonly model: string;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Provider icons mapping.
 * Uses Unicode symbols for terminal compatibility.
 */
const PROVIDER_ICONS: Record<string, string> = {
  anthropic: "◈", // Diamond with dot
  openai: "◉", // Circle with fill
  google: "◎", // Circle with ring
  azure: "◇", // Diamond outline
  bedrock: "▣", // Square with fill
  mistral: "◆", // Filled diamond
  ollama: "○", // Circle outline
  default: "●", // Filled circle
};

/**
 * Provider display names mapping.
 */
const PROVIDER_NAMES: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  azure: "Azure",
  bedrock: "Bedrock",
  mistral: "Mistral",
  ollama: "Ollama",
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Gets the icon for a provider.
 * Falls back to default icon for unknown providers.
 */
function getProviderIcon(provider: string): string {
  const normalizedProvider = provider.toLowerCase();
  return PROVIDER_ICONS[normalizedProvider] ?? "●";
}

/**
 * Gets the display name for a provider.
 * Falls back to capitalized provider name for unknown providers.
 */
function getProviderName(provider: string): string {
  const normalizedProvider = provider.toLowerCase();
  return PROVIDER_NAMES[normalizedProvider] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}

/**
 * Truncates model name if too long.
 * Preserves the version suffix if present.
 */
function formatModelName(model: string, maxLength = 25): string {
  if (model.length <= maxLength) {
    return model;
  }

  // Try to preserve version suffix
  const parts = model.split("-");
  if (parts.length > 1) {
    const suffix = parts[parts.length - 1] ?? "";
    const truncated = model.slice(0, maxLength - suffix.length - 4);
    return `${truncated}...${suffix}`;
  }

  return `${model.slice(0, maxLength - 3)}...`;
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * ModelIndicator displays the current AI provider and model.
 *
 * Features:
 * - Provider-specific icon
 * - Provider name
 * - Model name (truncated if too long)
 * - Themed styling
 *
 * @example
 * ```tsx
 * // Anthropic Claude
 * <ModelIndicator provider="anthropic" model="claude-3-opus" />
 *
 * // OpenAI GPT-4
 * <ModelIndicator provider="openai" model="gpt-4-turbo" />
 * ```
 */
export function ModelIndicator({ provider, model }: ModelIndicatorProps): React.JSX.Element {
  const { theme } = useTheme();

  const icon = useMemo(() => getProviderIcon(provider), [provider]);
  const providerName = useMemo(() => getProviderName(provider), [provider]);
  const displayModel = useMemo(() => formatModelName(model), [model]);

  return (
    <Box>
      <Text color={theme.colors.primary}>{icon}</Text>
      <Text color={theme.semantic.text.muted}> </Text>
      <Text color={theme.semantic.text.secondary}>{providerName}</Text>
      <Text color={theme.semantic.text.muted}>/</Text>
      <Text color={theme.semantic.text.primary}>{displayModel}</Text>
    </Box>
  );
}
