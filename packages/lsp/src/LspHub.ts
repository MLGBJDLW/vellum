import { access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { type FSWatcher, watch } from "chokidar";

import { BrokenServerTracker } from "./broken-tracker.js";
import { LspCache } from "./cache.js";
import type { LspConfig, LspServerConfig } from "./config.js";
import { getServerConfig, loadLspConfig } from "./config.js";
import { ServerNotFoundError } from "./errors.js";
import { ServerInstaller } from "./installer.js";
import { LanguageClient } from "./LanguageClient.js";
import { findRootForFile } from "./root-detection.js";
import { registerLspTools } from "./tools/register.js";
import type { LspHubEvents, LspHubOptions, LspServer, LspServerStatus } from "./types.js";

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

  constructor(options: LspHubOptions) {
    this.options = options;
    this.installer = new ServerInstaller({ autoInstall: options.autoInstall });
    this.brokenTracker = new BrokenServerTracker({
      maxRetries: options.maxRestartAttempts ?? 3,
    });
    this.cache = new LspCache({ maxSize: options.cacheMaxEntries ?? 500 });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.reloadConfig();
    await this.setupWatchers();
    if (this.options.toolRegistry) {
      registerLspTools(this.options.toolRegistry, this);
    }
    this.initialized = true;
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

  async getConnectionForFile(filePath: string): Promise<LanguageClient> {
    await this.initialize();
    if (!this.config) {
      throw new Error("LSP config not loaded");
    }

    const { serverId, config } = this.resolveServerForFile(filePath);
    const root = config.rootPatterns?.length
      ? await findRootForFile(filePath, config.rootPatterns)
      : dirname(resolve(filePath));

    const existing = this.servers.get(serverId);
    if (existing?.connection?.isAlive()) {
      return existing.connection;
    }

    await this.startServer(serverId, root);
    const entry = this.servers.get(serverId);
    if (!entry?.connection) {
      throw new Error(`Failed to start LSP server: ${serverId}`);
    }
    return entry.connection;
  }

  async diagnostics(filePath: string): Promise<readonly unknown[]> {
    const cacheKey = `diagnostics:${filePath}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached as readonly unknown[];
    const connection = await this.getConnectionForFile(filePath);
    await connection.touchFile(filePath);
    const diagnostics = await connection.waitForDiagnostics(filePath);
    this.cache.set(cacheKey, diagnostics);
    this.emitEvent("diagnostics:updated", {
      serverId: connection.serverId,
      uri: pathToFileURL(filePath).toString(),
      diagnostics,
    });
    return diagnostics;
  }

  async hover(filePath: string, line: number, character: number): Promise<unknown | null> {
    const cacheKey = `hover:${filePath}:${line}:${character}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached as unknown | null;
    const connection = await this.getConnectionForFile(filePath);
    await connection.touchFile(filePath);
    const result = await connection.hover(filePath, line, character);
    this.cache.set(cacheKey, result);
    return result;
  }

  async definition(filePath: string, line: number, character: number): Promise<unknown[]> {
    const cacheKey = `definition:${filePath}:${line}:${character}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached as unknown[];
    const connection = await this.getConnectionForFile(filePath);
    await connection.touchFile(filePath);
    const result = await connection.definition(filePath, line, character);
    this.cache.set(cacheKey, result);
    return result;
  }

  async references(
    filePath: string,
    line: number,
    character: number,
    includeDeclaration = false
  ): Promise<unknown[]> {
    const cacheKey = `references:${filePath}:${line}:${character}:${includeDeclaration}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached as unknown[];
    const connection = await this.getConnectionForFile(filePath);
    await connection.touchFile(filePath);
    const result = await connection.references(filePath, line, character, includeDeclaration);
    this.cache.set(cacheKey, result);
    return result;
  }

  async documentSymbols(filePath: string): Promise<unknown[]> {
    const cacheKey = `symbols:${filePath}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached as unknown[];
    const connection = await this.getConnectionForFile(filePath);
    await connection.touchFile(filePath);
    const result = await connection.documentSymbol(filePath);
    this.cache.set(cacheKey, result);
    return result;
  }

  async workspaceSymbols(query: string): Promise<unknown[]> {
    const cacheKey = `workspace-symbols:${query}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached as unknown[];
    await this.initialize();
    if (!this.config) {
      throw new Error("LSP config not loaded");
    }

    const firstServer = Object.keys(this.config.servers)[0];
    if (!firstServer) return [];
    const server = await this.startServer(firstServer, process.cwd());
    if (!server.connection) return [];
    const result = await server.connection.workspaceSymbol(query);
    this.cache.set(cacheKey, result);
    return result;
  }

  async incomingCalls(filePath: string, line: number, character: number): Promise<unknown[]> {
    const cacheKey = `incoming:${filePath}:${line}:${character}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached as unknown[];
    const connection = await this.getConnectionForFile(filePath);
    await connection.touchFile(filePath);
    const result = await connection.incomingCalls(filePath, line, character);
    this.cache.set(cacheKey, result);
    return result;
  }

  async outgoingCalls(filePath: string, line: number, character: number): Promise<unknown[]> {
    const cacheKey = `outgoing:${filePath}:${line}:${character}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached as unknown[];
    const connection = await this.getConnectionForFile(filePath);
    await connection.touchFile(filePath);
    const result = await connection.outgoingCalls(filePath, line, character);
    this.cache.set(cacheKey, result);
    return result;
  }

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
    const connection = await this.getConnectionForFile(filePath);
    await connection.touchFile(filePath);
    const result = await connection.codeActions(filePath, startLine, startChar, endLine, endChar);
    this.cache.set(cacheKey, result);
    return result;
  }

  async formatDocument(filePath: string): Promise<unknown[]> {
    const cacheKey = `format:${filePath}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached as unknown[];
    const connection = await this.getConnectionForFile(filePath);
    await connection.touchFile(filePath);
    const result = await connection.formatDocument(filePath);
    this.cache.set(cacheKey, result);
    return result;
  }

  async completion(filePath: string, line: number, character: number): Promise<unknown[]> {
    const cacheKey = `completion:${filePath}:${line}:${character}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached as unknown[];
    const connection = await this.getConnectionForFile(filePath);
    await connection.touchFile(filePath);
    if (!connection.completion) {
      return [];
    }
    const result = await connection.completion(filePath, line, character);
    this.cache.set(cacheKey, result);
    return result;
  }

  async dispose(): Promise<void> {
    for (const entry of this.servers.values()) {
      if (entry.connection) {
        await entry.connection.shutdown();
      }
    }
    this.servers.clear();
    await this.watcher?.close();
    this.initialized = false;
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
      if (this.options.autoInstall) {
        const config = this.config?.servers[serverId] as LspServerConfig | undefined;
        if (config) {
          await this.installer.install(serverId, config);
          return;
        }
      }
      throw new ServerNotFoundError(serverId, searched);
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
    this.watcher.on("change", async () => {
      await this.reloadConfig();
    });
  }

  private emitEvent<K extends keyof LspHubEvents>(event: K, data: LspHubEvents[K]): void {
    if (this.options.onEvent) {
      this.options.onEvent(event, data);
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
