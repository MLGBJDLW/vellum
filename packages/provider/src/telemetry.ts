/**
 * Instrumented Provider - Telemetry Wrapper
 *
 * Wraps any LLMProvider to capture telemetry metrics including:
 * - Request latency
 * - Token usage
 * - Error rates
 * - Model/provider information
 *
 * @module @vellum/provider/telemetry
 */

import { EventEmitter } from "node:events";
import type {
  CompletionMessage,
  CompletionParams,
  CompletionResult,
  CredentialValidationResult,
  LLMProvider,
  ModelInfo,
  ProviderCredential,
  ProviderOptions,
  StreamEvent,
  TokenUsage,
} from "./types.js";

// =============================================================================
// T054: Telemetry Types
// =============================================================================

/**
 * Telemetry event emitted after each operation
 */
export interface TelemetryEvent {
  /** Type of operation that was performed */
  type: "complete" | "stream" | "error";
  /** Name of the provider (e.g., 'anthropic', 'openai') */
  provider: string;
  /** Model ID used for the operation */
  model: string;
  /** Operation latency in milliseconds */
  latencyMs: number;
  /** Token usage statistics (if available) */
  usage?: TokenUsage;
  /** Error information (if type is 'error') */
  error?: { code: string; message: string };
  /** Timestamp when the operation started */
  timestamp: Date;
}

/**
 * Aggregated metrics for a provider/model combination
 */
export interface TelemetryMetrics {
  /** Total number of requests */
  totalRequests: number;
  /** Number of successful requests */
  successCount: number;
  /** Number of failed requests */
  errorCount: number;
  /** Average latency in milliseconds */
  avgLatencyMs: number;
  /** Total input tokens consumed */
  totalInputTokens: number;
  /** Total output tokens generated */
  totalOutputTokens: number;
  /** Total cache read tokens */
  totalCacheReadTokens: number;
  /** Total cache write tokens */
  totalCacheWriteTokens: number;
}

/**
 * Options for configuring the InstrumentedProvider
 */
export interface InstrumentedProviderOptions {
  /** Name to use for the provider in telemetry events (optional override) */
  providerName?: string;
  /** Whether to emit events (default: true) */
  emitEvents?: boolean;
  /** Whether to track aggregated metrics (default: true) */
  trackMetrics?: boolean;
}

// =============================================================================
// T054: Telemetry Event Emitter
// =============================================================================

/**
 * Typed event emitter for telemetry events
 */
export interface TelemetryEventEmitter {
  on(event: "telemetry", listener: (event: TelemetryEvent) => void): this;
  off(event: "telemetry", listener: (event: TelemetryEvent) => void): this;
  once(event: "telemetry", listener: (event: TelemetryEvent) => void): this;
  emit(event: "telemetry", data: TelemetryEvent): boolean;
}

// =============================================================================
// T054: InstrumentedProvider Implementation
// =============================================================================

/**
 * Wraps an LLMProvider to capture telemetry metrics
 *
 * @example
 * ```typescript
 * const baseProvider = new AnthropicProvider();
 * const instrumented = new InstrumentedProvider(baseProvider, {
 *   providerName: 'anthropic',
 * });
 *
 * instrumented.on('telemetry', (event) => {
 *   console.log(`[${event.provider}/${event.model}] ${event.type}: ${event.latencyMs}ms`);
 *   if (event.usage) {
 *     console.log(`  Tokens: ${event.usage.inputTokens} in, ${event.usage.outputTokens} out`);
 *   }
 * });
 *
 * await instrumented.initialize({ apiKey: 'sk-...' });
 * const result = await instrumented.complete({
 *   model: 'claude-sonnet-4-20250514',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * ```
 */
