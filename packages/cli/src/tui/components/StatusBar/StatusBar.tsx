/**
 * StatusBar Component (T034)
 *
 * Container component that renders all status indicators in a horizontal row.
 * Unified Footer layout: modes | model | context+cost
 *
 * @module tui/components/StatusBar/StatusBar
 */

import type { CodingMode } from "@vellum/core";
import { Box, Text } from "ink";
import { useTUITranslation } from "../../i18n/index.js";
import { useTheme } from "../../theme/index.js";
import { ContextProgress, type ContextProgressProps } from "./ContextProgress.js";
import { ModelIndicator } from "./ModelIndicator.js";
import { ThinkingModeIndicator, type ThinkingModeIndicatorProps } from "./ThinkingModeIndicator.js";
import { TrustModeIndicator, type TrustModeIndicatorProps } from "./TrustModeIndicator.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the StatusBar component.
 */
export interface StatusBarProps {
  /** Current coding mode */
  readonly mode?: CodingMode;
  /** Model name (e.g., 'claude-sonnet-4') */
  readonly modelName?: string;
  /** Token usage information (displayed with visual progress bar) */
  readonly tokens?: ContextProgressProps;
  /** Trust mode setting */
  readonly trustMode?: TrustModeIndicatorProps["mode"];
  /** Thinking mode status */
  readonly thinking?: ThinkingModeIndicatorProps;
  /** Current cost in dollars */
  readonly cost?: number;
  /** Whether to show a border (default: false for unified footer) */
  readonly showBorder?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Separator between status items */
const SEPARATOR = " │ ";

/** Goldenrod brand color */
const BRAND_COLOR = "#DAA520";

/** Mode display configuration */
const MODES_CONFIG: Array<{ mode: CodingMode; icon: string; label: string }> = [
  { mode: "vibe", icon: "◐", label: "vibe" },
  { mode: "plan", icon: "◇", label: "Think" },
  { mode: "spec", icon: "◈", label: "Orch" },
];

// =============================================================================
// Main Component
// =============================================================================

/**
 * Format cost as currency string.
 */
function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  if (cost < 1) {
    return `$${cost.toFixed(2)}`;
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * StatusBar displays all status indicators in a horizontal layout.
 *
 * Unified Footer Layout:
 * ```
 * ◐ vibe  ◇ Think  ◈ Orch │ claude-sonnet │ ▓▓▓░░ 45% │ $0.02
 * ```
 *
 * Features:
 * - All modes shown with active one highlighted
 * - Model name only (no provider prefix)
 * - Context progress with visual bar
 * - Cost display
 *
 * @example
 * ```tsx
 * <StatusBar
 *   mode="vibe"
 *   modelName="claude-sonnet-4"
 *   tokens={{ current: 5000, max: 100000 }}
 *   cost={0.02}
 * />
 * ```
 */
export function StatusBar({
  mode = "vibe",
  modelName,
  tokens,
  trustMode,
  thinking,
  cost,
  showBorder = false,
}: StatusBarProps): React.JSX.Element {
  const { theme } = useTheme();
  const { t } = useTUITranslation();

  // Use primary/accent color for status bar border
  const borderColor = theme.colors.primary;

  // Render mode selector (all modes shown, active highlighted)
  const modeSection = (
    <Box key="modes">
      {MODES_CONFIG.map((modeConfig, index) => {
        const isActive = modeConfig.mode === mode;
        return (
          <Text key={modeConfig.mode}>
            {index > 0 && "  "}
            <Text
              color={isActive ? BRAND_COLOR : theme.semantic.text.muted}
              bold={isActive}
              dimColor={!isActive}
            >
              {modeConfig.icon} {modeConfig.label}
            </Text>
          </Text>
        );
      })}
    </Box>
  );

  // Collect right-side indicators
  const rightIndicators: React.ReactNode[] = [];

  // Model indicator (compact, name only)
  if (modelName) {
    rightIndicators.push(<ModelIndicator key="model" model={modelName} compact />);
  }

  // Context progress
  if (tokens) {
    rightIndicators.push(
      <ContextProgress
        key="tokens"
        current={tokens.current}
        max={tokens.max}
        showLabel={false}
        barWidth={tokens.barWidth ?? 5}
      />
    );
  }

  // Trust mode (if provided)
  if (trustMode) {
    rightIndicators.push(<TrustModeIndicator key="trust" mode={trustMode} />);
  }

  // Thinking mode (if provided)
  if (thinking) {
    rightIndicators.push(
      <ThinkingModeIndicator
        key="thinking"
        active={thinking.active}
        budget={thinking.budget}
        used={thinking.used}
      />
    );
  }

  // Cost display
  if (cost !== undefined && cost > 0) {
    rightIndicators.push(
      <Box key="cost">
        <Text color={theme.colors.success}>{formatCost(cost)}</Text>
      </Box>
    );
  }

  // Render right indicators with separators
  const renderedRightItems: React.ReactNode[] = [];
  for (let i = 0; i < rightIndicators.length; i++) {
    if (i > 0) {
      renderedRightItems.push(
        <Text key={`sep-${i}`} color={theme.semantic.border.muted}>
          {SEPARATOR}
        </Text>
      );
    }
    renderedRightItems.push(rightIndicators[i]);
  }

  // Empty state
  if (!modelName && !tokens && !cost) {
    return (
      <Box flexDirection="row" justifyContent="space-between" width="100%">
        {modeSection}
        <Text color={theme.semantic.text.muted}>{t("status.noInfo")}</Text>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="row"
      justifyContent="space-between"
      width="100%"
      paddingX={showBorder ? 1 : 0}
      borderStyle={showBorder ? "round" : undefined}
      borderColor={showBorder ? borderColor : undefined}
    >
      {/* Left: Mode selector */}
      {modeSection}

      {/* Right: Model, Context, Cost */}
      <Box flexDirection="row">{renderedRightItems}</Box>
    </Box>
  );
}
