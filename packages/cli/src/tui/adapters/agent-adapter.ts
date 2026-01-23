/**
 * Agent Adapter for AgentLoop ↔ TUI Context Integration
 *
 * Provides event mapping from AgentLoop to MessagesContext and ToolsContext,
 * enabling seamless integration between the agent execution engine and the TUI.
 *
 * @module tui/adapters/agent-adapter
 */

import type { AgentLoop, ExecutionResult } from "@vellum/core";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { ICONS } from "../../utils/icons.js";
import type { MessageTokenUsage, ToolCallInfo } from "../context/MessagesContext.js";
import { useMessages } from "../context/MessagesContext.js";
import { useTools } from "../context/ToolsContext.js";
import { findLastSafeSplitPoint } from "../utils/findLastSafeSplitPoint.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Interface for the Agent Adapter
 *
 * Provides methods to connect and disconnect from an AgentLoop,
 * mapping its events to the TUI context providers.
 */
export interface AgentAdapter {
  /**
   * Connect to an AgentLoop and start listening to its events
   *
   * @param agentLoop - The AgentLoop instance to connect to
   */
  connect: (agentLoop: AgentLoop) => void;

  /**
   * Disconnect from the current AgentLoop and stop listening to events
   */
  disconnect: () => void;
}

/**
 * Options for the useAgentAdapter hook
 */
export interface UseAgentAdapterOptions {
  /**
   * Whether to automatically clear contexts on disconnect
   * @default false
   */
  clearOnDisconnect?: boolean;

  /**
   * Whether to enable message splitting for long streaming responses.
   *
   * When enabled, long messages are split at safe points (paragraph breaks)
   * and completed portions are moved to historyMessages for <Static> rendering.
   *
   * **WARNING**: This can cause messages to disappear in VirtualizedList mode
   * because historyMessages may be outside the visible render window.
   * Only enable if using standard (non-virtualized) message rendering.
   *
   * @default false
   */
  enableMessageSplitting?: boolean;
}

/**
 * Return value of the useAgentAdapter hook
 */
export interface UseAgentAdapterReturn extends AgentAdapter {
  /**
   * Whether currently connected to an AgentLoop
   */
  isConnected: boolean;
}

// =============================================================================
// Message ID Tracking
// =============================================================================

/**
 * Tracks the current streaming message for event correlation
 */
