import { LspError, LspErrorCode, RequestTimeoutError, ServerNotFoundError } from "./errors.js";

export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof LspError)) return false;

  switch (error.code) {
    case LspErrorCode.LSP_CONNECTION_CLOSED:
    case LspErrorCode.LSP_REQUEST_TIMEOUT:
      return true;
    case LspErrorCode.LSP_INIT_FAILED:
      return error.cause?.message?.includes("ECONNREFUSED") ?? false;
    default:
      return false;
  }
}

export function requiresUserAction(error: unknown): boolean {
  if (!(error instanceof LspError)) return false;

  switch (error.code) {
    case LspErrorCode.LSP_SERVER_NOT_FOUND:
    case LspErrorCode.LSP_INSTALL_FAILED:
    case LspErrorCode.LSP_ROOT_NOT_FOUND:
      return true;
    default:
      return false;
  }
}

export function getUserFriendlyMessage(error: unknown): string {
  if (!(error instanceof LspError)) {
    return error instanceof Error ? error.message : "Unknown error";
  }

  switch (error.code) {
    case LspErrorCode.LSP_SERVER_NOT_FOUND:
      return `Language server '${error.serverId}' not found. Run 'vellum lsp install ${error.serverId}'.`;
    case LspErrorCode.LSP_INIT_FAILED:
      return `Language server '${error.serverId}' failed to initialize. Check server logs.`;
    case LspErrorCode.LSP_CONNECTION_CLOSED:
      return `Connection to '${error.serverId}' closed unexpectedly. Retrying...`;
    case LspErrorCode.LSP_REQUEST_TIMEOUT:
      return `Language server request timed out. The server may be overloaded.`;
    case LspErrorCode.LSP_INSTALL_FAILED:
      return `Language server installation failed. Check network or install manually.`;
    case LspErrorCode.LSP_ROOT_NOT_FOUND:
      return `Could not detect project root. Run from a project directory.`;
    default:
      return error.message;
  }
}

export function assertServerFound(serverId: string, found: boolean, searched: string[]): void {
  if (!found) {
    throw new ServerNotFoundError(serverId, searched);
  }
}

export function timeoutError(
  serverId: string,
  method: string,
  timeoutMs: number
): RequestTimeoutError {
  return new RequestTimeoutError(serverId, method, timeoutMs);
}
