import { access } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { type FSWatcher, watch } from "chokidar";
import type { Diagnostic } from "vscode-languageserver-protocol";

import { BrokenServerTracker } from "./broken-tracker.js";
import { LspCache } from "./cache.js";
import type { LspConfig, LspServerConfig } from "./config.js";
import { getServerConfig, loadLspConfig } from "./config.js";
import { ServerNotFoundError } from "./errors.js";
import { ServerInstaller } from "./installer.js";
import { LanguageClient } from "./LanguageClient.js";
import { MultiClientManager } from "./multi-client.js";
import { findRootForFile } from "./root-detection.js";
import { registerLspTools } from "./tools/register.js";
import type {
  LspHubEvents,
  LspHubOptions,
  LspServer,
  LspServerStatus,
  MergedDiagnostics,
  PendingInstall,
} from "./types.js";

interface ServerEntry {
  id: string;
  config: LspServerConfig;
  status: LspServerStatus;
  connection: LanguageClient | null;
  root: string;
  createdAt: Date;
  stats: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    restartCount: number;
    lastActivityAt: Date | null;
  };
}

export class LspHub {
  private static instance: LspHub | null = null;

  static getInstance(options?: LspHubOptions): LspHub {
    if (!LspHub.instance) {
      if (!options) {
        throw new Error("LspHub not initialized. Provide options on first call.");
      }
      LspHub.instance = new LspHub(options);
    }
    return LspHub.instance;
  }

  private options: LspHubOptions;
  private config: LspConfig | null = null;
  private servers = new Map<string, ServerEntry>();
  private watcher?: FSWatcher;
  private installer: ServerInstaller;
  private brokenTracker: BrokenServerTracker;
  private cache: LspCache<unknown>;
  private initialized = false;
  // FIX: Track initialization in progress to prevent race conditions
  private initializePromise: Promise<void> | null = null;
  // FIX: Track servers being started to prevent concurrent startup race conditions
  private startingServers = new Set<string>();
  // Multi-client manager for handling multiple LSP servers per file
  private multiClientManager: MultiClientManager | null = null;
  // Diagnostic debounce timers per URI
  private diagnosticTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // Pending diagnostics waiting to be emitted after debounce
  private pendingDiagnostics = new Map<string, { serverId: string; diagnostics: Diagnostic[] }>();
  // Track servers pending installation when autoInstall is "prompt"
  private pendingInstalls = new Map<string, PendingInstall>();

  constructor(options: LspHubOptions) {
    this.options = options;
    this.installer = new ServerInstaller({ autoInstall: options.autoInstall });
    this.brokenTracker = new BrokenServerTracker({
      maxRetries: options.maxRestartAttempts ?? 3,
    });
    this.cache = new LspCache({ maxSize: options.cacheMaxEntries ?? 500 });

    // Initialize MultiClientManager by default (enableMultiClient defaults to true)
    if (options.enableMultiClient !== false) {
      this.multiClientManager = new MultiClientManager({
        maxClientsPerFile: options.multiClientConfig?.maxConnectionsPerFile ?? 3,
        priorityRules:
          options.multiClientConfig?.fileRules?.map((rule) => ({
            pattern: rule.pattern,
            servers: [...rule.servers],
          })) ?? [],
      });
    }
  }

  async initialize(): Promise<void> {
    // FIX: Prevent race condition by tracking initialization promise
    if (this.initialized) return;

    // If already initializing, wait for that to complete
    if (this.initializePromise) {
      return this.initializePromise;
    }

    // Create initialization promise to prevent concurrent initialization
    this.initializePromise = (async () => {
      try {
        await this.reloadConfig();
        await this.setupWatchers();
        if (this.options.toolRegistry) {
          registerLspTools(this.options.toolRegistry, this);
        }
        this.initialized = true;
      } finally {
        this.initializePromise = null;
      }
    })();

    return this.initializePromise;
  }

  async reloadConfig(): Promise<void> {
    const projectPath = await this.options.getProjectConfigPath?.();
    const workspaceRoot = projectPath ? dirname(dirname(projectPath)) : process.cwd();
    this.config = await loadLspConfig(workspaceRoot);
    this.emitEvent("config:reloaded", {
      serverIds: Object.keys(this.config.servers),
    });
  }

