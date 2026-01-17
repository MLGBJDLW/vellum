/**
 * Messages Context and State Management
 *
 * Provides message state management for the Vellum TUI including
 * message storage, streaming support, and tool call tracking.
 *
 * @module tui/context/MessagesContext
 */

import React, {
  createContext,
  type Dispatch,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useReducer,
} from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Role of a message sender
 */
export type MessageRole = "user" | "assistant" | "system" | "tool" | "tool_group";

/**
 * Status of a tool call within a message.
 * - pending: Tool call created but not started
 * - running: Tool is currently executing (show spinner)
 * - completed: Tool finished successfully (show checkmark)
 * - error: Tool failed (show error icon)
 */
export type ToolCallStatus = "pending" | "running" | "completed" | "error";

/**
 * Information about a tool call within a message
 */
export interface ToolCallInfo {
  /** Unique identifier for the tool call */
  readonly id: string;
  /** Name of the tool being called */
  readonly name: string;
  /** Arguments passed to the tool */
  readonly arguments: Record<string, unknown>;
  /** Result of the tool call, if completed successfully */
  readonly result?: unknown;
  /** Error message if the tool call failed */
  readonly error?: string;
  /** Status of the tool call */
  readonly status: ToolCallStatus;
}

/**
 * Token usage information for a message turn.
 */
export interface MessageTokenUsage {
  /** Number of input tokens */
  readonly inputTokens: number;
  /** Number of output tokens */
  readonly outputTokens: number;
  /** Number of tokens used for thinking/reasoning (if applicable) */
  readonly thinkingTokens?: number;
  /** Number of tokens read from cache (if applicable) */
  readonly cacheReadTokens?: number;
}

/**
 * A single message in the conversation
 */
export interface Message {
  /** Unique identifier for the message */
  readonly id: string;
  /** Role of the message sender */
  readonly role: MessageRole;
  /** Content of the message */
  readonly content: string;
  /** Timestamp when the message was created */
  readonly timestamp: Date;
  /** Whether the message is currently being streamed */
  readonly isStreaming?: boolean;
  /** Tool calls associated with this message */
  readonly toolCalls?: readonly ToolCallInfo[];
  /** Token usage for this message turn (assistant messages only) */
  readonly tokenUsage?: MessageTokenUsage;
  /** Whether this message is a continuation of a previous split message */
  readonly isContinuation?: boolean;
  /** Thinking/reasoning content (for models with extended thinking) */
  readonly thinking?: string;
}

/**
 * Messages state interface
 *
 * Uses a split architecture for optimal rendering:
 * - `historyMessages`: Completed messages rendered in Ink's <Static> (never re-render)
 * - `pendingMessage`: Currently streaming message (only this causes re-renders)
 */
export interface MessagesState {
  /** Completed messages - rendered in <Static>, never re-render */
  readonly historyMessages: readonly Message[];
  /** Currently streaming message - the only thing that re-renders */
  readonly pendingMessage: Message | null;
  /** List of all messages in the conversation (computed: history + pending) */
  readonly messages: readonly Message[];
  /** Whether any message is currently streaming */
  readonly isStreaming: boolean;
}

/**
 * Initial messages state
 */
const initialState: MessagesState = {
  historyMessages: [],
  pendingMessage: null,
  messages: [],
  isStreaming: false,
};

// =============================================================================
// Actions (Discriminated Union)
// =============================================================================

/**
 * Add a new message
 */
export interface AddMessageAction {
  readonly type: "ADD_MESSAGE";
  readonly message: Message;
}

/**
 * Update an existing message
 */
export interface UpdateMessageAction {
  readonly type: "UPDATE_MESSAGE";
  readonly id: string;
  readonly updates: Partial<Omit<Message, "id">>;
}

/**
 * Append content to an existing message (for streaming)
 */
export interface AppendToMessageAction {
  readonly type: "APPEND_TO_MESSAGE";
  readonly id: string;
  readonly content: string;
}

