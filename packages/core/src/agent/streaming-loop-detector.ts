// ============================================
// Streaming Loop Detector (T041+)
// ============================================

/**
 * Detects loops during LLM streaming, not just after turn completion.
 *
 * Tracks content patterns and tool calls as chunks arrive, enabling
 * earlier interruption to save tokens and avoid wasted computation.
 *
 * @module @vellum/core/agent/streaming-loop-detector
 */

import type { StreamEvent } from "@vellum/provider";

/**
 * Configuration for streaming loop detection.
 */
export interface StreamingLoopConfig {
  /** Number of identical tool calls (same name+args) to trigger detection (default: 3) */
  toolCallThreshold?: number;
  /** Number of identical content patterns to trigger detection (default: 5) */
  contentRepeatThreshold?: number;
  /** Minimum content length before tracking patterns (default: 100) */
  minContentLength?: number;
  /** Sliding window size for content pattern matching (default: 50) */
  patternWindowSize?: number;
}

/**
 * Default configuration for streaming loop detection.
 */
export const DEFAULT_STREAMING_LOOP_CONFIG: Required<StreamingLoopConfig> = {
  toolCallThreshold: 3,
  contentRepeatThreshold: 5,
  minContentLength: 100,
  patternWindowSize: 50,
};

/**
 * Types of loops detected during streaming.
 */
export type StreamingLoopType = "tool_repeat" | "content_repeat";

/**
 * Result of streaming loop check.
 */
export interface StreamingLoopResult {
  /** Whether a loop was detected */
  detected: boolean;
  /** Type of loop if detected */
  type?: StreamingLoopType;
  /** Human-readable evidence of the loop */
  evidence?: string;
  /** Confidence score (0-1) */
  confidence?: number;
}

/**
 * Internal state for debugging and inspection.
 */
export interface StreamingLoopState {
  /** Map of tool call hashes to their occurrence count */
  toolCallCounts: Map<string, number>;
  /** Recent content patterns tracked */
  contentPatterns: string[];
  /** Total accumulated content length */
  accumulatedContentLength: number;
  /** Number of stream events processed */
  eventsProcessed: number;
}

/**
 * Pending tool call being accumulated from stream deltas.
 */
interface PendingToolCall {
  id: string;
  name: string;
  argumentsJson: string;
}

/**
 * Hashes a tool call for comparison (name + normalized args).
 *
 * @param name - Tool name
 * @param args - Tool arguments (object or JSON string)
 * @returns Hash string for comparison
 */
function hashToolCall(name: string, args: Record<string, unknown> | string): string {
  const argsString = typeof args === "string" ? args : JSON.stringify(args);
  // Simple hash: concatenate name and sorted args
  return `${name}:${argsString}`;
}

/**
 * Extracts sliding window patterns from content.
 *
 * @param content - Full accumulated content
 * @param windowSize - Size of the sliding window
 * @param minLength - Minimum content length to start extraction
 * @returns Array of extracted patterns
 */
function extractPatterns(content: string, windowSize: number, minLength: number): string[] {
  if (content.length < minLength) {
    return [];
  }

  const patterns: string[] = [];
  // Extract patterns at regular intervals (every windowSize/2 chars)
  const step = Math.max(1, Math.floor(windowSize / 2));

  for (let i = 0; i <= content.length - windowSize; i += step) {
    patterns.push(content.slice(i, i + windowSize));
  }

  return patterns;
}

/**
 * Counts occurrences of each pattern in an array.
 *
 * @param patterns - Array of patterns
 * @returns Map of pattern to count
 */
function countPatternOccurrences(patterns: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const pattern of patterns) {
    counts.set(pattern, (counts.get(pattern) ?? 0) + 1);
  }
  return counts;
}

/**
 * Detects loops during LLM streaming.
 *
 * Processes stream events incrementally, tracking:
 * - Tool calls with same name and arguments
 * - Repeated content patterns using sliding window
 *
 * Can interrupt streaming early when loops are detected.
 *
 * @example
 * ```typescript
 * const detector = new StreamingLoopDetector({
 *   toolCallThreshold: 3,
 *   contentRepeatThreshold: 5,
 * });
 *
 * for await (const event of stream) {
 *   const result = detector.addAndCheck(event);
 *   if (result.detected) {
 *     console.log(`Loop detected: ${result.type}`);
 *     // Optionally interrupt the stream
 *     break;
 *   }
 * }
 *
 * // Reset for next turn
 * detector.reset();
 * ```
 */
export class StreamingLoopDetector {
  private readonly config: Required<StreamingLoopConfig>;

  /** Tool call hash -> occurrence count */
  private toolCallHistory: Map<string, number> = new Map();

  /** Accumulated text content from stream */
  private accumulatedContent = "";

  /** Tracked content patterns */
  private contentPatterns: string[] = [];

  /** Number of events processed */
  private eventsProcessed = 0;

  /** Pending tool calls being accumulated from deltas */
  private pendingToolCalls: Map<string, PendingToolCall> = new Map();

  /** Last detected result (cached for repeated queries) */
  private lastResult: StreamingLoopResult = { detected: false };

  constructor(config?: StreamingLoopConfig) {
    this.config = { ...DEFAULT_STREAMING_LOOP_CONFIG, ...config };
  }

  /**
   * Gets the current configuration.
   */
  getConfig(): Required<StreamingLoopConfig> {
    return { ...this.config };
  }

