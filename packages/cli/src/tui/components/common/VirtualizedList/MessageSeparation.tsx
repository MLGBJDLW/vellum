/**
 * Message Separation
 *
 * Separates streaming and stable messages to optimize rendering performance.
 * Streaming messages are rendered separately with high-frequency updates,
 * while stable messages are virtualized for efficient memory usage.
 *
 * Architecture:
 * - Streaming messages: Rendered separately, high-frequency updates
 * - Stable messages: Virtualized list rendering, low-frequency updates
 * - Transition state: Smooth transition from streaming → stable
 *
 * @module tui/components/common/VirtualizedList/MessageSeparation
 */

import { Box, Text } from "ink";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Message status classification.
 *
 * - `streaming`: Actively receiving content, high-frequency updates
 * - `stable`: Complete, ready for virtualization
 * - `transitioning`: Moving from streaming to stable (animation phase)
 */
export type MessageStatus = "streaming" | "stable" | "transitioning";

/**
 * Metadata for tracking message state and timing.
 */
export interface MessageMeta {
  /** Unique message identifier */
  readonly id: string;
  /** Current message status */
  readonly status: MessageStatus;
  /** Timestamp when streaming started (ms since epoch) */
  readonly streamStartTime?: number;
  /** Timestamp of last content update (ms since epoch) */
  readonly lastUpdateTime?: number;
  /** Estimated completion progress (0-1), computed from content patterns */
  readonly estimatedProgress?: number;
}

/**
 * Configuration for message separation behavior.
 */
export interface MessageSeparationConfig {
  /** Maximum concurrent streaming messages (prevents memory leaks) */
  readonly maxStreamingMessages: number;
  /** Duration for transition animation (ms) */
  readonly transitionDurationMs: number;
  /** Time without updates before message becomes stable (ms) */
  readonly stableThresholdMs: number;
}

/**
 * Default configuration values.
 * Tuned for typical LLM streaming patterns.
 */
export const DEFAULT_MESSAGE_SEPARATION_CONFIG: MessageSeparationConfig = {
  maxStreamingMessages: 3,
  transitionDurationMs: 200,
  stableThresholdMs: 500,
};

/**
 * Generic message interface for separation logic.
 */
export interface SeparableMessage {
  /** Unique identifier */
  readonly id: string;
  /** Message content */
  readonly content: string;
  /** Whether message is actively streaming */
  readonly isStreaming?: boolean;
}

/**
 * Result of message separation.
 */
export interface SeparatedMessages<T extends SeparableMessage = SeparableMessage> {
  /** Stable messages suitable for virtualized rendering */
  readonly stableMessages: readonly T[];
  /** Streaming messages requiring dedicated rendering */
  readonly streamingMessages: readonly (T & { meta: MessageMeta })[];
  /** IDs of messages currently transitioning */
  readonly transitioningIds: readonly string[];
}

/**
 * Return type for useMessageSeparation hook.
 */
export interface UseMessageSeparationReturn<T extends SeparableMessage = SeparableMessage>
  extends SeparatedMessages<T> {
  /** Mark a message as complete (triggers transition) */
  markComplete: (id: string) => void;
  /** Get current status of a message */
  getStatus: (id: string) => MessageStatus;
  /** Count of currently streaming messages */
  streamingCount: number;
}

/**
 * Props for streaming message item component.
 */
export interface StreamingMessageItemProps {
  /** Message identifier */
  readonly id: string;
  /** Message content */
  readonly content: string;
  /** Message metadata */
  readonly meta: MessageMeta;
  /** Callback when streaming completes */
  readonly onComplete?: (id: string) => void;
}

/**
 * Props for stable message item component.
 */
export interface StableMessageItemProps {
  /** Message identifier */
  readonly id: string;
  /** Message content */
  readonly content: string;
}

// ============================================================================
// Internal State Types
// ============================================================================

/**
 * Internal state for tracking message metadata.
 */
