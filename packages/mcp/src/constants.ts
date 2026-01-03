// ============================================
// T002: MCP Constants
// ============================================

/** Default timeout for MCP operations in seconds */
export const DEFAULT_MCP_TIMEOUT_SECONDS = 60;

/** Minimum allowed timeout for MCP operations in seconds */
export const MIN_MCP_TIMEOUT_SECONDS = 1;

/** Default port for OAuth callback server */
export const DEFAULT_OAUTH_PORT = 3333;

/** Default shutdown timeout for graceful server disconnection in milliseconds */
export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5000;

/** Debounce delay for config file watching in milliseconds */
export const CONFIG_WATCH_DEBOUNCE_MS = 500;

/** Maximum number of connection retries */
export const MAX_CONNECTION_RETRIES = 3;

/** Base delay for exponential backoff in milliseconds */
export const RETRY_BASE_DELAY_MS = 1000;

/** OAuth flow timeout in milliseconds (5 minutes) */
export const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

/** Client name for MCP protocol handshake */
export const MCP_CLIENT_NAME = "Vellum";
