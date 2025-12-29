// ============================================
// Combined Loop Detection (T040)
// ============================================

/**
 * Combined loop detection integrating doom loop and LLM stuck detection.
 *
 * Provides a unified interface for detecting both types of loops
 * with confidence scoring and action recommendations.
 *
 * @module @vellum/core/agent/loop-detection
 */

import { type DoomLoopResult, detectDoomLoop, type ToolCall } from "./doom.js";
import {
  extractTextFromMessages,
  LLMStuckDetector,
  type StuckDetectorConfig,
  type StuckResult,
} from "./stuck-detector.js";

/**
 * Types of detected loops.
 */
export type LoopType = "doom_loop" | "llm_stuck" | "none";

/**
 * Suggested actions for loop handling.
 */
export type LoopAction = "continue" | "warn" | "intervene" | "terminate";

/**
 * Combined result from all loop detection methods.
 */
export interface CombinedLoopResult {
  /** Type of loop detected */
  type: LoopType;
  /** Whether any loop was detected */
  detected: boolean;
  /** Confidence score for the detection (0-1) */
  confidence: number;
  /** Suggested action to take */
  suggestedAction: LoopAction;
  /** Details about doom loop detection */
  doomLoop?: DoomLoopResult;
  /** Details about LLM stuck detection */
  stuckDetection?: StuckResult;
  /** Human-readable description */
  description?: string;
}

/**
 * Configuration for combined loop detection.
 */
export interface LoopDetectionConfig {
  /** Enable doom loop detection */
  enableDoomLoop?: boolean;
  /** Number of identical tool calls to trigger doom loop detection */
  doomLoopThreshold?: number;
  /** Enable LLM stuck detection */
  enableStuckDetection?: boolean;
  /** Configuration for stuck detection */
  stuckDetectorConfig?: StuckDetectorConfig;
}

/**
 * Default configuration for loop detection.
 */
export const DEFAULT_LOOP_DETECTION_CONFIG: Required<LoopDetectionConfig> = {
  enableDoomLoop: true,
  doomLoopThreshold: 3,
  enableStuckDetection: true,
  stuckDetectorConfig: {
    threshold: 0.85,
    windowSize: 3,
    ngramSize: 3,
    enableLLMFallback: false,
    borderlineZone: [0.75, 0.9],
  },
};

/**
 * Context for loop detection.
 */
export interface LoopDetectionContext {
  /** Recent tool calls for doom loop detection */
  toolCalls: ToolCall[];
  /** Recent LLM response texts for stuck detection */
  responses: string[];
}

/**
 * Detects loops in agent execution.
 *
 * Combines doom loop detection (identical tool calls) and LLM stuck
 * detection (similar responses) into a unified result.
 *
 * @example
 * ```typescript
 * const result = detectLoop({
 *   toolCalls: [
 *     { id: "1", name: "read", input: { path: "x" } },
 *     { id: "2", name: "read", input: { path: "x" } },
 *     { id: "3", name: "read", input: { path: "x" } },
 *   ],
 *   responses: [
 *     "I cannot access that file.",
 *     "I'm unable to access that file.",
 *     "I can not access that file.",
 *   ],
 * });
 *
 * if (result.detected) {
 *   console.log(`${result.type} detected with ${result.confidence} confidence`);
 *   console.log(`Suggested action: ${result.suggestedAction}`);
 * }
 * ```
 *
 * @param context - Detection context with tool calls and responses
 * @param config - Optional configuration overrides
 * @returns Combined detection result
 */
export function detectLoop(
  context: LoopDetectionContext,
  config: LoopDetectionConfig = {}
): CombinedLoopResult {
  const cfg = { ...DEFAULT_LOOP_DETECTION_CONFIG, ...config };

  let doomLoopResult: DoomLoopResult | undefined;
  let stuckResult: StuckResult | undefined;

  // Run doom loop detection
  if (cfg.enableDoomLoop && context.toolCalls.length >= cfg.doomLoopThreshold) {
    doomLoopResult = detectDoomLoop(context.toolCalls, { threshold: cfg.doomLoopThreshold });
  }

  // Run LLM stuck detection
  if (
    cfg.enableStuckDetection &&
    context.responses.length >= (cfg.stuckDetectorConfig?.windowSize ?? 3)
  ) {
    const detector = new LLMStuckDetector(cfg.stuckDetectorConfig);
    stuckResult = detector.detect(context.responses);
  }

  // Determine result based on detection outcomes
  return combineResults(doomLoopResult, stuckResult);
}

/**
 * Combines doom loop and stuck detection results.
 */