interface StreamingMessage {
  /** Message ID in the context */
  id: string;
  /** Accumulated content */
  content: string;
  /** Accumulated thinking content */
  thinking: string;
  /** Whether this message has started streaming */
  hasStarted: boolean;
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook that creates an agent adapter for connecting AgentLoop events
 * to MessagesContext and ToolsContext.
 *
 * Event mappings:
 * - `stateChange` (to streaming) → addMessage to MessagesContext (streaming start)
 * - `text` → appendToMessage in MessagesContext
 * - `complete` → updateMessage (isStreaming: false) in MessagesContext
 * - `toolStart` → addExecution to ToolsContext
 * - `toolEnd` → updateExecution in ToolsContext
 *
 * @param options - Configuration options for the adapter
 * @returns The agent adapter interface with connect/disconnect methods
 *
 * @example
 * ```tsx
 * function AgentContainer() {
 *   const adapter = useAgentAdapter();
 *   const loopRef = useRef<AgentLoop | null>(null);
 *
 *   useEffect(() => {
 *     const loop = new AgentLoop(config);
 *     loopRef.current = loop;
 *     adapter.connect(loop);
 *
 *     return () => {
 *       adapter.disconnect();
 *     };
 *   }, []);
 *
 *   return <ChatUI />;
 * }
 * ```
 */
export function useAgentAdapter(options: UseAgentAdapterOptions = {}): UseAgentAdapterReturn {
  const { clearOnDisconnect = false, enableMessageSplitting = false } = options;

  // Context hooks
  const {
    addMessage,
    appendToMessage,
    appendToThinking,
    updateMessage,
    clearMessages,
    commitPendingMessage,
    splitMessageAtSafePoint,
    addToolGroup,
    updateToolGroup,
    historyMessages,
  } = useMessages();
  const { addExecution, updateExecution, clearExecutions, registerCallId } = useTools();

  // =============================================================================
  // Stable Refs for Context Methods
  // =============================================================================
  // Store context methods in refs to avoid callback recreation on every render.
  // This prevents the connect/disconnect cycle that resets streamingMessageRef
  // during active streaming, which was causing message splitting and flickering.

  const addMessageRef = useRef(addMessage);
  const appendToMessageRef = useRef(appendToMessage);
  const appendToThinkingRef = useRef(appendToThinking);
  const updateMessageRef = useRef(updateMessage);
  const clearMessagesRef = useRef(clearMessages);
  const commitPendingMessageRef = useRef(commitPendingMessage);
  const splitMessageAtSafePointRef = useRef(splitMessageAtSafePoint);
  const addToolGroupRef = useRef(addToolGroup);
  const updateToolGroupRef = useRef(updateToolGroup);
  const addExecutionRef = useRef(addExecution);
  const updateExecutionRef = useRef(updateExecution);
  const clearExecutionsRef = useRef(clearExecutions);
  const registerCallIdRef = useRef(registerCallId);
  const historyMessagesRef = useRef(historyMessages);

  // Keep refs up-to-date without triggering callback recreation
  useEffect(() => {
    addMessageRef.current = addMessage;
    appendToMessageRef.current = appendToMessage;
    appendToThinkingRef.current = appendToThinking;
    updateMessageRef.current = updateMessage;
    clearMessagesRef.current = clearMessages;
    commitPendingMessageRef.current = commitPendingMessage;
    splitMessageAtSafePointRef.current = splitMessageAtSafePoint;
    addToolGroupRef.current = addToolGroup;
    updateToolGroupRef.current = updateToolGroup;
    addExecutionRef.current = addExecution;
    updateExecutionRef.current = updateExecution;
    clearExecutionsRef.current = clearExecutions;
    registerCallIdRef.current = registerCallId;
    historyMessagesRef.current = historyMessages;
  }, [
    addMessage,
    appendToMessage,
    appendToThinking,
    updateMessage,
    clearMessages,
    commitPendingMessage,
    splitMessageAtSafePoint,
    addToolGroup,
    updateToolGroup,
    addExecution,
    updateExecution,
    clearExecutions,
    registerCallId,
    historyMessages,
  ]);

  // =============================================================================
  // Connection State Refs
  // =============================================================================

  // Track connection state
  const connectedLoopRef = useRef<AgentLoop | null>(null);
  const isConnectedRef = useRef(false);

  // Track current streaming message
  const streamingMessageRef = useRef<StreamingMessage | null>(null);

  // Pending tool calls awaiting an assistant message to attach to (for persistence)
  const pendingToolCallsRef = useRef<Map<string, ToolCallInfo>>(new Map());

  // Map tool call IDs to execution IDs (for context correlation)
  const toolIdMapRef = useRef<Map<string, string>>(new Map());

  // Map tool call IDs to tool_group message IDs (for inline UI rendering)
  const toolGroupMapRef = useRef<Map<string, string>>(new Map());

  const pendingUsageRef = useRef<MessageTokenUsage | null>(null);

  // =============================================================================
  // Thinking Event Handling
  // =============================================================================

  /**
   * Detect if the new assistant message should be marked as a continuation.
   * A continuation occurs when:
   * - The last message in history is a tool_group
   * - The message before that was an assistant message
   *
   * This allows the UI to render a minimal `↳` indicator instead of the full header.
   */
  const isContinuationAfterToolGroup = useCallback((): boolean => {
    const history = historyMessagesRef.current;
    if (history.length < 2) {
      return false;
    }
    const lastMessage = history[history.length - 1];
    const secondLastMessage = history[history.length - 2];

    // Check if last is tool_group and second-last is assistant
    return lastMessage?.role === "tool_group" && secondLastMessage?.role === "assistant";
  }, []);

  /**
   * Store or update a pending tool call until a streaming message exists.
   * Ensures tool call data is persisted even when tools fire before text.
   */
  const upsertPendingToolCall = useCallback((toolCallInfo: ToolCallInfo) => {
    const existing = pendingToolCallsRef.current.get(toolCallInfo.id);
    if (existing) {
      pendingToolCallsRef.current.set(toolCallInfo.id, {
        ...existing,
        ...toolCallInfo,
        arguments:
          Object.keys(toolCallInfo.arguments).length > 0
            ? toolCallInfo.arguments
            : existing.arguments,
      });
    } else {
      pendingToolCallsRef.current.set(toolCallInfo.id, toolCallInfo);
    }
  }, []);

  /**
   * Flush any pending tool calls to attach to the next assistant message.
   */
  const flushPendingToolCalls = useCallback((): ToolCallInfo[] | undefined => {
    if (pendingToolCallsRef.current.size === 0) {
      return undefined;
    }
    const calls = Array.from(pendingToolCallsRef.current.values());
    pendingToolCallsRef.current.clear();
    return calls;
  }, []);

  /**
   * Handle thinking streaming from AgentLoop.
   * Appends thinking content directly to the streaming message.
   */
  const handleThinking = useCallback(
    (text: string) => {
      if (!streamingMessageRef.current) {
        const pendingToolCalls = flushPendingToolCalls();
        const isContinuation = isContinuationAfterToolGroup();
        const pendingUsage = pendingUsageRef.current ?? undefined;
        const id = addMessageRef.current({
          role: "assistant",
          content: "",
          isStreaming: true,
          isContinuation,
          toolCalls: pendingToolCalls && pendingToolCalls.length > 0 ? pendingToolCalls : undefined,
          ...(pendingUsage ? { tokenUsage: pendingUsage } : {}),
        });
        streamingMessageRef.current = {
          id,
          content: "",
          thinking: "",
          hasStarted: true,
        };
        if (pendingUsage) {
          pendingUsageRef.current = null;
        }
      }
      streamingMessageRef.current.thinking += text;
      // Append thinking content to the message via context
      appendToThinkingRef.current(streamingMessageRef.current.id, text);
    },
    [flushPendingToolCalls, isContinuationAfterToolGroup]
  );

  /**
   * Handle text streaming from AgentLoop
   * Maps to: appendToMessage in MessagesContext
   *
   * Uses refs for context methods to maintain callback stability and prevent
   * message splitting during re-renders.
   *
   * When content exceeds the threshold, checks for safe split points
   * (paragraph breaks, headers, list items - NOT inside code blocks)
   * and splits to move completed content to Static for better performance.
   */
  const handleText = useCallback(
    (text: string) => {
      const streaming = streamingMessageRef.current;

      if (!streaming) {
        // Start a new streaming message if we receive text without a message
        const pendingToolCalls = flushPendingToolCalls();
        const isContinuation = isContinuationAfterToolGroup();
        const pendingUsage = pendingUsageRef.current ?? undefined;
        const id = addMessageRef.current({
          role: "assistant",
          content: text,
          isStreaming: true,
          isContinuation,
          toolCalls: pendingToolCalls && pendingToolCalls.length > 0 ? pendingToolCalls : undefined,
          ...(pendingUsage ? { tokenUsage: pendingUsage } : {}),
        });
        streamingMessageRef.current = {
          id,
          content: text,
          thinking: "",
          hasStarted: true,
        };
        if (pendingUsage) {
          pendingUsageRef.current = null;
        }
      } else {
        // Append to existing streaming message
        streaming.content += text;
        appendToMessageRef.current(streaming.id, text);

        // Only split messages if explicitly enabled.
        // Splitting can cause messages to disappear in VirtualizedList mode
        // because split portions are moved to historyMessages which may not be rendered.
        if (enableMessageSplitting) {
          // Check if we should split at a safe point to improve performance
          // This moves completed content to Static where it won't re-render
          // Uses newline-gated strategy - only splits at paragraph breaks (\n\n)
          const splitIndex = findLastSafeSplitPoint(streaming.content);
          if (splitIndex > 0) {
            splitMessageAtSafePointRef.current(splitIndex);
            // Update local tracking to reflect the split
            streaming.content = streaming.content.slice(splitIndex);
          }
        }
      }
    },
    [enableMessageSplitting, flushPendingToolCalls, isContinuationAfterToolGroup]
  ); // Depends on enableMessageSplitting flag

  /**
   * Handle message/complete events from AgentLoop
   * Maps to: commitPendingMessage (move pending to history for Static rendering)
   *
   * When streaming completes, the pending message is committed to history.
   * This moves it to Ink's <Static> component where it will never re-render.
   */
  const handleComplete = useCallback(() => {
    const streaming = streamingMessageRef.current;

    if (streaming) {
      // NOTE: Do NOT copy thinking to content - they are separate concerns.
      // Thinking content should stay in the thinking field and be rendered
      // by the ThinkingBlock component, not mixed with regular content.
      // Commit the pending message to history (moves to <Static>)
      // This is more efficient than just marking isStreaming: false
      // because the message will never re-render once in <Static>
      commitPendingMessageRef.current();
      streamingMessageRef.current = null;
    }
    pendingToolCallsRef.current.clear();
    pendingUsageRef.current = null;
  }, []); // Empty deps = stable callback

  const handleUsage = useCallback((usage: MessageTokenUsage) => {
    const tokenUsage: MessageTokenUsage = {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      ...(usage.thinkingTokens !== undefined ? { thinkingTokens: usage.thinkingTokens } : {}),
      ...(usage.cacheReadTokens !== undefined ? { cacheReadTokens: usage.cacheReadTokens } : {}),
      ...(usage.cacheWriteTokens !== undefined ? { cacheWriteTokens: usage.cacheWriteTokens } : {}),
    };

    pendingUsageRef.current = tokenUsage;

    const streaming = streamingMessageRef.current;
    if (streaming) {
      updateMessageRef.current(streaming.id, { tokenUsage });
    }
  }, []);

  /**
   * Handle error events from AgentLoop
   * Ensures streaming state is properly reset when an error occurs.
   */
  const handleError = useCallback((error: Error) => {
    const streaming = streamingMessageRef.current;

    if (streaming) {
      const content =
        streaming.content.trim().length > 0
          ? streaming.content
          : `${ICONS.warning} ${error.message}`;
      // Mark the message as no longer streaming and surface the error
      updateMessageRef.current(streaming.id, { isStreaming: false, content });
      commitPendingMessageRef.current();
      streamingMessageRef.current = null;
      pendingToolCallsRef.current.clear();
      pendingUsageRef.current = null;
    } else {
      addMessageRef.current({
        role: "assistant",
        content: `${ICONS.warning} ${error.message}`,
        isStreaming: false,
      });
    }
    pendingToolCallsRef.current.clear();
    pendingUsageRef.current = null;

    // Log error for debugging (could also emit to a context/store if needed)
    console.error("[AgentAdapter] AgentLoop error:", error.message);
  }, []); // Empty deps = stable callback

  /**
   * Commit the current streaming message before inserting tool rows.
   * Keeps tool_group messages inline between assistant segments.
   */
  const finalizeStreamingMessage = useCallback(() => {
    const streaming = streamingMessageRef.current;
    if (!streaming) {
      return;
    }

    const hasContent = streaming.content.trim().length > 0;
    const hasThinking = streaming.thinking.trim().length > 0;
    if (hasContent || hasThinking) {
      commitPendingMessageRef.current();
    }
    streamingMessageRef.current = null;
  }, []);

  /**
   * Create or update a tool_group message for inline tool display.
   */
  const upsertToolGroup = useCallback(
    (
      callId: string,
      name: string,
      input: Record<string, unknown>,
      status: "pending" | "running" | "completed" | "error",
      result?: unknown,
      error?: string
    ) => {
      const toolCallInfo: ToolCallInfo = {
        id: callId,
        name,
        arguments: input,
        status,
        result,
        error,
      };

      const existingGroupId = toolGroupMapRef.current.get(callId);
      if (!existingGroupId) {
        finalizeStreamingMessage();
        const groupId = addToolGroupRef.current([toolCallInfo]);
        toolGroupMapRef.current.set(callId, groupId);
        return;
      }

      updateToolGroupRef.current(existingGroupId, toolCallInfo);
    },
    [finalizeStreamingMessage]
  );

  /**
   * Sync a tool call to the streaming assistant message's toolCalls array.
   * If no message is streaming yet, stash the call for the next assistant message.
   *
   * Tool calls are persisted on assistant messages; UI rendering uses tool_group rows.
   */
  const syncToolCallToMessage = useCallback(
    (
      callId: string,
      name: string,
      input: Record<string, unknown>,
      status: "pending" | "running" | "completed" | "error",
      result?: unknown,
      error?: string
    ) => {
      const toolCallInfo: ToolCallInfo = {
        id: callId,
        name,
        arguments: input,
        status,
        result,
        error,
      };

      if (!streamingMessageRef.current) {
        upsertPendingToolCall(toolCallInfo);
        return;
      }

      // Update existing message's toolCalls (merging handled by context)
      updateMessageRef.current(streamingMessageRef.current.id, {
        toolCalls: [toolCallInfo],
      });
    },
    [upsertPendingToolCall]
  );

  /**
   * Handle tool start from AgentLoop
   * Maps to: addExecution in ToolsContext + tool_group message
   */
  const handleToolStart = useCallback(
    (callId: string, name: string, input: Record<string, unknown>) => {
      // Persist tool call info on assistant message and render inline tool row.
      syncToolCallToMessage(callId, name, input, "running");
      upsertToolGroup(callId, name, input, "running");

      const existingExecutionId = toolIdMapRef.current.get(callId);

      // If we already created a pending execution due to permissionRequired,
      // treat toolStart as an update (not a new execution) to avoid duplicates.
      if (existingExecutionId) {
        updateExecutionRef.current(existingExecutionId, {
          status: "running",
          startedAt: new Date(),
        });
        return;
      }

      // Add execution to tools context
      const executionId = addExecutionRef.current({
        toolName: name,
        params: input,
        status: "running",
        startedAt: new Date(),
      });

      // Map the AgentLoop callId to our execution ID
      toolIdMapRef.current.set(callId, executionId);
      registerCallIdRef.current(callId, executionId);
    },
    [syncToolCallToMessage, upsertToolGroup]
  );

  /**
   * Handle tool end from AgentLoop
   * Maps to: updateExecution in ToolsContext + tool_group message update
   */
  const handleToolEnd = useCallback(
    (callId: string, name: string, result: ExecutionResult) => {
      // Look up the execution ID from our map
      const executionId = toolIdMapRef.current.get(callId);

      if (executionId) {
        // Update the execution with result
        updateExecutionRef.current(executionId, {
          status: result.result.success ? "complete" : "error",
          result: result.result.success ? result.result.output : undefined,
          error: !result.result.success ? new Error(String(result.result.error)) : undefined,
          completedAt: new Date(),
        });

        // Clean up the map entry
        toolIdMapRef.current.delete(callId);
      }

      const isSuccess = result.result.success;
      upsertToolGroup(
        callId,
        name,
        {}, // Args not available here; merge keeps previous arguments if present.
        isSuccess ? "completed" : "error",
        isSuccess ? result.result.output : undefined,
        !isSuccess ? String(result.result.error) : undefined
      );
      toolGroupMapRef.current.delete(callId);
    },
    [upsertToolGroup]
  );

  /**
   * Handle permission required events
   * Maps to: addExecution with 'pending' status in ToolsContext
   */
  const handlePermissionRequired = useCallback(
    (callId: string, name: string, input: Record<string, unknown>) => {
      // Persist tool call info and show inline pending tool row.
      syncToolCallToMessage(callId, name, input, "pending");
      upsertToolGroup(callId, name, input, "pending");

      // Add execution in pending state (awaiting approval)
      const executionId = addExecutionRef.current({
        toolName: name,
        params: input,
        status: "pending",
      });

      // Map the callId to execution ID
      toolIdMapRef.current.set(callId, executionId);
      registerCallIdRef.current(callId, executionId);
    },
    [syncToolCallToMessage, upsertToolGroup]
  );

  /**
   * Handle permission granted events
   * Maps to: updateExecution with 'running' status in ToolsContext
   */
  const handlePermissionGranted = useCallback(
    (callId: string, _name: string) => {
      const executionId = toolIdMapRef.current.get(callId);

      if (executionId) {
        updateExecutionRef.current(executionId, {
          status: "running",
          startedAt: new Date(),
        });
      }

      upsertToolGroup(callId, _name, {}, "running");
    },
    [upsertToolGroup]
  );

  /**
   * Handle permission denied events
   * Maps to: updateExecution with 'rejected' status in ToolsContext
   */
  const handlePermissionDenied = useCallback(
    (callId: string, _name: string, reason: string) => {
      const executionId = toolIdMapRef.current.get(callId);

      if (executionId) {
        updateExecutionRef.current(executionId, {
          status: "rejected",
          error: new Error(reason),
        });

        // Clean up the map entry
        toolIdMapRef.current.delete(callId);
      }

      upsertToolGroup(callId, _name, {}, "error", undefined, reason);
      toolGroupMapRef.current.delete(callId);
    },
    [upsertToolGroup]
  );

  /**
   * Connect to an AgentLoop instance
   *
   * Now has empty dependencies since all handlers are stable (using refs).
   * This prevents unnecessary disconnect/reconnect cycles during re-renders.
   */
  const connect = useCallback(
    (agentLoop: AgentLoop) => {
      // Skip reconnection if already connected to the same loop
      // This prevents resetting streaming state during re-renders
      if (connectedLoopRef.current === agentLoop) {
        return;
      }

      // Disconnect from any existing loop first
      if (connectedLoopRef.current) {
        // Remove existing event listeners
        connectedLoopRef.current.off("text", handleText);
        connectedLoopRef.current.off("thinking", handleThinking);
        connectedLoopRef.current.off("complete", handleComplete);
        connectedLoopRef.current.off("error", handleError);
        connectedLoopRef.current.off("usage", handleUsage);
        connectedLoopRef.current.off("toolStart", handleToolStart);
        connectedLoopRef.current.off("toolEnd", handleToolEnd);
        connectedLoopRef.current.off("permissionRequired", handlePermissionRequired);
        connectedLoopRef.current.off("permissionGranted", handlePermissionGranted);
        connectedLoopRef.current.off("permissionDenied", handlePermissionDenied);
      }

      // Reset state only when connecting to a NEW loop
      streamingMessageRef.current = null;
      pendingToolCallsRef.current.clear();
      toolIdMapRef.current.clear();
      toolGroupMapRef.current.clear();
      pendingUsageRef.current = null;

      // Subscribe to AgentLoop events
      agentLoop.on("text", handleText);
      agentLoop.on("thinking", handleThinking);
      agentLoop.on("complete", handleComplete);
      agentLoop.on("error", handleError);
      agentLoop.on("usage", handleUsage);
      agentLoop.on("toolStart", handleToolStart);
      agentLoop.on("toolEnd", handleToolEnd);
      agentLoop.on("permissionRequired", handlePermissionRequired);
      agentLoop.on("permissionGranted", handlePermissionGranted);
      agentLoop.on("permissionDenied", handlePermissionDenied);

      // Store reference
      connectedLoopRef.current = agentLoop;
      isConnectedRef.current = true;
    },
    [
      handleText,
      handleThinking,
      handleComplete,
      handleError,
      handleUsage,
      handleToolStart,
      handleToolEnd,
      handlePermissionRequired,
      handlePermissionGranted,
      handlePermissionDenied,
    ]
  );

  /**
   * Disconnect from the current AgentLoop
   *
   * Uses refs for clear functions to maintain callback stability.
   */
  const disconnect = useCallback(() => {
    if (connectedLoopRef.current) {
      // Remove all event listeners
      connectedLoopRef.current.off("text", handleText);
      connectedLoopRef.current.off("thinking", handleThinking);
      connectedLoopRef.current.off("complete", handleComplete);
      connectedLoopRef.current.off("error", handleError);
      connectedLoopRef.current.off("usage", handleUsage);
      connectedLoopRef.current.off("toolStart", handleToolStart);
      connectedLoopRef.current.off("toolEnd", handleToolEnd);
      connectedLoopRef.current.off("permissionRequired", handlePermissionRequired);
      connectedLoopRef.current.off("permissionGranted", handlePermissionGranted);
      connectedLoopRef.current.off("permissionDenied", handlePermissionDenied);

      // Clear reference
      connectedLoopRef.current = null;
      isConnectedRef.current = false;

      // Reset state
      streamingMessageRef.current = null;
      pendingToolCallsRef.current.clear();
      toolIdMapRef.current.clear();
      toolGroupMapRef.current.clear();
      pendingUsageRef.current = null;

      // Optionally clear contexts (using refs for stability)
      if (clearOnDisconnect) {
        clearMessagesRef.current();
        clearExecutionsRef.current();
      }
    }
  }, [
    handleText,
    handleThinking,
    handleComplete,
    handleError,
    handleUsage,
    handleToolStart,
    handleToolEnd,
    handlePermissionRequired,
    handlePermissionGranted,
    handlePermissionDenied,
    clearOnDisconnect,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (connectedLoopRef.current) {
        disconnect();
      }
    };
  }, [disconnect]);

