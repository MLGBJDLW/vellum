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
  // Types
  type Usage,
  type StreamTextPart,
  type StreamReasoningPart,
  type StreamToolPart,
  type StreamMessagePart,
  type AssistantMessage,
  type CollectorAction,
  // Classes
  StreamCollector,
} from "./collector.js";

export {
  // Types
  type NewlineGateConfig,
  // Constants
  DEFAULT_NEWLINE_GATE_CONFIG,
  // Classes
  NewlineGate,
} from "./newline-gate.js";

export {
  // Types
  type BackpressureState,
  type BackpressureStrategy,
  type BackpressureConfig,
  type AdaptiveBackpressureConfig,
  // Constants
  DEFAULT_BACKPRESSURE_CONFIG,
  DEFAULT_ADAPTIVE_CONFIG,
  // Classes
  BackpressureController,
  ThroughputTracker,
  LatencyTracker,
  AdaptiveBackpressure,
} from "./backpressure.js";

export {
  // Types
  type StreamError,
  type UiEvent,
  type UiEventHandler,
  type BlockProcessor,
  type StreamProcessorConfig,
  type StreamProcessorHooks,
  // Classes
  StreamProcessor,
  TextBlockProcessor,
  ReasoningBlockProcessor,
  // Functions
  processMultiBlockStream,
} from "./processor.js";

export {
  // Types
  type MCPToolStatus,
  type MCPToolState,
  type MCPStreamEvent,
  type MCPToolCallback,
  // Classes
  MCPStreamHandler,
} from "./mcp-handler.js";

export {
  // Classes
  CitationCollector,
} from "./citation.js";

export {
  // Types
  type StreamContext,
  type StreamingHooks,
  // Classes
  StreamingHookManager,
} from "./hooks.js";

export {
  // Types
  type LogLevel,
  type StreamLoggerConfig,
  // Classes
  StreamLogger,
} from "./logging.js";