interface MessageMetaState {
  readonly id: string;
  readonly status: MessageStatus;
  readonly streamStartTime: number;
  readonly lastUpdateTime: number;
  readonly estimatedProgress: number;
  /** Content length at last check (for progress estimation) */
  readonly lastContentLength: number;
}

// ============================================================================
// Hook: useMessageSeparation
// ============================================================================

/**
 * Hook for separating streaming and stable messages.
 *
 * Automatically tracks message state transitions:
 * 1. Messages with `isStreaming=true` are classified as streaming
 * 2. After `stableThresholdMs` without updates → transitioning
 * 3. After `transitionDurationMs` animation → stable
 *
 * @param messages - Array of messages to separate
 * @param config - Optional configuration overrides
 * @returns Separated messages with control functions
 *
 * @example
 * ```tsx
 * const { stableMessages, streamingMessages, markComplete } = useMessageSeparation(
 *   messages,
 *   { maxStreamingMessages: 2 }
 * );
 *
 * return (
 *   <>
 *     <VirtualizedList data={stableMessages} ... />
 *     {streamingMessages.map(msg => (
 *       <StreamingMessage key={msg.id} {...msg} onComplete={markComplete} />
 *     ))}
 *   </>
 * );
 * ```
 */
export function useMessageSeparation<T extends SeparableMessage>(
  messages: readonly T[],
  config?: Partial<MessageSeparationConfig>
): UseMessageSeparationReturn<T> {
  const mergedConfig = useMemo<MessageSeparationConfig>(
    () => ({
      ...DEFAULT_MESSAGE_SEPARATION_CONFIG,
      ...config,
    }),
    [config]
  );

  // Track metadata for each message
  const [metaMap, setMetaMap] = useState<Map<string, MessageMetaState>>(() => new Map());

  // Track transitioning message IDs
  const [transitioningIds, setTransitioningIds] = useState<Set<string>>(() => new Set());

  // Refs for cleanup timers
  const transitionTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const stableCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Update metadata when messages change.
   */
  useEffect(() => {
    const now = Date.now();
    const newMetaMap = new Map<string, MessageMetaState>();
    const currentIds = new Set(messages.map((m) => m.id));

    for (const message of messages) {
      const existing = metaMap.get(message.id);
      const isStreaming = message.isStreaming ?? false;

      if (existing) {
        // Update existing entry
        const contentChanged = message.content.length !== existing.lastContentLength;
        const progress = estimateProgress(message.content, existing.lastContentLength);

        newMetaMap.set(message.id, {
          ...existing,
          status: isStreaming ? "streaming" : existing.status,
          lastUpdateTime: contentChanged ? now : existing.lastUpdateTime,
          estimatedProgress: progress,
          lastContentLength: message.content.length,
        });
      } else {
        // New message
        newMetaMap.set(message.id, {
          id: message.id,
          status: isStreaming ? "streaming" : "stable",
          streamStartTime: isStreaming ? now : 0,
          lastUpdateTime: now,
          estimatedProgress: isStreaming ? 0 : 1,
          lastContentLength: message.content.length,
        });
      }
    }

    // Cleanup removed messages from transition timers
    for (const id of metaMap.keys()) {
      if (!currentIds.has(id)) {
        const timer = transitionTimersRef.current.get(id);
        if (timer) {
          clearTimeout(timer);
          transitionTimersRef.current.delete(id);
        }
      }
    }

    setMetaMap(newMetaMap);
  }, [messages, metaMap]);

  /**
   * Start transition timer for a message.
   */
  const startTransition = useCallback(
    (id: string): void => {
      // Add to transitioning set
      setTransitioningIds((prev) => new Set(prev).add(id));

      // Schedule completion
      const timer = setTimeout(() => {
        setMetaMap((prev) => {
          const updated = new Map(prev);
          const meta = updated.get(id);
          if (meta && meta.status === "transitioning") {
            updated.set(id, { ...meta, status: "stable", estimatedProgress: 1 });
          }
          return updated;
        });

        setTransitioningIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });

        transitionTimersRef.current.delete(id);
      }, mergedConfig.transitionDurationMs);

      transitionTimersRef.current.set(id, timer);
    },
    [mergedConfig.transitionDurationMs]
  );

  /**
   * Periodic check for messages that should transition to stable.
   */
  useEffect(() => {
    const checkStable = (): void => {
      const now = Date.now();
      let hasChanges = false;

      setMetaMap((prev) => {
        const updated = new Map(prev);

        for (const [id, meta] of updated) {
          // Check if streaming message has been quiet long enough
          if (meta.status === "streaming") {
            const silentDuration = now - meta.lastUpdateTime;
            if (silentDuration >= mergedConfig.stableThresholdMs) {
              // Find if message is still marked as streaming in source
              const sourceMessage = messages.find((m) => m.id === id);
              if (!sourceMessage?.isStreaming) {
                updated.set(id, { ...meta, status: "transitioning" });
                hasChanges = true;
                startTransition(id);
              }
            }
          }
        }

        return hasChanges ? updated : prev;
      });
    };

    // Run check periodically
    stableCheckTimerRef.current = setInterval(checkStable, 100);

    return () => {
      if (stableCheckTimerRef.current) {
        clearInterval(stableCheckTimerRef.current);
      }
    };
  }, [messages, mergedConfig.stableThresholdMs, startTransition]);

  /**
   * Manually mark a message as complete.
   */
  const markComplete = useCallback(
    (id: string): void => {
      setMetaMap((prev) => {
        const updated = new Map(prev);
        const meta = updated.get(id);
        if (meta && meta.status === "streaming") {
          updated.set(id, { ...meta, status: "transitioning" });
          startTransition(id);
        }
        return updated;
      });
    },
    [startTransition]
  );

  /**
   * Get current status of a message.
   */
  const getStatus = useCallback(
    (id: string): MessageStatus => {
      return metaMap.get(id)?.status ?? "stable";
    },
    [metaMap]
  );

  /**
   * Compute separated messages.
   */
  const separated = useMemo<SeparatedMessages<T>>(() => {
    const stable: T[] = [];
    const streaming: (T & { meta: MessageMeta })[] = [];

    for (const message of messages) {
      const meta = metaMap.get(message.id);
      const status = meta?.status ?? "stable";

      if (status === "streaming" || status === "transitioning") {
        // Enforce max streaming limit (FIFO - keep newest)
        if (streaming.length >= mergedConfig.maxStreamingMessages) {
          // Move oldest to stable
          const oldest = streaming.shift();
          if (oldest) {
            // Remove meta to convert back to base type - find original message
            const originalMessage = messages.find((m) => m.id === oldest.id);
            if (originalMessage) {
              stable.push(originalMessage);
            }
          }
        }

        streaming.push({
          ...message,
          meta: {
            id: message.id,
            status,
            streamStartTime: meta?.streamStartTime,
            lastUpdateTime: meta?.lastUpdateTime,
            estimatedProgress: meta?.estimatedProgress,
          },
        });
      } else {
        stable.push(message);
      }
    }

    return {
      stableMessages: stable,
      streamingMessages: streaming,
      transitioningIds: Array.from(transitioningIds),
    };
  }, [messages, metaMap, transitioningIds, mergedConfig.maxStreamingMessages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const timer of transitionTimersRef.current.values()) {
        clearTimeout(timer);
      }
      transitionTimersRef.current.clear();
    };
  }, []);

  return {
    ...separated,
    markComplete,
    getStatus,
    streamingCount: separated.streamingMessages.length,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Estimate streaming progress based on content patterns.
 *
 * Uses heuristics:
 * - Code blocks ending with ``` suggest completion
 * - Sentence-ending punctuation suggests paragraph completion
 * - Growth rate analysis for overall progress
 *
 * @param content - Current message content
 * @param lastLength - Content length at last check
 * @returns Estimated progress (0-1)
 */
function estimateProgress(content: string, lastLength: number): number {
  // No content yet
  if (content.length === 0) return 0;

  // Check for completion indicators
  const hasEndingPunctuation = /[.!?]\s*$/.test(content);
  const codeBlockCount = (content.match(/```/g) || []).length;
  const hasCompleteCodeBlocks = codeBlockCount % 2 === 0 && codeBlockCount > 0;

  // Base progress on content characteristics
  let progress = 0.5;

  if (hasEndingPunctuation) {
    progress += 0.2;
  }

  if (hasCompleteCodeBlocks) {
    progress += 0.2;
  }

  // Growth rate factor (slowing growth suggests nearing completion)
  const growthRate = lastLength > 0 ? content.length / lastLength : 1;
  if (growthRate < 1.1) {
    progress += 0.1; // Minimal growth suggests near completion
  }

  return Math.min(1, progress);
}

