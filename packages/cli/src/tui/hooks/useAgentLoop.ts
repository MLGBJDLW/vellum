/**
 * useAgentLoop Hook (T038)
 *
 * React hook that wraps AgentLoop for use in React Ink applications.
 * Provides reactive state, run/cancel methods, and automatic cleanup.
 */

import {
  type AgentLoop,
  type AgentState,
  createUserMessage,
  type ExecutionResult,
  SessionParts,
  type StateContext,
} from "@vellum/core";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Message type for the hook's message list.
 */
export interface AgentMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  /** If this message contains thinking content */
  thinking?: string;
  thinkingDuration?: number;
}

/**
 * Tool execution information.
 */
export interface CurrentTool {
  callId: string;
  name: string;
  input: Record<string, unknown>;
  status: "pending" | "executing" | "completed" | "failed";
  result?: ExecutionResult;
}

/**
 * Delegation state for subagent tracking (T059).
 */
export interface DelegationState {
  /** Whether a delegation is currently active */
  isActive: boolean;
  /** Delegation ID for tracking */
  delegationId: string | null;
  /** Agent being delegated to */
  delegatingTo: string | null;
  /** Task being delegated */
  task: string | null;
  /** Latest subagent text chunk */
  subagentText: string | null;
}

/**
 * User prompt state for ask_followup_question tool.
 */
export interface UserPromptState {
  /** Whether the prompt is visible */
  visible: boolean;
  /** The question to display to the user */
  question: string;
  /** Optional suggestions for the user */
  suggestions?: string[];
}

/**
 * Completion state for attempt_completion tool.
 */
export interface CompletionState {
  /** Whether a completion was attempted */
  attempted: boolean;
  /** The result/summary of the completion */
  result: string;
  /** Whether verification was performed */
  verified: boolean;
  /** Whether verification passed (if verified) */
  verificationPassed?: boolean;
}

/**
 * Hook status derived from AgentLoop state.
 */
export type HookStatus =
  | "idle"
  | "running"
  | "waiting_permission"
  | "waiting_input"
  | "error"
  | "cancelled";

/**
 * Return value of useAgentLoop hook.
 */
export interface UseAgentLoopReturn {
  /** Current status of the agent loop */
  status: HookStatus;
  /** Raw AgentLoop state */
  agentState: AgentState;
  /** List of messages in the conversation */
  messages: AgentMessage[];
  /** Current thinking content being streamed */
  thinking: string;
  /** Current tool being executed */
  currentTool: CurrentTool | null;
  /** Whether an operation is in progress */
  isLoading: boolean;
  /** Last error encountered */
  error: Error | null;
  /** Current delegation state (T059) */
  delegation: DelegationState;
  /** Current user prompt state for ask_followup_question tool */
  userPromptState: UserPromptState | null;
  /** Submit user response to pending prompt */
  submitUserResponse: (response: string) => void;
  /** Current completion state for attempt_completion tool */
  completionState: CompletionState | null;
  /** Run the agent with user input */
  run: (input: string) => Promise<void>;
  /** Cancel the current operation */
  cancel: (reason?: string) => void;
  /** Clear the conversation */
  clear: () => void;
}

/**
 * Maps AgentState to HookStatus.
 */
function mapStateToStatus(state: AgentState): HookStatus {
  switch (state) {
    case "idle":
      return "idle";
    case "streaming":
    case "tool_executing":
    case "recovering":
    case "retry":
      return "running";
    case "wait_permission":
      return "waiting_permission";
    case "wait_input":
      return "waiting_input";
    case "terminated":
    case "shutdown":
      return "cancelled";
    case "paused":
      return "idle";
    default:
      return "idle";
  }
}

/**
 * Generates a unique message ID.
 */
