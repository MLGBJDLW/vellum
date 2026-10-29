/**
 * ThinkingBlock Component
 *
 * Displays thinking/reasoning content from extended thinking models
 * with collapsible UI, duration display, and streaming indicator.
 *
 * Features:
 * - Collapsible: Toggle between collapsed (1-line summary) and expanded view
 * - Duration display: Shows how long thinking took (e.g., "Thought for 3.2s")
 * - Streaming indicator: Highlights the label while thinking is in progress
 * - Collapsed activity title: Latest complete provider heading or activity label
 * - Keyboard toggle: 't' key to toggle expand/collapse
 * - Visual distinction: Box border to separate from main content
 * - Tool calls: Optional inline display of tool calls within thinking block
 *
 * @module tui/components/Messages/ThinkingBlock
 */

import { Box, Text } from "ink";
import type React from "react";
import { memo, useCallback, useEffect, useId, useMemo, useRef } from "react";
import type { ToolCallInfo } from "../../context/MessagesContext.js";
import { useCollapsible } from "../../hooks/useCollapsible.js";
import type { ThinkingDisplayMode } from "../../i18n/index.js";
import { useTheme } from "../../theme/index.js";
import { BannerShimmerText } from "../Banner/ShimmerText.js";
import { Clickable } from "../common/Clickable.js";
import { SPINNER_STYLES, Spinner } from "../common/Spinner.js";
import { StreamingText } from "./StreamingText.js";
import { getThinkingActivity } from "./thinkingActivity.js";

// Spinner frames for tool call status
const TOOL_SPINNER_FRAMES = ["-", "\\", "|", "/"];

// =============================================================================
// Inline Formatting for Thinking Content
// =============================================================================

/**
 * Lightweight inline format element
 */
interface InlineFormatElement {
  readonly type: "text" | "code" | "bold";
  readonly content: string;
}

/**
 * Regex for parsing inline `code` and **bold** patterns.
 * Groups: 1=full backtick match, 2=code content, 3=full bold match, 4=bold content
 */