/**
 * Replace the entire message list
 */
export interface SetMessagesAction {
  readonly type: "SET_MESSAGES";
  readonly messages: readonly Message[];
}

/**
 * Clear all messages
 */
export interface ClearMessagesAction {
  readonly type: "CLEAR_MESSAGES";
}

/**
 * Set streaming state
 */
export interface SetStreamingAction {
  readonly type: "SET_STREAMING";
  readonly isStreaming: boolean;
}

/**
 * Commit pending message to history (for Static rendering)
 */
export interface CommitPendingMessageAction {
  readonly type: "COMMIT_PENDING_MESSAGE";
}

/**
 * Split a long streaming message at a safe point
 * Moves completed content to history and keeps remainder as pending
 */
export interface SplitMessageAction {
  readonly type: "SPLIT_MESSAGE";
  /** Index to split at (content before this becomes history) */
  readonly splitIndex: number;
}

/**
 * Append thinking/reasoning content to an existing message (for streaming)
 */
export interface AppendToThinkingAction {
  readonly type: "APPEND_TO_THINKING";
  readonly id: string;
  readonly thinking: string;
}

/**
 * Add a new tool_group message (Gemini-style independent tool execution)
 */
export interface AddToolGroupAction {
  readonly type: "ADD_TOOL_GROUP";
  readonly toolCalls: readonly ToolCallInfo[];
}

/**
 * Update an existing tool_group message with tool call status
 */
export interface UpdateToolGroupAction {
  readonly type: "UPDATE_TOOL_GROUP";
  readonly groupId: string;
  readonly toolCall: ToolCallInfo;
}

/**
 * Discriminated union of all message actions
 */
export type MessagesAction =
  | AddMessageAction
  | UpdateMessageAction
  | AppendToMessageAction
  | SetMessagesAction
  | ClearMessagesAction
  | SetStreamingAction
  | CommitPendingMessageAction
  | SplitMessageAction
  | AppendToThinkingAction
  | AddToolGroupAction
  | UpdateToolGroupAction;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Compute the combined messages array from history + pending
 */
function computeMessages(
  historyMessages: readonly Message[],
  pendingMessage: Message | null
): readonly Message[] {
  if (pendingMessage) {
    return [...historyMessages, pendingMessage];
  }
  return historyMessages;
}

/**
 * Merge tool calls: Update existing calls by ID or add new ones.
 * This allows updating tool status (running → completed/error) without losing other calls.
 */
function mergeToolCalls(
  existing: readonly ToolCallInfo[] | undefined,
  incoming: readonly ToolCallInfo[] | undefined
): readonly ToolCallInfo[] | undefined {
  if (!incoming || incoming.length === 0) {
    return existing;
  }
  if (!existing || existing.length === 0) {
    return incoming;
  }

  // Create a map of existing calls for efficient lookup
  const callMap = new Map<string, ToolCallInfo>();
  for (const call of existing) {
    callMap.set(call.id, call);
  }

  // Merge incoming calls
  for (const call of incoming) {
    const existingCall = callMap.get(call.id);
    if (existingCall) {
      // Merge: keep existing args if incoming doesn't have them
      callMap.set(call.id, {
        ...existingCall,
        ...call,
        // Preserve arguments if not provided in incoming
        arguments: Object.keys(call.arguments).length > 0 ? call.arguments : existingCall.arguments,
      });
    } else {
      // Add new call
      callMap.set(call.id, call);
    }
  }

  return Array.from(callMap.values());
}

// =============================================================================
// Reducer
// =============================================================================