  // Memoize return value to ensure stable object reference across renders.
  // This prevents useEffect re-runs in consumers that depend on the adapter object,
  // which was causing disconnect/reconnect cycles during streaming.
  return useMemo(
    () => ({
      connect,
      disconnect,
      isConnected: isConnectedRef.current,
    }),
    [connect, disconnect]
  );
}

// =============================================================================
// Factory Function (Non-Hook Alternative)
// =============================================================================

/**
 * Context dispatch functions required by the adapter factory
 */
export interface AdapterDispatchers {
  /** Add a message to the messages context */
  addMessage: (message: { role: "assistant"; content: string; isStreaming?: boolean }) => string;
  /** Append content to an existing message */
  appendToMessage: (id: string, content: string) => void;
  /** Update a message's properties */
  updateMessage: (id: string, updates: Partial<{ content: string; isStreaming: boolean }>) => void;
  /** Add a tool execution to the tools context */
  addExecution: (execution: {
    toolName: string;
    params: Record<string, unknown>;
    status?: "pending" | "approved" | "rejected" | "running" | "complete" | "error";
    startedAt?: Date;
  }) => string;
  /** Update a tool execution */
  updateExecution: (
    id: string,
    updates: {
      status?: "pending" | "approved" | "rejected" | "running" | "complete" | "error";
      result?: unknown;
      error?: Error;
      startedAt?: Date;
      completedAt?: Date;
    }
  ) => void;
}

