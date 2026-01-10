/**
 * TrustModeIndicator Component (T037)
 *
 * Displays the current trust mode with an icon and color.
 * Trust modes control how much autonomy the AI has for tool execution.
 *
 * @module tui/components/StatusBar/TrustModeIndicator
 */

import { Box, Text } from "ink";
import { useMemo } from "react";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Trust mode types.
 * - ask: AI asks for approval before each action
 * - auto: AI auto-approves safe actions, asks for dangerous ones
 * - full: AI auto-approves all actions
 */
export type TrustMode = "ask" | "auto" | "full";

/**
 * Props for the TrustModeIndicator component.
 */
export interface TrustModeIndicatorProps {
  /** Current trust mode */
  readonly mode: TrustMode;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Trust mode configuration mapping.
 */
interface TrustModeConfig {
  readonly icon: string;
  readonly label: string;
  readonly description: string;
}

const TRUST_MODE_CONFIG: Record<TrustMode, TrustModeConfig> = {
  ask: {
    icon: "◎",
    label: "Approval: Ask",
    description: "Manual approval required",
  },
  auto: {
    icon: "◉",
    label: "Approval: Auto",
    description: "Auto-approve safe actions",
  },
  full: {
    icon: "●",
    label: "Approval: Full",
    description: "Auto-approve all actions",
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Gets the color for a trust mode.
 * - ask: warning (requires attention)
 * - auto: info (semi-autonomous)
 * - full: success (fully autonomous) but also indicates risk
 */
function getTrustModeColor(mode: TrustMode, theme: ReturnType<typeof useTheme>["theme"]): string {
  switch (mode) {
    case "ask":
      return theme.colors.warning;
    case "auto":
      return theme.colors.info;
    case "full":
      return theme.colors.success;
    default:
      return theme.semantic.text.secondary;
  }
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * TrustModeIndicator displays the current trust mode with visual cues.
 *
 * Features:
 * - Mode-specific icon
 * - Color-coded by trust level
 * - Compact label display
 *
 * Trust Modes:
 * - Ask (◎): Manual approval for all actions
 * - Auto (◉): Auto-approve safe actions, ask for dangerous ones
 * - Full (●): Auto-approve all actions (highest trust)
 *
 * @example
 * ```tsx
 * // Ask mode (most restrictive)
 * <TrustModeIndicator mode="ask" />
 *
 * // Auto mode (balanced)
 * <TrustModeIndicator mode="auto" />
 *
 * // Full mode (most permissive)
 * <TrustModeIndicator mode="full" />
 * ```
 */
export function TrustModeIndicator({ mode }: TrustModeIndicatorProps): React.JSX.Element {
  const { theme } = useTheme();

  const config = useMemo(() => TRUST_MODE_CONFIG[mode], [mode]);
  const color = useMemo(() => getTrustModeColor(mode, theme), [mode, theme]);

  return (
    <Box>
      <Text color={color}>{config.icon}</Text>
      <Text color={theme.semantic.text.muted}> </Text>
      <Text color={color}>{config.label}</Text>
    </Box>
  );
}
