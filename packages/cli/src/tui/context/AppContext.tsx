/**
 * Application Context and State Management
 *
 * Provides global application state for the Vellum TUI including
 * mode, loading state, error handling, and focus management.
 *
 * @module tui/context/AppContext
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
 * Application mode representing the current operational state
 */
export type AppMode = "idle" | "loading" | "streaming" | "waiting" | "error";

/**
 * Focusable areas in the TUI
 */
export type FocusedArea = "input" | "messages" | "tools" | "status";

/**
 * Application state interface
 */
export interface AppState {
  /** Current application mode */
  readonly mode: AppMode;
  /** Whether the application is in a loading state */
  readonly loading: boolean;
  /** Current error, if any */
  readonly error: Error | null;
  /** Whether vim mode is enabled for input */
  readonly vimMode: boolean;
  /** Currently focused area of the UI */
  readonly focusedArea: FocusedArea;
}

/**
 * Initial application state
 */
const initialState: AppState = {
  mode: "idle",
  loading: false,
  error: null,
  vimMode: false,
  focusedArea: "input",
};

// =============================================================================
// Actions (Discriminated Union)
// =============================================================================

/**
 * Set the application mode
 */
export interface SetModeAction {
  readonly type: "SET_MODE";
  readonly mode: AppMode;
}

/**
 * Set the loading state
 */
export interface SetLoadingAction {
  readonly type: "SET_LOADING";
  readonly loading: boolean;
}

/**
 * Set an error
 */
export interface SetErrorAction {
  readonly type: "SET_ERROR";
  readonly error: Error | null;
}

/**
 * Toggle vim mode
 */
export interface ToggleVimModeAction {
  readonly type: "TOGGLE_VIM_MODE";
}

/**
 * Set vim mode explicitly
 */
export interface SetVimModeAction {
  readonly type: "SET_VIM_MODE";
  readonly vimMode: boolean;
}

/**
 * Set the focused area
 */
export interface SetFocusedAreaAction {
  readonly type: "SET_FOCUSED_AREA";
  readonly focusedArea: FocusedArea;
}

/**
 * Reset the application state to initial values
 */
export interface ResetAction {
  readonly type: "RESET";
}

/**
 * Discriminated union of all application actions
 */
export type AppAction =
  | SetModeAction
  | SetLoadingAction
  | SetErrorAction
  | ToggleVimModeAction
  | SetVimModeAction
  | SetFocusedAreaAction
  | ResetAction;

// =============================================================================
// Reducer
// =============================================================================

/**
 * Application state reducer
 *
 * @param state - Current application state
 * @param action - Action to apply
 * @returns New application state
 */
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_MODE":
      return {
        ...state,
        mode: action.mode,
        // Automatically update loading based on mode
        loading: action.mode === "loading" || action.mode === "streaming",
        // Clear error when transitioning away from error state
        error: action.mode === "error" ? state.error : null,
      };

    case "SET_LOADING":
      return {
        ...state,
        loading: action.loading,
      };

    case "SET_ERROR":
      return {
        ...state,
        error: action.error,
        mode: action.error !== null ? "error" : state.mode,
      };

    case "TOGGLE_VIM_MODE":
      return {
        ...state,
        vimMode: !state.vimMode,
      };

    case "SET_VIM_MODE":
      return {
        ...state,
        vimMode: action.vimMode,
      };

    case "SET_FOCUSED_AREA":
      return {
        ...state,
        focusedArea: action.focusedArea,
      };

    case "RESET":
      return initialState;

    default:
      // Exhaustive check - TypeScript will error if a case is missing
      return state;
  }
}

// =============================================================================
// Context
// =============================================================================

/**
 * Context value interface
 */
export interface AppContextValue {
  /** Current application state */
  readonly state: AppState;
  /** Dispatch function for state updates */
  readonly dispatch: Dispatch<AppAction>;
  /** Reset state to initial values */
  readonly reset: () => void;
}

/**
 * React context for application state
 *
 * Initialized as undefined to detect usage outside provider
 */
const AppContext = createContext<AppContextValue | undefined>(undefined);

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to access the application state and dispatch
 *
 * Must be used within an AppProvider component.
 *
 * @returns The current app context value with state, dispatch, and reset
 * @throws Error if used outside AppProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { state, dispatch, reset } = useApp();
 *
 *   // Read state
 *   if (state.loading) {
 *     return <Text>Loading...</Text>;
 *   }
 *
 *   // Dispatch actions
 *   const handleStart = () => {
 *     dispatch({ type: 'SET_MODE', mode: 'loading' });
 *   };
 *
 *   // Reset to initial state
 *   const handleReset = () => reset();
 *
 *   return <Box>...</Box>;
 * }
 * ```
 */
export function useApp(): AppContextValue {
  const context = useContext(AppContext);

  if (context === undefined) {
    throw new Error(
      "useApp must be used within an AppProvider. " +
        "Ensure your component is wrapped in <AppProvider>."
    );
  }

  return context;
}

// =============================================================================
// Provider Props
// =============================================================================

/**
 * Props for the AppProvider component
 */
export interface AppProviderProps {
  /**
   * Initial state overrides
   *
   * Partial state that will be merged with the default initial state
   */
  readonly initialState?: Partial<AppState>;

  /**
   * Children to render within the app context
   */
  readonly children: ReactNode;
}

// =============================================================================
// Provider Component
// =============================================================================

/**
 * Application state provider component
 *
 * Provides application state context to all child components, enabling
 * access to the current state and dispatch via the useApp hook.
 *
 * @example
 * ```tsx
 * // Using default initial state
 * <AppProvider>
 *   <App />
 * </AppProvider>
 *
 * // Using custom initial state
 * <AppProvider initialState={{ vimMode: true }}>
 *   <App />
 * </AppProvider>
 * ```
 */
export function AppProvider({
  initialState: initialStateOverrides,
  children,
}: AppProviderProps): React.JSX.Element {
  // State management with useReducer
  // Initial state is computed once via lazy initializer
  const [state, dispatch] = useReducer(
    appReducer,
    initialStateOverrides,
    (overrides): AppState => ({
      ...initialState,
      ...overrides,
    })
  );

  /**
   * Reset state to initial values
   */
  const reset = useCallback((): void => {
    dispatch({ type: "RESET" });
  }, []);

  /**
   * Memoized context value
   */
  const contextValue = useMemo<AppContextValue>(
    () => ({
      state,
      dispatch,
      reset,
    }),
    [state, reset]
  );

  return <AppContext value={contextValue}>{children}</AppContext>;
}

// =============================================================================
// Exports
// =============================================================================

export { AppContext, initialState };
