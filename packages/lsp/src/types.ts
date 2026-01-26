import type { MessageConnection } from "vscode-jsonrpc";
import type {
  CallHierarchyIncomingCall,
  CallHierarchyOutgoingCall,
  CodeAction,
  CompletionItem,
  Diagnostic,
  DocumentSymbol,
  Hover,
  Location,
  SymbolInformation,
  TextEdit,
} from "vscode-languageserver-protocol";

// =============================================================================
// Transport Types
// =============================================================================

export type LspTransportType = "stdio" | "socket" | "ipc";

/**
 * Auto-install mode for LSP servers.
 * - "auto": Automatically install missing servers
 * - "prompt": Prompt user before installing (default)
 * - "never": Never auto-install servers
 */
export type AutoInstallMode = "auto" | "prompt" | "never";

// =============================================================================
// Server Status
// =============================================================================

export type LspServerStatus =
  | LspServerStatusStopped
  | LspServerStatusStarting
  | LspServerStatusRunning
  | LspServerStatusError
  | LspServerStatusBroken;

export interface LspServerStatusStopped {
  readonly status: "stopped";
  readonly stoppedAt?: Date;
  readonly reason?: "user" | "idle" | "shutdown";
}

export interface LspServerStatusStarting {
  readonly status: "starting";
  readonly startedAt: Date;
  readonly progress: number;
}

export interface LspServerStatusRunning {
  readonly status: "running";
  readonly startedAt: Date;
  readonly pid: number;
  readonly capabilities: LspServerCapabilities;
  readonly requestCount: number;
}

export interface LspServerStatusError {
  readonly status: "error";
  readonly error: Error;
  readonly errorAt: Date;
  readonly restartCount: number;
  readonly maxRestarts: number;
  readonly retrying: boolean;
  readonly nextRetryAt?: Date;
}

export interface LspServerStatusBroken {
  readonly status: "broken";
  readonly lastError: Error;
  readonly totalAttempts: number;
  readonly brokenAt: Date;
  readonly recoveryHint: string;
}

export interface LspServerCapabilities {
  readonly hoverProvider: boolean;
  readonly definitionProvider: boolean;
  readonly implementationProvider: boolean;
  readonly referencesProvider: boolean;
  readonly documentSymbolProvider: boolean;
  readonly workspaceSymbolProvider: boolean;
  readonly callHierarchyProvider: boolean;
  readonly diagnosticProvider: boolean;
  readonly codeActionProvider: boolean;
  readonly renameProvider: boolean;
  readonly documentFormattingProvider: boolean;
}

export function isServerRunning(status: LspServerStatus): status is LspServerStatusRunning {
  return status.status === "running";
}

export function isServerRecoverable(status: LspServerStatus): status is LspServerStatusError {
  return status.status === "error" && status.restartCount < status.maxRestarts;
}

export function isServerBroken(status: LspServerStatus): status is LspServerStatusBroken {
  return status.status === "broken";
}

// =============================================================================
// Server + Connection
// =============================================================================

export interface LspServer {
  readonly id: string;
  readonly name: string;
  readonly extensions: readonly string[];
  readonly status: LspServerStatus;
  readonly connection: LspConnection | null;
  readonly root: string;
  readonly configSource: "builtin" | "global" | "project";
  readonly disabled: boolean;
  readonly createdAt: Date;
  readonly stats: LspServerStats;
}

export interface LspServerStats {
  readonly totalRequests: number;
  readonly successfulRequests: number;
  readonly failedRequests: number;
  readonly averageResponseTime: number;
  readonly restartCount: number;
  readonly lastActivityAt: Date | null;
}

export interface LspConnection {
  readonly serverId: string;
  readonly root: string;
  readonly rpcConnection: MessageConnection;
  readonly capabilities: LspServerCapabilities;
  readonly initialized: boolean;
  readonly openFiles: ReadonlyMap<string, number>;
  readonly diagnosticsCache: ReadonlyMap<string, readonly Diagnostic[]>;

  touchFile(filePath: string): Promise<void>;
  closeFile(filePath: string): Promise<void>;

  waitForDiagnostics(filePath: string, timeoutMs?: number): Promise<Diagnostic[]>;
  hover(filePath: string, line: number, character: number): Promise<Hover | null>;
  definition(filePath: string, line: number, character: number): Promise<Location[]>;
  implementation(filePath: string, line: number, character: number): Promise<Location[]>;
  references(
    filePath: string,
    line: number,
    character: number,
    includeDeclaration?: boolean
  ): Promise<Location[]>;
  documentSymbol(filePath: string): Promise<DocumentSymbol[]>;
  workspaceSymbol(query: string): Promise<SymbolInformation[]>;
  incomingCalls(
    filePath: string,
    line: number,
    character: number
  ): Promise<CallHierarchyIncomingCall[]>;
  outgoingCalls(
    filePath: string,
    line: number,
    character: number
  ): Promise<CallHierarchyOutgoingCall[]>;
  codeActions(
    filePath: string,
    startLine: number,
    startChar: number,
    endLine: number,
    endChar: number
  ): Promise<CodeAction[]>;
  formatDocument(filePath: string): Promise<TextEdit[]>;
  completion?(filePath: string, line: number, character: number): Promise<CompletionItem[]>;

  shutdown(): Promise<void>;
  isAlive(): boolean;
}

// =============================================================================
// Hub Options + Events
// =============================================================================

