/**
 * useBacktrack Hook (T058)
 *
 * React hook for managing conversation backtracking and branching.
 * Provides undo/redo functionality with support for creating alternative
 * conversation branches (forks).
 *
 * @module @vellum/cli
 */

import { useCallback, useMemo, useReducer } from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Represents a single state snapshot in the history.
 */
export interface HistorySnapshot<T> {
  /** Unique identifier for this snapshot */
  readonly id: string;
  /** The state data at this point */
  readonly state: T;
  /** Timestamp when this snapshot was created */
  readonly timestamp: number;
  /** Optional description of what changed */
  readonly description?: string;
}

/**
 * Represents a branch (fork) in the conversation history.
 */
export interface Branch<T> {
  /** Unique identifier for this branch */
  readonly id: string;
  /** Human-readable name for the branch */
  readonly name: string;
  /** Index in the parent branch where this fork occurred */
  readonly forkPoint: number;
  /** The history snapshots in this branch */
  readonly history: ReadonlyArray<HistorySnapshot<T>>;
  /** ID of the parent branch (null for main branch) */
  readonly parentBranchId: string | null;
  /** Timestamp when this branch was created */
  readonly createdAt: number;
}

/**
 * Current backtrack state exposed to consumers.
 */
export interface BacktrackState {
  /** Whether undo is available */
  readonly canUndo: boolean;
  /** Whether redo is available */
  readonly canRedo: boolean;
  /** Total number of forks/branches */
  readonly forkCount: number;
  /** Current branch identifier */
  readonly currentBranch: string;
  /** Current position in history */
  readonly currentIndex: number;
  /** Total history length in current branch */
  readonly historyLength: number;
}

/**
 * Options for the useBacktrack hook.
 */
export interface UseBacktrackOptions<T> {
  /** Initial state */
  readonly initialState: T;
  /** Maximum history length per branch (default: 100) */
  readonly maxHistory?: number;
  /** Whether to enable branching (default: true) */
  readonly enableBranching?: boolean;
  /** Callback when state changes */
  readonly onStateChange?: (state: T, action: "undo" | "redo" | "push" | "branch") => void;
}

/**
 * Return value of useBacktrack hook.
 */
export interface UseBacktrackReturn<T> {
  /** Current state */
  readonly currentState: T;
  /** Backtrack state information */
  readonly backtrackState: BacktrackState;
  /** All available branches */
  readonly branches: ReadonlyArray<Branch<T>>;
  /** Push a new state to history */
  readonly push: (state: T, description?: string) => void;
  /** Undo to previous state */
  readonly undo: () => void;
  /** Redo to next state */
  readonly redo: () => void;
  /** Create a new branch from current position */
  readonly createBranch: (name?: string) => string;
  /** Switch to a different branch */
  readonly switchBranch: (branchId: string) => void;
  /** Get branch by ID */
  readonly getBranch: (branchId: string) => Branch<T> | undefined;
  /** Reset to initial state */
  readonly reset: () => void;
  /** Go to specific point in history */
  readonly goTo: (index: number) => void;
}

// =============================================================================
// Constants
// =============================================================================

/** Default maximum history length */
const DEFAULT_MAX_HISTORY = 100;

/** Main branch identifier */
const MAIN_BRANCH_ID = "main";

// =============================================================================
// Internal State Types
// =============================================================================

interface InternalState<T> {
  readonly branches: Record<string, Branch<T>>;
  readonly currentBranchId: string;
  readonly currentIndex: number;
  readonly maxHistory: number;
}

type Action<T> =
  | { type: "PUSH"; state: T; description?: string }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "GO_TO"; index: number }
  | { type: "CREATE_BRANCH"; name?: string; newBranchId: string }
  | { type: "SWITCH_BRANCH"; branchId: string }
  | { type: "RESET"; initialState: T };

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a unique ID for snapshots and branches.
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a new snapshot.
 */
