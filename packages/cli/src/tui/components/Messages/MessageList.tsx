/**
 * MessageList Component (T017)
 *
 * Displays a list of messages with auto-scroll support and optimized rendering.
 * Uses virtualized rendering for optimal performance with large message lists.
 *
 * V2 Simplified Props (Phase 3):
 * - Core: messages, isStreaming, isFocused
 * - Callbacks: onScrollChange
 * - Configuration: estimatedItemHeight, scrollKeyMode
 *
 * Features:
 * - Virtualized rendering (always enabled for performance)
 * - Auto-scroll to bottom with manual override
 * - Keyboard navigation (PageUp/Down, Home/End)
 * - Thinking indicator during streaming
 * - New messages banner for unread notifications
 *
 * @module tui/components/Messages/MessageList
 */

import { getIcons } from "@vellum/shared";
import { Box, type DOMElement, type Key, measureElement, Text, useInput } from "ink";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  getThinkingDisplayMode,
  getThinkingExpandedByDefault,
  subscribeToDisplayMode,
} from "../../../commands/think.js";
import { useAnimationFrame } from "../../context/AnimationContext.js";
import type { Message, ToolCallInfo } from "../../context/MessagesContext.js";
import { useAlternateBuffer } from "../../hooks/useAlternateBuffer.js";
import { useAnimatedScrollbar } from "../../hooks/useAnimatedScrollbar.js";
import { useDiffMode } from "../../hooks/useDiffMode.js";
import { useKeyboardScroll } from "../../hooks/useKeyboardScroll.js";
import { useScrollController } from "../../hooks/useScrollController.js";
import type { ThinkingDisplayMode } from "../../i18n/index.js";
import { useTUITranslation } from "../../i18n/index.js";
import { useTheme } from "../../theme/index.js";
import { isEndKey, isHomeKey } from "../../types/ink-extended.js";
import { estimateMessageHeight } from "../../utils/heightEstimator.js";
import { BannerShimmerText } from "../Banner/ShimmerText.js";
import { MaxSizedBox } from "../common/MaxSizedBox.js";
import { ScrollIndicator } from "../common/ScrollIndicator.js";
import { StreamingIndicator } from "../common/StreamingIndicator.js";
import {
  // New Messages Banner - unread notification
  NewMessagesBanner,
  SCROLL_TO_ITEM_END,
  // Message Separation - streaming/stable split
  useMessageSeparation,
  useNewMessagesBanner,
  VirtualizedList,
  type VirtualizedListRef,
} from "../common/VirtualizedList/index.js";
import { DiffView } from "./DiffView.js";
import { MarkdownRenderer } from "./MarkdownRenderer.js";
import { ThinkingBlock } from "./ThinkingBlock.js";
import { ToolResultPreview } from "./ToolResultPreview.js";

// =============================================================================
// Constants
// =============================================================================

/** ASCII text spinner animation frames for running tools (no Unicode/emoji) */
const SPINNER_FRAMES = ["-", "\\", "|", "/"] as const;
const THINKING_TOGGLE_HINT = "Alt+E";

/** Enable debug logging for TUI mode decisions */
const DEBUG_TUI = process.env.NODE_ENV === "development" && process.env.DEBUG_TUI;

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the MessageList component.
 *
 * V2 Simplified Interface (Phase 3):
 * - Core: messages, isStreaming, isFocused
 * - Callbacks: onScrollChange
 * - Configuration: estimatedItemHeight, scrollKeyMode
 *
 * Deprecated props are kept for backward compatibility but will be removed in v3.
 */
export interface MessageListProps {
  // ===========================================================================
  // Core Props (Required/Recommended)
  // ===========================================================================

  /** Array of messages to display */
  readonly messages: readonly Message[];

  /**
   * Whether the agent is currently streaming a response.
   * Shows thinking indicator when true and no content has arrived.
   * @default false
   */
  readonly isStreaming?: boolean;

  /**
   * Whether this component has keyboard focus.
   * Controls whether PageUp/PageDown/arrow keys work.
   * @default true
   */
  readonly isFocused?: boolean;

  // ===========================================================================
  // Callbacks
  // ===========================================================================

  /** Callback when scroll position changes relative to bottom */
  readonly onScrollChange?: (isAtBottom: boolean) => void;

  // ===========================================================================
  // Configuration
  // ===========================================================================

  /**
   * Estimated height per message in lines (for virtualization).
   * Can be a fixed number or function for variable heights.
   * @default 4
   */
  readonly estimatedItemHeight?: number | ((index: number) => number);

  /**
   * Which keys are allowed for scroll control.
   * - "all": arrows, PageUp/PageDown, Home/End (default)
   * - "page": only PageUp/PageDown to avoid stealing input navigation
   */
  readonly scrollKeyMode?: "all" | "page";

  // ===========================================================================
  // Deprecated Props (kept for backward compatibility)
  // ===========================================================================

  /**
   * @deprecated No longer used. Use `messages` array directly.
   * Static rendering is handled internally.
   */
  readonly historyMessages?: readonly Message[];

  /**
   * @deprecated No longer needed. Streaming messages should have `isStreaming: true`
   * in the messages array. This prop is merged into `messages` internally.
   */
  readonly pendingMessage?: Message | null;

  /**
   * @deprecated Use `isStreaming` instead. This prop is kept for backward compatibility.
   * Shows thinking indicator when true and no content has arrived.
   */
  readonly isLoading?: boolean;

  /**
   * @deprecated Always enabled. Auto-scroll is the default behavior.
   * Users can manually scroll up to pause, scroll to bottom to resume.
   */
  readonly autoScroll?: boolean;

  /**
   * @deprecated Container height is used automatically.
   * Maximum height in lines (optional, for windowed display).
   */
  readonly maxHeight?: number;

  /**
   * @deprecated Always true. Virtualized rendering is always enabled for performance.
   */
  readonly useVirtualizedList?: boolean;

  /**
   * @deprecated Always true. Auto-follow resumes on any non-scroll key press.
   */
  readonly forceFollowOnInput?: boolean;

  /**
   * @deprecated Handled at App level. Alternate buffer mode for viewport calculation.
   */
  readonly useAltBuffer?: boolean;

