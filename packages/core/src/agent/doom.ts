// ============================================
// Doom Loop Detection (T018)
// ============================================

/**
 * Detects doom loops in agent tool execution.
 *
 * A doom loop occurs when the agent repeatedly makes identical tool calls,
 * indicating it's stuck in a non-productive cycle.
 *
 * @module @vellum/core/agent/doom
 */

/**
 * Represents a tool call for doom loop detection.
 */
export interface ToolCall {
  /** Tool call identifier */
  id: string;
  /** Tool name */
  name: string;
  /** Tool input parameters */
  input: Record<string, unknown>;
}

/**
 * Result of doom loop detection.
 */
export interface DoomLoopResult {
  /** Whether a doom loop was detected */
  detected: boolean;
  /** The repeated tool call (if detected) */
  repeatedCall?: ToolCall;
  /** Number of consecutive identical calls found */
  repeatCount?: number;
}

/**
 * Options for doom loop detection.
 */
export interface DoomLoopOptions {
  /** Number of identical consecutive calls to trigger detection (default: 3) */
  threshold?: number;
  /** Whether to include tool id in comparison (default: false) */
  includeId?: boolean;
}

/**
 * Default options for doom loop detection.
 */
export const DEFAULT_DOOM_LOOP_OPTIONS: Required<DoomLoopOptions> = {
  threshold: 3,
  includeId: false,
};

/**
 * Serializes a tool call for comparison.
 *
 * By default, excludes the id field since it's always unique.
 *
 * @param call - Tool call to serialize
 * @param includeId - Whether to include the id in serialization
 * @returns JSON string representation
 */
export function serializeToolCall(call: ToolCall, includeId = false): string {
  if (includeId) {
    return JSON.stringify({
      id: call.id,
      name: call.name,
      input: call.input,
    });
  }
  return JSON.stringify({
    name: call.name,
    input: call.input,
  });
}

/**
 * Detects if recent tool calls form a doom loop.
 *
 * A doom loop is detected when the last N (threshold) tool calls
 * are identical by name and input parameters.
 *
 * @example
 * ```typescript
 * const toolCalls = [
 *   { id: "1", name: "read_file", input: { path: "test.txt" } },
 *   { id: "2", name: "read_file", input: { path: "test.txt" } },
 *   { id: "3", name: "read_file", input: { path: "test.txt" } },
 * ];
 *
 * const result = detectDoomLoop(toolCalls);
 * // { detected: true, repeatedCall: { id: "3", ... }, repeatCount: 3 }
 * ```
 *
 * @param toolCalls - Array of recent tool calls
 * @param options - Detection options
 * @returns DoomLoopResult indicating whether a doom loop was detected
 */
export function detectDoomLoop(
  toolCalls: ToolCall[],
  options: DoomLoopOptions = {}
): DoomLoopResult {
  const { threshold, includeId } = { ...DEFAULT_DOOM_LOOP_OPTIONS, ...options };

  // Not enough calls to detect doom loop
  if (toolCalls.length < threshold) {
    return { detected: false };
  }

  // Get the last N tool calls
  const recentCalls = toolCalls.slice(-threshold);

  // Serialize for comparison
  const serialized = recentCalls.map((call) => serializeToolCall(call, includeId));

  // Check if all are identical to the first
  const reference = serialized[0];
  const allIdentical = serialized.every((s) => s === reference);

  if (allIdentical) {
    return {
      detected: true,
      repeatedCall: recentCalls[recentCalls.length - 1],
      repeatCount: threshold,
    };
  }

  return { detected: false };
}

/**
 * Counts consecutive identical tool calls from the end.
 *
 * @param toolCalls - Array of tool calls
 * @param includeId - Whether to include id in comparison
 * @returns Number of consecutive identical calls from the end
 */
export function countConsecutiveIdenticalCalls(toolCalls: ToolCall[], includeId = false): number {
  if (toolCalls.length === 0) {
    return 0;
  }

  const lastCall = toolCalls[toolCalls.length - 1] as ToolCall;
  const lastSerialized = serializeToolCall(lastCall, includeId);

  let count = 1;
  for (let i = toolCalls.length - 2; i >= 0; i--) {
    const call = toolCalls[i] as ToolCall;
    const serialized = serializeToolCall(call, includeId);
    if (serialized === lastSerialized) {
      count++;
    } else {
      break;
    }
  }

  return count;
}

/**
 * Creates a ToolCall object from raw parameters.
 *
 * @param id - Tool call identifier
 * @param name - Tool name
 * @param input - Tool input parameters
 * @returns ToolCall object
 */
export function createToolCall(id: string, name: string, input: Record<string, unknown>): ToolCall {
  return { id, name, input };
}