function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * React hook for managing AgentLoop in React Ink applications.
 *
 * Provides:
 * - Reactive state (status, messages, thinking, currentTool)
 * - Methods (run, cancel, clear)
 * - Automatic event subscription and cleanup
 * - Ctrl+C and ESC cancellation integration
 *
 * @param loop - The AgentLoop instance to wrap
 *
 * @example
 * ```tsx
 * function App() {
 *   const loop = useMemo(() => new AgentLoop(config), [config]);
 *   const {
 *     status,
 *     messages,
 *     thinking,
 *     currentTool,
 *     isLoading,
 *     run,
 *     cancel,
 *   } = useAgentLoop(loop);
 *
 *   const handleSubmit = async (input: string) => {
 *     await run(input);
 *   };
 *
 *   // Use useInput for Ctrl+C/ESC handling
 *   useInput((char, key) => {
 *     if (key.escape || (key.ctrl && char === 'c')) {
 *       cancel('user_interrupt');
 *     }
 *   });
 *
 *   return (
 *     <Box flexDirection="column">
 *       <MessageList messages={messages} />
 *       {thinking && <ThinkingBlock thinking={thinking} duration={0} />}
 *       {currentTool && <Text>Executing: {currentTool.name}</Text>}
 *       <Input onSubmit={handleSubmit} disabled={isLoading} />
 *     </Box>
 *   );
 * }
 * ```
 */
