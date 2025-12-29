/**
 * Streaming Module
 *
 * Provides utilities for handling streaming responses from LLM providers.
 * Includes collectors, actions, and helper functions for building
 * complete responses from incremental events.
 *
 * @module @vellum/core/streaming
 */

export {
  AdaptiveBackpressure,
  type AdaptiveBackpressureConfig,
  type BackpressureConfig,
  // Classes
  BackpressureController,
  // Types
  type BackpressureState,
  type BackpressureStrategy,
  DEFAULT_ADAPTIVE_CONFIG,
  // Constants
  DEFAULT_BACKPRESSURE_CONFIG,
  LatencyTracker,
  ThroughputTracker,
} from "./backpressure.js";
export {
  // Classes
  CitationCollector,
} from "./citation.js";
export {
  type AssistantMessage,
  type CollectorAction,
  // Classes
  StreamCollector,
  type StreamMessagePart,
  type StreamReasoningPart,
  type StreamTextPart,
  type StreamToolPart,
  // Types
  type Usage,
} from "./collector.js";
export {
  // Types
  type StreamContext,
  // Classes
  StreamingHookManager,
  type StreamingHooks,
} from "./hooks.js";
export {
  // Types
  type LogLevel,
  // Classes
  StreamLogger,
  type StreamLoggerConfig,
} from "./logging.js";
export {
  type MCPStreamEvent,
  // Classes
  MCPStreamHandler,
  type MCPToolCallback,
  type MCPToolState,
  // Types
  type MCPToolStatus,
} from "./mcp-handler.js";
export {
  // Constants
  DEFAULT_NEWLINE_GATE_CONFIG,
  // Classes
  NewlineGate,
  // Types
  type NewlineGateConfig,
} from "./newline-gate.js";
export {
  type BlockProcessor,
  // Functions
  processMultiBlockStream,
  ReasoningBlockProcessor,
  // Types
  type StreamError,
  // Classes
  StreamProcessor,
  type StreamProcessorConfig,
  type StreamProcessorHooks,
  TextBlockProcessor,
  type UiEvent,
  type UiEventHandler,
} from "./processor.js";