export class InstrumentedProvider
  extends EventEmitter
  implements LLMProvider, TelemetryEventEmitter
{
  private readonly wrapped: LLMProvider;
  private readonly providerName: string;
  private readonly emitEvents: boolean;
  private readonly trackMetrics: boolean;
  private metrics: Map<string, TelemetryMetrics> = new Map();

  /**
   * Create a new InstrumentedProvider
   *
   * @param provider - The LLMProvider to wrap
   * @param options - Configuration options
   */
  constructor(provider: LLMProvider, options: InstrumentedProviderOptions = {}) {
    super();
    this.wrapped = provider;
    this.providerName = options.providerName ?? "unknown";
    this.emitEvents = options.emitEvents ?? true;
    this.trackMetrics = options.trackMetrics ?? true;
  }

  // ===========================================================================
  // LLMProvider Interface Implementation
  // ===========================================================================

  /**
   * Initialize the wrapped provider
   */
  async initialize(options: ProviderOptions): Promise<void> {
    return this.wrapped.initialize(options);
  }

  /**
   * Generate a non-streaming completion with telemetry tracking
   */
  async complete(params: CompletionParams): Promise<CompletionResult> {
    const startTime = Date.now();
    const timestamp = new Date();

    try {
      const result = await this.wrapped.complete(params);
      const latencyMs = Date.now() - startTime;

      this.recordTelemetry({
        type: "complete",
        provider: this.providerName,
        model: params.model,
        latencyMs,
        usage: result.usage,
        timestamp,
      });

      return result;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      this.recordError(params.model, latencyMs, timestamp, error);
      throw error;
    }
  }

  /**
   * Generate a streaming completion with telemetry tracking
   */
  stream(params: CompletionParams): AsyncIterable<StreamEvent> {
    const self = this;
    const startTime = Date.now();
    const timestamp = new Date();

    return {
      async *[Symbol.asyncIterator]() {
        let usage: TokenUsage | undefined;

        try {
          for await (const event of self.wrapped.stream(params)) {
            // Capture usage from usage events
            if (event.type === "usage") {
              usage = {
                inputTokens: event.inputTokens,
                outputTokens: event.outputTokens,
                ...(event.cacheReadTokens !== undefined && {
                  cacheReadTokens: event.cacheReadTokens,
                }),
                ...(event.cacheWriteTokens !== undefined && {
                  cacheWriteTokens: event.cacheWriteTokens,
                }),
              };
            }

            // Capture errors from error events
            if (event.type === "error") {
              self.recordTelemetry({
                type: "error",
                provider: self.providerName,
                model: params.model,
                latencyMs: Date.now() - startTime,
                error: { code: event.code, message: event.message },
                timestamp,
              });
            }

            yield event;
          }

          // Record successful stream completion
          const latencyMs = Date.now() - startTime;
          self.recordTelemetry({
            type: "stream",
            provider: self.providerName,
            model: params.model,
            latencyMs,
            usage,
            timestamp,
          });
        } catch (error) {
          const latencyMs = Date.now() - startTime;
          self.recordError(params.model, latencyMs, timestamp, error);
          throw error;
        }
      },
    };
  }

  /**
   * Count tokens using the wrapped provider
   */
  async countTokens(input: string | CompletionMessage[], model?: string): Promise<number> {
    return this.wrapped.countTokens(input, model);
  }

  /**
   * List available models from the wrapped provider
   */
  async listModels(): Promise<ModelInfo[]> {
    return this.wrapped.listModels();
  }

  /**
   * Validate a credential using the wrapped provider
   */
  async validateCredential(credential: ProviderCredential): Promise<CredentialValidationResult> {
    return this.wrapped.validateCredential(credential);
  }

  /**
   * Check if the wrapped provider is initialized
   */
  isInitialized(): boolean {
    return this.wrapped.isInitialized();
  }

  // ===========================================================================
  // Telemetry Methods
  // ===========================================================================

  /**
   * Record a telemetry event
   */
  private recordTelemetry(event: TelemetryEvent): void {
    if (this.emitEvents) {
      this.emit("telemetry", event);
    }

    if (this.trackMetrics) {
      this.updateMetrics(event);
    }
  }

  /**
   * Record an error telemetry event
   */
  private recordError(model: string, latencyMs: number, timestamp: Date, error: unknown): void {
    const errorInfo = this.extractErrorInfo(error);

    this.recordTelemetry({
      type: "error",
      provider: this.providerName,
      model,
      latencyMs,
      error: errorInfo,
      timestamp,
    });
  }

  /**
   * Extract error code and message from an error
   */
  private extractErrorInfo(error: unknown): { code: string; message: string } {
    if (error instanceof Error) {
      // Check for ProviderError with code
      const providerError = error as { code?: string; message: string };
      return {
        code: providerError.code ?? "unknown_error",
        message: error.message,
      };
    }

    return {
      code: "unknown_error",
      message: String(error),
    };
  }

  /**
   * Update aggregated metrics from a telemetry event
   */
  private updateMetrics(event: TelemetryEvent): void {
    const key = `${event.provider}:${event.model}`;
    const existing = this.metrics.get(key) ?? {
      totalRequests: 0,
      successCount: 0,
      errorCount: 0,
      avgLatencyMs: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheWriteTokens: 0,
    };

    // Update counts
    existing.totalRequests += 1;
    if (event.type === "error") {
      existing.errorCount += 1;
    } else {
      existing.successCount += 1;
    }

    // Update average latency (incremental average)
    existing.avgLatencyMs =
      existing.avgLatencyMs + (event.latencyMs - existing.avgLatencyMs) / existing.totalRequests;

    // Update token counts
    if (event.usage) {
      existing.totalInputTokens += event.usage.inputTokens;
      existing.totalOutputTokens += event.usage.outputTokens;
      existing.totalCacheReadTokens += event.usage.cacheReadTokens ?? 0;
      existing.totalCacheWriteTokens += event.usage.cacheWriteTokens ?? 0;
    }

    this.metrics.set(key, existing);
  }

  // ===========================================================================
  // Public Telemetry API
  // ===========================================================================

  /**
   * Get aggregated metrics for a specific provider/model combination
   *
   * @param provider - Provider name
   * @param model - Model ID
   * @returns Metrics or undefined if no data exists
   */
  getMetrics(provider: string, model: string): TelemetryMetrics | undefined {
    return this.metrics.get(`${provider}:${model}`);
  }

  /**
   * Get all aggregated metrics
   *
   * @returns Map of provider:model keys to metrics
   */
  getAllMetrics(): Map<string, TelemetryMetrics> {
    return new Map(this.metrics);
  }

  /**
   * Reset all aggregated metrics
   */
  resetMetrics(): void {
    this.metrics.clear();
  }

  /**
   * Get the wrapped provider (for testing or advanced use cases)
   */
  getWrappedProvider(): LLMProvider {
    return this.wrapped;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Wrap an LLMProvider with telemetry instrumentation
 *
 * @param provider - The provider to wrap
 * @param options - Instrumentation options
 * @returns Instrumented provider
 *
 * @example
 * ```typescript
 * const provider = instrumentProvider(new AnthropicProvider(), {
 *   providerName: 'anthropic',
 * });
 *
 * provider.on('telemetry', console.log);
 * ```
 */
export function instrumentProvider(
  provider: LLMProvider,
  options?: InstrumentedProviderOptions
): InstrumentedProvider {
  return new InstrumentedProvider(provider, options);
}
