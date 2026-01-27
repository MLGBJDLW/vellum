/**
 * HTTP utilities module
 *
 * Provides HTTP client utilities with connection pooling.
 *
 * @module @vellum/shared/http
 */

export {
  closeDefaultPool,
  createHttpPool,
  DEFAULT_POOL_OPTIONS,
  defaultHttpPool,
  type FetchWithPoolOptions,
  fetchWithPool,
  type HttpPool,
  type HttpPoolOptions,
} from "./pool.js";