/**
 * Creates an agent adapter without using React hooks.
 *
 * Useful for testing or non-React environments.
 *
 * @param dispatchers - Context dispatch functions
 * @returns An AgentAdapter interface
 *
 * @example
 * ```typescript
 * const dispatchers = {
 *   addMessage: (msg) => { ... },
 *   appendToMessage: (id, content) => { ... },
 *   updateMessage: (id, updates) => { ... },
 *   addExecution: (exec) => { ... },
 *   updateExecution: (id, updates) => { ... },
 * };
 *
 * const adapter = createAgentAdapter(dispatchers);
 * adapter.connect(agentLoop);
 *
 * // Later...
 * adapter.disconnect();
 * ```
 */
export function createAgentAdapter(dispatchers: AdapterDispatchers): AgentAdapter {
  let connectedLoop: AgentLoop | null = null;
  let streamingMessage: StreamingMessage | null = null;
  const toolIdMap = new Map<string, string>();

  const handleText = (text: string) => {
    if (!streamingMessage) {
      const id = dispatchers.addMessage({
        role: "assistant",
        content: text,
        isStreaming: true,
      });
      streamingMessage = { id, content: text, thinking: "", hasStarted: true };
    } else {
      streamingMessage.content += text;
      dispatchers.appendToMessage(streamingMessage.id, text);
    }
  };

  const handleThinking = (text: string) => {
    if (!streamingMessage) {
      const id = dispatchers.addMessage({
        role: "assistant",
        content: "",
        isStreaming: true,
      });
      streamingMessage = { id, content: "", thinking: "", hasStarted: true };
    }
    streamingMessage.thinking += text;
  };

  const handleComplete = () => {
    if (streamingMessage) {
      if (streamingMessage.content.trim().length === 0 && streamingMessage.thinking.trim()) {
        dispatchers.updateMessage(streamingMessage.id, { content: streamingMessage.thinking });
      }
      dispatchers.updateMessage(streamingMessage.id, { isStreaming: false });
      streamingMessage = null;
    }
  };

  const handleError = (error: Error) => {
    if (streamingMessage) {
      dispatchers.updateMessage(streamingMessage.id, { isStreaming: false });
      streamingMessage = null;
    }
    console.error("[AgentAdapter] AgentLoop error:", error.message);
  };

  const handleToolStart = (callId: string, name: string, input: Record<string, unknown>) => {
    const executionId = dispatchers.addExecution({
      toolName: name,
      params: input,
      status: "running",
      startedAt: new Date(),
    });
    toolIdMap.set(callId, executionId);
  };

  const handleToolEnd = (callId: string, _name: string, result: ExecutionResult) => {
    const executionId = toolIdMap.get(callId);
    if (executionId) {
      dispatchers.updateExecution(executionId, {
        status: result.result.success ? "complete" : "error",
        result: result.result.success ? result.result.output : undefined,
        error: !result.result.success ? new Error(String(result.result.error)) : undefined,
        completedAt: new Date(),
      });
      toolIdMap.delete(callId);
    }
  };

  const handlePermissionRequired = (
    callId: string,
    name: string,
    input: Record<string, unknown>
  ) => {
    const executionId = dispatchers.addExecution({
      toolName: name,
      params: input,
      status: "pending",
    });
    toolIdMap.set(callId, executionId);
  };

  const handlePermissionGranted = (callId: string, _name: string) => {
    const executionId = toolIdMap.get(callId);
    if (executionId) {
      dispatchers.updateExecution(executionId, {
        status: "running",
        startedAt: new Date(),
      });
    }
  };

  const handlePermissionDenied = (callId: string, _name: string, reason: string) => {
    const executionId = toolIdMap.get(callId);
    if (executionId) {
      dispatchers.updateExecution(executionId, {
        status: "rejected",
        error: new Error(reason),
      });
      toolIdMap.delete(callId);
    }
  };

  return {
    connect(agentLoop: AgentLoop) {
      // Skip reconnection if already connected to the same loop
      if (connectedLoop === agentLoop) {
        return;
      }

      // Disconnect existing
      if (connectedLoop) {
        connectedLoop.off("text", handleText);
        connectedLoop.off("thinking", handleThinking);
        connectedLoop.off("complete", handleComplete);
        connectedLoop.off("error", handleError);
        connectedLoop.off("toolStart", handleToolStart);
        connectedLoop.off("toolEnd", handleToolEnd);
        connectedLoop.off("permissionRequired", handlePermissionRequired);
        connectedLoop.off("permissionGranted", handlePermissionGranted);
        connectedLoop.off("permissionDenied", handlePermissionDenied);
      }

      // Reset state only when connecting to a NEW loop
      streamingMessage = null;
      toolIdMap.clear();

      // Subscribe
      agentLoop.on("text", handleText);
      agentLoop.on("thinking", handleThinking);
      agentLoop.on("complete", handleComplete);
      agentLoop.on("error", handleError);
      agentLoop.on("toolStart", handleToolStart);
      agentLoop.on("toolEnd", handleToolEnd);
      agentLoop.on("permissionRequired", handlePermissionRequired);
      agentLoop.on("permissionGranted", handlePermissionGranted);
      agentLoop.on("permissionDenied", handlePermissionDenied);

      connectedLoop = agentLoop;
    },

    disconnect() {
      if (connectedLoop) {
        connectedLoop.off("text", handleText);
        connectedLoop.off("thinking", handleThinking);
        connectedLoop.off("complete", handleComplete);
        connectedLoop.off("error", handleError);
        connectedLoop.off("toolStart", handleToolStart);
        connectedLoop.off("toolEnd", handleToolEnd);
        connectedLoop.off("permissionRequired", handlePermissionRequired);
        connectedLoop.off("permissionGranted", handlePermissionGranted);
        connectedLoop.off("permissionDenied", handlePermissionDenied);
        connectedLoop = null;
      }
      streamingMessage = null;
      toolIdMap.clear();
    },
  };
}

// =============================================================================
// Exports
// =============================================================================

export default useAgentAdapter;