  /**
   * @deprecated Always true in V2. New scroll controller is always enabled.
   */
  readonly enableScroll?: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format a timestamp for display.
 */
function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Get the display icon for a message role.
 */
function getRoleIcon(role: Message["role"]): string {
  const icons = getIcons();
  switch (role) {
    case "user":
      return icons.user;
    case "assistant":
      return icons.assistant;
    case "system":
      return icons.system;
    case "tool":
      return icons.tool;
    default:
      return icons.info;
  }
}

/**
 * Get the role display label using i18n.
 * @param role - Message role
 * @param t - Translation function from useTUITranslation
 */
function getRoleLabel(role: Message["role"], t: (key: string) => string): string {
  switch (role) {
    case "user":
      return t("messages.user");
    case "assistant":
      return t("messages.assistant");
    case "system":
      return t("messages.system");
    case "tool":
      return t("messages.tool");
    default:
      return t("messages.unknown");
  }
}

/**
 * Legacy estimateMessageHeight wrapper for virtualization.
 * Uses the extracted heightEstimator utility internally.
 */
function estimateMessageHeightLegacy(
  message: Message,
  width: number,
  includeToolCalls: boolean
): number {
  return estimateMessageHeight(message, { width, includeToolCalls });
}

interface DiffMetadata {
  readonly diff: string;
  readonly additions: number;
  readonly deletions: number;
}

function isDiffMetadata(value: unknown): value is DiffMetadata {
  if (!value || typeof value !== "object") {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.diff === "string" &&
    typeof obj.additions === "number" &&
    typeof obj.deletions === "number"
  );
}

function getDiffMetadata(result: unknown): DiffMetadata | null {
  if (isDiffMetadata(result)) {
    return result;
  }
  if (!result || typeof result !== "object") {
    return null;
  }
  const diffMeta = (result as Record<string, unknown>).diffMeta;
  return isDiffMetadata(diffMeta) ? diffMeta : null;
}

// =============================================================================
// Sub-Components
// =============================================================================

/**
 * Props for inline tool call indicator.
 */
interface InlineToolCallProps {
  readonly toolCall: ToolCallInfo;
  readonly accentColor: string;
  readonly mutedColor: string;
  readonly successColor: string;
  readonly errorColor: string;
}

/**
 * Renders an inline tool call with status indicator (spinner/checkmark/error).
 * Gemini-style: shows tool name with animated spinner while running,
 * checkmark when completed, X when error.
 */
const InlineToolCall = memo(function InlineToolCall({
  toolCall,
  accentColor,
  mutedColor,
  successColor,
  errorColor,
}: InlineToolCallProps) {
  // Use animation frame for spinner (only animates when running)
  const frameIndex = useAnimationFrame(SPINNER_FRAMES);
  // Get current diff view mode
  const { mode: diffMode } = useDiffMode();

  // Determine status indicator and color
  let statusIcon: string;
  let statusColor: string;

  switch (toolCall.status) {
    case "running":
    case "pending":
      statusIcon = SPINNER_FRAMES[frameIndex] ?? "-";
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

  const diffMeta = getDiffMetadata(toolCall.result);
  const hasDiffStats =
    toolCall.status === "completed" &&
    diffMeta !== null &&
    (diffMeta.additions > 0 || diffMeta.deletions > 0);
  const hasDiffContent =
    toolCall.status === "completed" &&
    diffMeta !== null &&
    diffMeta.diff.trim() !== "" &&
    diffMeta.diff !== "(no changes)";

  // Show result preview for non-diff tool results
  const hasResultPreview =
    toolCall.status === "completed" &&
    !hasDiffContent &&
    toolCall.result !== undefined &&
    toolCall.result !== null;

  // Shimmer effect for running tools - use accent as base, highlight gold as shimmer peak
  const isRunning = toolCall.status === "running" || toolCall.status === "pending";

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Text color={statusColor}>{statusIcon}</Text>
        <Text> </Text>
        {isRunning ? (
          <BannerShimmerText
            baseColor={accentColor}
            highlightColor="#FFD700"
            shimmerConfig={{ cycleDuration: 2000 }}
            shimmerWidth={0.2}
            bold
          >
            {toolCall.name}
          </BannerShimmerText>
        ) : (
          <Text color={accentColor} bold>
            {toolCall.name}
          </Text>
        )}
        {hasDiffStats && diffMeta && (
          <>
            <Text> </Text>
            <Text color={successColor}>+{diffMeta.additions}</Text>
            <Text> </Text>
            <Text color={errorColor}>-{diffMeta.deletions}</Text>
          </>
        )}
        {/* Show error message inline if present */}
        {toolCall.status === "error" && toolCall.error && (
          <Text color={errorColor} dimColor>
            {" "}
            — {toolCall.error}
          </Text>
        )}
      </Box>
      {hasDiffContent && diffMeta && (
        <Box marginLeft={2} marginTop={1}>
          <MaxSizedBox maxHeight={12} truncationIndicator="... (diff truncated)">
            <DiffView diff={diffMeta.diff} compact mode={diffMode} />
          </MaxSizedBox>
        </Box>
      )}
      {hasResultPreview && (
        <Box marginLeft={2} marginTop={0}>
          <ToolResultPreview result={toolCall.result} toolName={toolCall.name} />
        </Box>
      )}
    </Box>
  );
});

/**
 * ThinkingIndicator component.
 * Shows an animated spinner with "Thinking..." text while the agent is processing
 * and before any streaming content has arrived.
 *
 * Uses StreamingIndicator for consistent styling across all streaming phases.
 */
const ThinkingIndicator = memo(function ThinkingIndicator() {
  // Use StreamingIndicator for consistent styling
  return (
    <Box marginBottom={1} paddingX={1}>
      <StreamingIndicator phase="thinking" showPhaseTime narrow showCancelHint />
    </Box>
  );
});

/**
 * ToolGroupItem component.
 * Renders tool call rows inline between assistant segments.
 */
interface ToolGroupItemProps {
  readonly message: Message & { role: "tool_group" };
  readonly accentColor: string;
  readonly mutedColor: string;
  readonly successColor: string;
  readonly errorColor: string;
}

const ToolGroupItem = memo(function ToolGroupItem({
  message,
  accentColor,
  mutedColor,
  successColor,
  errorColor,
}: ToolGroupItemProps) {
  if (!message.toolCalls || message.toolCalls.length === 0) {
    return <Box />;
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <MaxSizedBox maxHeight={15} truncationIndicator="... (more tool calls)">
        <Box flexDirection="column" marginLeft={2}>
          {message.toolCalls.map((toolCall) => (
            <InlineToolCall
              key={toolCall.id}
              toolCall={toolCall}
              accentColor={accentColor}
              mutedColor={mutedColor}
              successColor={successColor}
              errorColor={errorColor}
            />
          ))}
        </Box>
      </MaxSizedBox>
    </Box>
  );
});

/**
 * Props for a single message item.
 */
interface MessageItemProps {
  readonly message: Message;
  readonly roleColor: string;
  readonly mutedColor: string;
  readonly accentColor: string;
  /** Color for thinking/reasoning content */
  readonly thinkingColor: string;
  /** Color for success indicators */
  readonly successColor: string;
  /** Color for error indicators */
  readonly errorColor: string;
  /** Whether to render inline tool calls for this message */
  readonly showToolCalls?: boolean;
  /** Display mode for thinking blocks */
  readonly thinkingDisplayMode?: "full" | "compact";
  /** Toggle signal for thinking blocks */
  readonly thinkingToggleSignal?: number;
  /** Hint text for thinking toggle */
  readonly thinkingToggleHint?: string;
  /** Callback when thinking block height changes (for virtualized list re-measurement) */
  readonly onThinkingHeightChange?: () => void;
  /** Whether thinking blocks start expanded by default */
  readonly thinkingExpandedByDefault?: boolean;
}

/**
 * Renders a single message with role icon, timestamp, and content.
 * Includes optional thinking/reasoning content displayed before the main content.
 * Tool calls are displayed inline with Gemini-style status indicators.
 */
const MessageItem = memo(function MessageItem({
  message,
  roleColor,
  mutedColor,
  accentColor,
  thinkingColor: _thinkingColor, // ThinkingBlock handles its own theming
  successColor,
  errorColor,
  showToolCalls = true,
  thinkingDisplayMode,
  thinkingToggleSignal,
  thinkingToggleHint,
  onThinkingHeightChange,
  thinkingExpandedByDefault = true,
}: MessageItemProps) {
  const { t } = useTUITranslation();
  const icon = getRoleIcon(message.role);
  const label = getRoleLabel(message.role, t);
  const timestamp = formatTimestamp(message.timestamp);
  const hasThinking = message.thinking && message.thinking.length > 0;

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Message header: role icon, label, and timestamp (or minimal for continuations) */}
      <Box>
        {message.isContinuation ? (
          <Text color={mutedColor}>↳</Text>
        ) : (
          <Text>
            {icon}{" "}
            <Text color={roleColor} bold>
              {label}
            </Text>
            <Text color={mutedColor}> • {timestamp}</Text>
            {message.isStreaming && (
              <Text color={mutedColor} italic>
                {" "}
                (streaming...)
              </Text>
            )}
          </Text>
        )}
      </Box>

      {/* Thinking/reasoning content (if present) - displayed before main content */}
      {hasThinking && (
        <ThinkingBlock
          content={message.thinking ?? ""}
          durationMs={message.thinkingDuration}
          isStreaming={message.isStreaming && !message.isThinkingComplete}
          initialCollapsed={!message.isStreaming && !thinkingExpandedByDefault}
          persistenceId={`thinking-${message.id}`}
          showCharCount
          displayMode={thinkingDisplayMode}
          toggleSignal={thinkingToggleSignal}
          toggleHint={thinkingToggleHint}
          onHeightChange={onThinkingHeightChange}
        />
      )}

      {/* Message content */}
      <Box marginLeft={2} marginTop={0}>
        <MarkdownRenderer
          content={message.content || (message.isStreaming ? "" : "(empty)")}
          compact
          textColor={roleColor}
          isStreaming={message.isStreaming}
        />
      </Box>

      {/* Tool calls, if any - Gemini-style inline with status icons */}
      {showToolCalls && message.toolCalls && message.toolCalls.length > 0 && (
        <MaxSizedBox maxHeight={15} truncationIndicator="... (more tool calls)">
          <Box flexDirection="column" marginLeft={2} marginTop={1}>
            {message.toolCalls.map((toolCall) => (
              <InlineToolCall
                key={toolCall.id}
                toolCall={toolCall}
                accentColor={accentColor}
                mutedColor={mutedColor}
                successColor={successColor}
                errorColor={errorColor}
              />
            ))}
          </Box>
        </MaxSizedBox>
      )}
    </Box>
  );
});

