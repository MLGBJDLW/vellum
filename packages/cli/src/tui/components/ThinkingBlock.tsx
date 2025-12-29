/**
 * ThinkingBlock Component (T037)
 *
 * A collapsible component to display AI thinking/reasoning content.
 * Shows a compressed "[Thinking...]" state that expands to show full content.
 */

import { Box, Text, useInput } from "ink";
import { useCallback, useState } from "react";

/**
 * Props for the ThinkingBlock component.
 */
export interface ThinkingBlockProps {
  /** The thinking/reasoning content to display */
  thinking: string;
  /** Duration of the thinking phase in milliseconds */
  duration: number;
  /** Whether the block is expanded (controlled) */
  isExpanded?: boolean;
  /** Callback when the expand/collapse state is toggled */
  onToggle?: () => void;
}

/**
 * Formats duration in milliseconds to a human-readable string.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * ThinkingBlock displays AI thinking/reasoning content in a collapsible format.
 *
 * When collapsed, shows "[Thinking...]" with duration.
 * When expanded, shows the full thinking content with dimmed styling.
 *
 * Can be controlled (isExpanded/onToggle) or uncontrolled (internal state).
 *
 * @example
 * ```tsx
 * // Uncontrolled usage
 * <ThinkingBlock
 *   thinking="Let me analyze this problem..."
 *   duration={1500}
 * />
 *
 * // Controlled usage
 * <ThinkingBlock
 *   thinking="Let me analyze this problem..."
 *   duration={1500}
 *   isExpanded={expanded}
 *   onToggle={() => setExpanded(!expanded)}
 * />
 * ```
 */
export function ThinkingBlock({
  thinking,
  duration,
  isExpanded: controlledExpanded,
  onToggle,
}: ThinkingBlockProps) {
  // Internal state for uncontrolled mode
  const [internalExpanded, setInternalExpanded] = useState(false);

  // Use controlled or uncontrolled expanded state
  const isControlled = controlledExpanded !== undefined;
  const expanded = isControlled ? controlledExpanded : internalExpanded;

  // Handle toggle action
  const handleToggle = useCallback(() => {
    if (onToggle) {
      onToggle();
    } else if (!isControlled) {
      setInternalExpanded((prev) => !prev);
    }
  }, [isControlled, onToggle]);

  // Handle input for keyboard toggle (Enter or Space)
  useInput((input, key) => {
    if (key.return || input === " ") {
      handleToggle();
    }
  });

  // Format the duration
  const formattedDuration = formatDuration(duration);

  if (!expanded) {
    // Collapsed view
    return (
      <Box>
        <Text dimColor>
          💭 [Thinking... {formattedDuration}] <Text italic>(press Enter to expand)</Text>
        </Text>
      </Box>
    );
  }

  // Expanded view
  return (
    <Box flexDirection="column">
      <Box>
        <Text dimColor>
          💭 Thinking ({formattedDuration}) <Text italic>(press Enter to collapse)</Text>
        </Text>
      </Box>
      <Box marginLeft={2} marginTop={1}>
        <Text dimColor wrap="wrap">
          {thinking}
        </Text>
      </Box>
    </Box>
  );
}

export default ThinkingBlock;
