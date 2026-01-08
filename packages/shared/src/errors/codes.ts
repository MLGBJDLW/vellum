/**
 * Unified error codes for the Vellum system.
 *
 * Ranges:
 * - 1xxx: General/System errors
 * - 2xxx: Network/API errors
 * - 3xxx: Configuration errors
 * - 4xxx: Credential/Auth errors
 * - 5xxx: Provider/LLM errors
 * - 6xxx: Tool/MCP errors
 * - 7xxx: Session errors
 * - 8xxx: Agent errors
 * - 9xxx: Git/Snapshot errors
 */
export enum ErrorCode {
  // ═══════════════════════════════════════════
  // 1xxx - General/System Errors
  // ═══════════════════════════════════════════
  UNKNOWN = 1000,
  INTERNAL_ERROR = 1001,
  INVALID_ARGUMENT = 1002,
  NOT_IMPLEMENTED = 1003,
  TIMEOUT = 1004,
  SYSTEM_IO_ERROR = 1010,
  SYSTEM_OUT_OF_MEMORY = 1011,

  // ═══════════════════════════════════════════
  // 2xxx - Network/API Errors
  // ═══════════════════════════════════════════
  NETWORK_ERROR = 2001,
  API_ERROR = 2002,
  RATE_LIMITED = 2003,
  SERVICE_UNAVAILABLE = 2004,
  QUOTA_TERMINAL = 2010,
  QUOTA_RETRYABLE = 2011,
  CIRCUIT_OPEN = 2020,

  // ═══════════════════════════════════════════
  // 3xxx - Configuration Errors
  // ═══════════════════════════════════════════
  CONFIG_INVALID = 3001,
  CONFIG_NOT_FOUND = 3002,
  CONFIG_PARSE_ERROR = 3003,

  // ═══════════════════════════════════════════
  // 4xxx - Credential/Auth Errors
  // ═══════════════════════════════════════════
  CREDENTIAL_NOT_FOUND = 4001,
  CREDENTIAL_EXPIRED = 4002,
  CREDENTIAL_INVALID_FORMAT = 4003,
  CREDENTIAL_VALIDATION_FAILED = 4004,
  KEYCHAIN_NOT_AVAILABLE = 4005,
  ENCRYPTION_FAILED = 4006,
  DECRYPTION_FAILED = 4007,
  REFRESH_TOKEN_EXPIRED = 4008,
  CREDENTIAL_STORE_UNAVAILABLE = 4009,

  // ═══════════════════════════════════════════
  // 5xxx - Provider/LLM Errors
  // ═══════════════════════════════════════════
  PROVIDER_NOT_FOUND = 5001,
  PROVIDER_INITIALIZATION_FAILED = 5002,
  PROVIDER_AUTH_FAILED = 5003,
  LLM_RATE_LIMIT = 5010,
  LLM_CONTEXT_LENGTH = 5011,
  LLM_AUTH_FAILED = 5012,
  LLM_NETWORK_ERROR = 5013,
  LLM_TIMEOUT = 5014,
  LLM_INVALID_RESPONSE = 5015,

  // ═══════════════════════════════════════════
  // 6xxx - Tool/MCP Errors
  // ═══════════════════════════════════════════
  TOOL_NOT_FOUND = 6001,
  TOOL_VALIDATION_FAILED = 6002,
  TOOL_EXECUTION_FAILED = 6003,
  TOOL_PERMISSION_DENIED = 6004,
  TOOL_TIMEOUT = 6005,
  TOOL_ABORTED = 6006,
  PATH_SECURITY = 6007,
  MCP_CONNECTION = 6010,
  MCP_PROTOCOL = 6011,
  MCP_TIMEOUT = 6012,
  SMART_EDIT_FAILED = 6020,

  // ═══════════════════════════════════════════
  // 7xxx - Session Errors
  // ═══════════════════════════════════════════
  SESSION_NOT_FOUND = 7001,
  SESSION_EXPIRED = 7002,
  SESSION_CONFLICT = 7003,

  // ═══════════════════════════════════════════
  // 8xxx - Agent Errors
  // ═══════════════════════════════════════════
  AGENT_NOT_FOUND = 8001,
  AGENT_LOOP_ERROR = 8002,
  CONTEXT_OVERFLOW = 8003,

  // ═══════════════════════════════════════════
  // 9xxx - Git/Snapshot Errors
  // ═══════════════════════════════════════════
  GIT_NOT_INITIALIZED = 9000,
  GIT_SNAPSHOT_DISABLED = 9001,
  GIT_PROTECTED_PATH = 9002,
  GIT_OPERATION_FAILED = 9010,
  GIT_LOCK_TIMEOUT = 9020,
  GIT_CONFLICT = 9030,
  GIT_DIRTY_WORKDIR = 9031,
  GIT_BRANCH_EXISTS = 9032,
  GIT_BRANCH_NOT_FOUND = 9033,
  GIT_REMOTE_ERROR = 9034,
  GIT_TIMEOUT = 9035,
  GIT_NO_STAGED_CHANGES = 9036,
  GIT_STASH_EMPTY = 9037,
}

/**
 * Error severity levels
 */
export type ErrorSeverity = "low" | "medium" | "high" | "critical";

/**
 * Infer error severity from error code
 */
export function inferSeverity(code: ErrorCode): ErrorSeverity {
  // Critical: Agent errors that break the loop
  if (code >= 8001 && code <= 8999) return "critical";

  // High: System, credential failures
  if (code >= 1000 && code <= 1999) return "high";
  if (code >= 4000 && code <= 4999) return "high";

  // Medium: Network, provider, tool errors
  if (code >= 2000 && code <= 2999) return "medium";
  if (code >= 5000 && code <= 5999) return "medium";
  if (code >= 6000 && code <= 6999) return "medium";

  // Low: Config, session, git
  if (code >= 3000 && code <= 3999) return "low";
  if (code >= 7000 && code <= 7999) return "low";
  if (code >= 9000 && code <= 9999) return "low";

  return "medium";
}
