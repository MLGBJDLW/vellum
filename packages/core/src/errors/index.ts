// ============================================
// Vellum Errors - Barrel Export
// ============================================

export {
  ModelAvailabilityService,
  type ModelState,
  type ModelStatus,
} from "./availability/index.js";
export {
  CircuitBreaker,
  type CircuitBreakerOptions,
  CircuitBreakerRegistry,
  CircuitOpenError,
  type CircuitState,
  circuitClose,
  circuitHalfOpen,
  circuitOpen,
} from "./circuit-breaker/index.js";
export {
  type CacheEntry,
  CacheFallback,
  type CacheFallbackOptions,
  type FallbackConfig,
  type FallbackProvider,
  type FallbackResult,
  type FallbackType,
  ProviderFallbackChain,
} from "./fallback/index.js";
export {
  GlobalErrorHandler,
  type GlobalErrorHandlerOptions,
} from "./handler.js";
export {
  parseRetryHeaders,
  type RetryHeadersResult,
} from "./headers.js";
export {
  formatQuotaMessage,
  type QuotaMessageOptions,
  type UserPlan,
} from "./messages.js";
export {
  getNetworkErrorCode,
  isNetworkError,
  maybeWrapNetworkError,
  NETWORK_ERROR_CODES,
  NetworkError,
  type NetworkErrorCode,
  wrapNetworkError,
} from "./network.js";
export { ErrorNoTelemetry, shouldSkipTelemetry } from "./privacy/index.js";
export {
  classifyQuotaError,
  type QuotaClassificationResult,
  RetryableQuotaError,
  TerminalQuotaError,
} from "./quota/index.js";
export {
  AbortError,
  type RetryOptions,
  withRetry,
  withTimeout,
} from "./retry.js";
export {
  type AggregatedError,
  BufferedErrorTelemetry,
  type BufferedErrorTelemetryOptions,
} from "./telemetry/index.js";
export {
  ErrorCode,
  ErrorSeverity,
  inferSeverity,
  isFatalError,
  isRetryableError,
  VellumError,
  type VellumErrorOptions,
} from "./types.js";
export {
  type UsageEvent,
  UsageTracker,
  type UsageTrackerOptions,
  type UsageWindow,
} from "./usage/index.js";