  getConfig(): LspConfig | null {
    return this.config;
  }

  getServers(): LspServer[] {
    if (!this.config) {
      return [];
    }

    const servers: LspServer[] = [];
    for (const [id, cfg] of Object.entries(this.config.servers) as [string, LspServerConfig][]) {
      const entry = this.servers.get(id);
      const status: LspServerStatus =
        entry?.status ??
        ({
          status: "stopped",
          stoppedAt: new Date(),
        } satisfies LspServerStatus);

      servers.push({
        id,
        name: cfg.name ?? id,
        extensions: cfg.fileExtensions ?? [],
        status,
        connection: entry?.connection ?? null,
        root: entry?.root ?? process.cwd(),
        configSource: "builtin",
        disabled: !cfg.enabled || this.config.disabled.includes(id),
        createdAt: entry?.createdAt ?? new Date(),
        stats: entry?.stats ?? {
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          averageResponseTime: 0,
          restartCount: 0,
          lastActivityAt: null,
        },
      });
    }

    return servers;
  }

  getServer(serverId: string): LspServer | undefined {
    return this.getServers().find((server) => server.id === serverId);
  }

  async startServer(serverId: string, workspaceRoot?: string): Promise<LspServer> {
    await this.initialize();
    if (!this.config) {
      throw new Error("LSP config not loaded");
    }

    const config = getServerConfig(this.config, serverId);
    if (!config || !config.enabled) {
      throw new Error(`No enabled configuration for language: ${serverId}`);
    }

    if (!this.brokenTracker.isAvailable(serverId)) {
      throw new Error(`LSP server '${serverId}' temporarily disabled after failures`);
    }

    const root = workspaceRoot ?? process.cwd();
    const existing = this.servers.get(serverId);
    if (existing?.connection?.isAlive()) {
      return this.getServer(serverId) as LspServer;
    }

    // FIX: Prevent concurrent startup of the same server (race condition)
    if (this.startingServers.has(serverId)) {
      // Wait a bit and check if it's now available
      await new Promise((resolve) => setTimeout(resolve, 100));
      const nowExisting = this.servers.get(serverId);
      if (nowExisting?.connection?.isAlive()) {
        return this.getServer(serverId) as LspServer;
      }
      // If still starting, wait longer
      let attempts = 0;
      while (this.startingServers.has(serverId) && attempts < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        attempts++;
      }
      const finalExisting = this.servers.get(serverId);
      if (finalExisting?.connection?.isAlive()) {
        return this.getServer(serverId) as LspServer;
      }
    }

    // Mark this server as starting
    this.startingServers.add(serverId);

    try {
      await this.ensureCommandAvailable(config.command, serverId);

      const entry: ServerEntry = {
        id: serverId,
        config,
        status: { status: "starting", startedAt: new Date(), progress: 0 },
        connection: null,
        root,
        createdAt: new Date(),
        stats: {
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          averageResponseTime: 0,
          restartCount: existing?.stats.restartCount ?? 0,
          lastActivityAt: null,
        },
      };
      this.servers.set(serverId, entry);

      this.emitEvent("server:starting", {
        serverId,
        root,
        command: [config.command, ...(config.args ?? [])],
      });

      const startTime = Date.now();
      try {
        const client = new LanguageClient({
          serverId,
          name: config.name ?? serverId,
          command: config.command,
          args: config.args ?? [],
          cwd: config.cwd ?? root,
          env: config.env as Record<string, string> | undefined,
          rootPath: root,
          rootUri: pathToFileURL(root).toString(),
          initializationOptions: config.initializationOptions,
          settings: config.settings,
          languageId: config.languageId,
          requestTimeoutMs: this.config.requestTimeoutMs,
        });

        await client.start();

        entry.connection = client;
        entry.status = {
          status: "running",
          startedAt: new Date(),
          pid: client.isAlive() ? (client.pid ?? 0) : 0,
          capabilities: client.capabilities,
          requestCount: 0,
        };
        entry.stats.lastActivityAt = new Date();
        this.brokenTracker.recordSuccess(serverId);

        this.emitEvent("server:running", {
          serverId,
          root,
          capabilities: client.capabilities,
          pid: entry.status.pid,
          startupTimeMs: Date.now() - startTime,
        });
      } catch (error) {
        this.brokenTracker.recordFailure(serverId, error as Error);
        entry.status = {
          status: "error",
          error: error as Error,
          errorAt: new Date(),
          restartCount: entry.stats.restartCount,
          maxRestarts: this.options.maxRestartAttempts ?? 3,
          retrying: false,
        };
        this.emitEvent("server:error", {
          serverId,
          root,
          error: error as Error,
        });
        throw error;
      }

      return this.getServer(serverId) as LspServer;
    } finally {
      // FIX: Always remove from startingServers set to prevent deadlocks
      this.startingServers.delete(serverId);
    }
  }