/**
 * Messages state reducer
 *
 * Uses a split architecture for optimal rendering:
 * - historyMessages: Completed messages (for <Static>)
 * - pendingMessage: Currently streaming message (causes re-renders)
 *
 * @param state - Current messages state
 * @param action - Action to apply
 * @returns New messages state
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Reducer with many action types for message state management
function messagesReducer(state: MessagesState, action: MessagesAction): MessagesState {
  switch (action.type) {
    case "ADD_MESSAGE": {
      const isStreaming = action.message.isStreaming ?? false;

      if (isStreaming) {
        // Streaming message becomes pendingMessage
        return {
          ...state,
          pendingMessage: action.message,
          messages: computeMessages(state.historyMessages, action.message),
          isStreaming: true,
        };
      }
      // Non-streaming message goes directly to history
      const newHistory = [...state.historyMessages, action.message];
      return {
        ...state,
        historyMessages: newHistory,
        messages: computeMessages(newHistory, state.pendingMessage),
        isStreaming: state.pendingMessage?.isStreaming ?? false,
      };
    }

    case "UPDATE_MESSAGE": {
      // Check if updating pending message
      if (state.pendingMessage?.id === action.id) {
        // Merge toolCalls instead of replacing
        const mergedToolCalls = mergeToolCalls(
          state.pendingMessage.toolCalls,
          action.updates.toolCalls
        );
        const updatedPending = {
          ...state.pendingMessage,
          ...action.updates,
          toolCalls: mergedToolCalls,
        };
        return {
          ...state,
          pendingMessage: updatedPending,
          messages: computeMessages(state.historyMessages, updatedPending),
          isStreaming: updatedPending.isStreaming ?? false,
        };
      }

      // Update in history
      const messageIndex = state.historyMessages.findIndex((m) => m.id === action.id);
      if (messageIndex === -1) {
        return state;
      }

      const updatedHistory = [...state.historyMessages];
      const existingMessage = updatedHistory[messageIndex];
      if (existingMessage) {
        // Merge toolCalls for history messages too
        const mergedToolCalls = mergeToolCalls(existingMessage.toolCalls, action.updates.toolCalls);
        updatedHistory[messageIndex] = {
          ...existingMessage,
          ...action.updates,
          toolCalls: mergedToolCalls,
        };
      }

      return {
        ...state,
        historyMessages: updatedHistory,
        messages: computeMessages(updatedHistory, state.pendingMessage),
        isStreaming: state.pendingMessage?.isStreaming ?? false,
      };
    }

    case "APPEND_TO_MESSAGE": {
      // Appending only makes sense for pending (streaming) message
      if (state.pendingMessage?.id === action.id) {
        const updatedPending = {
          ...state.pendingMessage,
          content: state.pendingMessage.content + action.content,
        };
        return {
          ...state,
          pendingMessage: updatedPending,
          messages: computeMessages(state.historyMessages, updatedPending),
        };
      }

      // Fallback: update in history (for backward compat)
      const messageIndex = state.historyMessages.findIndex((m) => m.id === action.id);
      if (messageIndex === -1) {
        return state;
      }

      const updatedHistory = [...state.historyMessages];
      const existingMessage = updatedHistory[messageIndex];
      if (existingMessage) {
        updatedHistory[messageIndex] = {
          ...existingMessage,
          content: existingMessage.content + action.content,
        };
      }

      return {
        ...state,
        historyMessages: updatedHistory,
        messages: computeMessages(updatedHistory, state.pendingMessage),
      };
    }

    case "SET_MESSAGES": {
      // Separate streaming and non-streaming messages
      const streaming = action.messages.find((m) => m.isStreaming === true) ?? null;
      const history = action.messages.filter((m) => m.isStreaming !== true);
      return {
        historyMessages: history,
        pendingMessage: streaming,
        messages: action.messages,
        isStreaming: streaming !== null,
      };
    }

    case "CLEAR_MESSAGES":
      return {
        ...initialState,
      };

    case "SET_STREAMING":
      return {
        ...state,
        isStreaming: action.isStreaming,
      };

    case "COMMIT_PENDING_MESSAGE": {
      if (!state.pendingMessage) {
        return state;
      }
      // Move pending to history with isStreaming: false
      const completedMessage = {
        ...state.pendingMessage,
        isStreaming: false,
      };
      const newHistory = [...state.historyMessages, completedMessage];
      return {
        historyMessages: newHistory,
        pendingMessage: null,
        messages: newHistory,
        isStreaming: false,
      };
    }

    case "SPLIT_MESSAGE": {
      if (!state.pendingMessage) {
        return state;
      }

      const content = state.pendingMessage.content;
      if (action.splitIndex <= 0 || action.splitIndex >= content.length) {
        return state;
      }

      // Create completed portion for history
      const completedMessage: Message = {
        ...state.pendingMessage,
        id: generateMessageId(), // New ID for the split-off portion
        content: content.slice(0, action.splitIndex),
        isStreaming: false,
      };

      // Keep remainder as pending - mark as continuation of split message
      const remainingMessage: Message = {
        ...state.pendingMessage,
        content: content.slice(action.splitIndex),
        isContinuation: true,
      };

      const newHistory = [...state.historyMessages, completedMessage];
      return {
        historyMessages: newHistory,
        pendingMessage: remainingMessage,
        messages: computeMessages(newHistory, remainingMessage),
        isStreaming: true,
      };
    }

    case "APPEND_TO_THINKING": {
      // Appending thinking only makes sense for pending (streaming) message
      if (state.pendingMessage?.id === action.id) {
        const updatedPending = {
          ...state.pendingMessage,
          thinking: (state.pendingMessage.thinking ?? "") + action.thinking,
        };
        return {
          ...state,
          pendingMessage: updatedPending,
          messages: computeMessages(state.historyMessages, updatedPending),
        };
      }
      return state;
    }

    case "ADD_TOOL_GROUP": {
      // Create a new tool_group message (Gemini-style independent tool execution)
      const toolGroupMessage: Message = {
        id: generateMessageId(),
        role: "tool_group",
        content: "", // tool_group doesn't need content
        timestamp: new Date(),
        toolCalls: action.toolCalls,
        isStreaming: false,
      };
      const newHistory = [...state.historyMessages, toolGroupMessage];
      return {
        ...state,
        historyMessages: newHistory,
        messages: computeMessages(newHistory, state.pendingMessage),
      };
    }

    case "UPDATE_TOOL_GROUP": {
      // Find and update the tool_group message with the specified groupId
      const groupIndex = state.historyMessages.findIndex(
        (m) => m.id === action.groupId && m.role === "tool_group"
      );
      if (groupIndex === -1) {
        return state;
      }

      const updatedHistory = [...state.historyMessages];
      const existingGroup = updatedHistory[groupIndex];
      if (existingGroup) {
        // Merge the tool call update into existing toolCalls
        const mergedToolCalls = mergeToolCalls(existingGroup.toolCalls, [action.toolCall]);
        updatedHistory[groupIndex] = {
          ...existingGroup,
          toolCalls: mergedToolCalls,
        };
      }

      return {
        ...state,
        historyMessages: updatedHistory,
        messages: computeMessages(updatedHistory, state.pendingMessage),
      };
    }

    default:
      // Exhaustive check - TypeScript will error if a case is missing
      return state;
  }
}

// =============================================================================
// ID Generation
// =============================================================================

/**
 * Generate a unique message ID
 *
 * Uses crypto.randomUUID() when available, falls back to timestamp-based ID
 */
