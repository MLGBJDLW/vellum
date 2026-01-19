// ============================================
// LLM Loop Verifier (T041)
// ============================================

/**
 * LLM-based loop detection for verifying stuck/loop states.
 *
 * Uses an LLM to analyze conversation history and detect repetitive patterns
 * with confidence scoring. Designed for borderline cases where similarity-based
 * detection is uncertain.
 *
 * Reference: Gemini CLI loopDetectionService.ts pattern
 *
 * @module @vellum/core/agent/llm-loop-verifier
 */

import type { CompletionMessage, LLMProvider } from "@vellum/provider";
import type { SessionMessage } from "../session/message.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Result of LLM-based loop verification.
 */
export interface LLMLoopCheckResult {
  /** Whether the conversation appears to be stuck in a loop */
  isStuck: boolean;
  /** Confidence score for the detection (0.0 - 1.0) */
  confidence: number;
  /** LLM's analysis/explanation of the detection */
  analysis: string;
  /** Error message if verification failed */
  error?: string;
}

/**
 * Configuration for LLMLoopVerifier.
 */
export interface LLMLoopVerifierConfig {
  /**
   * Confidence threshold above which to consider the result definitive.
   * Only results with confidence >= threshold will be trusted.
   * @default 0.9
   */
  confidenceThreshold?: number;
  /**
   * Number of turns to wait between LLM verification checks.
   * Prevents excessive LLM calls for loop detection.
   * @default 30
   */
  checkIntervalTurns?: number;
  /**
   * Maximum number of messages to include in analysis.
   * More messages provide better context but increase cost.
   * @default 20
   */
  maxHistoryMessages?: number;
  /**
   * Model to use for verification (defaults to provider's default).
   */
  model?: string;
  /**
   * Temperature for verification calls (lower = more deterministic).
   * @default 0.0
   */
  temperature?: number;
}

/**
 * Default configuration values.
 */
export const DEFAULT_LLM_LOOP_VERIFIER_CONFIG: Required<Omit<LLMLoopVerifierConfig, "model">> = {
  confidenceThreshold: 0.9,
  checkIntervalTurns: 30,
  maxHistoryMessages: 20,
  temperature: 0.0,
};

// =============================================================================
// System Prompt
// =============================================================================

/**
 * System prompt for LLM-based loop detection.
 */
const LOOP_DETECTION_SYSTEM_PROMPT = `You are analyzing a conversation between a user and an AI assistant to detect if the assistant is stuck in a repetitive loop.

Analyze the conversation history for these patterns:
1. REPETITIVE RESPONSES: The assistant gives nearly identical responses multiple times
2. CIRCULAR TOOL CALLS: The same tools are called repeatedly with similar inputs
3. NO PROGRESS: The assistant acknowledges a problem but fails to make progress
4. OSCILLATING BEHAVIOR: The assistant alternates between similar states without resolving
5. ERROR LOOPS: The same errors occur repeatedly without effective resolution attempts

Output your analysis as JSON with this exact structure:
{
  "isStuck": boolean,
  "confidence": number,
  "analysis": string
}

Where:
- isStuck: true if the assistant appears stuck in a loop, false otherwise
- confidence: your confidence in this assessment from 0.0 (no confidence) to 1.0 (certain)
- analysis: brief explanation of your reasoning (1-2 sentences)

Be conservative: only mark as stuck with high confidence (>0.9) if there's clear evidence of repetitive behavior that prevents task progress.`;

// =============================================================================
// LLMLoopVerifier Class
// =============================================================================

/**
 * Verifies loop/stuck states using LLM analysis.
 *
 * Uses an LLM to analyze recent conversation history and detect patterns
 * that indicate the agent is stuck. Designed to complement similarity-based
 * detection for borderline cases.
 *
 * @example
 * ```typescript
 * const verifier = new LLMLoopVerifier(provider, {
 *   confidenceThreshold: 0.9,
 *   checkIntervalTurns: 30,
 * });
 *
 * if (verifier.shouldCheck()) {
 *   const result = await verifier.verify(messages);
 *   if (result.isStuck && result.confidence >= 0.9) {
 *     console.log('Loop detected:', result.analysis);
 *   }
 * }
 * ```
 */
export class LLMLoopVerifier {
  private readonly config: Required<Omit<LLMLoopVerifierConfig, "model">> & {
    model?: string;
  };
  private turnsSinceLastCheck = 0;

  constructor(
    private readonly provider: LLMProvider,
    config?: LLMLoopVerifierConfig
  ) {
    this.config = {
      ...DEFAULT_LLM_LOOP_VERIFIER_CONFIG,
      ...config,
    };
  }

  /**
   * Gets the current configuration.
   */
  getConfig(): LLMLoopVerifierConfig {
    return { ...this.config };
  }

  /**
   * Increments the turn counter and checks if LLM verification should run.
   *
   * Call this method each turn to track when to run LLM verification.
   * Only returns true every checkIntervalTurns turns to prevent excessive calls.
   *
   * @returns true if enough turns have passed since last check
   */
  shouldCheck(): boolean {
    this.turnsSinceLastCheck++;
    return this.turnsSinceLastCheck >= this.config.checkIntervalTurns;
  }

  /**
   * Checks if verification is due without incrementing the counter.
   *
   * @returns true if enough turns have passed since last check
   */
  isDue(): boolean {
    return this.turnsSinceLastCheck >= this.config.checkIntervalTurns;
  }

  /**
   * Gets the number of turns since the last LLM check.
   */
  getTurnsSinceLastCheck(): number {
    return this.turnsSinceLastCheck;
  }

  /**
   * Resets the turn counter after a check or on conversation reset.
   */
  reset(): void {
    this.turnsSinceLastCheck = 0;
  }