function createSnapshot<T>(state: T, description?: string): HistorySnapshot<T> {
  return {
    id: generateId(),
    state,
    timestamp: Date.now(),
    description,
  };
}

/**
 * Create initial branch with initial state.
 */
function createInitialBranch<T>(initialState: T): Branch<T> {
  return {
    id: MAIN_BRANCH_ID,
    name: "Main",
    forkPoint: 0,
    history: [createSnapshot(initialState, "Initial state")],
    parentBranchId: null,
    createdAt: Date.now(),
  };
}

// =============================================================================
// Reducer
// =============================================================================

function reducer<T>(state: InternalState<T>, action: Action<T>): InternalState<T> {
  const currentBranch = state.branches[state.currentBranchId];
  if (!currentBranch) {
    return state;
  }

  switch (action.type) {
    case "PUSH": {
      const newSnapshot = createSnapshot(action.state, action.description);

      // If we're not at the end, truncate future history
      const truncatedHistory = currentBranch.history.slice(0, state.currentIndex + 1);

      // Add new snapshot
      let newHistory = [...truncatedHistory, newSnapshot];

      // Enforce max history limit
      if (newHistory.length > state.maxHistory) {
        newHistory = newHistory.slice(newHistory.length - state.maxHistory);
      }

      const updatedBranch: Branch<T> = {
        ...currentBranch,
        history: newHistory,
      };

      return {
        ...state,
        branches: {
          ...state.branches,
          [state.currentBranchId]: updatedBranch,
        },
        currentIndex: newHistory.length - 1,
      };
    }

    case "UNDO": {
      if (state.currentIndex <= 0) {
        return state;
      }
      return {
        ...state,
        currentIndex: state.currentIndex - 1,
      };
    }

    case "REDO": {
      if (state.currentIndex >= currentBranch.history.length - 1) {
        return state;
      }
      return {
        ...state,
        currentIndex: state.currentIndex + 1,
      };
    }

    case "GO_TO": {
      const targetIndex = Math.max(0, Math.min(action.index, currentBranch.history.length - 1));
      if (targetIndex === state.currentIndex) {
        return state;
      }
      return {
        ...state,
        currentIndex: targetIndex,
      };
    }

    case "CREATE_BRANCH": {
      const branchName = action.name ?? `Branch ${Object.keys(state.branches).length}`;

      // Copy history up to current point
      const forkedHistory = currentBranch.history.slice(0, state.currentIndex + 1);

      const newBranch: Branch<T> = {
        id: action.newBranchId,
        name: branchName,
        forkPoint: state.currentIndex,
        history: forkedHistory,
        parentBranchId: state.currentBranchId,
        createdAt: Date.now(),
      };

      return {
        ...state,
        branches: {
          ...state.branches,
          [action.newBranchId]: newBranch,
        },
        currentBranchId: action.newBranchId,
        currentIndex: forkedHistory.length - 1,
      };
    }

    case "SWITCH_BRANCH": {
      const targetBranch = state.branches[action.branchId];
      if (!targetBranch) {
        return state;
      }
      return {
        ...state,
        currentBranchId: action.branchId,
        currentIndex: targetBranch.history.length - 1,
      };
    }

    case "RESET": {
      const initialBranch = createInitialBranch(action.initialState);
      return {
        ...state,
        branches: { [MAIN_BRANCH_ID]: initialBranch },
        currentBranchId: MAIN_BRANCH_ID,
        currentIndex: 0,
      };
    }
  }
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook for managing conversation backtracking and branching.
 *
 * Provides undo/redo functionality with support for creating alternative
 * conversation branches (forks) from any point in history.
 *
 * @example
 * ```tsx
 * function ConversationView() {
 *   const {
 *     currentState,
 *     backtrackState,
 *     push,
 *     undo,
 *     redo,
 *     createBranch,
 *   } = useBacktrack({
 *     initialState: { messages: [] },
 *   });
 *
 *   // Ctrl+Z to undo
 *   useHotkeys([
 *     { key: 'z', ctrl: true, handler: undo },
 *     { key: 'y', ctrl: true, handler: redo },
 *     { key: 'b', ctrl: true, handler: () => createBranch() },
 *   ]);
 *
 *   return (
 *     <Box>
 *       <Text>Can Undo: {backtrackState.canUndo ? 'Yes' : 'No'}</Text>
 *       <Text>Branch: {backtrackState.currentBranch}</Text>
 *     </Box>
 *   );
 * }
 * ```
 */
export function useBacktrack<T>(options: UseBacktrackOptions<T>): UseBacktrackReturn<T> {
  const { initialState, maxHistory = DEFAULT_MAX_HISTORY, onStateChange } = options;

  // Initialize state
  const [state, dispatch] = useReducer(reducer<T>, {
    branches: { [MAIN_BRANCH_ID]: createInitialBranch(initialState) },
    currentBranchId: MAIN_BRANCH_ID,
    currentIndex: 0,
    maxHistory,
  });

  // Get current branch and state
  const currentBranch = state.branches[state.currentBranchId];
  const currentSnapshot = currentBranch?.history[state.currentIndex];
  const currentState = currentSnapshot?.state ?? initialState;

  // Compute backtrack state
  const backtrackState = useMemo<BacktrackState>(
    () => ({
      canUndo: state.currentIndex > 0,
      canRedo: currentBranch ? state.currentIndex < currentBranch.history.length - 1 : false,
      forkCount: Object.keys(state.branches).length - 1, // Exclude main branch
      currentBranch: currentBranch?.name ?? "Main",
      currentIndex: state.currentIndex,
      historyLength: currentBranch?.history.length ?? 0,
    }),
    [state.currentIndex, currentBranch, state.branches]
  );

  // Get all branches as array
  const branches = useMemo<ReadonlyArray<Branch<T>>>(
    () => Object.values(state.branches) as ReadonlyArray<Branch<T>>,
    [state.branches]
  );

  // Action handlers
  const push = useCallback(
    (newState: T, description?: string) => {
      dispatch({ type: "PUSH", state: newState, description });
      onStateChange?.(newState, "push");
    },
    [onStateChange]
  );

  const undo = useCallback(() => {
    if (state.currentIndex > 0) {
      dispatch({ type: "UNDO" });
      const prevState = currentBranch?.history[state.currentIndex - 1]?.state;
      if (prevState) {
        onStateChange?.(prevState, "undo");
      }
    }
  }, [state.currentIndex, currentBranch?.history, onStateChange]);

  const redo = useCallback(() => {
    if (currentBranch && state.currentIndex < currentBranch.history.length - 1) {
      dispatch({ type: "REDO" });
      const nextState = currentBranch.history[state.currentIndex + 1]?.state;
      if (nextState) {
        onStateChange?.(nextState, "redo");
      }
    }
  }, [state.currentIndex, currentBranch, onStateChange]);

  const createBranch = useCallback(
    (name?: string): string => {
      const newBranchId = generateId();
      dispatch({ type: "CREATE_BRANCH", name, newBranchId });
      onStateChange?.(currentState, "branch");
      return newBranchId;
    },
    [currentState, onStateChange]
  );

  const switchBranch = useCallback((branchId: string) => {
    dispatch({ type: "SWITCH_BRANCH", branchId });
  }, []);

  const getBranch = useCallback(
    (branchId: string): Branch<T> | undefined => {
      return state.branches[branchId] as Branch<T> | undefined;
    },
    [state.branches]
  );

  const reset = useCallback(() => {
    dispatch({ type: "RESET", initialState });
  }, [initialState]);

  const goTo = useCallback((index: number) => {
    dispatch({ type: "GO_TO", index });
  }, []);

  return {
    currentState,
    backtrackState,
    branches,
    push,
    undo,
    redo,
    createBranch,
    switchBranch,
    getBranch,
    reset,
    goTo,
  };
}