  /**
   * Process a stream event and check for loops.
   *
   * O(1) for most events, O(n) for content pattern extraction
   * where n is the pattern count (bounded by content length).
   *
   * @param event - Stream event to process
   * @returns Detection result
   */
  addAndCheck(event: StreamEvent): StreamingLoopResult {
    this.eventsProcessed++;

    switch (event.type) {
      case "text":
        return this.handleTextEvent(event.content);

      case "reasoning":
        // Also track reasoning content for patterns
        return this.handleTextEvent(event.content);

      case "tool_call_start":
        return this.handleToolCallStart(event.id, event.name);

      case "tool_call_delta":
        return this.handleToolCallDelta(event.id, event.arguments);

      case "tool_call_end":
        return this.handleToolCallEnd(event.id);

      case "toolCall":
        // Legacy complete tool call event
        return this.handleCompleteToolCall(event.id, event.name, event.input);

      default:
        // Other events don't affect loop detection
        return this.lastResult;
    }
  }

  /**
   * Handle text content event.
   */
  private handleTextEvent(content: string): StreamingLoopResult {
    this.accumulatedContent += content;

    // Check for content patterns if we have enough content
    if (this.accumulatedContent.length >= this.config.minContentLength) {
      const result = this.checkContentPatterns();
      if (result.detected) {
        this.lastResult = result;
        return result;
      }
    }

    return this.lastResult;
  }

  /**
   * Handle tool call start event.
   */
  private handleToolCallStart(id: string, name: string): StreamingLoopResult {
    this.pendingToolCalls.set(id, {
      id,
      name,
      argumentsJson: "",
    });
    return this.lastResult;
  }

  /**
   * Handle tool call delta event (incremental arguments).
   */
  private handleToolCallDelta(id: string, argsChunk: string): StreamingLoopResult {
    const pending = this.pendingToolCalls.get(id);
    if (pending) {
      pending.argumentsJson += argsChunk;
    }
    return this.lastResult;
  }

  /**
   * Handle tool call end event - finalize and check for repeats.
   */
  private handleToolCallEnd(id: string): StreamingLoopResult {
    const pending = this.pendingToolCalls.get(id);
    if (!pending) {
      return this.lastResult;
    }

    // Try to parse arguments
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(pending.argumentsJson || "{}");
    } catch {
      // Keep empty args if parse fails
    }

    const result = this.recordToolCall(pending.name, args);
    this.pendingToolCalls.delete(id);
    return result;
  }

  /**
   * Handle legacy complete tool call event.
   */
  private handleCompleteToolCall(
    _id: string,
    name: string,
    input: Record<string, unknown>
  ): StreamingLoopResult {
    return this.recordToolCall(name, input);
  }

  /**
   * Record a tool call and check for repeats.
   */
  private recordToolCall(name: string, args: Record<string, unknown>): StreamingLoopResult {
    const hash = hashToolCall(name, args);
    const count = (this.toolCallHistory.get(hash) ?? 0) + 1;
    this.toolCallHistory.set(hash, count);

    if (count >= this.config.toolCallThreshold) {
      this.lastResult = {
        detected: true,
        type: "tool_repeat",
        evidence: `Tool "${name}" called ${count}x with same arguments`,
        confidence: Math.min(1, count / (this.config.toolCallThreshold + 2)),
      };
      return this.lastResult;
    }

    return this.lastResult;
  }

  /**
   * Check accumulated content for repeated patterns.
   */
  private checkContentPatterns(): StreamingLoopResult {
    this.contentPatterns = extractPatterns(
      this.accumulatedContent,
      this.config.patternWindowSize,
      this.config.minContentLength
    );

    if (this.contentPatterns.length === 0) {
      return { detected: false };
    }

    const patternCounts = countPatternOccurrences(this.contentPatterns);

    // Find the most repeated pattern
    let maxCount = 0;
    let maxPattern = "";
    for (const [pattern, count] of patternCounts) {
      if (count > maxCount) {
        maxCount = count;
        maxPattern = pattern;
      }
    }

    if (maxCount >= this.config.contentRepeatThreshold) {
      // Truncate pattern for display (avoid long evidence strings)
      const displayPattern = maxPattern.length > 30 ? `${maxPattern.slice(0, 30)}...` : maxPattern;

      this.lastResult = {
        detected: true,
        type: "content_repeat",
        evidence: `Content pattern repeated ${maxCount}x: "${displayPattern}"`,
        confidence: Math.min(1, maxCount / (this.config.contentRepeatThreshold + 3)),
      };
      return this.lastResult;
    }

    return { detected: false };
  }

  /**
   * Reset detector state for a new turn.
   */
  reset(): void {
    this.toolCallHistory.clear();
    this.accumulatedContent = "";
    this.contentPatterns = [];
    this.eventsProcessed = 0;
    this.pendingToolCalls.clear();
    this.lastResult = { detected: false };
  }

  /**
   * Get current internal state for debugging.
   */
  getState(): StreamingLoopState {
    return {
      toolCallCounts: new Map(this.toolCallHistory),
      contentPatterns: [...this.contentPatterns],
      accumulatedContentLength: this.accumulatedContent.length,
      eventsProcessed: this.eventsProcessed,
    };
  }

  /**
   * Check if a loop has been detected without processing new events.
   */
  isLoopDetected(): boolean {
    return this.lastResult.detected;
  }

  /**
   * Get the last detection result.
   */
  getLastResult(): StreamingLoopResult {
    return { ...this.lastResult };
  }
}
