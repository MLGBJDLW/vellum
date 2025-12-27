/**
 * Telemetry type definitions for OpenTelemetry integration
 * @module telemetry/types
 */

/**
 * Configuration for telemetry/tracing setup
 */
export interface TelemetryConfig {
  /** Whether telemetry is enabled */
  enabled: boolean;
  /** Service name for resource identification */
  serviceName?: string;
  /** Service version for resource identification */
  serviceVersion?: string;
  /** Type of span exporter to use */
  exporterType: "console" | "otlp" | "none";
  /** OTLP endpoint URL (required when exporterType is 'otlp') */
  otlpEndpoint?: string;
  /** Sampling ratio from 0.0 to 1.0 (default: 1.0) */
  samplingRatio?: number;
}

/**
 * Metadata for LLM API calls used in span attributes
 */
export interface LLMCallMetadata {
  /** LLM provider (e.g., 'openai', 'anthropic', 'google') */
  provider: string;
  /** Model identifier (e.g., 'gpt-4', 'claude-3-opus') */
  model: string;
  /** Unique request identifier for correlation */
  requestId: string;
  /** Type of LLM operation */
  operation: "chat" | "completion" | "embedding";
}

/**
 * Response data from LLM calls for metrics
 */
export interface LLMResponseData {
  /** Number of tokens in the prompt/input */
  promptTokens?: number;
  /** Number of tokens in the completion/output */
  completionTokens?: number;
  /** Total tokens used (prompt + completion) */
  totalTokens?: number;
  /** Reason the model stopped generating */
  finishReason?: string;
}

/**
 * Semantic conventions for gen_ai.* attributes
 * Following OpenTelemetry Semantic Conventions for Generative AI
 * @see https://opentelemetry.io/docs/specs/semconv/gen-ai/
 */
export const LLM_SEMANTIC_CONVENTIONS = {
  /** The name of the GenAI system (e.g., openai, anthropic) */
  PROVIDER: "gen_ai.system",
  /** The name of the model being used */
  MODEL: "gen_ai.request.model",
  /** The name of the operation being performed */
  OPERATION: "gen_ai.operation.name",
  /** The unique identifier for the request */
  REQUEST_ID: "gen_ai.request.id",
  /** The number of tokens in the input/prompt */
  PROMPT_TOKENS: "gen_ai.usage.input_tokens",
  /** The number of tokens in the output/completion */
  COMPLETION_TOKENS: "gen_ai.usage.output_tokens",
  /** The reason(s) the model stopped generating */
  FINISH_REASON: "gen_ai.response.finish_reasons",
} as const;

/** Type for LLM semantic convention keys */
export type LLMSemanticConventionKey = keyof typeof LLM_SEMANTIC_CONVENTIONS;

/** Type for LLM semantic convention values */
export type LLMSemanticConventionValue =
  (typeof LLM_SEMANTIC_CONVENTIONS)[LLMSemanticConventionKey];
