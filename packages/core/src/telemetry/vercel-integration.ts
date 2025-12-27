/**
 * Integration with Vercel AI SDK telemetry settings.
 * Provides helpers to create and extract telemetry data compatible with Vercel AI SDK.
 *
 * @see https://sdk.vercel.ai/docs/ai-sdk-core/telemetry
 */

/**
 * Vercel AI SDK telemetry settings interface.
 * Matches the TelemetrySettings type from the Vercel AI SDK.
 */
export interface VercelTelemetrySettings {
  /** Whether telemetry is enabled */
  isEnabled?: boolean;
  /** Unique identifier for the function being traced */
  functionId?: string;
  /** Additional metadata to attach to telemetry events */
  metadata?: Record<string, string | number | boolean | string[] | undefined>;
}

/**
 * Options for creating Vercel telemetry settings.
 */
export interface CreateVercelSettingsOptions {
  /** Whether telemetry is enabled (default: true) */
  enabled?: boolean;
  /** Function identifier for tracing */
  functionId?: string;
  /** User identifier for attribution */
  userId?: string;
  /** Session identifier for grouping related requests */
  sessionId?: string;
  /** Environment name (defaults to NODE_ENV) */
  environment?: string;
  /** Additional metadata to include */
  additionalMetadata?: Record<string, string | number | boolean>;
}

/**
 * Create Vercel AI SDK compatible telemetry settings.
 *
 * @example
 * ```typescript
 * import { generateText } from 'ai';
 * import { createVercelTelemetrySettings } from './vercel-integration';
 *
 * const result = await generateText({
 *   model: openai('gpt-4'),
 *   prompt: 'Hello',
 *   experimental_telemetry: createVercelTelemetrySettings({
 *     functionId: 'chat-completion',
 *     userId: 'user-123',
 *     sessionId: 'session-456',
 *   }),
 * });
 * ```
 */
export function createVercelTelemetrySettings(
  options: CreateVercelSettingsOptions = {}
): VercelTelemetrySettings {
  const metadata: Record<string, string | number | boolean | string[] | undefined> = {
    ...options.additionalMetadata,
  };

  // Only include defined values in metadata
  if (options.userId !== undefined) {
    metadata.userId = options.userId;
  }
  if (options.sessionId !== undefined) {
    metadata.sessionId = options.sessionId;
  }

  // Environment defaults to NODE_ENV if not specified
  metadata.environment = options.environment ?? process.env.NODE_ENV;

  return {
    isEnabled: options.enabled ?? true,
    functionId: options.functionId,
    metadata,
  };
}

/**
 * Token usage data extracted from Vercel AI SDK responses.
 */
export interface VercelTokenUsage {
  /** Number of tokens in the prompt */
  promptTokens?: number;
  /** Number of tokens in the completion */
  completionTokens?: number;
  /** Total tokens used */
  totalTokens?: number;
}

/**
 * Extract telemetry data from a Vercel AI SDK response.
 * Handles both camelCase and snake_case property names.
 *
 * @example
 * ```typescript
 * import { generateText } from 'ai';
 * import { extractVercelTelemetryData } from './vercel-integration';
 *
 * const result = await generateText({ ... });
 * const usage = extractVercelTelemetryData(result);
 * console.log(`Tokens used: ${usage.totalTokens}`);
 * ```
 */
export function extractVercelTelemetryData(response: unknown): VercelTokenUsage {
  if (!response || typeof response !== "object") {
    return {};
  }

  const r = response as Record<string, unknown>;
  const usage = r.usage as Record<string, number> | undefined;

  if (!usage) {
    return {};
  }

  return {
    promptTokens: usage.promptTokens ?? usage.prompt_tokens,
    completionTokens: usage.completionTokens ?? usage.completion_tokens,
    totalTokens: usage.totalTokens ?? usage.total_tokens,
  };
}

/**
 * Check if a response has token usage information.
 */
export function hasTokenUsage(response: unknown): boolean {
  const usage = extractVercelTelemetryData(response);
  return usage.totalTokens !== undefined || usage.promptTokens !== undefined;
}
