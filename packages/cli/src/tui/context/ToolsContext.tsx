/**
 * Tools Context and State Management
 *
 * Provides tool execution state management for the Vellum TUI including
 * tool approval workflow, execution tracking, and status updates.
 *
 * @module tui/context/ToolsContext
 */

import type {
  AskContext,
  PermissionAskHandler,
  PermissionInfo,
  PermissionResponse,
} from "@vellum/core";
import React, {
  createContext,
  type Dispatch,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
} from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Status of a tool execution
 */
export type ToolExecutionStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "running"
  | "complete"
  | "error";

/**
 * A single tool execution
 */
export interface ToolExecution {
  /** Unique identifier for the execution */
  readonly id: string;
  /** Name of the tool being executed */
  readonly toolName: string;
  /** Parameters passed to the tool */
  readonly params: Record<string, unknown>;
  /** Current status of the execution */
  readonly status: ToolExecutionStatus;
  /** Result of the execution, if completed */
  readonly result?: unknown;
  /** Error that occurred during execution */
  readonly error?: Error;
  /** Timestamp when execution started */
  readonly startedAt?: Date;
  /** Timestamp when execution completed */
  readonly completedAt?: Date;
  /** Shell output lines for streaming display (max 10 lines) */
  readonly shellOutput?: readonly string[];
}

/**
 * Input shape for creating a new execution.
 *
 * Status defaults to "pending" for backwards compatibility with existing UI/tests.
 */
export interface NewToolExecution {
  /** Name of the tool being executed */
  readonly toolName: string;
  /** Parameters passed to the tool */
  readonly params: Record<string, unknown>;
  /** Initial status (default: "pending") */
  readonly status?: ToolExecutionStatus;
  /** Result of the execution, if completed */
  readonly result?: unknown;
  /** Error that occurred during execution */
  readonly error?: Error;
  /** Timestamp when execution started */
  readonly startedAt?: Date;
  /** Timestamp when execution completed */
  readonly completedAt?: Date;
}

/**
 * Tools state interface
 */
export interface ToolsState {
  /** List of all tool executions */
  readonly executions: readonly ToolExecution[];
  /** Tool executions pending approval */
  readonly pendingApproval: readonly ToolExecution[];
}

/**
 * Initial tools state
 */
const initialState: ToolsState = {
  executions: [],
  pendingApproval: [],
};

// =============================================================================
// Actions (Discriminated Union)
// =============================================================================

/**
 * Add a new tool execution
 */
export interface AddExecutionAction {
  readonly type: "ADD_EXECUTION";
  readonly execution: ToolExecution;
}

/**
 * Approve a pending tool execution
 */
export interface ApproveExecutionAction {
  readonly type: "APPROVE_EXECUTION";
  readonly id: string;
}

/**
 * Reject a pending tool execution
 */
export interface RejectExecutionAction {
  readonly type: "REJECT_EXECUTION";
  readonly id: string;
}

/**
 * Approve all pending tool executions
 */
export interface ApproveAllAction {
  readonly type: "APPROVE_ALL";
}

/**
 * Update an existing tool execution
 */
export interface UpdateExecutionAction {
  readonly type: "UPDATE_EXECUTION";
  readonly id: string;
  readonly updates: Partial<Omit<ToolExecution, "id">>;
}

/**
 * Clear all tool executions
 */
export interface ClearExecutionsAction {
  readonly type: "CLEAR_EXECUTIONS";
}

/**
 * Discriminated union of all tools actions
 */
export type ToolsAction =
  | AddExecutionAction
  | ApproveExecutionAction
  | RejectExecutionAction
  | ApproveAllAction
  | UpdateExecutionAction
  | ClearExecutionsAction;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Compute pending approval list from executions
 */
function computePendingApproval(executions: readonly ToolExecution[]): readonly ToolExecution[] {
  return executions.filter((e) => e.status === "pending");
}

/**
 * Update a single execution in the list
 */
function updateExecutionInList(
  executions: readonly ToolExecution[],
  id: string,
  updates: Partial<Omit<ToolExecution, "id">>
): readonly ToolExecution[] {
  const index = executions.findIndex((e) => e.id === id);
  if (index === -1) {
    return executions;
  }

  const existing = executions[index];
  if (!existing) {
    return executions;
  }

  const updated = [...executions];
  updated[index] = {
    ...existing,
    ...updates,
  };
  return updated;
}

// =============================================================================
// Reducer
// =============================================================================

/**
 * Tools state reducer
 *
 * @param state - Current tools state
 * @param action - Action to apply
 * @returns New tools state
 */
