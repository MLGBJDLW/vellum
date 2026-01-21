/**
 * LSP Context Provider
 *
 * Provides LSP (Language Server Protocol) state management for the TUI.
 * Subscribes to LSP integration manager state updates and provides
 * status information to UI components.
 *
 * @module tui/context/LspContext
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

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
  /** Refresh LSP state */
  readonly refresh: () => void;
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
      } else {
        setTotalServers(0);
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  // Initial refresh and interval
  useEffect(() => {
    // Immediate refresh
    refresh();

    // Set up interval for periodic refresh
    const intervalId = setInterval(refresh, refreshInterval);

    return () => {
      clearInterval(intervalId);
    };
  }, [refresh, refreshInterval]);

  // Create context value
  const contextValue = useMemo<LspContextState>(
    () => ({
      isInitialized,
      runningServers,
      totalServers,
      runningServerIds,
      toolsRegistered,
      error,
      refresh,
    }),
    [isInitialized, runningServers, totalServers, runningServerIds, toolsRegistered, error, refresh]
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