export function useAgentLoop(loop: AgentLoop): UseAgentLoopReturn {
  // Core state
  const [agentState, setAgentState] = useState<AgentState>(loop.getState());
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [thinking, setThinking] = useState("");
  const [currentTool, setCurrentTool] = useState<CurrentTool | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Delegation state (T059)
  const [delegation, setDelegation] = useState<DelegationState>({
    isActive: false,
    delegationId: null,
    delegatingTo: null,
    task: null,
    subagentText: null,
  });

  // User prompt state for ask_followup_question tool
  const [userPromptState, setUserPromptState] = useState<UserPromptState | null>(null);

  // Completion state for attempt_completion tool
  const [completionState, setCompletionState] = useState<CompletionState | null>(null);

  // Track thinking start time for duration calculation
  const thinkingStartRef = useRef<number | null>(null);

  // Track tool clear timeout for cleanup (T038 fix)
  const toolClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track current streaming message for accumulation
  const currentMessageRef = useRef<{
    id: string;
    content: string;
    thinking: string;
    thinkingDuration: number;
  } | null>(null);

  // Derived state
  const status = mapStateToStatus(agentState);
  const isLoading = status === "running" || status === "waiting_permission";

  // Subscribe to AgentLoop events
  useEffect(() => {
    // State change handler
    const handleStateChange = (from: AgentState, to: AgentState, _context: StateContext) => {
      setAgentState(to);

      // Clear error on successful state transition from recovering
      if (from === "recovering" && to !== "terminated") {
        setError(null);
      }
    };

    // Text streaming handler
    const handleText = (text: string) => {
      if (!currentMessageRef.current) {
        currentMessageRef.current = {
          id: generateMessageId(),
          content: "",
          thinking: "",
          thinkingDuration: 0,
        };
      }
      currentMessageRef.current.content += text;

      // Update messages with accumulated content
      const current = currentMessageRef.current;
      setMessages((prev) => {
        const existingIndex = prev.findIndex((m) => m.id === current.id);
        const message: AgentMessage = {
          id: current.id,
          role: "assistant",
          content: current.content,
          timestamp: Date.now(),
          thinking: current.thinking || undefined,
          thinkingDuration: current.thinkingDuration || undefined,
        };

        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = message;
          return updated;
        }
        return [...prev, message];
      });
    };

    // Thinking streaming handler
    const handleThinking = (text: string) => {
      if (thinkingStartRef.current === null) {
        thinkingStartRef.current = Date.now();
      }

      // Create streaming message if not exists (same pattern as handleText)
      // This ensures UI shows response even when thinking arrives before text
      if (!currentMessageRef.current) {
        currentMessageRef.current = {
          id: generateMessageId(),
          content: "",
          thinking: "",
          thinkingDuration: 0,
        };

        // Add initial message to UI so it knows there's a response
        const current = currentMessageRef.current;
        setMessages((prev) => [
          ...prev,
          {
            id: current.id,
            role: "assistant",
            content: "",
            timestamp: Date.now(),
            thinking: text,
            thinkingDuration: 0,
          },
        ]);
      }

      setThinking((prev) => prev + text);

      // Accumulate in current message ref
      currentMessageRef.current.thinking += text;
      currentMessageRef.current.thinkingDuration =
        Date.now() - (thinkingStartRef.current ?? Date.now());

      // Update message with accumulated thinking
      const current = currentMessageRef.current;
      setMessages((prev) => {
        const existingIndex = prev.findIndex((m) => m.id === current.id);
        const existing = prev[existingIndex];
        if (existingIndex >= 0 && existing) {
          const updated = [...prev];
          updated[existingIndex] = {
            id: existing.id,
            role: existing.role,
            content: existing.content,
            timestamp: existing.timestamp,
            thinking: current.thinking,
            thinkingDuration: current.thinkingDuration,
          };
          return updated;
        }
        return prev;
      });
    };

    // Tool start handler
    const handleToolStart = (callId: string, name: string, input: Record<string, unknown>) => {
      setCurrentTool({
        callId,
        name,
        input,
        status: "executing",
      });
    };

    // Tool end handler
    const handleToolEnd = (callId: string, _name: string, result: ExecutionResult) => {
      setCurrentTool((prev) => {
        if (prev?.callId === callId) {
          return {
            callId: prev.callId,
            name: prev.name,
            input: prev.input,
            status: result.result.success ? "completed" : "failed",
            result,
          } as CurrentTool;
        }
        return prev;
      });

      // Clear previous timeout if exists (prevent memory leaks)
      if (toolClearTimeoutRef.current) {
        clearTimeout(toolClearTimeoutRef.current);
      }

      // Clear tool after a short delay
      toolClearTimeoutRef.current = setTimeout(() => {
        setCurrentTool((prev) => (prev?.callId === callId ? null : prev));
        toolClearTimeoutRef.current = null;
      }, 100);
    };

    // Error handler
    const handleError = (err: Error) => {
      setError(err);
      // Surface error as assistant message for visibility
      const errorMessage: AgentMessage = {
        id: generateMessageId(),
        role: "assistant",
        content: `⚠️ ${err.message}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      currentMessageRef.current = null;
    };

    // Complete handler
    const handleComplete = () => {
      // Finalize current message
      if (currentMessageRef.current) {
        currentMessageRef.current = null;
      }
      // Clear thinking
      setThinking("");
      thinkingStartRef.current = null;
    };

    // Message handler - log or store full message content
    const handleMessage = (_content: string) => {
      // Message events are handled via text accumulation
      // This handler can be extended for message-level operations
    };

    // Tool call handler - track pending tool calls
    const handleToolCall = (id: string, name: string, input: Record<string, unknown>) => {
      setCurrentTool({
        callId: id,
        name,
        input,
        status: "pending",
      });
    };

    // Usage handler - track token usage
    const handleUsage = (_usage: { inputTokens: number; outputTokens: number }) => {
      // Token usage can be tracked here for display
      // This data is also available in ContextProgress via context
    };

    // Terminated handler - handle cancellation/termination
    const handleTerminated = () => {
      setCurrentTool(null);
      setThinking("");
      thinkingStartRef.current = null;
    };

    // Loop detected handler - show warning to user
    const handleLoopDetected = (_result: {
      detected: boolean;
      confidence: number;
      reason?: string;
    }) => {
      // Loop detection can trigger UI feedback
      // Consider emitting a warning message or status
    };

    // Retry handler - show retry feedback
    const handleRetry = (_attempt: number, _error: Error, _delay: number) => {
      // Retry events can be used for UI feedback
    };

    // Retry exhausted handler - show retry failure
    const handleRetryExhausted = (err: Error, _attempts: number) => {
      setError(err);
    };

    // Delegation start handler (T059)
    const handleDelegationStart = (delegationId: string, agent: string, task: string) => {
      setDelegation({
        isActive: true,
        delegationId,
        delegatingTo: agent,
        task,
        subagentText: null,
      });
    };

    // Delegation complete handler (T059)
    const handleDelegationComplete = (_delegationId: string, _agent: string, _result: string) => {
      setDelegation({
        isActive: false,
        delegationId: null,
        delegatingTo: null,
        task: null,
        subagentText: null,
      });
    };

    // Subagent text handler (T059)
    const handleSubagentText = (_delegationId: string, agent: string, chunk: string) => {
      setDelegation((prev) => ({
        ...prev,
        subagentText: chunk,
        delegatingTo: agent,
      }));
    };

    // Subagent tool handler (T059)
    const handleSubagentTool = (_delegationId: string, agent: string, toolName: string) => {
      setDelegation((prev) => ({
        ...prev,
        subagentText: `${agent}: ${toolName}`,
      }));
    };

    // User prompt handler for ask_followup_question tool
    const handleUserPromptRequired = (prompt: { question: string; suggestions?: string[] }) => {
      setUserPromptState({
        visible: true,
        question: prompt.question,
        suggestions: prompt.suggestions,
      });
    };

    // Completion handler for attempt_completion tool
    const handleCompletionAttempted = (completion: {
      result: string;
      verified: boolean;
      verificationPassed?: boolean;
    }) => {
      setCompletionState({
        attempted: true,
        result: completion.result,
        verified: completion.verified,
        verificationPassed: completion.verificationPassed,
      });
    };

    // Subscribe to events
    loop.on("stateChange", handleStateChange);
    loop.on("text", handleText);
    loop.on("thinking", handleThinking);
    loop.on("toolStart", handleToolStart);
    loop.on("toolEnd", handleToolEnd);
    loop.on("error", handleError);
    loop.on("complete", handleComplete);
    loop.on("message", handleMessage);
    loop.on("toolCall", handleToolCall);
    loop.on("usage", handleUsage);
    loop.on("terminated", handleTerminated);
    loop.on("loopDetected", handleLoopDetected);
    loop.on("retry", handleRetry);
    loop.on("retryExhausted", handleRetryExhausted);
    // Delegation events (T059)
    loop.on("delegationStart", handleDelegationStart);
    loop.on("delegationComplete", handleDelegationComplete);
    loop.on("subagentText", handleSubagentText);
    loop.on("subagentTool", handleSubagentTool);
    // User prompt and completion events
    loop.on("userPrompt:required", handleUserPromptRequired);
    loop.on("completion:attempted", handleCompletionAttempted);

    // Cleanup subscriptions and timers
    return () => {
      // Clear tool timeout to prevent memory leaks
      if (toolClearTimeoutRef.current) {
        clearTimeout(toolClearTimeoutRef.current);
        toolClearTimeoutRef.current = null;
      }

      // Unsubscribe from all events
      loop.off("stateChange", handleStateChange);
      loop.off("text", handleText);
      loop.off("thinking", handleThinking);
      loop.off("toolStart", handleToolStart);
      loop.off("toolEnd", handleToolEnd);
      loop.off("error", handleError);
      loop.off("complete", handleComplete);
      loop.off("message", handleMessage);
      loop.off("toolCall", handleToolCall);
      loop.off("usage", handleUsage);
      loop.off("terminated", handleTerminated);
      loop.off("loopDetected", handleLoopDetected);
      loop.off("retry", handleRetry);
      loop.off("retryExhausted", handleRetryExhausted);
      // Delegation events cleanup (T059)
      loop.off("delegationStart", handleDelegationStart);
      loop.off("delegationComplete", handleDelegationComplete);
      loop.off("subagentText", handleSubagentText);
      loop.off("subagentTool", handleSubagentTool);
      // User prompt and completion events cleanup
      loop.off("userPrompt:required", handleUserPromptRequired);
      loop.off("completion:attempted", handleCompletionAttempted);
    };
  }, [loop]);

  // Run method - adds user message and runs the loop
  const run = useCallback(
    async (input: string) => {
      if (!input.trim()) return;

      // Reset state for new run
      setError(null);
      setThinking("");
      thinkingStartRef.current = null;
      currentMessageRef.current = null;

      // Add user message
      const userMessage: AgentMessage = {
        id: generateMessageId(),
        role: "user",
        content: input,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // Add to AgentLoop messages
      loop.addMessage(createUserMessage([SessionParts.text(input)]));

      // Run the loop
      try {
        await loop.run();
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error; // Re-throw for caller to handle
      }
    },
    [loop]
  );

  // Cancel method
  const cancel = useCallback(
    (reason?: string) => {
      loop.cancel(reason);
      setCurrentTool(null);
      setThinking("");
      thinkingStartRef.current = null;
    },
    [loop]
  );

  // Clear conversation
  const clear = useCallback(() => {
    setMessages([]);
    setThinking("");
    setCurrentTool(null);
    setError(null);
    thinkingStartRef.current = null;
    currentMessageRef.current = null;
    setUserPromptState(null);
    setCompletionState(null);
  }, []);

  // Submit user response to pending prompt
  const submitUserResponse = useCallback(
    (response: string) => {
      loop.submitUserResponse(response);
      setUserPromptState(null);
    },
    [loop]
  );

  return {
    status,
    agentState,
    messages,
    thinking,
    currentTool,
    isLoading,
    error,
    delegation,
    userPromptState,
    submitUserResponse,
    completionState,
    run,
    cancel,
    clear,
  };
}

export default useAgentLoop;