function generateMessageId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// =============================================================================
// Context
// =============================================================================

/**
 * Context value interface
 */
export interface MessagesContextValue {
  /** Current messages state */
  readonly state: MessagesState;
  /** Dispatch function for state updates */
  readonly dispatch: Dispatch<MessagesAction>;
  /** All messages in the conversation (history + pending) */
  readonly messages: readonly Message[];
  /** Completed messages for <Static> rendering (never re-render) */
  readonly historyMessages: readonly Message[];
  /** Currently streaming message (only this causes re-renders) */
  readonly pendingMessage: Message | null;
  /** Add a new message, returns the generated ID */
  readonly addMessage: (message: Omit<Message, "id" | "timestamp">) => string;
  /** Update an existing message */
  readonly updateMessage: (id: string, updates: Partial<Omit<Message, "id">>) => void;
  /** Append content to a message (for streaming) */
  readonly appendToMessage: (id: string, content: string) => void;
  /** Append thinking/reasoning content to a message (for streaming) */
  readonly appendToThinking: (id: string, thinking: string) => void;
  /** Replace the entire message list */
  readonly setMessages: (messages: readonly Message[]) => void;
  /** Clear all messages */
  readonly clearMessages: () => void;
  /** Commit pending message to history (for Static rendering) */
  readonly commitPendingMessage: () => void;
  /** Split a long streaming message at a safe point (e.g., paragraph boundary) */
  readonly splitMessageAtSafePoint: (splitIndex: number) => void;
  /** Add a new tool_group message (Gemini-style), returns the group ID */
  readonly addToolGroup: (toolCalls: readonly ToolCallInfo[]) => string;
  /** Update an existing tool_group message with a tool call update */
  readonly updateToolGroup: (groupId: string, toolCall: ToolCallInfo) => void;
}

