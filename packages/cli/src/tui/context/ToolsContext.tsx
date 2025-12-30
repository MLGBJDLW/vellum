/**
 * Tools Context and State Management
 *
 * Provides tool execution state management for the Vellum TUI including
 * tool approval workflow, execution tracking, and status updates.
 *
 * @module tui/context/ToolsContext
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
  readonly addExecution: (tool: Omit<ToolExecution, "id" | "status">) => string;
  /** Approve a pending tool execution */
  readonly approveExecution: (id: string) => void;
  /** Reject a pending tool execution */
  readonly rejectExecution: (id: string) => void;
  /** Approve all pending tool executions */
  readonly approveAll: () => void;
  /** Update an existing tool execution */
  readonly updateExecution: (id: string, updates: Partial<ToolExecution>) => void;
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

  /**
   * Add a new tool execution
   * @returns The generated execution ID
   */
  const addExecution = useCallback((tool: Omit<ToolExecution, "id" | "status">): string => {
    const id = generateExecutionId();
    const fullExecution: ToolExecution = {
      ...tool,
      id,
      status: "pending",
    };
    dispatch({ type: "ADD_EXECUTION", execution: fullExecution });
    return id;
  }, []);

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
    dispatch({ type: "CLEAR_EXECUTIONS" });
  }, []);

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
      approveExecution,
      rejectExecution,
      approveAll,
      updateExecution,
      clearExecutions,
    }),
    [
      state,
      addExecution,
      approveExecution,
      rejectExecution,
      approveAll,
      updateExecution,
      clearExecutions,
    ]
  );

  return <ToolsContext.Provider value={contextValue}>{children}</ToolsContext.Provider>;
}

// =============================================================================
// Exports
// =============================================================================

export { ToolsContext, initialState };