function toolsReducer(state: ToolsState, action: ToolsAction): ToolsState {
  switch (action.type) {
    case "ADD_EXECUTION": {
      const newExecutions = [...state.executions, action.execution];
      return {
        executions: newExecutions,
        pendingApproval: computePendingApproval(newExecutions),
      };
    }

    case "APPROVE_EXECUTION": {
      const updatedExecutions = updateExecutionInList(state.executions, action.id, {
        status: "approved",
      });

      if (updatedExecutions === state.executions) {
        return state;
      }

      return {
        executions: updatedExecutions,
        pendingApproval: computePendingApproval(updatedExecutions),
      };
    }

    case "REJECT_EXECUTION": {
      const updatedExecutions = updateExecutionInList(state.executions, action.id, {
        status: "rejected",
      });

      if (updatedExecutions === state.executions) {
        return state;
      }

      return {
        executions: updatedExecutions,
        pendingApproval: computePendingApproval(updatedExecutions),
      };
    }

    case "APPROVE_ALL": {
      if (state.pendingApproval.length === 0) {
        return state;
      }

      const updatedExecutions = state.executions.map((execution) =>
        execution.status === "pending" ? { ...execution, status: "approved" as const } : execution
      );

      return {
        executions: updatedExecutions,
        pendingApproval: [],
      };
    }

    case "UPDATE_EXECUTION": {
      const updatedExecutions = updateExecutionInList(state.executions, action.id, action.updates);

      if (updatedExecutions === state.executions) {
        return state;
      }

      return {
        executions: updatedExecutions,
        pendingApproval: computePendingApproval(updatedExecutions),
      };
    }

    case "CLEAR_EXECUTIONS":
      return initialState;

    default:
      // Exhaustive check - TypeScript will error if a case is missing
      return state;
  }
}

// =============================================================================
// ID Generation
// =============================================================================

/**
 * Generate a unique tool execution ID
 *
 * Uses crypto.randomUUID() when available, falls back to timestamp-based ID
 */