/**
 * React context for messages state
 *
 * Initialized as undefined to detect usage outside provider
 */
const MessagesContext = createContext<MessagesContextValue | undefined>(undefined);

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to access the messages state and actions
 *
 * Must be used within a MessagesProvider component.
 *
 * @returns The current messages context value with state and actions
 * @throws Error if used outside MessagesProvider
 *
 * @example
 * ```tsx
 * function ChatComponent() {
 *   const { messages, addMessage, appendToMessage, clearMessages } = useMessages();
 *
 *   // Add a new message
 *   const handleSend = (content: string) => {
 *     const id = addMessage({ role: 'user', content });
 *     console.log('Created message:', id);
 *   };
 *
 *   // Handle streaming content
 *   const handleStream = (id: string, chunk: string) => {
 *     appendToMessage(id, chunk);
 *   };
 *
 *   // Clear conversation
 *   const handleClear = () => clearMessages();
 *
 *   return <Box>...</Box>;
 * }
 * ```
 */
export function useMessages(): MessagesContextValue {
  const context = useContext(MessagesContext);

  if (context === undefined) {
    throw new Error(
      "useMessages must be used within a MessagesProvider. " +
        "Ensure your component is wrapped in <MessagesProvider>."
    );
  }

  return context;
}

// =============================================================================
// Provider Props
// =============================================================================

/**
 * Props for the MessagesProvider component
 */
export interface MessagesProviderProps {
  /**
   * Initial messages to populate the conversation
   */
  readonly initialMessages?: readonly Message[];

  /**
   * Children to render within the messages context
   */
  readonly children: ReactNode;
}

// =============================================================================
// Provider Component
// =============================================================================

/**
 * Messages state provider component
 *
 * Provides messages state context to all child components, enabling
 * access to the message list and actions via the useMessages hook.
 *
 * @example
 * ```tsx
 * // Using default initial state
 * <MessagesProvider>
 *   <ChatApp />
 * </MessagesProvider>
 *
 * // Using initial messages
 * <MessagesProvider initialMessages={[{ id: '1', role: 'system', content: 'Hello', timestamp: new Date() }]}>
 *   <ChatApp />
 * </MessagesProvider>
 * ```
 */
