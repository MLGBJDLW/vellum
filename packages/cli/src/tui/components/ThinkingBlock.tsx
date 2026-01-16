/**
 * ThinkingBlock Component (T023/T037)
 *
 * A collapsible component to display AI thinking/reasoning content.
 * Shows a compressed "[Thinking...]" state that expands to show full content.
 * Supports streaming with animated indicator and displays token/duration metrics.
 */

import { Box, Text, useInput } from "ink";
import { useCallback, useState } from "react";
import { useTUITranslation } from "../i18n/index.js";
import { Spinner } from "./common/Spinner.js";
import { StreamingText } from "./Messages/StreamingText.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the ThinkingBlock component.
 */
export interface ThinkingBlockProps {
  /** The thinking/reasoning content to display */
  content: string;
  /** Whether the content is currently streaming */
  isStreaming?: boolean;
  /** Whether the block is collapsed (default: true) */
  collapsed?: boolean;
  /** Callback when the expand/collapse state is toggled */
  onToggle?: () => void;
  /** Enable keyboard toggle handling (default: true) */
  keyboardToggleEnabled?: boolean;
  /** Number of tokens used in thinking (optional) */
  tokenCount?: number;
  /** Duration of the thinking phase in milliseconds */
  duration?: number;

  // Legacy props for backward compatibility
  /** @deprecated Use `content` instead */
  thinking?: string;
  /** @deprecated Use `!collapsed` instead */
  isExpanded?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

// Note: Spinner animation is now handled by the shared Spinner component
// which uses the global AnimationContext for centralized timing.

// =============================================================================
// Helper Functions
// =============================================================================

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
 * Formats token count to a human-readable string with K/M suffix.
 */
function formatTokenCount(count: number): string {
  if (count < 1000) {
    return `${count}`;
  }
  if (count < 1000000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return `${(count / 1000000).toFixed(1)}M`;
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * ThinkingBlock displays AI thinking/reasoning content in a collapsible format.
 *
 * When collapsed, shows "[Thinking...]" with duration and token count.
 * When expanded, shows the full thinking content with dimmed styling.
 * Supports streaming mode with animated spinner indicator.
 *
 * Can be controlled (collapsed/onToggle) or uncontrolled (internal state).
 *
 * @example
 * ```tsx
 * // Basic usage with streaming
 * <ThinkingBlock
 *   content={thinkingText}
 *   isStreaming={isThinking}
 *   tokenCount={1234}
 *   duration={5430}
 * />
 *
 * // Controlled collapse state
 * <ThinkingBlock
 *   content={thinkingText}
 *   isStreaming={false}
 *   collapsed={!expanded}
 *   onToggle={() => setExpanded(!expanded)}
 *   tokenCount={1234}
 *   duration={5430}
 * />
 *
 * // Legacy API (backward compatible)
 * <ThinkingBlock
 *   thinking="Let me analyze this problem..."
 *   duration={1500}
 *   isExpanded={expanded}
 *   onToggle={() => setExpanded(!expanded)}
 * />
 * ```
 */
export function ThinkingBlock({
  content,
  isStreaming = false,
  collapsed: controlledCollapsed,
  onToggle,
  keyboardToggleEnabled = true,
  tokenCount,
  duration,
  // Legacy props
  thinking,
  isExpanded,
}: ThinkingBlockProps): React.JSX.Element {
  const { t } = useTUITranslation();
  // Internal state for uncontrolled mode (default collapsed)
  const [internalCollapsed, setInternalCollapsed] = useState(true);

  // Normalize props: support both new and legacy API
  const displayContent = content ?? thinking ?? "";

  // Handle collapsed state: support new `collapsed` prop and legacy `isExpanded` prop
  const isControlled = controlledCollapsed !== undefined || isExpanded !== undefined;
  const isCollapsed = isControlled
    ? (controlledCollapsed ?? (isExpanded !== undefined ? !isExpanded : true))
    : internalCollapsed;

  // Handle toggle action
  const handleToggle = useCallback(() => {
    if (onToggle) {
      onToggle();
    } else if (!isControlled) {
      setInternalCollapsed((prev) => !prev);
    }
  }, [isControlled, onToggle]);

  // Handle input for keyboard toggle (Enter or Space)
  useInput(
    (input, key) => {
      if (key.ctrl && input.toLowerCase() === "e") {
        handleToggle();
      }
    },
    { isActive: keyboardToggleEnabled }
  );

  // Build metrics display string
  const metricsDisplay = buildMetricsDisplay(duration, tokenCount);

  // Determine arrow indicator
  const arrow = isCollapsed ? ">" : "v";

  if (isCollapsed) {
    // Collapsed view
    return (
      <Box>
        <Text dimColor>
          {arrow} [*] [{t("thinking.label")}
          {isStreaming ? " " : ""}
          {isStreaming && <Spinner />}
          {metricsDisplay}] <Text italic>{t("thinking.expandHint")}</Text>
        </Text>
      </Box>
    );
  }

  // Expanded view
  return (
    <Box flexDirection="column">
      <Box>
        <Text dimColor>
          {arrow} [*] {t("thinking.label").replace("...", "")}
          {isStreaming ? " " : ""}
          {isStreaming && <Spinner />}
          {metricsDisplay} <Text italic>{t("thinking.collapseHint")}</Text>
        </Text>
      </Box>
      <Box marginLeft={2} marginTop={1}>
        {isStreaming ? (
          <Text dimColor>
            <StreamingText content={displayContent} isStreaming={isStreaming} />
          </Text>
        ) : (
          <Text dimColor wrap="wrap">
            {displayContent}
          </Text>
        )}
      </Box>
    </Box>
  );
}

/**
 * Builds the metrics display string (duration and token count).
 */
function buildMetricsDisplay(duration: number | undefined, tokenCount: number | undefined): string {
  const parts: string[] = [];

  if (duration !== undefined) {
    parts.push(formatDuration(duration));
  }

  if (tokenCount !== undefined) {
    parts.push(`${formatTokenCount(tokenCount)} tokens`);
  }

  if (parts.length === 0) {
    return "";
  }

  return ` (${parts.join(" • ")})`;
}

export default ThinkingBlock;
