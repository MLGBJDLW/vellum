/**
 * HTTP Connection Pool Module
 *
 * Provides shared HTTP client utilities with connection pooling for improved
 * performance across the Vellum codebase. Uses undici (Bun's underlying HTTP client)
 * for efficient connection management.
 *
 * @module @vellum/shared/http
 */

import {
  Agent,
  type Agent as AgentType,
  type RequestInit as UndiciRequestInit,
  fetch as undiciFetch,
} from "undici";

/**
 * Configuration options for creating an HTTP connection pool.
 */
export interface HttpPoolOptions {
  /**
   * Maximum time a connection can remain idle before being closed (ms).
   * @default 30_000
   */
  keepAliveTimeout?: number;

  /**
   * Maximum time a connection can be kept alive (ms).
   * @default 60_000
   */
  keepAliveMaxTimeout?: number;

  /**
   * Maximum number of connections per origin.
   * @default 100
   */
  connections?: number;

  /**
   * Number of pipelined requests per connection.
   * @default 1
   */
  pipelining?: number;

  /**
   * Connection timeout (ms).
   * @default 10_000
   */
  connect?: {
    timeout?: number;
  };
}

/**
 * Default pool configuration optimized for typical API usage.
 */
export const DEFAULT_POOL_OPTIONS: Required<Omit<HttpPoolOptions, "connect">> & {
  connect: { timeout: number };
} = {
  keepAliveTimeout: 30_000, // 30s
  keepAliveMaxTimeout: 60_000, // 60s
  connections: 100, // max connections per origin
  pipelining: 1, // request pipelining
  connect: {
    timeout: 10_000, // 10s connection timeout
  },
} as const;

/**
 * Creates a new HTTP connection pool with the specified options.
 *
 * @param options - Pool configuration options
 * @returns Configured undici Agent for connection pooling
 *
 * @example
 * ```typescript
 * const pool = createHttpPool({
 *   connections: 50,
 *   keepAliveTimeout: 15_000,
 * });
 *
 * const response = await fetch('https://api.example.com/data', {
 *   dispatcher: pool,
 * });
 * ```
 */
export function createHttpPool(options: HttpPoolOptions = {}): AgentType {
  const config = {
    keepAliveTimeout: options.keepAliveTimeout ?? DEFAULT_POOL_OPTIONS.keepAliveTimeout,
    keepAliveMaxTimeout: options.keepAliveMaxTimeout ?? DEFAULT_POOL_OPTIONS.keepAliveMaxTimeout,
    connections: options.connections ?? DEFAULT_POOL_OPTIONS.connections,
    pipelining: options.pipelining ?? DEFAULT_POOL_OPTIONS.pipelining,
    connect: {
      timeout: options.connect?.timeout ?? DEFAULT_POOL_OPTIONS.connect.timeout,
    },
  };

  return new Agent(config);
}

/**
 * Default shared HTTP connection pool instance.
 *
 * Use this for most HTTP requests to benefit from connection reuse.
 * For specialized needs, create a custom pool with `createHttpPool()`.
 *
 * @example
 * ```typescript
 * const response = await fetch('https://api.example.com/data', {
 *   dispatcher: defaultHttpPool,
 * });
 * ```
 */
export const defaultHttpPool: AgentType = createHttpPool();

/**
 * Extended fetch options that include the dispatcher for connection pooling.
 */
export interface FetchWithPoolOptions extends Omit<UndiciRequestInit, "dispatcher"> {
  /**
   * Custom pool to use instead of the default.
   * If not provided, uses `defaultHttpPool`.
   */
  pool?: AgentType;
}

/**
 * Fetch wrapper that automatically uses connection pooling.
 *
 * This is a drop-in replacement for `fetch()` that uses the default
 * connection pool for improved performance.
 *
 * @param url - The URL to fetch
 * @param options - Fetch options (extended with optional custom pool)
 * @returns Promise resolving to the Response
 *
 * @example
 * ```typescript
 * // Simple GET request
 * const response = await fetchWithPool('https://api.example.com/data');
 *
 * // POST with custom headers
 * const response = await fetchWithPool('https://api.example.com/data', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ key: 'value' }),
 * });
 *
 * // Use custom pool
 * const customPool = createHttpPool({ connections: 10 });
 * const response = await fetchWithPool('https://api.example.com/data', {
 *   pool: customPool,
 * });
 * ```
 */
export async function fetchWithPool(
  url: string | URL,
  options: FetchWithPoolOptions = {}
): Promise<Response> {
  const { pool, ...fetchOptions } = options;
  const dispatcher = pool ?? defaultHttpPool;

  // Use undici's fetch with the dispatcher
  // Note: In Bun, the global fetch already uses undici internally,
  // but we explicitly use undici's fetch for consistency
  return undiciFetch(url, {
    ...fetchOptions,
    dispatcher,
  }) as Promise<Response>;
}

/**
 * Gracefully closes the default HTTP pool.
 *
 * Call this during application shutdown to ensure all connections
 * are properly closed.
 *
 * @example
 * ```typescript
 * process.on('SIGTERM', async () => {
 *   await closeDefaultPool();
 *   process.exit(0);
 * });
 * ```
 */
export async function closeDefaultPool(): Promise<void> {
  await defaultHttpPool.close();
}

/**
 * Type export for the Agent (connection pool) for advanced usage.
 */
export type { AgentType as HttpPool };
