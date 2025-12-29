// ============================================
// Vellum Error Codes
// ============================================

/**
 * Centralized error codes for the Vellum application.
 * Error code ranges:
 * - 1xxx: General/System errors
 * - 2xxx: Network/API errors
 * - 3xxx: Credential errors
 * - 4xxx: Provider errors
 * - 5xxx: Tool errors
 * - 6xxx: Agent errors
 */
export enum ErrorCode {
  // General Errors (1xxx)
  UNKNOWN = 1000,
  INTERNAL_ERROR = 1001,
  INVALID_ARGUMENT = 1002,
  NOT_IMPLEMENTED = 1003,
  TIMEOUT = 1004,

  // Network/API Errors (2xxx)
  NETWORK_ERROR = 2001,
  API_ERROR = 2002,
  RATE_LIMITED = 2003,
  SERVICE_UNAVAILABLE = 2004,

  // Credential Errors (3xxx)
  CREDENTIAL_NOT_FOUND = 3001,
  CREDENTIAL_EXPIRED = 3002,
  CREDENTIAL_INVALID_FORMAT = 3003,
  CREDENTIAL_VALIDATION_FAILED = 3004,
  KEYCHAIN_NOT_AVAILABLE = 3005,
  ENCRYPTION_FAILED = 3006,
  DECRYPTION_FAILED = 3007,
  REFRESH_TOKEN_EXPIRED = 3008,
  CREDENTIAL_STORE_UNAVAILABLE = 3009,

  // Provider Errors (4xxx)
  PROVIDER_NOT_FOUND = 4001,
  PROVIDER_INITIALIZATION_FAILED = 4002,
  PROVIDER_AUTH_FAILED = 4003,

  // Tool Errors (5xxx)
  TOOL_NOT_FOUND = 5001,
  TOOL_EXECUTION_FAILED = 5002,
  TOOL_PERMISSION_DENIED = 5004,

  // Agent Errors (6xxx)
  AGENT_NOT_FOUND = 6001,
  AGENT_LOOP_ERROR = 6002,
  CONTEXT_OVERFLOW = 6003,
}
