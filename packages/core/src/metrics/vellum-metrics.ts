/**
 * Vellum Preset Metrics
 *
 * Pre-configured metrics for monitoring LLM operations,
 * token usage, and system resources.
 */

import { MetricsCollector } from "./collector.js";

const collector = MetricsCollector.getInstance();

// ============================================================================
// Request Counters
// ============================================================================

/**
 * Total number of LLM API requests
 */
export const llmRequestsTotal = collector.createCounter({
  name: "vellum_llm_requests_total",
  description: "Total number of LLM API requests",
});

/**
 * Total number of failed LLM API requests
 */
export const llmRequestErrors = collector.createCounter({
  name: "vellum_llm_request_errors_total",
  description: "Total number of failed LLM API requests",
});

// ============================================================================
// Token Counters
// ============================================================================

/**
 * Total prompt tokens used across all requests
 */
export const promptTokensTotal = collector.createCounter({
  name: "vellum_prompt_tokens_total",
  description: "Total prompt tokens used",
});

/**
 * Total completion tokens used across all requests
 */
export const completionTokensTotal = collector.createCounter({
  name: "vellum_completion_tokens_total",
  description: "Total completion tokens used",
});

// ============================================================================
// Latency Histogram
// ============================================================================

/**
 * LLM request duration distribution in milliseconds
 */
export const llmRequestDuration = collector.createHistogram({
  name: "vellum_llm_request_duration_ms",
  description: "LLM request duration in milliseconds",
});

// ============================================================================
// Resource Gauges
// ============================================================================

/**
 * Current memory usage in bytes
 */
export const memoryUsageBytes = collector.createGauge({
  name: "vellum_memory_usage_bytes",
  description: "Current memory usage in bytes",
});

/**
 * Number of active provider connections
 */
export const activeConnections = collector.createGauge({
  name: "vellum_active_connections",
  description: "Number of active provider connections",
});
