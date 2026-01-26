/**
 * LSP Context Provider
 *
 * Provides LSP (Language Server Protocol) state management for the TUI.
 * Subscribes to LSP integration manager state updates and provides
 * status information to UI components.
 *
 * @module tui/context/LspContext
 */

import type { ConfirmationRequest, LspServerState } from "@vellum/lsp";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useLspConfirmation } from "../hooks/useLspConfirmation.js";
import { getLspManager, type LspIntegrationState } from "../lsp-integration.js";

// =============================================================================
// Types
// =============================================================================

/**
 * LSP Context state
 */
export interface LspContextState {
  /** Whether LSP is initialized */
  readonly isInitialized: boolean;
  /** Number of running LSP servers */
  readonly runningServers: number;
  /** Total number of configured LSP servers */
  readonly totalServers: number;
  /** Currently running server IDs */
  readonly runningServerIds: readonly string[];
  /** Whether tools are registered */
  readonly toolsRegistered: boolean;
  /** Error that occurred, if any */
  readonly error: Error | null;
  /** Auto-mode server states (null if auto-mode not active) */
  readonly autoModeStates: Map<string, LspServerState> | null;
  /** Current confirmation request (null if no dialog active) */
  readonly currentConfirmRequest: ConfirmationRequest | null;
  /** Respond to current confirmation request */
  readonly respondToConfirmation: (approved: boolean) => void;
  /** Refresh LSP state */
  readonly refresh: () => void;
  /**
   * Set confirmation handler for semi-auto mode.
   * Called by useLspConfirmation to register its requestConfirmation function.
   */
  readonly setConfirmationHandler: (
    handler: (request: ConfirmationRequest) => Promise<boolean>
  ) => void;
  /**
   * Confirm or deny a pending auto-mode action.
   * Used in semi-auto mode when user responds to a confirmation prompt.
   */
  readonly confirmAutoModeAction: (
    request: ConfirmationRequest,
    approved: boolean
  ) => Promise<void>;
}

/**
 * LSP Context
 */
const LspContext = createContext<LspContextState | null>(null);

// =============================================================================
// Provider Props
// =============================================================================

/**
 * Props for LspProvider
 */
export interface LspProviderProps {
  /** Children to render */
  readonly children: ReactNode;
  /** Refresh interval in milliseconds (default: 2000) */
  readonly refreshInterval?: number;
}

// =============================================================================
// Provider Component
// =============================================================================

/**
 * LSP Provider component.
 *
 * Subscribes to LSP integration manager state and provides it to the component tree.
 * Automatically refreshes state at the specified interval.
 *
 * @example
 * ```tsx
 * <LspProvider>
 *   <App />
 * </LspProvider>
 * ```
 */
export function LspProvider({
  children,
  refreshInterval = 2000,
}: LspProviderProps): React.JSX.Element {
  const [isInitialized, setIsInitialized] = useState(false);
  const [runningServers, setRunningServers] = useState(0);
  const [totalServers, setTotalServers] = useState(0);
  const [runningServerIds, setRunningServerIds] = useState<readonly string[]>([]);
  const [toolsRegistered, setToolsRegistered] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [autoModeStates, setAutoModeStates] = useState<Map<string, LspServerState> | null>(null);

  /**
   * Refresh LSP state from the manager
   */
  const refresh = useCallback(() => {
    try {
      const manager = getLspManager();
      const state: LspIntegrationState = manager.getState();
      const hub = manager.getHub();

      setIsInitialized(state.initialized);
      setRunningServerIds(state.runningServers);
      setRunningServers(state.runningServers.length);
      setToolsRegistered(state.toolsRegistered);

      // Get total configured servers from hub
      if (hub) {
        const servers = hub.getServers();
        setTotalServers(servers.length);
        // Get auto-mode states if available
        setAutoModeStates(hub.getAutoModeState());
      } else {
        setTotalServers(0);
        setAutoModeStates(null);
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  // Initial refresh and interval (polling as fallback)
  useEffect(() => {
    // Immediate refresh
    refresh();

    // Set up interval for periodic refresh (fallback for missed events)
    const intervalId = setInterval(refresh, refreshInterval);

    return () => {
      clearInterval(intervalId);
    };
  }, [refresh, refreshInterval]);

  // Event-driven updates (primary method - immediate response to LSP events)
  useEffect(() => {
    let manager: ReturnType<typeof getLspManager> | null = null;

    try {
      manager = getLspManager();
    } catch {
      // Manager not initialized yet, skip event subscription
      return;
    }

    const handleStateChange = () => {
      refresh();
    };

    // Subscribe to state changes
    manager.onStateChanged(handleStateChange);

    return () => {
      // Unsubscribe on cleanup
      manager?.offStateChanged(handleStateChange);
    };
  }, [refresh]);

  /**
   * Set confirmation handler for semi-auto mode.
   * Called by useLspConfirmation to register its requestConfirmation function.
   */
  const setConfirmationHandler = useCallback(
    (handler: (request: ConfirmationRequest) => Promise<boolean>) => {
      try {
        const manager = getLspManager();
        const hub = manager.getHub();
        if (hub) {
          hub.setConfirmationHandler(handler);
        }
      } catch {
        // Manager not initialized yet, ignore
      }
    },
    []
  );

  /**
   * Confirm or deny a pending auto-mode action.
   */
  const confirmAutoModeAction = useCallback(
    async (request: ConfirmationRequest, approved: boolean): Promise<void> => {
      try {
        const manager = getLspManager();
        const hub = manager.getHub();
        if (hub) {
          await hub.confirmAutoModeAction(request, approved);
        }
      } catch {
        // Manager not initialized yet, ignore
      }
    },
    []
  );

  // Use the confirmation hook for semi-auto mode
  const { currentRequest, respond, requestConfirmation } = useLspConfirmation({
    onResponse: confirmAutoModeAction,
  });

  // Register the confirmation handler with LspHub
  useEffect(() => {
    setConfirmationHandler(requestConfirmation);
  }, [setConfirmationHandler, requestConfirmation]);

  // Create context value
  const contextValue = useMemo<LspContextState>(
    () => ({
      isInitialized,
      runningServers,
      totalServers,
      runningServerIds,
      toolsRegistered,
      error,
      autoModeStates,
      currentConfirmRequest: currentRequest,
      respondToConfirmation: respond,
      refresh,
      setConfirmationHandler,
      confirmAutoModeAction,
    }),
    [
      isInitialized,
      runningServers,
      totalServers,
      runningServerIds,
      toolsRegistered,
      error,
      autoModeStates,
      currentRequest,
      respond,
      refresh,
      setConfirmationHandler,
      confirmAutoModeAction,
    ]
  );

  return <LspContext value={contextValue}>{children}</LspContext>;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to access LSP context.
 *
 * @returns LSP context state
 * @throws Error if used outside LspProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isInitialized, runningServers, totalServers } = useLsp();
 *
 *   if (!isInitialized) {
 *     return <Text>LSP: off</Text>;
 *   }
 *
 *   return <Text>LSP: {runningServers}/{totalServers}</Text>;
 * }
 * ```
 */
export function useLsp(): LspContextState {
  const context = useContext(LspContext);

  if (!context) {
    throw new Error("useLsp must be used within a LspProvider");
  }

  return context;
}

/**
 * Hook to access LSP context optionally (returns null if outside provider).
 *
 * @returns LSP context state or null
 */
export function useLspOptional(): LspContextState | null {
  return useContext(LspContext);
}