  /**
   * Marks that a check has been performed, resetting the turn counter.
   */
  markChecked(): void {
    this.turnsSinceLastCheck = 0;
  }

  /**
   * Runs LLM-based loop verification on the conversation history.
   *
   * Analyzes recent messages to detect repetitive patterns that indicate
   * the agent is stuck. Returns confidence-scored results.
   *
   * @param messages - Recent conversation messages to analyze
   * @returns LLMLoopCheckResult with detection result and confidence
   */
  async verify(messages: SessionMessage[]): Promise<LLMLoopCheckResult> {
    // Mark that we're performing a check
    this.markChecked();

    // Get recent messages for analysis
    const recentMessages = messages.slice(-this.config.maxHistoryMessages);

    if (recentMessages.length < 3) {
      return {
        isStuck: false,
        confidence: 1.0,
        analysis: "Insufficient conversation history for loop detection",
      };
    }

    try {
      // Convert SessionMessages to CompletionMessages for the provider
      const analysisMessages = this.formatMessagesForAnalysis(recentMessages);

      // Build the analysis request
      const completionMessages: CompletionMessage[] = [
        {
          role: "user",
          content: `Analyze this conversation for loop/stuck patterns:\n\n${analysisMessages}`,
        },
      ];

      // Call the LLM for analysis
      const result = await this.callLLM(completionMessages);
      return result;
    } catch (error) {
      // On error, return safe default (not stuck) with low confidence
      return {
        isStuck: false,
        confidence: 0.0,
        analysis: "Failed to perform LLM verification",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Formats session messages into a readable string for analysis.
   */
  private formatMessagesForAnalysis(messages: SessionMessage[]): string {
    const formatted: string[] = [];

    for (const msg of messages) {
      const role = msg.role.toUpperCase();
      const parts: string[] = [];

      for (const part of msg.parts) {
        switch (part.type) {
          case "text":
            parts.push(part.text);
            break;
          case "tool":
            parts.push(`[Tool Call: ${part.name}(${JSON.stringify(part.input)})]`);
            break;
          case "tool_result": {
            const content =
              typeof part.content === "string" ? part.content : JSON.stringify(part.content);
            const truncated = content.substring(0, 200);
            parts.push(
              `[Tool Result: ${part.toolId} -> ${truncated}${content.length > 200 ? "..." : ""}]`
            );
            break;
          }
          case "reasoning":
            parts.push(`[Reasoning: ${part.text.substring(0, 100)}...]`);
            break;
        }
      }

      if (parts.length > 0) {
        formatted.push(`${role}: ${parts.join("\n")}`);
      }
    }

    return formatted.join("\n\n---\n\n");
  }

  /**
   * Calls the LLM provider for loop analysis.
   */
  private async callLLM(messages: CompletionMessage[]): Promise<LLMLoopCheckResult> {
    // Use non-streaming completion for analysis
    const result = await this.provider.complete({
      model: this.config.model ?? "",
      messages: [{ role: "system", content: LOOP_DETECTION_SYSTEM_PROMPT }, ...messages],
      temperature: this.config.temperature,
      maxTokens: 500, // Keep response concise
    });

    // Parse the response
    return this.parseResponse(result.content);
  }

  /**
   * Parses the LLM response into a structured result.
   */
  private parseResponse(content: string): LLMLoopCheckResult {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          isStuck: false,
          confidence: 0.0,
          analysis: "Failed to parse LLM response: no JSON found",
          error: "Invalid response format",
        };
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        isStuck?: boolean;
        confidence?: number;
        analysis?: string;
      };

      // Validate required fields
      if (typeof parsed.isStuck !== "boolean") {
        return {
          isStuck: false,
          confidence: 0.0,
          analysis: "Failed to parse LLM response: missing isStuck field",
          error: "Invalid response format",
        };
      }

      // Clamp confidence to valid range
      const confidence = Math.max(0, Math.min(1, parsed.confidence ?? 0));

      return {
        isStuck: parsed.isStuck,
        confidence,
        analysis: parsed.analysis ?? "No analysis provided",
      };
    } catch (error) {
      return {
        isStuck: false,
        confidence: 0.0,
        analysis: "Failed to parse LLM response",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Checks if a result meets the confidence threshold.
   *
   * @param result - The verification result to check
   * @returns true if the result's confidence meets or exceeds the threshold
   */
  meetsConfidenceThreshold(result: LLMLoopCheckResult): boolean {
    return result.confidence >= this.config.confidenceThreshold;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Creates an LLMLoopVerifier with the given configuration.
 *
 * @param provider - LLM provider for verification calls
 * @param config - Optional configuration overrides
 * @returns Configured LLMLoopVerifier instance
 */
export function createLLMLoopVerifier(
  provider: LLMProvider,
  config?: LLMLoopVerifierConfig
): LLMLoopVerifier {
  return new LLMLoopVerifier(provider, config);
}

/**
 * Creates an LLMJudgmentCallback compatible with LLMStuckDetector.
 *
 * This adapter allows LLMLoopVerifier to be used as the llmJudgmentCallback
 * in LLMStuckDetector for borderline case verification.
 *
 * @param verifier - The LLMLoopVerifier instance to use
 * @param messages - Full message history for context
 * @returns LLMJudgmentCallback function
 */
export function createLLMJudgmentCallback(
  verifier: LLMLoopVerifier,
  getMessages: () => SessionMessage[]
): (
  responses: string[],
  stats: { average: number }
) => Promise<{ isStuck: boolean; confidence: number }> {
  return async (_responses: string[], _stats: { average: number }) => {
    const messages = getMessages();
    const result = await verifier.verify(messages);
    return {
      isStuck: result.isStuck,
      confidence: result.confidence,
    };
  };
}
