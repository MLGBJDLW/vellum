import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import { createMessageConnection, type MessageConnection } from "vscode-jsonrpc";
import { StreamMessageReader, StreamMessageWriter } from "vscode-jsonrpc/lib/node/main.js";
import type {
  CallHierarchyIncomingCall,
  CallHierarchyItem,
  CallHierarchyOutgoingCall,
  CodeAction,
  CompletionItem,
  Diagnostic,
  DocumentSymbol,
  Hover,
  InitializeParams,
  InitializeResult,
  Location,
  SymbolInformation,
  TextEdit,
} from "vscode-languageserver-protocol";
import { timeoutError } from "./error-utils.js";
import { ConnectionClosedError, InitFailedError } from "./errors.js";
import type { LspConnection, LspServerCapabilities } from "./types.js";

export interface LanguageClientOptions {
  serverId: string;
  name: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  rootPath: string;
  rootUri: string;
  initializationOptions?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  languageId?: string;
  requestTimeoutMs?: number;
}

interface DiagnosticsWaiter {
  resolve: (diags: Diagnostic[]) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  /** Flag to prevent race between timeout and resolve */
  settled: boolean;
}

export class LanguageClient implements LspConnection {
  readonly serverId: string;
  readonly root: string;
  readonly openFiles = new Map<string, number>();
  readonly diagnosticsCache = new Map<string, readonly Diagnostic[]>();

  private readonly options: LanguageClientOptions;
  private serverProcess: ChildProcessWithoutNullStreams | null = null;
  private connection?: MessageConnection;
  private initializedInternal = false;
  private capabilitiesInternal: LspServerCapabilities = {
    hoverProvider: false,
    definitionProvider: false,
    referencesProvider: false,
    documentSymbolProvider: false,
    workspaceSymbolProvider: false,
    callHierarchyProvider: false,
    diagnosticProvider: false,
    codeActionProvider: false,
    renameProvider: false,
    documentFormattingProvider: false,
  };
  private diagnosticsWaiters = new Map<string, DiagnosticsWaiter[]>();
  private closed = false;

  constructor(options: LanguageClientOptions) {
    this.options = options;
    this.serverId = options.serverId;
    this.root = options.rootPath;
  }

  get rpcConnection(): MessageConnection {
    if (!this.connection) {
      throw new ConnectionClosedError(this.serverId);
    }
    return this.connection;
  }

  get initialized(): boolean {
    return this.initializedInternal;
  }

  get capabilities(): LspServerCapabilities {
    return this.capabilitiesInternal;
  }

  get pid(): number | undefined {
    return this.serverProcess?.pid;
  }