// =============================================================================
// Main Component
// =============================================================================

/**
 * MessageList displays a scrollable list of conversation messages.
 *
 * Features:
 * - Renders completed messages in <Static> (never re-render)
 * - Only pending streaming message causes re-renders
 * - Auto-scrolls to bottom when new messages arrive
 * - Disables auto-scroll when user scrolls up (PageUp/Up arrows)
 * - Re-enables auto-scroll when user scrolls to bottom
 * - Keyboard navigation (PageUp/PageDown, Home/End)
 * - Optional windowed display with maxHeight
 *
 * Optimization pattern from Gemini CLI:
 * - historyMessages → <Static> (rendered once, never re-render)
 * - pendingMessage → Active re-rendering during streaming
 *
 * @example
 * ```tsx
 * // Basic usage with auto-scroll
 * <MessageList messages={messages} />
 *
 * // Optional Static rendering (static output mode only)
 * <MessageList
 *   messages={messages}
 *   historyMessages={historyMessages}
 *   pendingMessage={pendingMessage}
 * />
 *
 * // With scroll change callback
 * <MessageList
 *   messages={messages}
 *   autoScroll={true}
 *   onScrollChange={(atBottom) => setShowNewIndicator(!atBottom)}
 * />
 *
 * // With max height (windowed)
 * <MessageList
 *   messages={messages}
 *   maxHeight={20}
 * />
 * ```
 */
