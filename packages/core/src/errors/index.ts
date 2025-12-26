// ============================================
// Vellum Errors - Barrel Export
// ============================================

export {
  GlobalErrorHandler,
  type GlobalErrorHandlerOptions,
} from "./handler.js";
export {
  type RetryOptions,
  withRetry,
  withTimeout,
} from "./retry.js";
export {
  ErrorCode,
  ErrorSeverity,
  inferSeverity,
  isFatalError,
  isRetryableError,
  VellumError,
  type VellumErrorOptions,
} from "./types.js";