  async start(): Promise<void> {
    if (this.serverProcess) return;

    const { command, args = [], cwd, env } = this.options;
    this.serverProcess = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...env,
      },
      stdio: "pipe",
    });

    const stdout = this.serverProcess.stdout;
    const stdin = this.serverProcess.stdin;

    if (!stdout || !stdin) {
      throw new InitFailedError(this.serverId, new Error("Missing stdio streams"));
    }

    const connection = createMessageConnection(
      new StreamMessageReader(stdout),
      new StreamMessageWriter(stdin)
    );

    this.bindNotifications(connection);
    connection.listen();

    this.serverProcess.on("exit", (code) => {
      this.closed = true;
      this.rejectPendingDiagnostics(new ConnectionClosedError(this.serverId, code ?? undefined));
    });

    try {
      const initResult = await this.initialize(connection);
      this.capabilitiesInternal = this.extractCapabilities(initResult);
      this.initializedInternal = true;
      this.connection = connection;
    } catch (error) {
      await this.shutdown();
      throw error;
    }
  }

  async touchFile(filePath: string): Promise<void> {
    this.ensureReady();
    const uri = pathToFileURL(filePath).toString();
    const version = (this.openFiles.get(uri) ?? 0) + 1;
    const text = await readFile(filePath, "utf-8");

    if (!this.openFiles.has(uri)) {
      this.rpcConnection.sendNotification("textDocument/didOpen", {
        textDocument: {
          uri,
          languageId: this.options.languageId ?? guessLanguageId(filePath),
          version,
          text,
        },
      });
    } else {
      this.rpcConnection.sendNotification("textDocument/didChange", {
        textDocument: { uri, version },
        contentChanges: [{ text }],
      });
    }

    this.openFiles.set(uri, version);
  }

  async closeFile(filePath: string): Promise<void> {
    this.ensureReady();
    const uri = pathToFileURL(filePath).toString();
    if (this.openFiles.has(uri)) {
      this.rpcConnection.sendNotification("textDocument/didClose", {
        textDocument: { uri },
      });
      this.openFiles.delete(uri);
    }
  }

  async waitForDiagnostics(filePath: string, timeoutMs = 3000): Promise<Diagnostic[]> {
    this.ensureReady();
    const uri = pathToFileURL(filePath).toString();
    const cached = this.diagnosticsCache.get(uri);
    if (cached) return [...cached];

    return new Promise<Diagnostic[]>((resolve, reject) => {
      const waiter: DiagnosticsWaiter = {
        resolve,
        reject,
        timeout: undefined as unknown as ReturnType<typeof setTimeout>,
        settled: false,
      };
      waiter.timeout = setTimeout(() => {
        if (waiter.settled) return;
        waiter.settled = true;
        this.removeDiagnosticsWaiter(uri, resolve, reject);
        reject(timeoutError(this.serverId, "textDocument/publishDiagnostics", timeoutMs));
      }, timeoutMs);

      const waiters = this.diagnosticsWaiters.get(uri) ?? [];
      waiters.push(waiter);
      this.diagnosticsWaiters.set(uri, waiters);
    });
  }

  async hover(filePath: string, line: number, character: number): Promise<Hover | null> {
    return this.sendRequest("textDocument/hover", {
      textDocument: { uri: pathToFileURL(filePath).toString() },
      position: { line, character },
    });
  }

  async definition(filePath: string, line: number, character: number): Promise<Location[]> {
    return this.sendRequest("textDocument/definition", {
      textDocument: { uri: pathToFileURL(filePath).toString() },
      position: { line, character },
    });
  }

  async references(
    filePath: string,
    line: number,
    character: number,
    includeDeclaration = false
  ): Promise<Location[]> {
    return this.sendRequest("textDocument/references", {
      textDocument: { uri: pathToFileURL(filePath).toString() },
      position: { line, character },
      context: { includeDeclaration },
    });
  }

  async documentSymbol(filePath: string): Promise<DocumentSymbol[]> {
    return this.sendRequest("textDocument/documentSymbol", {
      textDocument: { uri: pathToFileURL(filePath).toString() },
    });
  }

  async workspaceSymbol(query: string): Promise<SymbolInformation[]> {
    return this.sendRequest("workspace/symbol", { query });
  }

  async incomingCalls(
    filePath: string,
    line: number,
    character: number
  ): Promise<CallHierarchyIncomingCall[]> {
    const items = await this.sendRequest<CallHierarchyItem[] | null>(
      "textDocument/prepareCallHierarchy",
      {
        textDocument: { uri: pathToFileURL(filePath).toString() },
        position: { line, character },
      }
    );

    if (!items || items.length === 0) return [];
    return this.sendRequest("callHierarchy/incomingCalls", {
      item: items[0],
    });
  }

  async outgoingCalls(
    filePath: string,
    line: number,
    character: number
  ): Promise<CallHierarchyOutgoingCall[]> {
    const items = await this.sendRequest<CallHierarchyItem[] | null>(
      "textDocument/prepareCallHierarchy",
      {
        textDocument: { uri: pathToFileURL(filePath).toString() },
        position: { line, character },
      }
    );

    if (!items || items.length === 0) return [];
    return this.sendRequest("callHierarchy/outgoingCalls", {
      item: items[0],
    });
  }

  async codeActions(
    filePath: string,
    startLine: number,
    startChar: number,
    endLine: number,
    endChar: number
  ): Promise<CodeAction[]> {
    return this.sendRequest("textDocument/codeAction", {
      textDocument: { uri: pathToFileURL(filePath).toString() },
      range: {
        start: { line: startLine, character: startChar },
        end: { line: endLine, character: endChar },
      },
      context: { diagnostics: [] },
    });
  }

  async formatDocument(filePath: string): Promise<TextEdit[]> {
    return this.sendRequest("textDocument/formatting", {
      textDocument: { uri: pathToFileURL(filePath).toString() },
      options: { tabSize: 2, insertSpaces: true },
    });
  }

  async completion(filePath: string, line: number, character: number): Promise<CompletionItem[]> {
    const result = await this.sendRequest("textDocument/completion", {
      textDocument: { uri: pathToFileURL(filePath).toString() },
      position: { line, character },
    });

    if (Array.isArray(result)) {
      return result as CompletionItem[];
    }

    if (result && typeof result === "object" && "items" in result) {
      return (result as { items: CompletionItem[] }).items;
    }

    return [];
  }

  async shutdown(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    try {
      if (this.initializedInternal) {
        await this.rpcConnection.sendRequest("shutdown");
        this.rpcConnection.sendNotification("exit");
      }
    } catch {
      // ignore shutdown errors
    }

    if (this.connection) {
      this.connection.dispose();
    }
    if (this.serverProcess && !this.serverProcess.killed) {
      this.serverProcess.kill();
    }
  }

  isAlive(): boolean {
    return Boolean(this.serverProcess && !this.serverProcess.killed && !this.closed);
  }

  private ensureReady(): void {
    if (!this.initializedInternal || this.closed || !this.connection) {
      throw new ConnectionClosedError(this.serverId);
    }
  }

  private async initialize(connection: MessageConnection): Promise<InitializeResult> {
    const params: InitializeParams = {
      processId: process.pid,
      rootUri: this.options.rootUri,
      rootPath: this.options.rootPath,
      capabilities: {},
      initializationOptions: this.options.initializationOptions,
      workspaceFolders: [
        {
          uri: this.options.rootUri,
          name: basename(this.options.rootPath),
        },
      ],
    };

    try {
      const result = await this.sendRequest("initialize", params, connection);
      connection.sendNotification("initialized", {});
      if (this.options.settings) {
        connection.sendNotification("workspace/didChangeConfiguration", {
          settings: this.options.settings,
        });
      }
      return result as InitializeResult;
    } catch (error) {
      throw new InitFailedError(this.serverId, error as Error);
    }
  }

  private extractCapabilities(result: InitializeResult): LspServerCapabilities {
    const caps = result.capabilities ?? {};
    return {
      hoverProvider: Boolean(caps.hoverProvider),
      definitionProvider: Boolean(caps.definitionProvider),
      referencesProvider: Boolean(caps.referencesProvider),
      documentSymbolProvider: Boolean(caps.documentSymbolProvider),
      workspaceSymbolProvider: Boolean(caps.workspaceSymbolProvider),
      callHierarchyProvider: Boolean(caps.callHierarchyProvider),
      diagnosticProvider: Boolean((caps as { diagnosticProvider?: boolean }).diagnosticProvider),
      codeActionProvider: Boolean(caps.codeActionProvider),
      renameProvider: Boolean(caps.renameProvider),
      documentFormattingProvider: Boolean(caps.documentFormattingProvider),
    };
  }

  private bindNotifications(connection: MessageConnection): void {
    connection.onNotification("textDocument/publishDiagnostics", (params) => {
      const { uri, diagnostics } = params as { uri: string; diagnostics: Diagnostic[] };
      this.diagnosticsCache.set(uri, diagnostics);
      const waiters = this.diagnosticsWaiters.get(uri);
      if (waiters) {
        for (const waiter of waiters) {
          if (waiter.settled) continue;
          waiter.settled = true;
          clearTimeout(waiter.timeout);
          waiter.resolve(diagnostics);
        }
        this.diagnosticsWaiters.delete(uri);
      }
    });
  }

  private removeDiagnosticsWaiter(
    uri: string,
    resolve: (diags: Diagnostic[]) => void,
    reject: (error: Error) => void
  ): void {
    const waiters = this.diagnosticsWaiters.get(uri);
    if (!waiters) return;
    const next = waiters.filter((waiter) => waiter.resolve !== resolve && waiter.reject !== reject);
    if (next.length > 0) {
      this.diagnosticsWaiters.set(uri, next);
    } else {
      this.diagnosticsWaiters.delete(uri);
    }
  }

  private rejectPendingDiagnostics(error: Error): void {
    for (const waiters of this.diagnosticsWaiters.values()) {
      for (const waiter of waiters) {
        if (waiter.settled) continue;
        waiter.settled = true;
        clearTimeout(waiter.timeout);
        waiter.reject(error);
      }
    }
    this.diagnosticsWaiters.clear();
  }

  // FIX: Properly cancel timeout on success to prevent memory leaks
  private async sendRequest<T>(
    method: string,
    params: unknown,
    connection: MessageConnection = this.rpcConnection
  ): Promise<T> {
    const timeoutMs = this.options.requestTimeoutMs ?? 30_000;
    const requestPromise = connection.sendRequest(method, params) as Promise<T>;

    // FIX: Store timeout ID so we can clear it on success
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(timeoutError(this.serverId, method, timeoutMs));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([requestPromise, timeoutPromise]);
      // FIX: Clear timeout on success to prevent memory leak
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      return result;
    } catch (error) {
      // FIX: Also clear timeout on error (in case request failed before timeout)
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      throw error;
    }
  }
}

function guessLanguageId(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
    case "mts":
    case "cts":
      return "typescript";
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "javascript";
    case "py":
      return "python";
    case "go":
      return "go";
    case "rs":
      return "rust";
    default:
      return ext ?? "plaintext";
  }
}
