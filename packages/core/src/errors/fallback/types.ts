// ============================================
// Fallback Types (T034 - REQ-012)
// ============================================

/**
 * Types of fallback strategies supported.
 * AC-012-1: FallbackConfig supports these fallback types
 */
export type FallbackType = "provider-chain" | "cache" | "default" | "graceful";

/**
 * Configuration for fallback behavior.
 * AC-012-1: FallbackConfig with provider-chain, cache, default, graceful types
 *
 * @template T - The type of value returned by fallback functions
 */
export interface FallbackConfig<T = unknown> {
  /** The type of fallback strategy to use */
  type: FallbackType;
  /** Array of fallback functions to try in order */
  fallbacks: Array<() => Promise<T>>;
  /** Timeout in milliseconds for each fallback attempt */
  timeout?: number;
  /** Number of retry attempts per fallback */
  retries?: number;
}

/**
 * Result of a fallback operation.
 * AC-012-4: FallbackResult indicates source (primary vs fallback)
 *
 * @template T - The type of value returned
 */
export interface FallbackResult<T> {
  /** The resolved value */
  value: T;
  /** Whether the value came from primary or a fallback source */
  source: "primary" | "fallback";
  /** Index of the fallback that succeeded (undefined if primary succeeded) */
  fallbackIndex?: number;
  /** The error that triggered fallback (if any) */
  error?: Error;
  /** Total number of attempts made */
  attempts: number;
}