function combineResults(doomLoop?: DoomLoopResult, stuck?: StuckResult): CombinedLoopResult {
  const doomDetected = doomLoop?.detected ?? false;
  const stuckDetected = stuck?.isStuck ?? false;

  // Neither detected
  if (!doomDetected && !stuckDetected) {
    return {
      type: "none",
      detected: false,
      confidence: 1.0,
      suggestedAction: "continue",
      doomLoop,
      stuckDetection: stuck,
    };
  }

  // Both detected - prioritize doom loop (more definitive)
  if (doomDetected && stuckDetected) {
    return {
      type: "doom_loop",
      detected: true,
      confidence: 1.0, // Doom loop is deterministic
      suggestedAction: "terminate",
      doomLoop,
      stuckDetection: stuck,
      description: "Detected identical repeated tool calls and highly similar responses",
    };
  }

  // Only doom loop detected
  if (doomDetected) {
    return {
      type: "doom_loop",
      detected: true,
      confidence: 1.0,
      suggestedAction: "terminate",
      doomLoop,
      stuckDetection: stuck,
      description: `Detected ${doomLoop?.repeatCount} identical tool calls: ${doomLoop?.repeatedCall?.name}`,
    };
  }

  // Only stuck detected
  const stuckConfidence = stuck?.confidence ?? 0;
  const similarity = stuck?.similarityScore ?? 0;

  return {
    type: "llm_stuck",
    detected: true,
    confidence: stuckConfidence,
    suggestedAction: mapStuckAction(stuck?.suggestedAction),
    doomLoop,
    stuckDetection: stuck,
    description: `LLM producing similar responses (${(similarity * 100).toFixed(1)}% similarity)`,
  };
}

/**
 * Maps stuck detector action to loop action.
 */
function mapStuckAction(action?: "continue" | "intervene" | "terminate"): LoopAction {
  switch (action) {
    case "terminate":
      return "terminate";
    case "intervene":
      return "intervene";
    case "continue":
      return "continue";
    default:
      return "warn";
  }
}

/**
 * Async loop detection with LLM fallback for borderline cases.
 *
 * @param context - Detection context
 * @param config - Optional configuration
 * @returns Promise resolving to combined detection result
 */
export async function detectLoopAsync(
  context: LoopDetectionContext,
  config: LoopDetectionConfig = {}
): Promise<CombinedLoopResult> {
  const cfg = { ...DEFAULT_LOOP_DETECTION_CONFIG, ...config };

  let doomLoopResult: DoomLoopResult | undefined;
  let stuckResult: StuckResult | undefined;

  // Run doom loop detection (synchronous)
  if (cfg.enableDoomLoop && context.toolCalls.length >= cfg.doomLoopThreshold) {
    doomLoopResult = detectDoomLoop(context.toolCalls, { threshold: cfg.doomLoopThreshold });
  }

  // Run LLM stuck detection (async with potential LLM fallback)
  if (
    cfg.enableStuckDetection &&
    context.responses.length >= (cfg.stuckDetectorConfig?.windowSize ?? 3)
  ) {
    const detector = new LLMStuckDetector(cfg.stuckDetectorConfig);
    stuckResult = await detector.detectAsync(context.responses);
  }

  return combineResults(doomLoopResult, stuckResult);
}

/**
 * Creates a loop detection context from messages.
 *
 * @param toolCalls - Array of tool calls
 * @param messages - Array of messages with text content
 * @returns LoopDetectionContext
 */
export function createLoopDetectionContext<T extends { text?: string; content?: string }>(
  toolCalls: ToolCall[],
  messages: T[]
): LoopDetectionContext {
  return {
    toolCalls,
    responses: extractTextFromMessages(messages),
  };
}

/**
 * Quick check if any loop condition is approaching threshold.
 *
 * Useful for early warning before full detection triggers.
 *
 * @param context - Detection context
 * @param config - Optional configuration
 * @returns Warning level: "none", "approaching", "detected"
 */
export function getLoopWarningLevel(
  context: LoopDetectionContext,
  config: LoopDetectionConfig = {}
): "none" | "approaching" | "detected" {
  const result = detectLoop(context, config);

  if (result.detected) {
    return "detected";
  }

  // Check if approaching doom loop
  const cfg = { ...DEFAULT_LOOP_DETECTION_CONFIG, ...config };
  if (context.toolCalls.length >= cfg.doomLoopThreshold - 1) {
    const lastCalls = context.toolCalls.slice(-(cfg.doomLoopThreshold - 1));
    const serialized = lastCalls.map((c) => JSON.stringify({ name: c.name, input: c.input }));
    const allSame = serialized.every((s) => s === serialized[0]);
    if (allSame) {
      return "approaching";
    }
  }

  // Check if approaching stuck threshold
  if (result.stuckDetection?.similarityScore) {
    const threshold = cfg.stuckDetectorConfig?.threshold ?? 0.85;
    if (result.stuckDetection.similarityScore >= threshold * 0.8) {
      return "approaching";
    }
  }

  return "none";
}
