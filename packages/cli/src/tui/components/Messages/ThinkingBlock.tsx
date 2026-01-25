/**
 * ThinkingBlock Component
 *
 * Displays thinking/reasoning content from extended thinking models
 * with collapsible UI, duration display, and streaming indicator.
 *
 * Features:
 * - Collapsible: Toggle between collapsed (1-line summary) and expanded view
 * - Duration display: Shows how long thinking took (e.g., "Thought for 3.2s")
 * - Streaming indicator: Shows spinner while thinking is in progress
 * - Character count: Shows length in collapsed mode (e.g., "[...] (1,234 chars)")
 * - Keyboard toggle: 't' key to toggle expand/collapse
 * - Visual distinction: Box border to separate from main content
 * - Tool calls: Optional inline display of tool calls within thinking block
 *
 * @module tui/components/Messages/ThinkingBlock
 */

import { Box, Text } from "ink";
import type React from "react";
import { memo, useEffect, useMemo, useRef } from "react";
import { useAnimationFrame } from "../../context/AnimationContext.js";
import type { ToolCallInfo } from "../../context/MessagesContext.js";
import { useCollapsible } from "../../hooks/useCollapsible.js";
import type { ThinkingDisplayMode } from "../../i18n/index.js";
import { useTheme } from "../../theme/index.js";
import { BannerShimmerText } from "../Banner/ShimmerText.js";
import { SPINNER_STYLES, Spinner } from "../common/Spinner.js";
import { StreamingText } from "./StreamingText.js";

// Spinner frames for tool call status
const TOOL_SPINNER_FRAMES = ["-", "\\", "|", "/"];

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the ThinkingBlock component.
 */
