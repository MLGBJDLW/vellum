/**
 * PauseIndicator Component
 *
 * Displays a visual indicator when the agent stream is paused.
 * Shows ⏸ PAUSED with yellow color.
 *
 * @module tui/components/StatusBar/PauseIndicator
 */

import { Text } from "ink";
import type React from "react";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the PauseIndicator component.
 */
export interface PauseIndicatorProps {
  /** Whether the agent is currently paused */
  readonly isPaused: boolean;
  /** Whether to show the indicator (default: true when paused) */
  readonly visible?: boolean;
  /** Compact mode - show only icon (default: false) */
  readonly compact?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Pause icon */
const PAUSE_ICON = "⏸";

/** Pause label */
const PAUSE_LABEL = "PAUSED";

// =============================================================================
// Component
// =============================================================================

/**
 * PauseIndicator - Visual indicator for paused stream state.
 *
 * @example
 * ```tsx
 * <PauseIndicator isPaused={isPaused} />
 * ```
 */
export function PauseIndicator({
  isPaused,
  visible = true,
  compact = false,
}: PauseIndicatorProps): React.JSX.Element | null {
  const { theme } = useTheme();

  if (!isPaused || !visible) {
    return null;
  }

  return (
    <Text color={theme.colors.warning}>
      {PAUSE_ICON}
      {!compact && ` ${PAUSE_LABEL}`}
    </Text>
  );
}

export default PauseIndicator;