const INLINE_FORMAT_REGEX = /(`([^`]+)`)|(\*\*(.+?)\*\*)/g;

/**
 * Parse text into inline format elements.
 * Only supports `code` and **bold** - intentionally minimal.
 */
function parseInlineFormat(text: string): InlineFormatElement[] {
  const elements: InlineFormatElement[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(INLINE_FORMAT_REGEX)) {
    const matchIndex = match.index ?? 0;

    // Add preceding plain text
    if (matchIndex > lastIndex) {
      elements.push({ type: "text", content: text.slice(lastIndex, matchIndex) });
    }

    // Determine match type
    if (match[1] !== undefined) {
      // Backtick code: `code`
      elements.push({ type: "code", content: match[2] ?? "" });
    } else if (match[3] !== undefined) {
      // Bold: **bold**
      elements.push({ type: "bold", content: match[4] ?? "" });
    }

    lastIndex = matchIndex + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    elements.push({ type: "text", content: text.slice(lastIndex) });
  }

  // Handle empty input
  if (elements.length === 0 && text.length > 0) {
    elements.push({ type: "text", content: text });
  }

  return elements;
}

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
  /** Whether thinking has completed (stable message) */
  readonly isThinkingComplete?: boolean;
  /** Whether initially collapsed (default: true) */
  readonly initialCollapsed?: boolean;
  /** Whether thinking blocks should be expanded by default */
  readonly expandedByDefault?: boolean;
  /** Whether thinking blocks auto-collapse after streaming ends */
  readonly autoCollapse?: boolean;
  /** Delay before auto-collapsing in milliseconds */
  readonly autoCollapseDelayMs?: number;
  /** Unique ID for state persistence (optional) */
  readonly persistenceId?: string;
  /** Enable keyboard toggle with 't' key (default: false to avoid conflicts) */
  readonly enableKeyboardToggle?: boolean;
  /** @deprecated Collapsed thinking always uses a single activity title. */
  readonly collapsedPreviewLines?: number;
  /** Maximum terminal columns for the activity title (default: 56) */
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
   * - "compact": Start with only the header; still manually expandable
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
  isThinkingComplete,
  initialCollapsed = true,
  expandedByDefault = true,
  autoCollapse = false,
  autoCollapseDelayMs = 300,
  persistenceId,
  enableKeyboardToggle = false,
  collapsedPreviewChars = 56,
  showCharCount = true,
  onToggle,
  onHeightChange,
  toolCalls,
  toggleSignal,
  toggleHint,
  displayMode = "full",
}: ThinkingBlockProps): React.JSX.Element | null {
  const { theme } = useTheme();
  const clickId = useId();

  // Compact changes the initial presentation, never the ability to inspect it.
  const isCompactMode = displayMode === "compact";
  const effectiveInitialCollapsed = isCompactMode ? true : initialCollapsed;
  const effectiveAutoCollapseDelayMs = Math.max(0, Math.floor(autoCollapseDelayMs));

  const { isCollapsed, hasUserOverride, toggle, setCollapsed } = useCollapsible({
    initialCollapsed: effectiveInitialCollapsed,
    toggleKey: enableKeyboardToggle ? "t" : undefined,
    keyboardEnabled: enableKeyboardToggle,
    persistenceId,
    toggleSignal,
    onToggle,
  });

  const prevStreamingRef = useRef(isStreaming);
  const prevCompleteRef = useRef(false);
  const autoCollapseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-collapse when streaming ends based on expanded/auto-collapse settings.
  useEffect(() => {
    if (autoCollapseTimeoutRef.current) {
      clearTimeout(autoCollapseTimeoutRef.current);
      autoCollapseTimeoutRef.current = null;
    }

    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = isStreaming;
    const thinkingCompleted =
      (isThinkingComplete && !prevCompleteRef.current) || (!isStreaming && wasStreaming);
    prevCompleteRef.current = Boolean(isThinkingComplete);

    const clearAutoCollapseTimeout = () => {
      if (autoCollapseTimeoutRef.current) {
        clearTimeout(autoCollapseTimeoutRef.current);
        autoCollapseTimeoutRef.current = null;
      }
    };

    if (!autoCollapse || hasUserOverride || isCollapsed || isStreaming || !thinkingCompleted) {
      return clearAutoCollapseTimeout;
    }

    autoCollapseTimeoutRef.current = setTimeout(
      () => {
        setCollapsed(true);
      },
      expandedByDefault ? effectiveAutoCollapseDelayMs : 0
    );

    return clearAutoCollapseTimeout;
  }, [
    autoCollapse,
    effectiveAutoCollapseDelayMs,
    hasUserOverride,
    isCollapsed,
    expandedByDefault,
    isStreaming,
    isThinkingComplete,
    setCollapsed,
  ]);

  // Expanded streaming content can add rows too; virtualized lists must measure
  // it again instead of clipping new content to the previous height.
  const prevCollapsedRef = useRef(isCollapsed);
  const prevContentRef = useRef(content);
  useEffect(() => {
    if (
      prevCollapsedRef.current !== isCollapsed ||
      (!isCollapsed && prevContentRef.current !== content)
    ) {
      onHeightChange?.();
    }
    prevCollapsedRef.current = isCollapsed;
    prevContentRef.current = content;
  }, [isCollapsed, content, onHeightChange]);

  // Theme colors
  const thinkingColor = theme.colors.warning ?? "yellow";
  const mutedColor = theme.semantic.text.muted;
  const borderColor = theme.colors.warning ?? "yellow";
  const accentColor = theme.colors.accent ?? "cyan";
  const successColor = theme.colors.success ?? "green";
  const errorColor = theme.colors.error ?? "red";

  // Inline formatter for thinking content - memoized to avoid re-creation
  const formatInlineThinking = useCallback(
    (text: string): React.ReactNode => {
      const elements = parseInlineFormat(text);

      // Fast path: no formatting needed
      if (elements.length === 1 && elements[0]?.type === "text") {
        return text;
      }

      return elements.map((el, idx) => {
        const key = `${el.type}-${idx}`;
        switch (el.type) {
          case "code":
            return (
              <Text key={key} inverse>
                {` ${el.content} `}
              </Text>
            );
          case "bold":
            return (
              <Text key={key} bold>
                {el.content}
              </Text>
            );
          default:
            return <Text key={key}>{el.content}</Text>;
        }
      });
    },
    [] // No dependencies - parseInlineFormat is stable
  );

  // Memoized values
  const charCount = useMemo(() => content.length, [content]);
  const activity = useMemo(
    () => getThinkingActivity(content, isStreaming, collapsedPreviewChars),
    [content, isStreaming, collapsedPreviewChars]
  );

  // Don't render if no content
  if (!content && !isStreaming) {
    return null;
  }

  // Detailed metadata belongs to the expanded view. The collapsed view is one row.
  const headerParts: string[] = [];

  if (!isStreaming && durationMs !== undefined && durationMs > 0) {
    headerParts.push(formatThinkingDuration(durationMs));
  }

  if (showCharCount && charCount > 0) {
    headerParts.push(formatCharCount(charCount));
  }

  if (toggleHint) headerParts.push(toggleHint);
  else if (enableKeyboardToggle) headerParts.push("press 't'");

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      flexShrink={1}
      minWidth={0}
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
      {/* Header row with toggle — clickable to expand/collapse */}
      <Clickable id={`thinking-toggle-${clickId}`} onClick={toggle} height={1}>
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          <Text wrap="truncate-end">
            <Text color={thinkingColor}>{isCollapsed ? "▸ " : "▾ "}</Text>
            {isStreaming ? (
              <BannerShimmerText baseColor={thinkingColor} highlightColor="#FFD700" enabled>
                Thinking
              </BannerShimmerText>
            ) : (
              <Text color={thinkingColor}>Thinking</Text>
            )}
            <Text color={mutedColor}>{` · ${activity}`}</Text>
            {!isCollapsed && headerParts.length > 0 && (
              <Text color={mutedColor} dimColor>{` (${headerParts.join(" · ")})`}</Text>
            )}
          </Text>
        </Box>
      </Clickable>

      {/* Render all received content immediately on expansion, including mid-stream. */}
      {!isCollapsed && (
        <Box marginLeft={2} marginTop={0} flexDirection="column">
          <Text color={thinkingColor} dimColor>
            <StreamingText
              content={content}
              isStreaming={isStreaming}
              typewriterEffect={false}
              cursorBlink={true}
              formatFn={formatInlineThinking}
            />
          </Text>
        </Box>
      )}

      {/* Tool calls (when present) */}
      {!isCollapsed && toolCalls && toolCalls.length > 0 && (
        <Box marginLeft={2} marginTop={0} flexDirection="column">
          {toolCalls.map((toolCall) => {
            // Determine status indicator and color
            let statusIcon: React.ReactNode;
            let statusColor: string;

            switch (toolCall.status) {
              case "running":
              case "pending":
                statusIcon = <Spinner frames={TOOL_SPINNER_FRAMES} color={accentColor} />;
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