const MessageList = memo(function MessageList({
  // Core props
  messages,
  isStreaming,
  isFocused,
  // Callbacks
  onScrollChange,
  // Configuration
  estimatedItemHeight = 4,
  scrollKeyMode = "all",
  // Deprecated props (kept for backward compatibility)
  historyMessages: _historyMessages,
  pendingMessage,
  isLoading,
  autoScroll = true,
  maxHeight,
  useVirtualizedList: _useVirtualizedList,
  forceFollowOnInput = true,
  useAltBuffer = false,
  enableScroll = false,
}: MessageListProps) {
  // Merge isStreaming and isLoading for backward compatibility
  // isStreaming takes precedence over deprecated isLoading
  const isLoadingInternal = isStreaming ?? isLoading ?? false;

  const { theme } = useTheme();

  // Subscribe to thinking display mode changes
  const [thinkingDisplayMode, setThinkingDisplayMode] =
    useState<ThinkingDisplayMode>(getThinkingDisplayMode);
  useEffect(() => {
    const unsubscribe = subscribeToDisplayMode(setThinkingDisplayMode);
    return unsubscribe;
  }, []);

  // Get thinking expanded by default setting (read once, doesn't need subscription)
  const thinkingExpandedByDefault = useMemo(() => getThinkingExpandedByDefault(), []);

  // Determine if we should show the thinking indicator:
  // - Agent is streaming (processing/waiting)
  // - AND no pending content has arrived yet
  // NOTE: Hoisted here to avoid TDZ error with scrollViewportHeight calculation
  const hasPendingContent = pendingMessage?.content && pendingMessage.content.length > 0;
  const showThinkingIndicator = isLoadingInternal && !hasPendingContent;
  const hasActiveStreaming = Boolean(pendingMessage?.isStreaming);
  const forceFollowWhileStreaming =
    autoScroll && (hasActiveStreaming || showThinkingIndicator || pendingMessage != null);
  const activeThinkingMessageId = useMemo(() => {
    if (pendingMessage?.thinking && pendingMessage.thinking.length > 0) {
      return pendingMessage.id;
    }
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message?.thinking && message.thinking.length > 0) {
        return message.id;
      }
    }
    return null;
  }, [messages, pendingMessage?.id, pendingMessage?.thinking]);

  // Get viewport dimensions for adaptive rendering
  // FIX: Use consistent inputReserve value matching useAlternateBuffer default (7)
  // This ensures height calculations are accurate:
  // - Input minHeight: 5 lines (for multiline input)
  // - Border: 2 lines (top + bottom)
  // Total: 7 lines reserved for input area
  const INPUT_RESERVE_HEIGHT = 7;
  const { availableHeight, width } = useAlternateBuffer({
    withViewport: true,
    enabled: useAltBuffer,
    inputReserve: INPUT_RESERVE_HEIGHT,
  });

  const estimatedContentWidth = Math.max(20, width - 24);

  // Calculate total estimated content height for scroll controller
  const totalContentHeight = useMemo(() => {
    return messages.reduce(
      (sum, msg) => sum + estimateMessageHeight(msg, { width: estimatedContentWidth }),
      0
    );
  }, [messages, estimatedContentWidth]);

  const toolGroupCallIds = useMemo(() => {
    const ids = new Set<string>();
    for (const message of messages) {
      if (message.role !== "tool_group" || !message.toolCalls) {
        continue;
      }
      for (const call of message.toolCalls) {
        ids.add(call.id);
      }
    }
    return ids;
  }, [messages]);
  const shouldRenderInlineToolCalls = useCallback(
    (message: Message) => {
      if (message.role !== "assistant") {
        return true;
      }
      if (!message.toolCalls || message.toolCalls.length === 0) {
        return true;
      }
      for (const call of message.toolCalls) {
        if (toolGroupCallIds.has(call.id)) {
          return false;
        }
      }
      return true;
    },
    [toolGroupCallIds]
  );

  const isStaticOutputMode = process.env.VELLUM_STATIC_OUTPUT === "1";
  const shouldConstrainHeight =
    !isStaticOutputMode && (useAltBuffer || (process.stdout.isTTY ?? false));

  // Ref for VirtualizedList imperative control
  const virtualizedListRef = useRef<VirtualizedListRef<Message>>(null);

  // Guard against scroll controller <-> list feedback loops
  const expectedScrollTopRef = useRef<number | null>(null);
  const isApplyingControllerScrollRef = useRef(false);
  const lastScrollMetricsRef = useRef({
    scrollHeight: 0,
    innerHeight: 0,
    offsetFromBottom: 0,
  });

  // Normalize maxHeight - treat 0, undefined, null as "no max height"
  const effectiveMaxHeight = maxHeight && maxHeight > 0 ? maxHeight : undefined;

  // Always use virtualized rendering (Phase 2a: removed mode switching)
  const useVirtualizedListInternal = true;

  // Compute max height for virtualized list
  const computedMaxHeight = useMemo(() => {
    if (effectiveMaxHeight !== undefined) {
      // Explicit maxHeight prop takes precedence
      return effectiveMaxHeight;
    }
    // When the layout isn't height-constrained, give VirtualizedList a fixed height
    // so it doesn't expand with content and push the input/footer out of view.
    if (!shouldConstrainHeight) {
      return availableHeight;
    }
    return undefined;
  }, [effectiveMaxHeight, shouldConstrainHeight, availableHeight]);

  // FIX: Improved thinking indicator height estimation
  // ThinkingIndicator includes: StreamingIndicator (1 line) + marginBottom (1) + paddingX
  // When expanded, it can be larger. Use a more realistic estimate.
  const THINKING_INDICATOR_HEIGHT = 3; // Conservative estimate for collapsed state
  const thinkingIndicatorHeight = showThinkingIndicator ? THINKING_INDICATOR_HEIGHT : 0;

  // Scroll viewport height (reserve space for inline indicators when needed)
  // Minimum of 8 lines to prevent degenerate rendering cases
  const MIN_SCROLL_VIEWPORT = 8;
  const scrollViewportHeight = useMemo(() => {
    const base = computedMaxHeight ?? availableHeight ?? 20;
    // FIX: Ensure we don't go negative and always have minimum viewport
    return Math.max(MIN_SCROLL_VIEWPORT, Math.max(0, base - thinkingIndicatorHeight));
  }, [computedMaxHeight, availableHeight, thinkingIndicatorHeight]);

  // Determine if we're using optimized Static rendering
  // Static mode when: adaptive mode says static OR adaptive is disabled AND no explicit maxHeight
  // NOTE: Static rendering does not support windowed scrolling; fall back when maxHeight is set.
  // T-VIRTUAL-SCROLL: Removed hasToolGroups check - tool groups work fine with Static rendering
  // as they are processed separately during message rendering.
  //
  // ==========================================================================
  // New Scroll Controller (enableScroll=true)
  // ==========================================================================
  // When enableScroll is true, use the new follow/manual scroll system with
  // ScrollIndicator and NewMessagesBadge components.

  // Track previous message count for new message notification
  const prevMessageLengthRef = useRef(messages.length);

  // Scroll controller for follow/manual modes
  const [scrollState, scrollActions] = useScrollController({
    viewportHeight: scrollViewportHeight,
    initialTotalHeight: totalContentHeight,
    scrollStep: 3,
    autoFollowOnBottom: true,
  });

  // Show badge when user has scrolled up and new messages arrived
  // (Computed later after allMessages/userScrolledUp are defined)

  // Update scroll controller when content height changes
  useEffect(() => {
    if (!enableScroll) return;
    scrollActions.setTotalHeight(totalContentHeight);
  }, [enableScroll, totalContentHeight, scrollActions]);

  // Update scroll controller when viewport height changes
  useEffect(() => {
    if (!enableScroll) return;
    scrollActions.setViewportHeight(scrollViewportHeight);
  }, [enableScroll, scrollViewportHeight, scrollActions]);

  // Notify new messages when in manual mode
  useEffect(() => {
    if (!enableScroll) return;
    const newLength = messages.length;
    const prevLength = prevMessageLengthRef.current;
    prevMessageLengthRef.current = newLength;

    if (newLength > prevLength && scrollState.mode === "manual") {
      scrollActions.notifyNewMessage();
    }
  }, [enableScroll, messages.length, scrollState.mode, scrollActions]);

  // Keyboard scroll handling (only when enableScroll is active and focused)
  useKeyboardScroll({
    state: scrollState,
    actions: scrollActions,
    enabled: enableScroll && isFocused !== false,
    vimKeys: true,
  });

  // Animated scrollbar colors for visual feedback during scroll activity
  // Provides fade-in/fade-out effect when scrolling occurs
  const { scrollbarColor: animatedThumbColor, trackColor: animatedTrackColor } =
    useAnimatedScrollbar(isFocused !== false, (delta) => {
      // Use scrollUp/scrollDown since scrollBy doesn't exist on ViewportScrollActions
      if (delta > 0) {
        scrollActions.scrollDown(Math.abs(delta));
      } else if (delta < 0) {
        scrollActions.scrollUp(Math.abs(delta));
      }
    });

  // Debug: log rendering mode changes (only in development)
  useEffect(() => {
    if (DEBUG_TUI) {
      console.error("[MessageList]", {
        totalContentHeight,
        availableHeight,
        computedMaxHeight,
        useVirtualizedListInternal,
        messageCount: messages.length,
      });
    }
  }, [totalContentHeight, availableHeight, computedMaxHeight, messages.length]);

  // Current scroll position (index of the first visible message in windowed mode)
  const [scrollOffset, setScrollOffset] = useState(0);

  // Whether user has manually scrolled away from bottom
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [thinkingToggleNonce, setThinkingToggleNonce] = useState(0);

  // Track previous message count for auto-scroll detection
  const prevMessageCountRef = useRef(messages.length);

  // Whether we're currently at the bottom of the list
  const isAtBottom = useMemo(() => {
    if (!computedMaxHeight || messages.length <= computedMaxHeight) {
      return true;
    }
    return scrollOffset >= messages.length - computedMaxHeight;
  }, [scrollOffset, messages.length, computedMaxHeight]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    const messageCountChanged = messages.length !== prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;

    if (messageCountChanged && autoScroll && !userScrolledUp) {
      // New message arrived and auto-scroll is enabled
      if (computedMaxHeight && messages.length > computedMaxHeight) {
        setScrollOffset(messages.length - computedMaxHeight);
      }
    }
  }, [messages.length, autoScroll, userScrolledUp, computedMaxHeight]);

  // Notify parent of scroll position changes
  useEffect(() => {
    onScrollChange?.(isAtBottom);
  }, [isAtBottom, onScrollChange]);

  // Scroll to bottom helper
  const scrollToBottom = useCallback(() => {
    if (enableScroll) {
      scrollActions.scrollToBottom();
    }
    if (useVirtualizedListInternal) {
      virtualizedListRef.current?.scrollToEnd();
      setUserScrolledUp(false);
      return;
    }
    if (computedMaxHeight && messages.length > computedMaxHeight) {
      setScrollOffset(messages.length - computedMaxHeight);
    }
    setUserScrolledUp(false);
  }, [enableScroll, scrollActions, messages.length, computedMaxHeight]);

  // Scroll up helper
  const scrollUp = useCallback((amount = 1) => {
    setScrollOffset((prev) => Math.max(0, prev - amount));
    setUserScrolledUp(true);
  }, []);

  // Scroll down helper
  const scrollDown = useCallback(
    (amount = 1) => {
      if (!computedMaxHeight || messages.length <= computedMaxHeight) return;

      const maxOffset = messages.length - computedMaxHeight;
      setScrollOffset((prev) => {
        const newOffset = Math.min(maxOffset, prev + amount);
        // If we've scrolled to the bottom, re-enable auto-scroll
        if (newOffset >= maxOffset) {
          setUserScrolledUp(false);
        }
        return newOffset;
      });
    },
    [messages.length, computedMaxHeight]
  );

  // Helper: Handle virtualized list keyboard navigation
  const handleVirtualizedNavigation = useCallback(
    (input: string, key: Key, list: VirtualizedListRef<Message>): boolean => {
      const scrollState = list.getScrollState();
      if (scrollState.scrollHeight <= scrollState.innerHeight) {
        return false;
      }

      const pageSize = Math.max(1, Math.floor(scrollState.innerHeight / 2));
      const lineStep = 1;

      if (scrollKeyMode === "page") {
        if (key.pageUp) {
          list.scrollBy(-pageSize);
          setUserScrolledUp(true);
          return true;
        }

        if (key.pageDown) {
          const reachesBottom =
            scrollState.scrollTop + pageSize >=
            scrollState.scrollHeight - scrollState.innerHeight - 1;
          if (reachesBottom) {
            list.scrollToEnd();
            setUserScrolledUp(false);
          } else {
            list.scrollBy(pageSize);
          }
          return true;
        }

        return false;
      }

      if (key.pageUp) {
        list.scrollBy(-pageSize);
        setUserScrolledUp(true);
        return true;
      }

      if (key.pageDown) {
        const reachesBottom =
          scrollState.scrollTop + pageSize >=
          scrollState.scrollHeight - scrollState.innerHeight - 1;
        if (reachesBottom) {
          list.scrollToEnd();
          setUserScrolledUp(false);
        } else {
          list.scrollBy(pageSize);
        }
        return true;
      }

      if (key.upArrow) {
        list.scrollBy(-lineStep);
        setUserScrolledUp(true);
        return true;
      }

      if (key.downArrow) {
        const reachesBottom =
          scrollState.scrollTop + lineStep >=
          scrollState.scrollHeight - scrollState.innerHeight - 1;
        if (reachesBottom) {
          list.scrollToEnd();
          setUserScrolledUp(false);
        } else {
          list.scrollBy(lineStep);
        }
        return true;
      }

      if (isHomeKey(input)) {
        list.scrollTo(0);
        setUserScrolledUp(true);
        return true;
      }

      if (isEndKey(input)) {
        list.scrollToEnd();
        setUserScrolledUp(false);
        return true;
      }

      if (key.meta && key.upArrow) {
        list.scrollTo(0);
        setUserScrolledUp(true);
        return true;
      }

      if (key.meta && key.downArrow) {
        list.scrollToEnd();
        setUserScrolledUp(false);
        return true;
      }

      return false;
    },
    [scrollKeyMode]
  );

  // Helper: Handle page-only scroll mode for direct navigation
  const handleDirectPageScroll = useCallback(
    (key: Key, pageStep: number): boolean => {
      if (key.pageUp) {
        scrollUp(pageStep);
        return true;
      }
      if (key.pageDown) {
        scrollDown(pageStep);
        return true;
      }
      return false;
    },
    [scrollUp, scrollDown]
  );

  // Helper: Handle arrow key navigation for direct mode
  const handleDirectArrowScroll = useCallback(
    (key: Key, pageStep: number): boolean => {
      if (key.pageUp) {
        scrollUp(pageStep);
        return true;
      }
      if (key.pageDown) {
        scrollDown(pageStep);
        return true;
      }
      if (key.upArrow && !key.meta) {
        scrollUp(1);
        return true;
      }
      if (key.downArrow && !key.meta) {
        scrollDown(1);
        return true;
      }
      return false;
    },
    [scrollUp, scrollDown]
  );

  // Helper: Handle meta key combinations for direct navigation
  const handleDirectMetaScroll = useCallback(
    (key: Key): boolean => {
      if (key.meta && key.upArrow) {
        setScrollOffset(0);
        setUserScrolledUp(true);
        return true;
      }
      if (key.meta && key.downArrow) {
        scrollToBottom();
        return true;
      }
      return false;
    },
    [scrollToBottom]
  );

  // Helper: Handle direct (non-virtualized) keyboard navigation
  const handleDirectNavigation = useCallback(
    (key: Key): boolean => {
      if (!computedMaxHeight || messages.length <= computedMaxHeight) {
        return false;
      }

      const pageStep = Math.max(1, Math.floor(computedMaxHeight / 2));

      // Page-only mode: only handle PageUp/PageDown
      if (scrollKeyMode === "page") {
        return handleDirectPageScroll(key, pageStep);
      }

      // Full mode: handle arrows first, then meta combinations
      if (handleDirectArrowScroll(key, pageStep)) {
        return true;
      }
      return handleDirectMetaScroll(key);
    },
    [
      computedMaxHeight,
      messages.length,
      scrollKeyMode,
      handleDirectPageScroll,
      handleDirectArrowScroll,
      handleDirectMetaScroll,
    ]
  );

  // Helper: Detect if key is a scroll navigation key
  const isScrollNavigationKey = useCallback(
    (char: string, key: Key): boolean => {
      if (scrollKeyMode === "page") {
        return key.pageUp || key.pageDown;
      }
      return (
        key.pageUp ||
        key.pageDown ||
        key.upArrow ||
        key.downArrow ||
        isHomeKey(char) ||
        isEndKey(char) ||
        (key.meta && key.upArrow) ||
        (key.meta && key.downArrow)
      );
    },
    [scrollKeyMode]
  );

  // Helper: Handle input when using scroll controller with virtualized list
  const handleScrollControllerInput = useCallback(
    (char: string, key: Key): boolean => {
      if (isScrollNavigationKey(char, key)) {
        return true; // Key handled by scroll controller
      }
      if (forceFollowOnInput && scrollState.mode === "manual") {
        scrollActions.scrollToBottom();
      }
      return true;
    },
    [isScrollNavigationKey, forceFollowOnInput, scrollState.mode, scrollActions]
  );

  // Force follow while streaming or showing the thinking indicator.
  useEffect(() => {
    if (!forceFollowWhileStreaming) {
      return;
    }
    scrollToBottom();
  }, [forceFollowWhileStreaming, scrollToBottom]);

  // Handle keyboard input for scrolling
  // isActive defaults to true when isFocused is undefined (backward compatible)
  useInput(
    useCallback(
      (char, key) => {
        // Alt+E to toggle thinking block expand/collapse
        // Check multiple ways since Alt detection varies by terminal:
        // 1. key.meta with 'e' char (standard Ink)
        // 2. Some terminals send Alt as escape sequence producing special chars
        const isAltE =
          (key.meta && (char.toLowerCase() === "e" || char === "ê" || char === "€")) ||
          char === "\x1b" + "e" || // escape sequence
          char === "´"; // Some Windows terminals

        if (isAltE && thinkingDisplayMode !== "compact" && activeThinkingMessageId) {
          setThinkingToggleNonce((prev) => prev + 1);
          return;
        }

        // Handle scroll controller mode separately
        if (enableScroll && useVirtualizedListInternal) {
          handleScrollControllerInput(char, key);
          return;
        }

        // Force follow on non-scroll input when user scrolled up
        const isScrollKey = isScrollNavigationKey(char, key);
        if (forceFollowOnInput && userScrolledUp && !isScrollKey) {
          scrollToBottom();
          return;
        }

        // Delegate to appropriate navigation handler
        if (useVirtualizedListInternal) {
          const list = virtualizedListRef.current;
          if (list) {
            handleVirtualizedNavigation(char, key, list);
          }
        } else {
          handleDirectNavigation(key);
        }
      },
      [
        enableScroll,
        handleScrollControllerInput,
        isScrollNavigationKey,
        forceFollowOnInput,
        userScrolledUp,
        scrollToBottom,
        handleVirtualizedNavigation,
        handleDirectNavigation,
        thinkingDisplayMode,
        activeThinkingMessageId,
      ]
    ),
    { isActive: isFocused !== false }
  );

  // Theme-based styling
  const roleColors: Record<Message["role"], string> = useMemo(
    () => ({
      user: theme.semantic.text.role.user,
      assistant: theme.semantic.text.role.assistant,
      system: theme.semantic.text.role.system,
      tool: theme.semantic.text.role.tool,
      tool_group: theme.semantic.text.role.tool,
    }),
    [
      theme.semantic.text.role.user,
      theme.semantic.text.role.assistant,
      theme.semantic.text.role.system,
      theme.semantic.text.role.tool,
    ]
  );
  const mutedColor = theme.semantic.text.muted;
  const accentColor = theme.colors.accent;
  const successColor = theme.colors.success;
  const errorColor = theme.colors.error;
  // Use muted color for thinking/reasoning content (dimmed appearance)
  const thinkingColor = theme.semantic.text.secondary ?? mutedColor;

  const getThinkingToggleInfo = useCallback(
    (message: Message) => {
      if (!message.thinking || message.thinking.length === 0) {
        return { signal: undefined, hint: undefined };
      }
      if (thinkingDisplayMode === "compact") {
        return { signal: undefined, hint: undefined };
      }
      if (message.id !== activeThinkingMessageId) {
        return { signal: undefined, hint: undefined };
      }
      return {
        signal: thinkingToggleNonce > 0 ? thinkingToggleNonce : undefined,
        hint: THINKING_TOGGLE_HINT,
      };
    },
    [activeThinkingMessageId, thinkingDisplayMode, thinkingToggleNonce]
  );

  // Callback to trigger re-measurement when ThinkingBlock height changes
  const handleThinkingHeightChange = useCallback(() => {
    virtualizedListRef.current?.forceRemeasure();
    setStreamingMeasureNonce((prev) => prev + 1);
  }, []);

  // Virtualized list callbacks must be defined unconditionally to keep hook order stable.
  const renderMessageItem = useCallback(
    ({ item }: { item: Message; index: number }) => {
      if (item.role === "tool_group") {
        return (
          <ToolGroupItem
            message={item as Message & { role: "tool_group" }}
            accentColor={accentColor}
            mutedColor={mutedColor}
            successColor={successColor}
            errorColor={errorColor}
          />
        );
      }
      const showToolCallsForItem = shouldRenderInlineToolCalls(item);
      const thinkingToggle = getThinkingToggleInfo(item);
      // Standard message rendering
      return (
        <MessageItem
          message={item}
          roleColor={roleColors[item.role]}
          mutedColor={mutedColor}
          accentColor={accentColor}
          thinkingColor={thinkingColor}
          successColor={successColor}
          errorColor={errorColor}
          showToolCalls={showToolCallsForItem}
          thinkingDisplayMode={thinkingDisplayMode}
          thinkingToggleSignal={thinkingToggle.signal}
          thinkingToggleHint={thinkingToggle.hint}
          onThinkingHeightChange={handleThinkingHeightChange}
          thinkingExpandedByDefault={thinkingExpandedByDefault}
        />
      );
    },
    [
      roleColors,
      mutedColor,
      accentColor,
      thinkingColor,
      successColor,
      errorColor,
      shouldRenderInlineToolCalls,
      thinkingDisplayMode,
      getThinkingToggleInfo,
      handleThinkingHeightChange,
      thinkingExpandedByDefault,
    ]
  );

  const keyExtractor = useCallback((item: Message) => item.id, []);

  const handleStickingChange = useCallback(
    (isSticking: boolean) => {
      setUserScrolledUp(!isSticking);
      onScrollChange?.(isSticking);
    },
    [onScrollChange]
  );

  // Track sync direction to prevent circular updates
  // FIX: Enhanced circular sync prevention with debouncing and direction tracking
  const syncDirectionRef = useRef<"toController" | "toList" | null>(null);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync VirtualizedList scroll position into scroll controller (for ScrollIndicator)
  const handleVirtualizedScrollTopChange = useCallback(
    (nextScrollTop: number) => {
      if (!enableScroll || !useVirtualizedListInternal) return;
      const list = virtualizedListRef.current;
      if (!list) return;

      // FIX: Skip if we're currently syncing from controller to list
      if (syncDirectionRef.current === "toList") {
        return;
      }

      const expectedScrollTop = expectedScrollTopRef.current;
      if (isApplyingControllerScrollRef.current && expectedScrollTop !== null) {
        if (Math.abs(nextScrollTop - expectedScrollTop) <= 2) {
          isApplyingControllerScrollRef.current = false;
          expectedScrollTopRef.current = null;
          return;
        }
      }

      const { scrollHeight, innerHeight } = list.getScrollState();
      const maxOffset = Math.max(0, scrollHeight - innerHeight);
      const offsetFromBottom = Math.max(0, maxOffset - nextScrollTop);

      const lastMetrics = lastScrollMetricsRef.current;
      // FIX: Increased tolerance to prevent micro-updates causing loops
      if (
        scrollHeight === lastMetrics.scrollHeight &&
        innerHeight === lastMetrics.innerHeight &&
        Math.abs(offsetFromBottom - lastMetrics.offsetFromBottom) <= 2
      ) {
        return;
      }

      lastScrollMetricsRef.current = { scrollHeight, innerHeight, offsetFromBottom };

      // Mark sync direction and clear after a frame
      syncDirectionRef.current = "toController";
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      syncTimeoutRef.current = setTimeout(() => {
        syncDirectionRef.current = null;
      }, 16); // One frame at 60fps

      scrollActions.setTotalHeight(scrollHeight);
      scrollActions.setViewportHeight(innerHeight);
      scrollActions.jumpTo(offsetFromBottom);
    },
    [enableScroll, scrollActions]
  );

  // Apply scroll controller state to VirtualizedList (keyboard/manual scroll)
  useEffect(() => {
    if (!enableScroll || !useVirtualizedListInternal) return;
    const list = virtualizedListRef.current;
    if (!list) return;

    // FIX: Skip if we're currently syncing from list to controller
    if (syncDirectionRef.current === "toController") {
      return;
    }

    const { scrollHeight, innerHeight, scrollTop } = list.getScrollState();
    const maxOffset = Math.max(0, scrollHeight - innerHeight);
    const targetScrollTop = Math.max(0, maxOffset - scrollState.offsetFromBottom);

    if (scrollState.offsetFromBottom <= 0 && !list.isAtBottom()) {
      // Mark sync direction
      syncDirectionRef.current = "toList";
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      syncTimeoutRef.current = setTimeout(() => {
        syncDirectionRef.current = null;
      }, 16);

      isApplyingControllerScrollRef.current = true;
      expectedScrollTopRef.current = maxOffset;
      list.scrollToEnd();
      return;
    }

    // FIX: Increased tolerance to prevent jitter from small differences
    if (Math.abs(scrollTop - targetScrollTop) > 2) {
      // Mark sync direction
      syncDirectionRef.current = "toList";
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      syncTimeoutRef.current = setTimeout(() => {
        syncDirectionRef.current = null;
      }, 16);

      isApplyingControllerScrollRef.current = true;
      expectedScrollTopRef.current = targetScrollTop;
      list.scrollTo(targetScrollTop);
    }
  }, [enableScroll, scrollState.offsetFromBottom]);

  // IMPORTANT: pendingMessage is merged into allMessages to avoid Ink <Static>
  // layout issues. Ink's <Static> doesn't participate in Flexbox layout and
  // renders at top, causing position problems when rendered separately.
  // NOTE: This useMemo MUST be before early return to satisfy React hooks rules.
  const allMessages = useMemo(() => {
    const msgs = messages as Message[];
    if (!pendingMessage) {
      return msgs;
    }

    // Only append pendingMessage if its ID is not already in messages.
    // This avoids creating new array references when content streams.
    const existsInMessages = msgs.some((m) => m.id === pendingMessage.id);
    if (existsInMessages) {
      return msgs;
    }
    return [...msgs, pendingMessage];
  }, [messages, pendingMessage]);

  // ============================================================================
  // Message Separation (streaming vs stable)
  // ============================================================================
  // Separate streaming vs stable messages (used for virtualized rendering)
  const messageSeparation = useMessageSeparation<Message>(allMessages, {
    maxStreamingMessages: 3,
    stableThresholdMs: 500,
  });

  // ============================================================================
  // New Messages Banner (enhanced unread notification)
  // ============================================================================
  const isAtBottomForBanner = enableScroll ? scrollState.mode === "follow" : !userScrolledUp;

  const bannerState = useNewMessagesBanner(
    scrollState.newMessageCount,
    isAtBottomForBanner,
    scrollActions.scrollToBottom
  );

  const virtualizedMessages = useMemo(
    () => (useVirtualizedListInternal ? messageSeparation.stableMessages : allMessages),
    [messageSeparation.stableMessages, allMessages]
  );

  // ============================================================================
  // Streaming Area Height Estimation
  // ============================================================================
  // NOTE: This hook MUST be before the early return to satisfy React hooks rules.
  // Calculate streaming area height dynamically based on actual content.
  // Thinking blocks can expand to 20+ lines, so we need accurate measurement.
  const estimatedStreamingAreaHeight = useMemo(() => {
    if (messageSeparation.streamingMessages.length === 0) return 0;

    // Base height per message (header + minimal content + margin)
    const baseHeight = typeof estimatedItemHeight === "number" ? estimatedItemHeight : 12;

    // Calculate height for each streaming message
    return messageSeparation.streamingMessages.reduce((total, msg) => {
      let msgHeight = baseHeight;

      // Add extra height for thinking blocks (expanded state can be 20+ lines)
      // Use a conservative upper bound to prevent TUI overlap
      if (msg.thinking && msg.thinking.length > 0) {
        // Estimate thinking block lines: 4 for header/chrome + content lines
        // Content lines = rough estimate of wrapped lines (conservative: 1 line per 60 chars)
        const thinkingContentLines = Math.ceil(msg.thinking.length / 60);
        // Cap at reasonable maximum to prevent extreme values
        const thinkingHeight = Math.min(30, 4 + thinkingContentLines);
        msgHeight += thinkingHeight;
      }

      return total + msgHeight;
    }, 0);
  }, [messageSeparation.streamingMessages, estimatedItemHeight]);

  // Measure actual streaming area height to avoid overlap with virtualized list.
  const streamingAreaRef = useRef<DOMElement | null>(null);
  const [measuredStreamingHeight, setMeasuredStreamingHeight] = useState(0);
  const [, setStreamingMeasureNonce] = useState(0);

  useLayoutEffect(() => {
    if (messageSeparation.streamingMessages.length === 0) {
      if (measuredStreamingHeight !== 0) {
        setMeasuredStreamingHeight(0);
      }
      return;
    }

    const node = streamingAreaRef.current;
    if (!node) return;

    const height = Math.max(0, Math.round(measureElement(node).height));
    if (height !== measuredStreamingHeight) {
      setMeasuredStreamingHeight(height);
    }
  }, [measuredStreamingHeight, messageSeparation.streamingMessages.length]);

  const resolvedStreamingAreaHeight =
    messageSeparation.streamingMessages.length > 0
      ? Math.max(estimatedStreamingAreaHeight, measuredStreamingHeight)
      : 0;

  const estimatedItemHeightForVirtualization = useMemo(() => {
    if (typeof estimatedItemHeight === "function") {
      return estimatedItemHeight;
    }
    const baseEstimate = estimatedItemHeight;
    return (index: number) => {
      const message = virtualizedMessages[index];
      if (!message) {
        return baseEstimate;
      }
      const includeToolCalls = shouldRenderInlineToolCalls(message);
      return Math.max(
        baseEstimate,
        estimateMessageHeightLegacy(message, estimatedContentWidth, includeToolCalls)
      );
    };
  }, [
    estimatedItemHeight,
    virtualizedMessages,
    estimatedContentWidth,
    shouldRenderInlineToolCalls,
  ]);

  // Auto-scroll to end when new messages arrive or pending content updates (virtualized mode only)
  const allMessagesLengthRef = useRef(allMessages.length);
  const prevPendingContentRef = useRef<string | undefined>(pendingMessage?.content);
  const prevPendingIdRef = useRef<string | undefined>(pendingMessage?.id);
  const prevPendingIsStreamingRef = useRef<boolean | undefined>(pendingMessage?.isStreaming);
  useEffect(() => {
    const hasNewMessages = allMessages.length > allMessagesLengthRef.current;
    const pendingContentChanged = pendingMessage?.content !== prevPendingContentRef.current;
    // Detect when a NEW assistant message starts streaming (different ID than before)
    const newPendingMessageStarted =
      pendingMessage?.id !== prevPendingIdRef.current && pendingMessage?.isStreaming;
    // Detect when streaming just finished (isStreaming changed from true to false)
    const streamingJustFinished =
      prevPendingIsStreamingRef.current === true && pendingMessage?.isStreaming === false;

    allMessagesLengthRef.current = allMessages.length;
    prevPendingContentRef.current = pendingMessage?.content;
    prevPendingIdRef.current = pendingMessage?.id;
    prevPendingIsStreamingRef.current = pendingMessage?.isStreaming;

    // Reset userScrolledUp when a new assistant message starts streaming
    // This ensures auto-scroll resumes for new responses even if user scrolled up previously
    if (newPendingMessageStarted && autoScroll) {
      setUserScrolledUp(false);
    }

    // Scroll when: new message arrived OR pending message content is streaming OR streaming just finished
    // The streamingJustFinished check ensures we scroll to bottom after streaming ends
    // to handle potential height changes (e.g., thinking block collapse)
    const shouldScroll =
      hasNewMessages ||
      (pendingMessage?.isStreaming && pendingContentChanged) ||
      streamingJustFinished;
    const shouldFollow =
      (enableScroll ? scrollState.mode === "follow" : !userScrolledUp) ||
      forceFollowWhileStreaming ||
      newPendingMessageStarted ||
      streamingJustFinished;

    if (!useVirtualizedListInternal || !autoScroll || !shouldScroll || !shouldFollow) {
      return;
    }
    scrollToBottom();
  }, [
    autoScroll,
    userScrolledUp,
    allMessages,
    pendingMessage?.content,
    pendingMessage?.isStreaming,
    pendingMessage?.id,
    enableScroll,
    scrollState.mode,
    forceFollowWhileStreaming,
    scrollToBottom,
  ]);

  // Empty state
  if (allMessages.length === 0) {
    return (
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        <Text color={mutedColor} italic>
          No messages yet. Start a conversation!
        </Text>
      </Box>
    );
  }

  // ==========================================================================
  // Virtualized Rendering (only rendering mode - Phase 2a)
  // ==========================================================================
  // FIX: When computedMaxHeight is undefined, rely on flex sizing so the list can
  // shrink to make room for streaming messages rendered below VirtualizedList.
  // Streaming area height is computed above (estimate + measurement) for the
  // constrained-height path.
  const listHeight =
    computedMaxHeight !== undefined
      ? Math.max(1, computedMaxHeight - thinkingIndicatorHeight - resolvedStreamingAreaHeight)
      : undefined;

  return (
    <Box flexDirection="column" flexGrow={1} minHeight={0} height={computedMaxHeight}>
      <Box flexDirection="row" flexGrow={1} minHeight={0} height={listHeight}>
        <Box flexDirection="column" flexGrow={1} minHeight={0} height={listHeight}>
          <VirtualizedList
            ref={virtualizedListRef}
            data={virtualizedMessages}
            renderItem={renderMessageItem}
            keyExtractor={keyExtractor}
            estimatedItemHeight={estimatedItemHeightForVirtualization}
            initialScrollIndex={SCROLL_TO_ITEM_END}
            initialScrollOffsetInIndex={SCROLL_TO_ITEM_END}
            onScrollTopChange={handleVirtualizedScrollTopChange}
            onStickingToBottomChange={handleStickingChange}
            scrollbarThumbColor={animatedThumbColor}
            alignToBottom
            isStreaming={hasActiveStreaming}
          />
        </Box>
        {/* ScrollIndicator (right side) - only when enableScroll is true */}
        {enableScroll && (
          <ScrollIndicator
            totalHeight={scrollState.totalHeight}
            offsetFromBottom={scrollState.offsetFromBottom}
            viewportHeight={scrollState.viewportHeight}
            thumbColor={animatedThumbColor}
            trackColor={animatedTrackColor}
          />
        )}
      </Box>

      {/* Thinking indicator - shows while agent is processing before first token */}
      {showThinkingIndicator && <ThinkingIndicator />}

      {/* Streaming messages rendered separately (outside VirtualizedList) */}
      {messageSeparation.streamingMessages.length > 0 && (
        <Box ref={streamingAreaRef} flexDirection="column" paddingX={1} flexShrink={0}>
          {messageSeparation.streamingMessages.map((msg, index) => (
            <Box key={msg.id}>{renderMessageItem({ item: msg, index })}</Box>
          ))}
        </Box>
      )}

      {/* NewMessagesBanner - enhanced unread notification */}
      {bannerState.isVisible && (
        <NewMessagesBanner
          unreadCount={scrollState.newMessageCount}
          isAtBottom={isAtBottomForBanner}
          onJumpToBottom={scrollActions.scrollToBottom}
        />
      )}

      {/* Auto-scroll status indicator */}
      {!enableScroll && userScrolledUp && autoScroll && (
        <Box justifyContent="center">
          <Text color={mutedColor} italic>
            Auto-scroll paused (scroll to bottom to resume)
          </Text>
        </Box>
      )}
    </Box>
  );
});

export { MessageList };
export default MessageList;