// ============================================================================
// Components
// ============================================================================

/**
 * Memoized stable message item.
 * Prevents re-renders when parent updates.
 */
export const StableMessageItem = React.memo(function StableMessageItem({
  id,
  content,
}: StableMessageItemProps): React.ReactElement {
  return (
    <Box key={id} flexDirection="column">
      <Text>{content}</Text>
    </Box>
  );
});

/**
 * Streaming message item with progress indicator.
 * Designed for high-frequency updates without virtualization overhead.
 */
export const StreamingMessageItem = React.memo(function StreamingMessageItem({
  id,
  content,
  meta,
  onComplete,
}: StreamingMessageItemProps): React.ReactElement {
  // Auto-complete when transitioning
  useEffect(() => {
    if (meta.status === "transitioning" && onComplete) {
      // Callback after transition completes (handled by hook)
    }
  }, [meta.status, onComplete]);

  const progressText =
    meta.estimatedProgress !== undefined ? `${Math.round(meta.estimatedProgress * 100)}%` : "";

  return (
    <Box key={id} flexDirection="column">
      <Text>{content}</Text>
      {meta.status === "streaming" && (
        <Box marginTop={1}>
          <Text dimColor>⟳ Streaming... {progressText}</Text>
        </Box>
      )}
      {meta.status === "transitioning" && (
        <Box marginTop={1}>
          <Text dimColor>✓ Completing...</Text>
        </Box>
      )}
    </Box>
  );
});