export function MessagesProvider({
  initialMessages,
  children,
}: MessagesProviderProps): React.JSX.Element {
  // State management with useReducer
  const [state, dispatch] = useReducer(
    messagesReducer,
    initialMessages,
    (messages): MessagesState => {
      // Separate streaming and non-streaming from initial messages
      const streaming = messages?.find((m) => m.isStreaming === true) ?? null;
      const history = messages?.filter((m) => m.isStreaming !== true) ?? [];
      return {
        historyMessages: history,
        pendingMessage: streaming,
        messages: messages ?? [],
        isStreaming: streaming !== null,
      };
    }
  );

  /**
   * Add a new message to the conversation
   * @returns The generated message ID
   */
  const addMessage = useCallback((message: Omit<Message, "id" | "timestamp">): string => {
    const id = generateMessageId();
    const fullMessage: Message = {
      ...message,
      id,
      timestamp: new Date(),
    };
    dispatch({ type: "ADD_MESSAGE", message: fullMessage });
    return id;
  }, []);

  /**
   * Update an existing message
   */
  const updateMessage = useCallback((id: string, updates: Partial<Omit<Message, "id">>): void => {
    dispatch({ type: "UPDATE_MESSAGE", id, updates });
  }, []);

  /**
   * Append content to an existing message (for streaming)
   */
  const appendToMessage = useCallback((id: string, content: string): void => {
    dispatch({ type: "APPEND_TO_MESSAGE", id, content });
  }, []);

  /**
   * Append thinking/reasoning content to an existing message (for streaming)
   */
  const appendToThinking = useCallback((id: string, thinking: string): void => {
    dispatch({ type: "APPEND_TO_THINKING", id, thinking });
  }, []);

  /**
   * Clear all messages
   */
  const clearMessages = useCallback((): void => {
    dispatch({ type: "CLEAR_MESSAGES" });
  }, []);

  /**
   * Replace the entire message list
   */
  const setMessages = useCallback((messages: readonly Message[]): void => {
    dispatch({ type: "SET_MESSAGES", messages });
  }, []);

  /**
   * Commit pending message to history (for Static rendering)
   */
  const commitPendingMessage = useCallback((): void => {
    dispatch({ type: "COMMIT_PENDING_MESSAGE" });
  }, []);

  /**
   * Split a long streaming message at a safe point
   */
  const splitMessageAtSafePoint = useCallback((splitIndex: number): void => {
    dispatch({ type: "SPLIT_MESSAGE", splitIndex });
  }, []);

  /**
   * Add a new tool_group message (Gemini-style independent tool execution)
   * @returns The generated group ID
   */
  const addToolGroup = useCallback((toolCalls: readonly ToolCallInfo[]): string => {
    const id = generateMessageId();
    // Dispatch with ID embedded in toolCalls (reducer will use generateMessageId for the message)
    // Actually, we need the reducer to return the ID. For now, we generate it here and pass via action.
    const toolGroupMessage: Message = {
      id,
      role: "tool_group",
      content: "",
      timestamp: new Date(),
      toolCalls,
      isStreaming: false,
    };
    dispatch({ type: "ADD_MESSAGE", message: toolGroupMessage });
    return id;
  }, []);

  /**
   * Update an existing tool_group message with a tool call update
   */
  const updateToolGroup = useCallback((groupId: string, toolCall: ToolCallInfo): void => {
    dispatch({ type: "UPDATE_TOOL_GROUP", groupId, toolCall });
  }, []);

  /**
   * Memoized context value
   */
  const contextValue = useMemo<MessagesContextValue>(
    () => ({
      state,
      dispatch,
      messages: state.messages,
      historyMessages: state.historyMessages,
      pendingMessage: state.pendingMessage,
      addMessage,
      updateMessage,
      appendToMessage,
      appendToThinking,
      setMessages,
      clearMessages,
      commitPendingMessage,
      splitMessageAtSafePoint,
      addToolGroup,
      updateToolGroup,
    }),
    [
      state,
      addMessage,
      updateMessage,
      appendToMessage,
      appendToThinking,
      setMessages,
      clearMessages,
      commitPendingMessage,
      splitMessageAtSafePoint,
      addToolGroup,
      updateToolGroup,
    ]
  );

  return <MessagesContext value={contextValue}>{children}</MessagesContext>;
}

// =============================================================================
// Exports
// =============================================================================

export { MessagesContext, initialState };
