/**
 * StatusBar Component (T034)
 *
 * Container component that renders all status indicators in a horizontal row.
 * Displays model info, token usage, trust mode, and thinking mode status.
 *
 * @module tui/components/StatusBar/StatusBar
 */

import { Box, Text } from "ink";
import { useTheme } from "../../theme/index.js";
import { ModelIndicator, type ModelIndicatorProps } from "./ModelIndicator.js";
import { ThinkingModeIndicator, type ThinkingModeIndicatorProps } from "./ThinkingModeIndicator.js";
import { TokenCounter, type TokenCounterProps } from "./TokenCounter.js";
import { TrustModeIndicator, type TrustModeIndicatorProps } from "./TrustModeIndicator.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the StatusBar component.
 */
export interface StatusBarProps {
  /** Model information */
  readonly model?: ModelIndicatorProps;
  /** Token usage information */
  readonly tokens?: TokenCounterProps;
  /** Trust mode setting */
  readonly trustMode?: TrustModeIndicatorProps["mode"];
  /** Thinking mode status */
  readonly thinking?: ThinkingModeIndicatorProps;
  /** Whether to show a border */
  readonly showBorder?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Separator between status items */
const SEPARATOR = " │ ";

// =============================================================================
// Main Component
// =============================================================================

/**
 * StatusBar displays all status indicators in a horizontal layout.
 *
 * Features:
 * - Model and provider information
 * - Token usage with color-coded warnings
 * - Trust mode indicator
 * - Thinking mode status with budget
 * - Optional border styling
 * - Flexible layout with separators
 *
 * @example
 * ```tsx
 * // Full status bar
 * <StatusBar
 *   model={{ provider: "anthropic", model: "claude-3-opus" }}
 *   tokens={{ current: 5000, max: 100000 }}
 *   trustMode="auto"
 *   thinking={{ active: true, budget: 10000, used: 2500 }}
 * />
 *
 * // Minimal status bar
 * <StatusBar
 *   model={{ provider: "openai", model: "gpt-4" }}
 * />
 * ```
 */
export function StatusBar({
  model,
  tokens,
  trustMode,
  thinking,
  showBorder = false,
}: StatusBarProps): React.JSX.Element {
  const { theme } = useTheme();

  // Collect active indicators
  const indicators: React.ReactNode[] = [];

  if (model) {
    indicators.push(<ModelIndicator key="model" provider={model.provider} model={model.model} />);
  }

  if (tokens) {
    indicators.push(<TokenCounter key="tokens" current={tokens.current} max={tokens.max} />);
  }

  if (trustMode) {
    indicators.push(<TrustModeIndicator key="trust" mode={trustMode} />);
  }

  if (thinking) {
    indicators.push(
      <ThinkingModeIndicator
        key="thinking"
        active={thinking.active}
        budget={thinking.budget}
        used={thinking.used}
      />
    );
  }

  // Render indicators with separators
  const renderedItems: React.ReactNode[] = [];
  for (let i = 0; i < indicators.length; i++) {
    if (i > 0) {
      renderedItems.push(
        <Text key={`sep-${i}`} color={theme.semantic.border.muted}>
          {SEPARATOR}
        </Text>
      );
    }
    renderedItems.push(indicators[i]);
  }

  // Empty state
  if (indicators.length === 0) {
    return (
      <Box>
        <Text color={theme.semantic.text.muted}>No status information</Text>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="row"
      paddingX={showBorder ? 1 : 0}
      borderStyle={showBorder ? "round" : undefined}
      borderColor={showBorder ? theme.semantic.border.default : undefined}
    >
      {renderedItems}
    </Box>
  );
}
