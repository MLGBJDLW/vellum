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
export type MessageRole = "user" | "assistant" | "system" | "tool";

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
  /** Result of the tool call, if completed */
  readonly result?: unknown;
  /** Status of the tool call */
  readonly status: "pending" | "running" | "completed" | "error";
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
}

/**
 * Messages state interface
 */
export interface MessagesState {
  /** List of all messages in the conversation */
  readonly messages: readonly Message[];
  /** Whether any message is currently streaming */
  readonly isStreaming: boolean;
}

/**
 * Initial messages state
 */
const initialState: MessagesState = {
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
 * Discriminated union of all message actions
 */
export type MessagesAction =
  | AddMessageAction
  | UpdateMessageAction
  | AppendToMessageAction
  | SetMessagesAction
  | ClearMessagesAction
  | SetStreamingAction;

// =============================================================================
// Reducer
// =============================================================================

/**
 * Messages state reducer
 *
 * @param state - Current messages state
 * @param action - Action to apply
 * @returns New messages state
 */
function messagesReducer(state: MessagesState, action: MessagesAction): MessagesState {
  switch (action.type) {
    case "ADD_MESSAGE": {
      const newMessages = [...state.messages, action.message];
      return {
        ...state,
        messages: newMessages,
        // Update streaming state based on the new message
        isStreaming: action.message.isStreaming ?? state.isStreaming,
      };
    }

    case "UPDATE_MESSAGE": {
      const messageIndex = state.messages.findIndex((m) => m.id === action.id);
      if (messageIndex === -1) {
        return state;
      }

      const updatedMessages = [...state.messages];
      const existingMessage = updatedMessages[messageIndex];
      if (existingMessage) {
        updatedMessages[messageIndex] = {
          ...existingMessage,
          ...action.updates,
        };
      }

      // Recalculate streaming state
      const isStreaming = updatedMessages.some((m) => m.isStreaming === true);

      return {
        ...state,
        messages: updatedMessages,
        isStreaming,
      };
    }

    case "APPEND_TO_MESSAGE": {
      const messageIndex = state.messages.findIndex((m) => m.id === action.id);
      if (messageIndex === -1) {
        return state;
      }

      const updatedMessages = [...state.messages];
      const existingMessage = updatedMessages[messageIndex];
      if (existingMessage) {
        updatedMessages[messageIndex] = {
          ...existingMessage,
          content: existingMessage.content + action.content,
        };
      }

      return {
        ...state,
        messages: updatedMessages,
      };
    }

    case "SET_MESSAGES": {
      const updatedMessages = [...action.messages];
      const isStreaming = updatedMessages.some((m) => m.isStreaming === true);
      return {
        ...state,
        messages: updatedMessages,
        isStreaming,
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
  /** All messages in the conversation */
  readonly messages: readonly Message[];
  /** Add a new message, returns the generated ID */
  readonly addMessage: (message: Omit<Message, "id" | "timestamp">) => string;
  /** Update an existing message */
  readonly updateMessage: (id: string, updates: Partial<Omit<Message, "id">>) => void;
  /** Append content to a message (for streaming) */
  readonly appendToMessage: (id: string, content: string) => void;
  /** Replace the entire message list */
  readonly setMessages: (messages: readonly Message[]) => void;
  /** Clear all messages */
  readonly clearMessages: () => void;
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
    (messages): MessagesState => ({
      messages: messages ?? [],
      isStreaming: false,
    })
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
   * Memoized context value
   */
  const contextValue = useMemo<MessagesContextValue>(
    () => ({
      state,
      dispatch,
      messages: state.messages,
      addMessage,
      updateMessage,
      appendToMessage,
      setMessages,
      clearMessages,
    }),
    [state, addMessage, updateMessage, appendToMessage, setMessages, clearMessages]
  );

  return <MessagesContext value={contextValue}>{children}</MessagesContext>;
}

// =============================================================================
// Exports
// =============================================================================

export { MessagesContext, initialState };