// ============================================================================
// Renderer Factory
// ============================================================================

/**
 * Message renderer factory return type.
 */
export interface MessageRendererFactory {
  /** Render a streaming message */
  renderStreaming: (props: StreamingMessageItemProps) => React.ReactNode;
  /** Render a stable message */
  renderStable: (props: StableMessageItemProps) => React.ReactNode;
}

/**
 * Create message renderer functions with shared configuration.
 *
 * Provides consistent rendering behavior across the application.
 * Use this factory to ensure streaming and stable messages have
 * compatible styling and behavior.
 *
 * @param config - Optional configuration overrides
 * @returns Object with render functions
 *
 * @example
 * ```tsx
 * const { renderStreaming, renderStable } = createMessageRenderer();
 *
 * // In virtualized list
 * const renderItem = ({ item, index }) => {
 *   const status = getStatus(item.id);
 *   if (status === 'streaming') {
 *     return renderStreaming({ id: item.id, content: item.content, meta: getMeta(item.id) });
 *   }
 *   return renderStable({ id: item.id, content: item.content });
 * };
 * ```
 */
export function createMessageRenderer(
  _config?: Partial<MessageSeparationConfig>
): MessageRendererFactory {
  return {
    renderStreaming: (props: StreamingMessageItemProps): React.ReactNode => {
      return <StreamingMessageItem {...props} />;
    },
    renderStable: (props: StableMessageItemProps): React.ReactNode => {
      return <StableMessageItem {...props} />;
    },
  };
}

// Note: Types are exported inline with their definitions above