  async stopServer(serverId: string): Promise<void> {
    const entry = this.servers.get(serverId);
    if (!entry) return;

    if (entry.connection) {
      await entry.connection.shutdown();
      entry.connection = null;
    }

    entry.status = {
      status: "stopped",
      stoppedAt: new Date(),
      reason: "user",
    };

    this.emitEvent("server:stopped", {
      serverId,
      root: entry.root,
      reason: "user",
    });
  }

  /**
   * Get a single connection for a file (backward-compatible).
   * Returns the first available connection from multi-client mode.
   */
  async getConnectionForFile(filePath: string): Promise<LanguageClient> {
    const connections = await this.getConnectionsForFile(filePath);
    const first = connections[0];
    if (!first) {
      throw new Error(`No language server available for file: ${filePath}`);
    }
    return first;
  }

  /**
   * Get all connections that can handle a file (multi-client mode).
   * Returns an array of connections in priority order.
   */
  async getConnectionsForFile(filePath: string): Promise<LanguageClient[]> {
    await this.initialize();
    if (!this.config) {
      throw new Error("LSP config not loaded");
    }

    const serverIds = this.resolveServersForFile(filePath);
    const connections: LanguageClient[] = [];

    for (const serverId of serverIds) {
      try {
        const conn = await this.getConnection(serverId, filePath);
        if (conn) connections.push(conn);
      } catch (error) {
        // Single server failure should not affect others in multi-client mode
        this.options.logger?.warn?.(`Failed to get connection for ${serverId}:`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return connections;
  }

  /**
   * Get or start a connection for a specific server and file.
   */
  private async getConnection(
    serverId: string,
    filePath: string
  ): Promise<LanguageClient | undefined> {
    if (!this.config) return undefined;

    const config = getServerConfig(this.config, serverId);
    if (!config || !config.enabled || this.config.disabled.includes(serverId)) {
      return undefined;
    }

    const root = config.rootPatterns?.length
      ? await findRootForFile(filePath, config.rootPatterns)
      : dirname(resolve(filePath));

    const existing = this.servers.get(serverId);
    if (existing?.connection?.isAlive()) {
      return existing.connection;
    }

    await this.startServer(serverId, root);
    const entry = this.servers.get(serverId);
    return entry?.connection ?? undefined;
  }

  /**
   * Resolve which servers should handle a file.
   * In multi-client mode, returns multiple server IDs.
   * In single-client mode, returns a single server ID.
   */
  private resolveServersForFile(filePath: string): string[] {
    if (!this.config) return [];

    // Multi-client mode: check priority rules first
    if (this.multiClientManager) {
      const priorityServers = this.multiClientManager.getPriorityServers(filePath);
      if (priorityServers.length > 0) {
        // Filter to only enabled servers
        const enabled = priorityServers.filter((id) => {
          const cfg = this.config?.servers[id] as LspServerConfig | undefined;
          return cfg?.enabled && !this.config?.disabled.includes(id);
        });
        if (enabled.length > 0) {
          return enabled.slice(0, this.multiClientManager.getMaxClientsPerFile());
        }
      }

      // Fall back to extension-based matching, returning all matching servers
      const matchingServers = this.findServersForExtension(filePath);
      return matchingServers.slice(0, this.multiClientManager.getMaxClientsPerFile());
    }

    // Single-client mode: use original resolution
    try {
      const { serverId } = this.resolveServerForFile(filePath);
      return [serverId];
    } catch {
      return [];
    }
  }

  /**
   * Find all servers that can handle a file based on extension/pattern.
   */
  private findServersForExtension(filePath: string): string[] {
    if (!this.config) return [];

    const ext = extname(filePath).toLowerCase();
    const basename = filePath.split(/[/\\]/).pop() ?? filePath;
    const matching: string[] = [];

    for (const [id, cfg] of Object.entries(this.config.servers) as [string, LspServerConfig][]) {
      if (!cfg.enabled || this.config.disabled.includes(id)) continue;

      const matchesExt = cfg.fileExtensions?.includes(ext);
      const matchesPattern = cfg.filePatterns?.some((pattern: string) =>
        matchSimplePattern(basename, pattern)
      );

      if (matchesExt || matchesPattern) {
        matching.push(id);
      }
    }

    return matching;
  }

  /**
   * Get diagnostics from all applicable LSP servers.
   * In multi-client mode, aggregates and deduplicates results.
   */
  async diagnostics(filePath: string): Promise<MergedDiagnostics> {
    const cacheKey = `diagnostics:${filePath}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached as MergedDiagnostics;

    const connections = await this.getConnectionsForFile(filePath);
    if (connections.length === 0) {
      return { diagnostics: [], sources: [] };
    }

    const allDiagnosticLists: Diagnostic[][] = [];
    const sources: string[] = [];
    const uri = pathToFileURL(filePath).toString();

    await Promise.all(
      connections.map(async (conn) => {
        try {
          await conn.touchFile(filePath);
          const diags = await conn.waitForDiagnostics(filePath);
          allDiagnosticLists.push(diags);
          sources.push(conn.serverId);

          // Emit with debounce if enabled
          this.emitDiagnosticsDebounced(conn.serverId, uri, diags);
        } catch (error) {
          // Single server failure should not affect others
          this.options.logger?.warn?.(`Diagnostics failed for ${conn.serverId}:`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })
    );

    const mergedDiagnostics: Diagnostic[] = this.multiClientManager
      ? (this.multiClientManager.mergeDiagnostics(allDiagnosticLists) as Diagnostic[])
      : allDiagnosticLists.flat();

    const result: MergedDiagnostics = {
      diagnostics: mergedDiagnostics,
      sources,
    };

    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Emit diagnostics event with debouncing.
   * When multiple updates come in rapid succession for the same URI,
   * only the last one will be emitted after the debounce period (150ms).
   */
  private emitDiagnosticsDebounced(serverId: string, uri: string, diagnostics: Diagnostic[]): void {
    const debounceMs = this.options.diagnosticsDebounceMs ?? 150;
    const shouldDebounce = this.options.enableDiagnosticsDebounce !== false;

    if (!shouldDebounce) {
      // Emit immediately without debouncing
      this.emitEvent("diagnostics:updated", { serverId, uri, diagnostics });
      return;
    }

    // Clear existing timer for this URI
    const existingTimer = this.diagnosticTimers.get(uri);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Store the pending diagnostics
    this.pendingDiagnostics.set(uri, { serverId, diagnostics });

    // Set new debounced timer
    const timer = setTimeout(() => {
      this.diagnosticTimers.delete(uri);
      const pending = this.pendingDiagnostics.get(uri);
      if (pending) {
        this.pendingDiagnostics.delete(uri);
        this.emitEvent("diagnostics:updated", {
          serverId: pending.serverId,
          uri,
          diagnostics: pending.diagnostics,
        });
      }
    }, debounceMs);

    this.diagnosticTimers.set(uri, timer);
  }

  /**
   * Clear all diagnostic debounce timers.
   * Called during disposal to prevent memory leaks.
   */
  private clearDiagnosticTimers(): void {
    for (const timer of this.diagnosticTimers.values()) {
      clearTimeout(timer);
    }
    this.diagnosticTimers.clear();
    this.pendingDiagnostics.clear();
  }

  /**
   * Get hover information using "first valid response" strategy.
   */
  async hover(filePath: string, line: number, character: number): Promise<unknown | null> {
    const cacheKey = `hover:${filePath}:${line}:${character}`;
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) return cached as unknown | null;

    const connections = await this.getConnectionsForFile(filePath);
    for (const conn of connections) {
      try {
        await conn.touchFile(filePath);
        const result = await conn.hover(filePath, line, character);
        if (result) {
          this.cache.set(cacheKey, result);
          return result;
        }
      } catch (error) {
        this.options.logger?.warn?.(`Hover failed for ${conn.serverId}:`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.cache.set(cacheKey, null);
    return null;
  }

  /**
   * Get definitions from all servers and merge results.
   */
  async definition(filePath: string, line: number, character: number): Promise<unknown[]> {
    const cacheKey = `definition:${filePath}:${line}:${character}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached as unknown[];

    const connections = await this.getConnectionsForFile(filePath);
    const allResults: unknown[] = [];

    await Promise.all(
      connections.map(async (conn) => {
        try {
          await conn.touchFile(filePath);
          const result = await conn.definition(filePath, line, character);
          allResults.push(...result);
        } catch (error) {
          this.options.logger?.warn?.(`Definition failed for ${conn.serverId}:`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })
    );

    this.cache.set(cacheKey, allResults);
    return allResults;
  }

  /**
   * Get implementations from all servers and merge results.
   * Finds concrete implementations of interfaces, abstract methods, or types.
   */
  async implementation(filePath: string, line: number, character: number): Promise<unknown[]> {
    const cacheKey = `implementation:${filePath}:${line}:${character}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached as unknown[];

    const connections = await this.getConnectionsForFile(filePath);
    const allResults: unknown[] = [];

    await Promise.all(
      connections.map(async (conn) => {
        try {
          await conn.touchFile(filePath);
          const result = await conn.implementation(filePath, line, character);
          allResults.push(...result);
        } catch (error) {
          this.options.logger?.warn?.(`Implementation failed for ${conn.serverId}:`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })
    );

    this.cache.set(cacheKey, allResults);
    return allResults;
  }

  /**
   * Get references from all servers and merge results.
   */
  async references(
    filePath: string,
    line: number,
    character: number,
    includeDeclaration = false
  ): Promise<unknown[]> {
    const cacheKey = `references:${filePath}:${line}:${character}:${includeDeclaration}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached as unknown[];

    const connections = await this.getConnectionsForFile(filePath);
    const allResults: unknown[] = [];

    await Promise.all(
      connections.map(async (conn) => {
        try {
          await conn.touchFile(filePath);
          const result = await conn.references(filePath, line, character, includeDeclaration);
          allResults.push(...result);
        } catch (error) {
          this.options.logger?.warn?.(`References failed for ${conn.serverId}:`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })
    );

    this.cache.set(cacheKey, allResults);
    return allResults;
  }

  /**
   * Get document symbols from all servers and merge results.
   */
  async documentSymbols(filePath: string): Promise<unknown[]> {
    const cacheKey = `symbols:${filePath}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached as unknown[];

    const connections = await this.getConnectionsForFile(filePath);
    const allResults: unknown[] = [];

    await Promise.all(
      connections.map(async (conn) => {
        try {
          await conn.touchFile(filePath);
          const result = await conn.documentSymbol(filePath);
          allResults.push(...result);
        } catch (error) {
          this.options.logger?.warn?.(`DocumentSymbol failed for ${conn.serverId}:`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })
    );

    this.cache.set(cacheKey, allResults);
    return allResults;
  }

  async workspaceSymbols(query: string): Promise<unknown[]> {
    const cacheKey = `workspace-symbols:${query}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached as unknown[];
    await this.initialize();
    if (!this.config) {
      throw new Error("LSP config not loaded");
    }

    // In multi-client mode, query all available servers
    if (this.multiClientManager) {
      const allResults: unknown[] = [];
      const serverIds = Object.keys(this.config.servers);

      await Promise.all(
        serverIds.map(async (serverId) => {
          try {
            const cfg = this.config?.servers[serverId] as LspServerConfig | undefined;
            if (!cfg?.enabled || this.config?.disabled.includes(serverId)) return;

            const server = await this.startServer(serverId, process.cwd());
            if (server.connection) {
              const result = await server.connection.workspaceSymbol(query);
              allResults.push(...result);
            }
          } catch (error) {
            this.options.logger?.warn?.(`WorkspaceSymbol failed for ${serverId}:`, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        })
      );

      this.cache.set(cacheKey, allResults);
      return allResults;
    }

    // Single-client mode: use first server
    const firstServer = Object.keys(this.config.servers)[0];
    if (!firstServer) return [];
    const server = await this.startServer(firstServer, process.cwd());
    if (!server.connection) return [];
    const result = await server.connection.workspaceSymbol(query);
    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Get incoming calls from all servers and merge results.
   */
  async incomingCalls(filePath: string, line: number, character: number): Promise<unknown[]> {
    const cacheKey = `incoming:${filePath}:${line}:${character}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached as unknown[];

    const connections = await this.getConnectionsForFile(filePath);
    const allResults: unknown[] = [];

    await Promise.all(
      connections.map(async (conn) => {
        try {
          await conn.touchFile(filePath);
          const result = await conn.incomingCalls(filePath, line, character);
          allResults.push(...result);
        } catch (error) {
          this.options.logger?.warn?.(`IncomingCalls failed for ${conn.serverId}:`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })
    );

    this.cache.set(cacheKey, allResults);
    return allResults;
  }

  /**
   * Get outgoing calls from all servers and merge results.
   */
  async outgoingCalls(filePath: string, line: number, character: number): Promise<unknown[]> {
    const cacheKey = `outgoing:${filePath}:${line}:${character}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached as unknown[];

    const connections = await this.getConnectionsForFile(filePath);
    const allResults: unknown[] = [];

    await Promise.all(
      connections.map(async (conn) => {
        try {
          await conn.touchFile(filePath);
          const result = await conn.outgoingCalls(filePath, line, character);
          allResults.push(...result);
        } catch (error) {
          this.options.logger?.warn?.(`OutgoingCalls failed for ${conn.serverId}:`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })
    );

    this.cache.set(cacheKey, allResults);
    return allResults;
  }

  /**
   * Get code actions from all servers and merge results.
   */
  async codeActions(
    filePath: string,
    startLine: number,
    startChar: number,
    endLine: number,
    endChar: number
  ): Promise<unknown[]> {
    const cacheKey = `code-actions:${filePath}:${startLine}:${startChar}:${endLine}:${endChar}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached as unknown[];

    const connections = await this.getConnectionsForFile(filePath);
    const allResults: unknown[] = [];

    await Promise.all(
      connections.map(async (conn) => {
        try {
          await conn.touchFile(filePath);
          const result = await conn.codeActions(filePath, startLine, startChar, endLine, endChar);
          allResults.push(...result);
        } catch (error) {
          this.options.logger?.warn?.(`CodeActions failed for ${conn.serverId}:`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })
    );

    this.cache.set(cacheKey, allResults);
    return allResults;
  }

  /**
   * Format document - uses first valid response strategy.
   * Formatting from multiple servers could conflict, so we take the first result.
   */
  async formatDocument(filePath: string): Promise<unknown[]> {
    const cacheKey = `format:${filePath}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached as unknown[];

    const connections = await this.getConnectionsForFile(filePath);
    for (const conn of connections) {
      try {
        await conn.touchFile(filePath);
        const result = await conn.formatDocument(filePath);
        if (result.length > 0) {
          this.cache.set(cacheKey, result);
          return result;
        }
      } catch (error) {
        this.options.logger?.warn?.(`FormatDocument failed for ${conn.serverId}:`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.cache.set(cacheKey, []);
    return [];
  }

  /**
   * Get completions from all servers and merge results.
   */
  async completion(filePath: string, line: number, character: number): Promise<unknown[]> {
    const cacheKey = `completion:${filePath}:${line}:${character}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached as unknown[];

    const connections = await this.getConnectionsForFile(filePath);
    const allResults: unknown[] = [];

    await Promise.all(
      connections.map(async (conn) => {
        try {
          await conn.touchFile(filePath);
          if (!conn.completion) return;
          const result = await conn.completion(filePath, line, character);
          allResults.push(...result);
        } catch (error) {
          this.options.logger?.warn?.(`Completion failed for ${conn.serverId}:`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })
    );

    this.cache.set(cacheKey, allResults);
    return allResults;
  }

  /**
   * Rename a symbol across the workspace.
   * Uses first valid response strategy since rename from multiple servers could conflict.
   */
  async rename(
    filePath: string,
    line: number,
    character: number,
    newName: string
  ): Promise<unknown | null> {
    // Rename is a mutating operation, don't cache
    const connections = await this.getConnectionsForFile(filePath);

    for (const conn of connections) {
      try {
        await conn.touchFile(filePath);
        const result = await conn.rename(filePath, line, character, newName);
        if (result) {
          return result;
        }
      } catch (error) {
        this.options.logger?.warn?.(`Rename failed for ${conn.serverId}:`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return null;
  }

  async dispose(): Promise<void> {
    // FIX: Properly clean up all resources to prevent memory leaks
    for (const entry of this.servers.values()) {
      if (entry.connection) {
        try {
          await entry.connection.shutdown();
        } catch {
          // Ignore shutdown errors during dispose
        }
      }
    }
    this.servers.clear();
    this.startingServers.clear();
    this.pendingInstalls.clear();

    // Clear diagnostic debounce timers
    this.clearDiagnosticTimers();

    // FIX: Remove all event listeners before closing watcher to prevent memory leaks
    if (this.watcher) {
      this.watcher.removeAllListeners();
      await this.watcher.close();
      this.watcher = undefined;
    }

    this.cache.clear();
    this.initialized = false;
    this.initializePromise = null;
  }

  private resolveServerForFile(filePath: string): { serverId: string; config: LspServerConfig } {
    if (!this.config) {
      throw new Error("LSP config not loaded");
    }

    const ext = `.${filePath.split(".").pop()?.toLowerCase() ?? ""}`;
    const basename = filePath.split(/[/\\\\]/).pop() ?? filePath;
    for (const [id, cfg] of Object.entries(this.config.servers) as [string, LspServerConfig][]) {
      if (!cfg.enabled || this.config.disabled.includes(id)) continue;
      if (cfg.fileExtensions?.includes(ext)) {
        return { serverId: id, config: cfg };
      }
      if (cfg.filePatterns?.some((pattern: string) => matchSimplePattern(basename, pattern))) {
        return { serverId: id, config: cfg };
      }
    }

    throw new Error(`No language server configured for file: ${filePath}`);
  }

  private async ensureCommandAvailable(command: string, serverId: string): Promise<void> {
    const searched = await this.findCommandPaths(command);
    if (searched.length === 0) {
      const config = this.config?.servers[serverId] as LspServerConfig | undefined;
      const serverName = config?.name ?? serverId;
      const installInfo = config?.install;

      // "auto" mode: install without prompting
      if (this.options.autoInstall === "auto") {
        if (config) {
          await this.performInstall(serverId, config);
          return;
        }
      }

      // "prompt" mode: ask user before installing
      if (this.options.autoInstall === "prompt") {
        const shouldInstall = await this.handleInstallPrompt(
          serverId,
          serverName,
          command,
          installInfo
        );

        if (shouldInstall && config) {
          await this.performInstall(serverId, config);
          return;
        }

        // User declined or no callback - throw error to prevent server start
        throw new ServerNotFoundError(serverId, searched);
      }

      // "never" mode: never auto-install
      throw new ServerNotFoundError(serverId, searched);
    }
  }

  /**
   * Handle installation prompt logic for "prompt" mode.
   * Returns true if installation should proceed, false otherwise.
   */
  private async handleInstallPrompt(
    serverId: string,
    serverName: string,
    command: string,
    installInfo?: { method?: "npm" | "pip" | "cargo" | "system"; package?: string; args?: string[] }
  ): Promise<boolean> {
    // If callback is provided, use it
    if (this.options.onInstallPrompt) {
      const result = await this.options.onInstallPrompt(serverId, serverName, {
        method: installInfo?.method,
        package: installInfo?.package,
      });

      if (!result) {
        this.emitEvent("install:skipped", { serverId, reason: "user-declined" });
      }
      return result;
    }

    // No callback: track as pending and emit event
    const pending: PendingInstall = {
      serverId,
      serverName,
      command,
      installMethod: installInfo?.method,
      installPackage: installInfo?.package,
      requestedAt: new Date(),
    };
    this.pendingInstalls.set(serverId, pending);

    this.emitEvent("install:prompt", {
      serverId,
      serverName,
      command,
      installMethod: installInfo?.method,
      installPackage: installInfo?.package,
    });

    this.emitEvent("install:skipped", { serverId, reason: "no-callback" });
    return false;
  }

  /**
   * Perform the actual installation and emit completion event.
   */
  private async performInstall(serverId: string, config: LspServerConfig): Promise<void> {
    try {
      await this.installer.install(serverId, config);
      // Remove from pending if it was there
      this.pendingInstalls.delete(serverId);
      this.emitEvent("install:complete", { serverId, success: true });
    } catch (error) {
      this.emitEvent("install:complete", {
        serverId,
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
  }

  /**
   * Get list of servers pending installation approval.
   * Used when autoInstall is "prompt" and no onInstallPrompt callback is provided.
   */
  getPendingInstalls(): readonly PendingInstall[] {
    return Array.from(this.pendingInstalls.values());
  }

  /**
   * Clear a pending install (e.g., user dismissed the prompt).
   */
  clearPendingInstall(serverId: string): void {
    this.pendingInstalls.delete(serverId);
  }

  /**
   * Approve and execute a pending installation.
   * Returns true if installation succeeded, false otherwise.
   */
  async approvePendingInstall(serverId: string): Promise<boolean> {
    const pending = this.pendingInstalls.get(serverId);
    if (!pending) {
      return false;
    }

    const config = this.config?.servers[serverId] as LspServerConfig | undefined;
    if (!config) {
      this.pendingInstalls.delete(serverId);
      return false;
    }

    try {
      await this.performInstall(serverId, config);
      return true;
    } catch {
      return false;
    }
  }

  private async findCommandPaths(command: string): Promise<string[]> {
    const delimiter = process.platform === "win32" ? ";" : ":";
    const paths = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
    const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat"] : [""];
    const found: string[] = [];

    for (const dir of paths) {
      for (const ext of extensions) {
        const full = join(dir, `${command}${ext}`);
        try {
          await access(full);
          found.push(full);
        } catch {
          // ignore
        }
      }
    }

    return found;
  }

  private async setupWatchers(): Promise<void> {
    const globalPath = await this.options.getGlobalConfigPath();
    const projectPath = await this.options.getProjectConfigPath?.();

    const paths = [globalPath, projectPath].filter(Boolean) as string[];
    if (paths.length === 0) return;

    this.watcher = watch(paths, { ignoreInitial: true });
    // FIX: Add error handling for config watcher to prevent unhandled promise rejections
    this.watcher.on("change", async () => {
      try {
        await this.reloadConfig();
      } catch (error) {
        // Log error but don't crash - config reload failures should be non-fatal
        this.emitEvent("config:error", {
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    });
    // FIX: Handle watcher errors
    this.watcher.on("error", (error) => {
      this.emitEvent("config:error", {
        error: error instanceof Error ? error : new Error(String(error)),
      });
    });
  }

  // FIX: Added error handling to prevent callback exceptions from crashing the hub
  private emitEvent<K extends keyof LspHubEvents>(event: K, data: LspHubEvents[K]): void {
    if (this.options.onEvent) {
      try {
        this.options.onEvent(event, data);
      } catch {
        // Silently ignore callback errors to prevent crashes
        // The callback owner is responsible for their own error handling
      }
    }
  }
}

function matchSimplePattern(value: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (!pattern.includes("*") && !pattern.includes("?")) {
    return value === pattern;
  }

  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^${escaped.replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i");
  return regex.test(value);
}
