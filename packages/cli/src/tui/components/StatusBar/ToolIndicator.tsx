/**
 * ToolIndicator Component
 *
 * Displays the currently executing tool with animated spinner.
 * Uses ASCII spinner animation (no emojis) for terminal compatibility.
 *
 * @module tui/components/StatusBar/ToolIndicator
 */

import { Box, Text } from "ink";
import type React from "react";
import { useAnimationFrame } from "../../context/AnimationContext.js";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the ToolIndicator component.
 */
export interface ToolIndicatorProps {
  /** Name of the currently executing tool */
  readonly toolName: string;
  /** Whether to show compact format (default: false) */
  readonly compact?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Spinner animation frames (braille pattern) */
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

// =============================================================================
// Component
// =============================================================================

/**
 * ToolIndicator displays the currently executing tool with a spinner.
 *
 * Format: `⠋ read_file` (spinner animates)
 *
 * Features:
 * - Animated braille spinner
 * - Compact display suitable for status bar
 * - Theme-aware colors
 *
 * @example
 * ```tsx
 * // Basic usage
 * <ToolIndicator toolName="read_file" />
 *
 * // Compact mode
 * <ToolIndicator toolName="read_file" compact />
 * ```
 */
export function ToolIndicator({
  toolName,
  compact = false,
}: ToolIndicatorProps): React.JSX.Element {
  const { theme } = useTheme();

  // Use global animation context for synchronized timing
  const frameIndex = useAnimationFrame(SPINNER_FRAMES);

  const spinnerChar = SPINNER_FRAMES[frameIndex];

  return (
    <Box flexDirection="row">
      <Text color={theme.colors.info}>{spinnerChar}</Text>
      <Text color={theme.semantic.text.secondary}>
        {compact ? "" : " "}
        {toolName}
      </Text>
    </Box>
  );
}