function generateExecutionId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return `tool-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// =============================================================================
// Context
// =============================================================================

/**
 * Context value interface
 */
export interface ToolsContextValue {
  /** Current tools state */
  readonly state: ToolsState;
  /** Dispatch function for state updates */
  readonly dispatch: Dispatch<ToolsAction>;
  /** All tool executions */
  readonly executions: readonly ToolExecution[];
  /** Tool executions pending approval */
  readonly pendingApproval: readonly ToolExecution[];
  /** Add a new tool execution, returns the generated ID */
  readonly addExecution: (tool: NewToolExecution) => string;
  /** Register a tool callId -> executionId mapping for correlation */
  readonly registerCallId: (callId: string, executionId: string) => void;
  /** Approve a pending tool execution */
  readonly approveExecution: (id: string) => void;
  /** Reject a pending tool execution */
  readonly rejectExecution: (id: string) => void;
  /** Respond to a pending permission prompt associated with an execution */
  readonly respondToPermissionRequest: (executionId: string, response: PermissionResponse) => void;
  /** PermissionAskHandler that surfaces permission prompts through ToolsContext */
  readonly permissionAskHandler: PermissionAskHandler;
  /** Approve all pending tool executions */
  readonly approveAll: () => void;
  /** Update an existing tool execution */
  readonly updateExecution: (id: string, updates: Partial<ToolExecution>) => void;
  /** Update shell output for streaming display (appends new content, keeps last 10 lines) */
  readonly updateShellOutput: (id: string, chunk: string) => void;
  /** Clear all tool executions */
  readonly clearExecutions: () => void;
}

/**
 * React context for tools state
 *
 * Initialized as undefined to detect usage outside provider
 */
const ToolsContext = createContext<ToolsContextValue | undefined>(undefined);

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to access the tools state and actions
 *
 * Must be used within a ToolsProvider component.
 *
 * @returns The current tools context value with state and actions
 * @throws Error if used outside ToolsProvider
 *
 * @example
 * ```tsx
 * function ToolApprovalComponent() {
 *   const { executions, pendingApproval, approveExecution, rejectExecution, approveAll } = useTools();
 *
 *   // Add a new tool execution
 *   const handleToolCall = (toolName: string, params: Record<string, unknown>) => {
 *     const id = addExecution({ toolName, params });
 *     console.log('Created execution:', id);
 *   };
 *
 *   // Approve a single execution
 *   const handleApprove = (id: string) => approveExecution(id);
 *
 *   // Reject a single execution
 *   const handleReject = (id: string) => rejectExecution(id);
 *
 *   // Approve all pending
 *   const handleApproveAll = () => approveAll();
 *
 *   return <Box>...</Box>;
 * }
 * ```
 */
export function useTools(): ToolsContextValue {
  const context = useContext(ToolsContext);

  if (context === undefined) {
    throw new Error(
      "useTools must be used within a ToolsProvider. " +
        "Ensure your component is wrapped in <ToolsProvider>."
    );
  }

  return context;
}

// =============================================================================
// Provider Props
// =============================================================================

/**
 * Props for the ToolsProvider component
 */
export interface ToolsProviderProps {
  /**
   * Initial tool executions to populate the state
   */
  readonly initialExecutions?: readonly ToolExecution[];

  /**
   * Children to render within the tools context
   */
  readonly children: ReactNode;
}

// =============================================================================
// Provider Component
// =============================================================================

/**
 * Tools state provider component
 *
 * Provides tools state context to all child components, enabling
 * access to tool executions and approval workflow via the useTools hook.
 *
 * @example
 * ```tsx
 * // Using default initial state
 * <ToolsProvider>
 *   <ToolApprovalUI />
 * </ToolsProvider>
 *
 * // Using initial executions
 * <ToolsProvider initialExecutions={[{ id: '1', toolName: 'read_file', params: {}, status: 'pending' }]}>
 *   <ToolApprovalUI />
 * </ToolsProvider>
 * ```
 */
export function ToolsProvider({
  initialExecutions,
  children,
}: ToolsProviderProps): React.JSX.Element {
  // State management with useReducer
  const [state, dispatch] = useReducer(
    toolsReducer,
    initialExecutions,
    (executions): ToolsState => {
      const executionList = executions ?? [];
      return {
        executions: executionList,
        pendingApproval: computePendingApproval(executionList),
      };
    }
  );

  // Correlate core ToolContext.callId -> ToolExecution.id
  const callIdMapRef = useRef<Map<string, string>>(new Map());

  // O(1) lookup for execution index by id (updated when state changes)
  const executionIndexMapRef = useRef<Map<string, number>>(new Map());

  type PendingResolver = {
    readonly resolve: (result: PermissionResponse | undefined) => void;
    readonly signal: AbortSignal;
    readonly abortHandler: () => void;
  };

  // Pending permission prompts keyed by ToolExecution.id
  const pendingPermissionResolversRef = useRef<Map<string, PendingResolver>>(new Map());

  // Keep executionIndexMapRef in sync with state.executions
  // This runs on every render but Map operations are O(1)
  executionIndexMapRef.current.clear();
  state.executions.forEach((exec, index) => {
    executionIndexMapRef.current.set(exec.id, index);
  });

  /**
   * Add a new tool execution
   * @returns The generated execution ID
   */
  const addExecution = useCallback((tool: NewToolExecution): string => {
    const id = generateExecutionId();
    const status: ToolExecutionStatus = tool.status ?? "pending";
    const fullExecution: ToolExecution = {
      id,
      toolName: tool.toolName,
      params: tool.params,
      status,
      result: tool.result,
      error: tool.error,
      startedAt: tool.startedAt,
      completedAt: tool.completedAt,
    };
    dispatch({ type: "ADD_EXECUTION", execution: fullExecution });
    return id;
  }, []);

  /**
   * Register callId mapping for correlation.
   */
  const registerCallId = useCallback((callId: string, executionId: string): void => {
    callIdMapRef.current.set(callId, executionId);
  }, []);

  /**
   * Respond to an active permission request (if any) associated with a ToolExecution.
   */
  const respondToPermissionRequest = useCallback(
    (executionId: string, response: PermissionResponse): void => {
      const pending = pendingPermissionResolversRef.current.get(executionId);

      // Update UI state immediately.
      dispatch({
        type: response === "reject" ? "REJECT_EXECUTION" : "APPROVE_EXECUTION",
        id: executionId,
      });

      if (!pending) {
        return;
      }

      // Clean up abort handler and resolve the ask promise.
      pending.signal.removeEventListener("abort", pending.abortHandler);
      pendingPermissionResolversRef.current.delete(executionId);
      pending.resolve(response);
    },
    []
  );

  /**
   * Approve a pending tool execution
   */
  const approveExecution = useCallback((id: string): void => {
    dispatch({ type: "APPROVE_EXECUTION", id });
  }, []);

  /**
   * Reject a pending tool execution
   */
  const rejectExecution = useCallback((id: string): void => {
    dispatch({ type: "REJECT_EXECUTION", id });
  }, []);

  /**
   * Ask handler implementation that drives permission prompts through ToolsContext.
   *
   * This allows core permission checks to block until the user responds in the TUI.
   */
  const permissionAskHandler: PermissionAskHandler = useCallback(
    async (info: PermissionInfo, context: AskContext): Promise<PermissionResponse | undefined> => {
      const toolNameFromMeta =
        typeof info.metadata?.toolName === "string"
          ? (info.metadata.toolName as string)
          : undefined;

      const toolName =
        toolNameFromMeta ??
        info.title
          .replace(/^Allow\s+/i, "")
          .replace(/\?$/, "")
          .trim();

      const paramsFromMeta =
        info.metadata && typeof info.metadata.params === "object" && info.metadata.params !== null
          ? (info.metadata.params as Record<string, unknown>)
          : {};

      const mappedExecutionId = info.callId ? callIdMapRef.current.get(info.callId) : undefined;
      const executionId =
        mappedExecutionId ??
        addExecution({
          toolName,
          params: paramsFromMeta,
          status: "pending",
        });

      // Ensure the execution reflects the prompt state.
      dispatch({
        type: "UPDATE_EXECUTION",
        id: executionId,
        updates: {
          toolName,
          params: paramsFromMeta,
          status: "pending",
        },
      });

      return new Promise<PermissionResponse | undefined>((resolve) => {
        const abortHandler = () => {
          // Only resolve if this execution is still pending.
          const pending = pendingPermissionResolversRef.current.get(executionId);
          if (!pending || pending.resolve !== resolve) {
            return;
          }

          pendingPermissionResolversRef.current.delete(executionId);
          resolve(undefined);
        };

        pendingPermissionResolversRef.current.set(executionId, {
          resolve,
          signal: context.signal,
          abortHandler,
        });

        context.signal.addEventListener("abort", abortHandler, { once: true });
      });
    },
    [addExecution]
  );

  /**
   * Approve all pending tool executions
   */
  const approveAll = useCallback((): void => {
    dispatch({ type: "APPROVE_ALL" });
  }, []);

  /**
   * Update an existing tool execution
   */
  const updateExecution = useCallback((id: string, updates: Partial<ToolExecution>): void => {
    dispatch({ type: "UPDATE_EXECUTION", id, updates });
  }, []);

  /**
   * Clear all tool executions
   */
  const clearExecutions = useCallback((): void => {
    // Clear the callId mapping to prevent unbounded growth
    callIdMapRef.current.clear();
    dispatch({ type: "CLEAR_EXECUTIONS" });
  }, []);

  /** Maximum number of shell output lines to keep */
  const MAX_SHELL_OUTPUT_LINES = 10;

  /**
   * Update shell output for streaming display
   * Appends new content and keeps only the last MAX_SHELL_OUTPUT_LINES lines
   */
  const updateShellOutput = useCallback(
    (id: string, chunk: string): void => {
      // Get current execution using O(1) index lookup
      const index = executionIndexMapRef.current.get(id);
      const execution = index !== undefined ? state.executions[index] : undefined;
      const currentLines = execution?.shellOutput ?? [];

      // Split chunk into lines and append
      const newLines = chunk.split("\n").filter((line) => line.length > 0);
      const allLines = [...currentLines, ...newLines];

      // Keep only last MAX_SHELL_OUTPUT_LINES lines
      const trimmedLines = allLines.slice(-MAX_SHELL_OUTPUT_LINES);

      dispatch({
        type: "UPDATE_EXECUTION",
        id,
        updates: { shellOutput: trimmedLines },
      });
    },
    [state.executions]
  );

  /**
   * Memoized context value
   */
  const contextValue = useMemo<ToolsContextValue>(
    () => ({
      state,
      dispatch,
      executions: state.executions,
      pendingApproval: state.pendingApproval,
      addExecution,
      registerCallId,
      approveExecution,
      rejectExecution,
      respondToPermissionRequest,
      permissionAskHandler,
      approveAll,
      updateExecution,
      updateShellOutput,
      clearExecutions,
    }),
    [
      state,
      addExecution,
      registerCallId,
      approveExecution,
      rejectExecution,
      respondToPermissionRequest,
      permissionAskHandler,
      approveAll,
      updateExecution,
      updateShellOutput,
      clearExecutions,
    ]
  );

  return <ToolsContext value={contextValue}>{children}</ToolsContext>;
}

// =============================================================================
// Exports
// =============================================================================

export { ToolsContext, initialState };
