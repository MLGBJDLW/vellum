/**
 * ModelStatusBar Component
 *
 * Compact status bar showing provider health with circuit breaker states.
 * Uses ASCII-only indicators for terminal compatibility.
 *
 * Display format: `[*] claude | [.] gpt-4 | [x] gemini`
 * - [*] = active provider
 * - [.] = healthy (CLOSED circuit)
 * - [x] = unhealthy (OPEN circuit)
 * - [?] = half-open (testing recovery)
 *
 * @module tui/components/Status/ModelStatusBar
 */

import { Box, Text } from "ink";
import { useMemo } from "react";
import type { CircuitState, ProviderStatusEntry } from "../../hooks/useProviderStatus.js";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for ModelStatusBar component.
 */
export interface ModelStatusBarProps {
  /** Array of provider status entries to display */
  readonly providers: readonly ProviderStatusEntry[];
  /** Maximum number of providers to show (0 = show all) */
  readonly maxVisible?: number;
  /** Show provider names instead of IDs */
  readonly showNames?: boolean;
  /** Compact mode - shorter provider identifiers */
  readonly compact?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Status indicators (ASCII only, no emoji) */
const STATUS_INDICATORS: Record<CircuitState | "active", string> = {
  active: "[*]", // Active provider
  CLOSED: "[.]", // Healthy
  OPEN: "[x]", // Unhealthy
  HALF_OPEN: "[?]", // Testing recovery
};

/** Separator between provider entries */
const SEPARATOR = " | ";

/** Provider ID abbreviations for compact display */
const PROVIDER_ABBREVIATIONS: Record<string, string> = {
  anthropic: "claude",
  openai: "gpt",
  google: "gemini",
  deepseek: "ds",
  qwen: "qwen",
  groq: "groq",
  xai: "grok",
  openrouter: "or",
  ollama: "local",
  lmstudio: "lms",
  zhipu: "glm",
  moonshot: "moon",
  mistral: "mist",
  yi: "yi",
  baichuan: "bc",
  copilot: "copilot",
  minimax: "mm",
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the status indicator for a provider entry.
 */
function getStatusIndicator(entry: ProviderStatusEntry): string {
  if (entry.isActive) {
    return STATUS_INDICATORS.active;
  }
  return STATUS_INDICATORS[entry.circuitState];
}

/**
 * Get abbreviated provider name for compact display.
 */
function getProviderAbbreviation(id: string): string {
  const lowerId = id.toLowerCase();
  return PROVIDER_ABBREVIATIONS[lowerId] ?? id.slice(0, 4);
}

/**
 * Get display label for a provider.
 */
function getProviderLabel(
  entry: ProviderStatusEntry,
  showNames: boolean,
  compact: boolean
): string {
  if (showNames) {
    return compact ? entry.name.slice(0, 8) : entry.name;
  }
  return compact ? getProviderAbbreviation(entry.id) : entry.id;
}

// =============================================================================
// Component
// =============================================================================

/**
 * ModelStatusBar displays provider health status in a compact format.
 *
 * @example
 * ```tsx
 * <ModelStatusBar
 *   providers={[
 *     { id: 'anthropic', name: 'Claude', circuitState: 'CLOSED', isActive: true, failureCount: 0, timeUntilReset: 0 },
 *     { id: 'openai', name: 'GPT-4', circuitState: 'CLOSED', isActive: false, failureCount: 0, timeUntilReset: 0 },
 *     { id: 'google', name: 'Gemini', circuitState: 'OPEN', isActive: false, failureCount: 3, timeUntilReset: 15000 },
 *   ]}
 * />
 * // Renders: [*] claude | [.] gpt | [x] gemini
 * ```
 */
export function ModelStatusBar({
  providers,
  maxVisible = 0,
  showNames = false,
  compact = true,
}: ModelStatusBarProps): React.ReactElement | null {
  const { theme } = useTheme();

  // Filter and limit providers to display
  const visibleProviders = useMemo(() => {
    if (providers.length === 0) return [];

    // Sort: active first, then by circuit state (CLOSED > HALF_OPEN > OPEN)
    const sorted = [...providers].sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;

      const stateOrder: Record<CircuitState, number> = {
        CLOSED: 0,
        HALF_OPEN: 1,
        OPEN: 2,
      };
      return stateOrder[a.circuitState] - stateOrder[b.circuitState];
    });

    return maxVisible > 0 ? sorted.slice(0, maxVisible) : sorted;
  }, [providers, maxVisible]);

  // Don't render if no providers
  if (visibleProviders.length === 0) {
    return null;
  }

  // Get color for circuit state
  const getStateColor = (entry: ProviderStatusEntry): string => {
    if (entry.isActive) {
      return theme.brand.primary;
    }
    switch (entry.circuitState) {
      case "CLOSED":
        return theme.colors.success;
      case "OPEN":
        return theme.colors.error;
      case "HALF_OPEN":
        return theme.colors.warning;
    }
  };

  // Overflow indicator if some providers are hidden
  const hiddenCount = providers.length - visibleProviders.length;

  return (
    <Box flexDirection="row">
      {visibleProviders.map((entry, index) => {
        const indicator = getStatusIndicator(entry);
        const label = getProviderLabel(entry, showNames, compact);
        const color = getStateColor(entry);

        return (
          <Text key={entry.id}>
            {index > 0 && <Text color={theme.semantic.border.muted}>{SEPARATOR}</Text>}
            <Text color={color} bold={entry.isActive}>
              {indicator}
            </Text>
            <Text color={color} dimColor={!entry.isActive}>
              {" "}
              {label}
            </Text>
          </Text>
        );
      })}
      {hiddenCount > 0 && (
        <Text color={theme.semantic.text.muted}>
          {SEPARATOR}+{hiddenCount}
        </Text>
      )}
    </Box>
  );
}

// =============================================================================
// Compact Variant
// =============================================================================

/**
 * Props for ModelStatusBarCompact component.
 */
export interface ModelStatusBarCompactProps {
  /** Array of provider status entries */
  readonly providers: readonly ProviderStatusEntry[];
}

/**
 * Ultra-compact variant showing only indicators without labels.
 * Format: `[*][.][x]` - suitable for very narrow terminals.
 *
 * @example
 * ```tsx
 * <ModelStatusBarCompact providers={providers} />
 * // Renders: [*][.][x]
 * ```
 */
export function ModelStatusBarCompact({
  providers,
}: ModelStatusBarCompactProps): React.ReactElement | null {
  const { theme } = useTheme();

  if (providers.length === 0) {
    return null;
  }

  // Sort: active first, then by ID
  const sorted = [...providers].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  return (
    <Box flexDirection="row">
      {sorted.map((entry) => {
        const indicator = getStatusIndicator(entry);

        let color: string;
        if (entry.isActive) {
          color = theme.brand.primary;
        } else if (entry.circuitState === "CLOSED") {
          color = theme.colors.success;
        } else if (entry.circuitState === "OPEN") {
          color = theme.colors.error;
        } else {
          color = theme.colors.warning;
        }

        return (
          <Text key={entry.id} color={color} bold={entry.isActive}>
            {indicator}
          </Text>
        );
      })}
    </Box>
  );
}