export interface LoggerLike {
  debug?: (message: string, meta?: Record<string, unknown>) => void;
  info?: (message: string, meta?: Record<string, unknown>) => void;
  warn?: (message: string, meta?: Record<string, unknown>) => void;
  error?: (message: string, meta?: Record<string, unknown>) => void;
}

export interface ToolRegistryLike {
  register: (tool: unknown) => void;
  unregister?: (name: string) => void;
}

/**
 * Configuration for multi-client mode file rules.
 * Determines which servers handle specific file patterns.
 */
export interface MultiClientFileRule {
  /** Glob pattern to match file paths */
  readonly pattern: string;
  /** Server IDs in priority order */
  readonly servers: readonly string[];
}

/**
 * Configuration for multi-client mode.
 */
export interface MultiClientOptions {
  /** Maximum number of LSP connections per file (default: 3) */
  readonly maxConnectionsPerFile?: number;
  /** File-specific server rules */
  readonly fileRules?: readonly MultiClientFileRule[];
}

/**
 * Result of aggregated diagnostics from multiple LSP servers.
 */
export interface MergedDiagnostics {
  readonly diagnostics: Diagnostic[];
  readonly sources: readonly string[];
}

/**
 * Represents a pending server installation that requires user confirmation.
 * Used when autoInstall is set to "prompt" mode.
 */
export interface PendingInstall {
  /** Unique identifier of the server */
  readonly serverId: string;
  /** Display name of the server */
  readonly serverName: string;
  /** The command that needs to be installed */
  readonly command: string;
  /** Installation method (npm, pip, cargo, system) */
  readonly installMethod?: "npm" | "pip" | "cargo" | "system";
  /** Package name to install */
  readonly installPackage?: string;
  /** Timestamp when the install was requested */
  readonly requestedAt: Date;
}

/**
 * Callback function for prompting user about server installation.
 * Return true to proceed with installation, false to skip.
 */
export type InstallPromptCallback = (
  serverId: string,
  serverName: string,
  installInfo: { method?: string; package?: string }
) => Promise<boolean>;

export interface LspHubOptions {
  getGlobalConfigPath: () => Promise<string>;
  getProjectConfigPath?: () => Promise<string | undefined>;
  toolRegistry?: ToolRegistryLike;
  onEvent?: <K extends keyof LspHubEvents>(event: K, data: LspHubEvents[K]) => void;
  logger?: LoggerLike;
  autoInstall?: AutoInstallMode;
  idleTimeoutMs?: number;
  cacheMaxEntries?: number;
  requestTimeoutMs?: number;
  maxRestartAttempts?: number;
  enableDiagnosticsDebounce?: boolean;
  diagnosticsDebounceMs?: number;
  /** Enable multi-client mode (default: true) */
  enableMultiClient?: boolean;
  /** Multi-client configuration */
  multiClientConfig?: MultiClientOptions;
  /**
   * Callback invoked when a server needs installation and autoInstall is "prompt".
   * Return true to proceed with installation, false to skip.
   * If not provided, pending installs will be tracked and can be queried via getPendingInstalls().
   */
  onInstallPrompt?: InstallPromptCallback;
  /** Workspace root directory for auto-mode detection */
  workspaceRoot?: string;
}

export interface LspHubEvents {
  "server:starting": {
    readonly serverId: string;
    readonly root: string;
    readonly command: readonly string[];
  };
  "server:running": {
    readonly serverId: string;
    readonly root: string;
    readonly capabilities: LspServerCapabilities;
    readonly pid: number;
    readonly startupTimeMs: number;
  };
  "server:stopped": {
    readonly serverId: string;
    readonly root: string;
    readonly reason?: "user" | "idle" | "shutdown";
  };
  "server:error": {
    readonly serverId: string;
    readonly root: string;
    readonly error: Error;
  };
  "diagnostics:updated": {
    readonly serverId: string;
    readonly uri: string;
    readonly diagnostics: readonly Diagnostic[];
  };
  "config:reloaded": {
    readonly serverIds: readonly string[];
  };
  // FIX: Added config:error event for config-related errors
  "config:error": {
    readonly error: Error;
  };
  /**
   * Emitted when a server installation is pending user confirmation.
   * Only emitted when autoInstall is "prompt" and no onInstallPrompt callback is provided.
   */
  "install:prompt": {
    readonly serverId: string;
    readonly serverName: string;
    readonly command: string;
    readonly installMethod?: "npm" | "pip" | "cargo" | "system";
    readonly installPackage?: string;
  };
  /**
   * Emitted when a server installation is completed.
   */
  "install:complete": {
    readonly serverId: string;
    readonly success: boolean;
    readonly error?: Error;
  };
  /**
   * Emitted when a server installation is skipped by user.
   */
  "install:skipped": {
    readonly serverId: string;
    readonly reason: "user-declined" | "no-callback";
  };
  /**
   * Emitted when a server is enabled (removed from disabled list).
   */
  "server:enabled": {
    readonly serverId: string;
  };
  /**
   * Emitted when a server is disabled (added to disabled list).
   */
  "server:disabled": {
    readonly serverId: string;
  };
  /**
   * Emitted when auto-mode server state changes.
   * Forwarded from AutoModeController.
   */
  lspStateChange: {
    readonly serverId: string;
    readonly previousState: string;
    readonly currentState: string;
    readonly timestamp: number;
    readonly error?: Error;
    readonly progress?: {
      current: number;
      total: number;
      message: string;
    };
  };
}
