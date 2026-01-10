/**
 * Agent Adapter for AgentLoop ↔ TUI Context Integration
 *
 * Provides event mapping from AgentLoop to MessagesContext and ToolsContext,
 * enabling seamless integration between the agent execution engine and the TUI.
 *
 * @module tui/adapters/agent-adapter
 */

import type { AgentLoop, ExecutionResult } from "@vellum/core";
import { useCallback, useEffect, useRef } from "react";
import { useMessages } from "../context/MessagesContext.js";
import { useTools } from "../context/ToolsContext.js";

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
  const { clearOnDisconnect = false } = options;

  // Context hooks
  const { addMessage, appendToMessage, updateMessage, clearMessages } = useMessages();
  const { addExecution, updateExecution, clearExecutions, registerCallId } = useTools();

  // Track connection state
  const connectedLoopRef = useRef<AgentLoop | null>(null);
  const isConnectedRef = useRef(false);

  // Track current streaming message
  const streamingMessageRef = useRef<StreamingMessage | null>(null);

  // Map tool call IDs to execution IDs (for context correlation)
  const toolIdMapRef = useRef<Map<string, string>>(new Map());

  /**
   * Handle text streaming from AgentLoop
   * Maps to: appendToMessage in MessagesContext
   */
  const handleText = useCallback(
    (text: string) => {
      const streaming = streamingMessageRef.current;

      if (!streaming) {
        // Start a new streaming message if we receive text without a message
        const id = addMessage({
          role: "assistant",
          content: text,
          isStreaming: true,
        });
        streamingMessageRef.current = {
          id,
          content: text,
          hasStarted: true,
        };
      } else {
        // Append to existing streaming message
        streaming.content += text;
        appendToMessage(streaming.id, text);
      }
    },
    [addMessage, appendToMessage]
  );

  /**
   * Handle message/complete events from AgentLoop
   * Maps to: updateMessage (isStreaming: false) in MessagesContext
   */
  const handleComplete = useCallback(() => {
    const streaming = streamingMessageRef.current;

    if (streaming) {
      // Mark the message as complete (stop streaming)
      updateMessage(streaming.id, { isStreaming: false });
      streamingMessageRef.current = null;
    }
  }, [updateMessage]);

  /**
   * Handle tool start from AgentLoop
   * Maps to: addExecution in ToolsContext
   */
  const handleToolStart = useCallback(
    (callId: string, name: string, input: Record<string, unknown>) => {
      const existingExecutionId = toolIdMapRef.current.get(callId);

      // If we already created a pending execution due to permissionRequired,
      // treat toolStart as an update (not a new execution) to avoid duplicates.
      if (existingExecutionId) {
        updateExecution(existingExecutionId, {
          status: "running",
          startedAt: new Date(),
        });
        return;
      }

      // Add execution to tools context
      const executionId = addExecution({
        toolName: name,
        params: input,
        status: "running",
        startedAt: new Date(),
      });

      // Map the AgentLoop callId to our execution ID
      toolIdMapRef.current.set(callId, executionId);
      registerCallId(callId, executionId);
    },
    [addExecution, registerCallId, updateExecution]
  );

  /**
   * Handle tool end from AgentLoop
   * Maps to: updateExecution in ToolsContext
   */
  const handleToolEnd = useCallback(
    (callId: string, _name: string, result: ExecutionResult) => {
      // Look up the execution ID from our map
      const executionId = toolIdMapRef.current.get(callId);

      if (executionId) {
        // Update the execution with result
        updateExecution(executionId, {
          status: result.result.success ? "complete" : "error",
          result: result.result.success ? result.result.output : undefined,
          error: !result.result.success ? new Error(String(result.result.error)) : undefined,
          completedAt: new Date(),
        });

        // Clean up the map entry
        toolIdMapRef.current.delete(callId);
      }
    },
    [updateExecution]
  );

  /**
   * Handle permission required events
   * Maps to: addExecution with 'pending' status in ToolsContext
   */
  const handlePermissionRequired = useCallback(
    (callId: string, name: string, input: Record<string, unknown>) => {
      // Add execution in pending state (awaiting approval)
      const executionId = addExecution({
        toolName: name,
        params: input,
        status: "pending",
      });

      // Map the callId to execution ID
      toolIdMapRef.current.set(callId, executionId);
      registerCallId(callId, executionId);
    },
    [addExecution, registerCallId]
  );

  /**
   * Handle permission granted events
   * Maps to: updateExecution with 'running' status in ToolsContext
   */
  const handlePermissionGranted = useCallback(
    (callId: string, _name: string) => {
      const executionId = toolIdMapRef.current.get(callId);

      if (executionId) {
        updateExecution(executionId, {
          status: "running",
          startedAt: new Date(),
        });
      }
    },
    [updateExecution]
  );

  /**
   * Handle permission denied events
   * Maps to: updateExecution with 'rejected' status in ToolsContext
   */
  const handlePermissionDenied = useCallback(
    (callId: string, _name: string, reason: string) => {
      const executionId = toolIdMapRef.current.get(callId);

      if (executionId) {
        updateExecution(executionId, {
          status: "rejected",
          error: new Error(reason),
        });

        // Clean up the map entry
        toolIdMapRef.current.delete(callId);
      }
    },
    [updateExecution]
  );

  /**
   * Connect to an AgentLoop instance
   */
  const connect = useCallback(
    (agentLoop: AgentLoop) => {
      // Disconnect from any existing loop first
      if (connectedLoopRef.current) {
        // Remove existing event listeners
        connectedLoopRef.current.off("text", handleText);
        connectedLoopRef.current.off("complete", handleComplete);
        connectedLoopRef.current.off("toolStart", handleToolStart);
        connectedLoopRef.current.off("toolEnd", handleToolEnd);
        connectedLoopRef.current.off("permissionRequired", handlePermissionRequired);
        connectedLoopRef.current.off("permissionGranted", handlePermissionGranted);
        connectedLoopRef.current.off("permissionDenied", handlePermissionDenied);
      }

      // Reset state
      streamingMessageRef.current = null;
      toolIdMapRef.current.clear();

      // Subscribe to AgentLoop events
      agentLoop.on("text", handleText);
      agentLoop.on("complete", handleComplete);
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
      handleComplete,
      handleToolStart,
      handleToolEnd,
      handlePermissionRequired,
      handlePermissionGranted,
      handlePermissionDenied,
    ]
  );

  /**
   * Disconnect from the current AgentLoop
   */
  const disconnect = useCallback(() => {
    if (connectedLoopRef.current) {
      // Remove all event listeners
      connectedLoopRef.current.off("text", handleText);
      connectedLoopRef.current.off("complete", handleComplete);
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
      toolIdMapRef.current.clear();

      // Optionally clear contexts
      if (clearOnDisconnect) {
        clearMessages();
        clearExecutions();
      }
    }
  }, [
    handleText,
    handleComplete,
    handleToolStart,
    handleToolEnd,
    handlePermissionRequired,
    handlePermissionGranted,
    handlePermissionDenied,
    clearOnDisconnect,
    clearMessages,
    clearExecutions,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (connectedLoopRef.current) {
        disconnect();
      }
    };
  }, [disconnect]);

  return {
    connect,
    disconnect,
    isConnected: isConnectedRef.current,
  };
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
  updateMessage: (id: string, updates: { isStreaming?: boolean }) => void;
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
      streamingMessage = { id, content: text, hasStarted: true };
    } else {
      streamingMessage.content += text;
      dispatchers.appendToMessage(streamingMessage.id, text);
    }
  };

  const handleComplete = () => {
    if (streamingMessage) {
      dispatchers.updateMessage(streamingMessage.id, { isStreaming: false });
      streamingMessage = null;
    }
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
      // Disconnect existing
      if (connectedLoop) {
        connectedLoop.off("text", handleText);
        connectedLoop.off("complete", handleComplete);
        connectedLoop.off("toolStart", handleToolStart);
        connectedLoop.off("toolEnd", handleToolEnd);
        connectedLoop.off("permissionRequired", handlePermissionRequired);
        connectedLoop.off("permissionGranted", handlePermissionGranted);
        connectedLoop.off("permissionDenied", handlePermissionDenied);
      }

      // Reset state
      streamingMessage = null;
      toolIdMap.clear();

      // Subscribe
      agentLoop.on("text", handleText);
      agentLoop.on("complete", handleComplete);
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
        connectedLoop.off("complete", handleComplete);
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
