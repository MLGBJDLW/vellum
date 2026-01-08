export enum LspErrorCode {
  LSP_SERVER_NOT_FOUND = 3200,
  LSP_INIT_FAILED = 3201,
  LSP_CONNECTION_CLOSED = 3202,
  LSP_REQUEST_TIMEOUT = 3203,
  LSP_INSTALL_FAILED = 3204,
  LSP_ROOT_NOT_FOUND = 3205,
}

export class LspError extends Error {
  readonly code: LspErrorCode;
  readonly serverId?: string;
  readonly cause?: Error;

  constructor(code: LspErrorCode, message: string, options?: { serverId?: string; cause?: Error }) {
    super(message);
    this.name = "LspError";
    this.code = code;
    this.serverId = options?.serverId;
    this.cause = options?.cause;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      serverId: this.serverId,
      cause: this.cause?.message,
    };
  }
}

export class ServerNotFoundError extends LspError {
  readonly searchedPaths: string[];

  constructor(serverId: string, searchedPaths: string[]) {
    super(
      LspErrorCode.LSP_SERVER_NOT_FOUND,
      `LSP server '${serverId}' not found. Searched: ${searchedPaths.join(", ")}`,
      { serverId }
    );
    this.searchedPaths = searchedPaths;
  }
}

export class InitFailedError extends LspError {
  readonly initializeResult?: unknown;

  constructor(serverId: string, cause?: Error, initializeResult?: unknown) {
    super(
      LspErrorCode.LSP_INIT_FAILED,
      `Failed to initialize LSP server '${serverId}': ${cause?.message ?? "unknown error"}`,
      { serverId, cause }
    );
    this.initializeResult = initializeResult;
  }
}

export class ConnectionClosedError extends LspError {
  readonly exitCode?: number;

  constructor(serverId: string, exitCode?: number) {
    super(
      LspErrorCode.LSP_CONNECTION_CLOSED,
      `LSP connection to '${serverId}' closed unexpectedly${
        exitCode !== undefined ? ` (exit code: ${exitCode})` : ""
      }`,
      { serverId }
    );
    this.exitCode = exitCode;
  }
}

export class RequestTimeoutError extends LspError {
  readonly method: string;
  readonly timeoutMs: number;

  constructor(serverId: string, method: string, timeoutMs: number) {
    super(
      LspErrorCode.LSP_REQUEST_TIMEOUT,
      `LSP request '${method}' to '${serverId}' timed out after ${timeoutMs}ms`,
      { serverId }
    );
    this.method = method;
    this.timeoutMs = timeoutMs;
  }
}

export class InstallFailedError extends LspError {
  readonly packageManager: string;
  readonly packageName: string;

  constructor(serverId: string, packageManager: string, packageName: string, cause?: Error) {
    super(
      LspErrorCode.LSP_INSTALL_FAILED,
      `Failed to install LSP server '${serverId}' via ${packageManager}: ${
        cause?.message ?? "unknown error"
      }`,
      { serverId, cause }
    );
    this.packageManager = packageManager;
    this.packageName = packageName;
  }
}

export class RootNotFoundError extends LspError {
  readonly searchedFrom: string;
  readonly markers: string[];

  constructor(searchedFrom: string, markers: string[]) {
    super(
      LspErrorCode.LSP_ROOT_NOT_FOUND,
      `Could not find project root from '${searchedFrom}'. Searched for: ${markers.join(", ")}`,
      {}
    );
    this.searchedFrom = searchedFrom;
    this.markers = markers;
  }
}
