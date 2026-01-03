/**
 * MCP Context Provider
 *
 * Provides McpHub initialization and lifecycle management for the TUI.
 * Handles startup initialization and graceful shutdown via ProcessManager.
 *
 * @module tui/context/McpContext
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ToolExecutor, ToolRegistry } from "@vellum/core";
import {
  type CoreCredentialManager,
  createOAuthCredentialAdapter,
  getProcessManager,
  McpHub,
  type McpHubOptions,
  type OAuthCredentialManager,
} from "@vellum/mcp";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

// =============================================================================
// T047: MCP Context Types
// =============================================================================

/**
 * MCP Context state
 */
export interface McpContextState {
  /** McpHub instance (null until initialized) */
  readonly hub: McpHub | null;
  /** Whether MCP is initialized */
  readonly isInitialized: boolean;
  /** Whether MCP is currently initializing */
  readonly isInitializing: boolean;
  /** Error that occurred during initialization, if any */
  readonly error: Error | null;
  /** Reinitialize MCP (e.g., after config change) */
  readonly reinitialize: () => Promise<void>;
}

/**
 * MCP Context
 */
const McpContext = createContext<McpContextState | null>(null);

// =============================================================================
// T047: MCP Provider Props
// =============================================================================

/**
 * Props for McpProvider
 */
export interface McpProviderProps {
  /** Children to render */
  readonly children: ReactNode;
  /** Whether to auto-initialize on mount (default: true) */
  readonly autoInitialize?: boolean;
  /** Client version for MCP protocol */
  readonly clientVersion?: string;
  /** Optional project config path override */
  readonly projectConfigPath?: string;
  /**
   * Optional credential manager for OAuth token persistence.
   * Can be either a CoreCredentialManager (from @vellum/core) or
   * an OAuthCredentialManager directly.
   */
  readonly credentialManager?: CoreCredentialManager | OAuthCredentialManager;
  /** Optional tool registry for MCP tool registration */
  readonly toolRegistry?: ToolRegistry;
  /** Optional tool executor for MCP tool execution */
  readonly toolExecutor?: ToolExecutor;
}

// =============================================================================
// T047: Default Paths
// =============================================================================

/**
 * Get the default Vellum settings directory path.
 * On Windows: %USERPROFILE%\.vellum
 * On Unix: ~/.vellum
 */
async function getDefaultSettingsPath(): Promise<string> {
  const home = os.homedir();
  const settingsDir = path.join(home, ".vellum");

  // Ensure directory exists
  await fs.mkdir(settingsDir, { recursive: true });

  return settingsDir;
}

/**
 * Get the default MCP servers config path.
 * Returns ~/.vellum/mcp.json
 */
async function getDefaultMcpServersPath(): Promise<string> {
  const settingsDir = await getDefaultSettingsPath();
  return path.join(settingsDir, "mcp.json");
}

// =============================================================================
// T047: MCP Provider Component
// =============================================================================

/**
 * MCP Provider component.
 *
 * Initializes McpHub on mount and registers cleanup with ProcessManager
 * for graceful shutdown handling.
 *
 * @example
 * ```tsx
 * <McpProvider clientVersion="1.0.0">
 *   <App />
 * </McpProvider>
 * ```
 */