export interface ThinkingBlockProps {
  /** Thinking/reasoning content to display */
  readonly content: string;
  /** Duration of thinking in milliseconds (optional) */
  readonly durationMs?: number;
  /** Whether thinking is still in progress (shows spinner) */
  readonly isStreaming?: boolean;
  /** Whether initially collapsed (default: true) */
  readonly initialCollapsed?: boolean;
  /** Unique ID for state persistence (optional) */
  readonly persistenceId?: string;
  /** Enable keyboard toggle with 't' key (default: false to avoid conflicts) */
  readonly enableKeyboardToggle?: boolean;
  /** Maximum lines to show in collapsed preview (default: 1) */
  readonly collapsedPreviewLines?: number;
  /** Maximum characters to show in collapsed preview (default: 80) */
  readonly collapsedPreviewChars?: number;
  /** Show character count in header (default: true) */
  readonly showCharCount?: boolean;
  /** Callback when toggle state changes */
  readonly onToggle?: (collapsed: boolean) => void;
  /**
   * Callback when the block's height changes.
   * Called after expand/collapse or content changes that affect height.
   * Useful for triggering re-measurement in virtualized lists.
   */
  readonly onHeightChange?: () => void;
  /** Tool calls to display inline within the thinking block */
  readonly toolCalls?: readonly ToolCallInfo[];
  /** External toggle signal (increment to toggle) */
  readonly toggleSignal?: number;
  /** Hint text for external toggle */
  readonly toggleHint?: string;
  /**
   * Display mode for thinking content.
   * - "full": Show content (default, can expand/collapse)
   * - "compact": Only show header, no content preview, cannot expand
   */
  readonly displayMode?: ThinkingDisplayMode;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format character count for display.
 */
function formatCharCount(count: number): string {
  if (count < 1000) {
    return `${count} chars`;
  }
  const k = count / 1000;
  return k >= 10 ? `${Math.round(k)}K chars` : `${k.toFixed(1)}K chars`;
}

/**
 * Format duration in milliseconds to human-readable string.
 */
function formatThinkingDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = (seconds % 60).toFixed(0);
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Get a preview of the content for collapsed mode.
 */
function getPreview(content: string, maxLines: number, maxChars: number): string {
  if (!content) return "";

  // Split by newlines and take first N lines
  const lines = content.split("\n").slice(0, maxLines);
  let preview = lines.join(" ").trim();

  // Truncate to max chars
  if (preview.length > maxChars) {
    preview = `${preview.slice(0, maxChars - 3)}...`;
  }

  return preview;
}

// =============================================================================
// Component
// =============================================================================

/**
 * ThinkingBlock - Collapsible display for model thinking/reasoning content.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <ThinkingBlock content="Let me think about this..." />
 *
 * // With streaming indicator
 * <ThinkingBlock
 *   content={thinkingContent}
 *   isStreaming={true}
 * />
 *
 * // With duration and keyboard toggle
 * <ThinkingBlock
 *   content={thinkingContent}
 *   durationMs={3200}
 *   enableKeyboardToggle
 * />
 *
 * // Initially expanded
 * <ThinkingBlock
 *   content={thinkingContent}
 *   initialCollapsed={false}
 * />
 * ```
 */
export const ThinkingBlock = memo(function ThinkingBlock({
  content,
  durationMs,
  isStreaming = false,
  initialCollapsed = true,
  persistenceId,
  enableKeyboardToggle = false,
  collapsedPreviewLines = 1,
  collapsedPreviewChars = 80,
  showCharCount = true,
  onToggle,
  onHeightChange,
  toolCalls,
  toggleSignal,
  toggleHint,
  displayMode = "full",
}: ThinkingBlockProps): React.JSX.Element | null {
  const { theme } = useTheme();

  // Animation frame for tool call spinners
  const frameIndex = useAnimationFrame(TOOL_SPINNER_FRAMES);

  // In compact mode, force collapsed and disable keyboard toggle
  const isCompactMode = displayMode === "compact";
  const effectiveInitialCollapsed = isCompactMode ? true : initialCollapsed;
  const effectiveKeyboardToggle = isCompactMode ? false : enableKeyboardToggle;

  const { isCollapsed, toggle: _toggle } = useCollapsible({
    initialCollapsed: effectiveInitialCollapsed,
    toggleKey: effectiveKeyboardToggle ? "t" : undefined,
    keyboardEnabled: effectiveKeyboardToggle,
    persistenceId,
    onToggle,
  });

  // In compact mode, always show as collapsed (never expandable)
  const effectiveIsCollapsed = isCompactMode ? true : isCollapsed;
  const lastToggleSignalRef = useRef<number | null>(null);

  useEffect(() => {
    if (isCompactMode || toggleSignal === undefined) {
      return;
    }
    if (lastToggleSignalRef.current === toggleSignal) {
      return;
    }
    lastToggleSignalRef.current = toggleSignal;
    _toggle();
  }, [isCompactMode, toggleSignal, _toggle]);

  // Notify parent when collapsed state changes (triggers height re-measurement)
  const prevCollapsedRef = useRef(effectiveIsCollapsed);
  useEffect(() => {
    if (prevCollapsedRef.current !== effectiveIsCollapsed) {
      prevCollapsedRef.current = effectiveIsCollapsed;
      onHeightChange?.();
    }
  }, [effectiveIsCollapsed, onHeightChange]);

  // Theme colors
  const thinkingColor = theme.colors.warning ?? "yellow";
  const mutedColor = theme.semantic.text.muted;
  const borderColor = theme.colors.warning ?? "yellow";
  const accentColor = theme.colors.accent ?? "cyan";
  const successColor = theme.colors.success ?? "green";
  const errorColor = theme.colors.error ?? "red";

  // Memoized values
  const charCount = useMemo(() => content.length, [content]);
  const preview = useMemo(
    () => getPreview(content, collapsedPreviewLines, collapsedPreviewChars),
    [content, collapsedPreviewLines, collapsedPreviewChars]
  );

  // Don't render if no content
  if (!content && !isStreaming) {
    return null;
  }

  // Build header text
  const headerParts: string[] = [];

  // Status icon and text
  if (isStreaming) {
    headerParts.push("Thinking");
  } else if (durationMs !== undefined && durationMs > 0) {
    headerParts.push(`Thought for ${formatThinkingDuration(durationMs)}`);
  } else {
    headerParts.push("Thought");
  }

  // Character count (when collapsed or streaming)
  if (showCharCount && charCount > 0 && (effectiveIsCollapsed || isStreaming)) {
    headerParts.push(`(${formatCharCount(charCount)})`);
  }

  // Toggle hint (not shown in compact mode since it's not toggleable)
  if (!isStreaming && !isCompactMode) {
    headerParts.push(effectiveIsCollapsed ? "[expand ▼]" : "[collapse ▲]");
  }

  return (
    <Box
      flexDirection="column"
      marginLeft={2}
      marginTop={0}
      marginBottom={0}
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      borderLeft
      borderRight={false}
      borderTop={false}
      borderBottom={false}
    >
      {/* Header row with toggle */}
      <Box flexDirection="row" alignItems="center">
        {/* Streaming spinner */}
        {isStreaming && (
          <>
            <Spinner color={thinkingColor} frames={SPINNER_STYLES.dots} />
            <Text> </Text>
          </>
        )}

        {/* Icon */}
        <Text color={thinkingColor}>[...] </Text>

        {/* Header text - clickable area concept (visual only in TUI) */}
        {isStreaming ? (
          <BannerShimmerText baseColor={thinkingColor} highlightColor="#FFD700" enabled={true}>
            {headerParts.join(" ")}
          </BannerShimmerText>
        ) : (
          <Text color={thinkingColor} dimColor italic>
            {headerParts.join(" ")}
          </Text>
        )}

        {/* Keyboard hint */}
        {effectiveKeyboardToggle && !isStreaming && (
          <Text color={mutedColor} dimColor>
            {" "}
            (press 't')
          </Text>
        )}
        {toggleHint && !isStreaming && !isCompactMode && (
          <Text color={mutedColor} dimColor>
            {" "}
            ({toggleHint})
          </Text>
        )}
      </Box>

      {/* Content area - In compact mode, don't show any content (no preview) */}
      {isCompactMode ? null : effectiveIsCollapsed ? (
        // Collapsed: show preview only
        content && (
          <Box marginLeft={2} marginTop={0}>
            <Text color={mutedColor} dimColor wrap="truncate">
              {preview}
            </Text>
          </Box>
        )
      ) : (
        // Expanded: show full content with typewriter effect
        <Box marginLeft={2} marginTop={0} flexDirection="column">
          <Text color={thinkingColor} dimColor>
            <StreamingText
              content={content}
              isStreaming={isStreaming}
              typewriterEffect={true}
              cursorBlink={true}
            />
          </Text>
        </Box>
      )}

      {/* Tool calls (when present) */}
      {toolCalls && toolCalls.length > 0 && (
        <Box marginLeft={2} marginTop={0} flexDirection="column">
          {toolCalls.map((toolCall) => {
            // Determine status indicator and color
            let statusIcon: string;
            let statusColor: string;

            switch (toolCall.status) {
              case "running":
              case "pending":
                statusIcon = TOOL_SPINNER_FRAMES[frameIndex] ?? "-";
                statusColor = accentColor;
                break;
              case "completed":
                statusIcon = "+";
                statusColor = successColor;
                break;
              case "error":
                statusIcon = "x";
                statusColor = errorColor;
                break;
              default:
                statusIcon = "o";
                statusColor = mutedColor;
            }

            return (
              <Box key={toolCall.id} flexDirection="row">
                <Text color={statusColor}>{statusIcon}</Text>
                <Text> </Text>
                <Text color={accentColor} bold>
                  {toolCall.name}
                </Text>
                {toolCall.status === "error" && toolCall.error && (
                  <Text color={errorColor} dimColor>
                    {" "}
                    — {toolCall.error}
                  </Text>
                )}
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
});

// =============================================================================
// Compact Variant
// =============================================================================

/**
 * Props for the CompactThinkingIndicator component.
 */
export interface CompactThinkingIndicatorProps {
  /** Duration of thinking in milliseconds */
  readonly durationMs?: number;
  /** Whether thinking is still in progress */
  readonly isStreaming?: boolean;
  /** Character count to display */
  readonly charCount?: number;
}

/**
 * CompactThinkingIndicator - Minimal inline thinking status.
 *
 * Use this when you just want to show that thinking occurred
 * without the full collapsible content.
 *
 * @example
 * ```tsx
 * <CompactThinkingIndicator durationMs={3200} charCount={1500} />
 * // Renders: 💭 Thought for 3.2s (1.5K chars)
 * ```
 */
export function CompactThinkingIndicator({
  durationMs,
  isStreaming = false,
  charCount,
}: CompactThinkingIndicatorProps): React.JSX.Element {
  const { theme } = useTheme();
  const thinkingColor = theme.colors.warning ?? "yellow";

  const parts: string[] = ["[...]"];

  if (isStreaming) {
    parts.push("Thinking...");
  } else if (durationMs !== undefined && durationMs > 0) {
    parts.push(`Thought for ${formatThinkingDuration(durationMs)}`);
  } else {
    parts.push("Thought");
  }

  if (charCount !== undefined && charCount > 0) {
    parts.push(`(${formatCharCount(charCount)})`);
  }

  return (
    <Box flexDirection="row" alignItems="center">
      {isStreaming && (
        <>
          <Spinner color={thinkingColor} frames={SPINNER_STYLES.dots} />
          <Text> </Text>
        </>
      )}
      <Text color={thinkingColor} dimColor italic>
        {parts.join(" ")}
      </Text>
    </Box>
  );
}

export default ThinkingBlock;