export function McpProvider({
  children,
  autoInitialize = true,
  clientVersion = "1.0.0",
  projectConfigPath,
  credentialManager,
  toolRegistry,
  toolExecutor,
}: McpProviderProps): React.JSX.Element {
  const [hub, setHub] = useState<McpHub | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Initialize McpHub and register with ProcessManager
   */
  const initialize = useCallback(async () => {
    if (isInitializing || hub) {
      return;
    }

    setIsInitializing(true);
    setError(null);

    try {
      // Adapt credential manager if needed
      // If it looks like a CoreCredentialManager (Result-based API), wrap it
      let oauthCredentialManager: OAuthCredentialManager | undefined;
      if (credentialManager) {
        // Check if it's already an OAuthCredentialManager (has void-returning methods)
        // vs a CoreCredentialManager (has Result-returning methods)
        // We duck-type check by looking at resolve return type
        const testResolve = credentialManager.resolve("test");
        if (testResolve instanceof Promise) {
          const result = await testResolve;
          // If result has 'ok' property, it's a CoreCredentialManager
          if (result && typeof result === "object" && "ok" in result) {
            oauthCredentialManager = createOAuthCredentialAdapter(
              credentialManager as CoreCredentialManager
            );
          } else {
            // It's already an OAuthCredentialManager
            oauthCredentialManager = credentialManager as OAuthCredentialManager;
          }
        }
      }

      // Create McpHub options
      const options: McpHubOptions = {
        getMcpServersPath: getDefaultMcpServersPath,
        getSettingsDirectoryPath: getDefaultSettingsPath,
        clientVersion,
        projectConfigPath: projectConfigPath ? () => Promise.resolve(projectConfigPath) : undefined,
        credentialManager: oauthCredentialManager,
        toolRegistry,
        toolExecutor,
      };

      // Create and initialize McpHub
      const newHub = new McpHub(options);
      await newHub.initialize();

      // Register with ProcessManager for graceful shutdown
      const processManager = getProcessManager();
      processManager.onCleanup(async () => {
        await newHub.dispose();
      });

      setHub(newHub);
      setIsInitialized(true);
    } catch (err) {
      const initError = err instanceof Error ? err : new Error(String(err));
      setError(initError);
      console.error("[MCP] Initialization failed:", initError.message);
    } finally {
      setIsInitializing(false);
    }
  }, [
    clientVersion,
    projectConfigPath,
    hub,
    isInitializing,
    credentialManager,
    toolRegistry,
    toolExecutor,
  ]);

  /**
   * Reinitialize MCP (dispose and recreate)
   */
  const reinitialize = useCallback(async () => {
    // Dispose existing hub
    if (hub) {
      try {
        await hub.dispose();
      } catch (err) {
        console.warn("[MCP] Error disposing hub during reinitialize:", err);
      }
      setHub(null);
      setIsInitialized(false);
    }

    // Re-initialize
    await initialize();
  }, [hub, initialize]);

  // Auto-initialize on mount
  useEffect(() => {
    if (autoInitialize && !hub && !isInitializing) {
      initialize();
    }
  }, [autoInitialize, hub, isInitializing, initialize]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hub) {
        hub.dispose().catch((err) => {
          console.warn("[MCP] Error disposing hub on unmount:", err);
        });
      }
    };
  }, [hub]);

  // Create context value
  const contextValue = useMemo<McpContextState>(
    () => ({
      hub,
      isInitialized,
      isInitializing,
      error,
      reinitialize,
    }),
    [hub, isInitialized, isInitializing, error, reinitialize]
  );

  return <McpContext.Provider value={contextValue}>{children}</McpContext.Provider>;
}

// =============================================================================
// T047: Hook
// =============================================================================

/**
 * Hook to access MCP context.
 *
 * @returns MCP context state
 * @throws Error if used outside McpProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { hub, isInitialized, error } = useMcp();
 *
 *   if (!isInitialized) {
 *     return <Text>Loading MCP...</Text>;
 *   }
 *
 *   if (error) {
 *     return <Text color="red">MCP Error: {error.message}</Text>;
 *   }
 *
 *   // Use hub...
 * }
 * ```
 */
export function useMcp(): McpContextState {
  const context = useContext(McpContext);

  if (!context) {
    throw new Error("useMcp must be used within a McpProvider");
  }

  return context;
}

/**
 * Hook to access McpHub directly (throws if not initialized).
 *
 * @returns McpHub instance
 * @throws Error if MCP is not initialized or used outside provider
 */
export function useMcpHub(): McpHub {
  const { hub, isInitialized, error } = useMcp();

  if (error) {
    throw error;
  }

  if (!isInitialized || !hub) {
    throw new Error("McpHub is not initialized");
  }

  return hub;
}
