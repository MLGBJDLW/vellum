/**
 * Reasoning Block Handler
 *
 * Handles synthetic reasoning blocks for models that require explicit
 * chain-of-thought (CoT) reasoning, such as DeepSeek R1.
 *
 * Implements REQ-004: Reasoning block injection for compatible models.
 *
 * @module @vellum/core/context/reasoning-block
 */

import type { ContextMessage } from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Model family identifiers that require reasoning blocks.
 */
export type ReasoningModelFamily = "deepseek" | "deepseek-r1";

/**
 * Options for reasoning block handling.
 */
export interface ReasoningBlockOptions {
  /**
   * Custom thinking prefix for the reasoning block.
   *
   * @default "Let me analyze the context and summarize the key points..."
   */
  thinkingPrefix?: string;

  /**
   * Whether to include timestamps in reasoning blocks.
   *
   * @default false
   */
  includeTimestamp?: boolean;
}

/**
 * Result of adding a reasoning block to a message.
 */
export interface ReasoningBlockResult {
  /** The message with reasoning block added */
  readonly message: ContextMessage;
  /** Whether a reasoning block was added */
  readonly wasAdded: boolean;
  /** The reasoning content that was added (if any) */
  readonly reasoningContent?: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Model name patterns that indicate DeepSeek reasoning models.
 *
 * These models benefit from explicit reasoning blocks in summaries.
 */
const DEEPSEEK_PATTERNS = [
  /deepseek/i,
  /deep-seek/i,
  /deepseek-r1/i,
  /deepseek-v3/i,
  /deepseek-coder/i,
] as const;

/**
 * Default thinking prefix for reasoning blocks.
 */
const DEFAULT_THINKING_PREFIX = "Let me analyze the context and summarize the key points...";

/**
 * Default reasoning block template.
 */
const REASONING_BLOCK_TEMPLATE = `<thinking>
{prefix}

Context Analysis:
- Reviewing conversation history and key decisions
- Identifying important technical details
- Preserving critical information for continuation
</thinking>`;

// ============================================================================
// ReasoningBlockHandler
// ============================================================================

/**
 * Handles reasoning block injection for models that require explicit CoT.
 *
 * DeepSeek models and similar reasoning-focused LLMs perform better when
 * provided with explicit `<thinking>` blocks in assistant messages.
 * This handler detects when such blocks are needed and adds them.
 *
 * @example
 * ```typescript
 * const handler = new ReasoningBlockHandler();
 *
 * // Check if model needs reasoning blocks
 * if (handler.requiresReasoningBlock('deepseek-r1')) {
 *   const result = handler.addReasoningBlock(summaryMessage);
 *   console.log(result.message.reasoningContent);
 * }
 * ```
 */
export class ReasoningBlockHandler {
  private readonly thinkingPrefix: string;
  private readonly includeTimestamp: boolean;

  constructor(options: ReasoningBlockOptions = {}) {
    this.thinkingPrefix = options.thinkingPrefix ?? DEFAULT_THINKING_PREFIX;
    this.includeTimestamp = options.includeTimestamp ?? false;
  }

  /**
   * Get the configured thinking prefix.
   */
  getThinkingPrefix(): string {
    return this.thinkingPrefix;
  }

  /**
   * Check if a model requires reasoning blocks.
   *
   * @param modelName - The model identifier (e.g., "deepseek-r1", "gpt-4o")
   * @returns True if the model requires reasoning blocks
   *
   * @example
   * ```typescript
   * handler.requiresReasoningBlock('deepseek-r1');    // true
   * handler.requiresReasoningBlock('deepseek-coder'); // true
   * handler.requiresReasoningBlock('gpt-4o');         // false
   * handler.requiresReasoningBlock('claude-3-opus');  // false
   * ```
   */
  requiresReasoningBlock(modelName: string): boolean {
    if (!modelName) return false;

    return DEEPSEEK_PATTERNS.some((pattern) => pattern.test(modelName));
  }

  /**
   * Detect the model family from a model name.
   *
   * @param modelName - The model identifier
   * @returns The model family or undefined if not a reasoning model
   *
   * @example
   * ```typescript
   * handler.detectModelFamily('deepseek-r1');     // 'deepseek-r1'
   * handler.detectModelFamily('deepseek-coder'); // 'deepseek'
   * handler.detectModelFamily('gpt-4o');         // undefined
   * ```
   */
  detectModelFamily(modelName: string): ReasoningModelFamily | undefined {
    if (!modelName) return undefined;

    const lowerName = modelName.toLowerCase();

    if (lowerName.includes("deepseek-r1")) {
      return "deepseek-r1";
    }

    if (DEEPSEEK_PATTERNS.some((pattern) => pattern.test(modelName))) {
      return "deepseek";
    }

    return undefined;
  }

  /**
   * Add a reasoning block to a message.
   *
   * Creates a synthetic `<thinking>` block and adds it to the message's
   * `reasoningContent` field. If the message already has reasoning content,
   * it is preserved and the synthetic block is prepended.
   *
   * @param message - The message to add reasoning to
   * @returns Result with the updated message and metadata
   *
   * @example
   * ```typescript
   * const summaryMessage: ContextMessage = {
   *   id: 'summary-1',
   *   role: 'assistant',
   *   content: '## Summary...',
   *   priority: MessagePriority.ANCHOR,
   * };
   *
   * const result = handler.addReasoningBlock(summaryMessage);
   * // result.message.reasoningContent contains <thinking>...</thinking>
   * ```
   */
  addReasoningBlock(message: ContextMessage): ReasoningBlockResult {
    // Only add reasoning to assistant messages
    if (message.role !== "assistant") {
      return {
        message,
        wasAdded: false,
      };
    }

    // Generate reasoning content
    const reasoningContent = this.generateReasoningContent();

    // Combine with existing reasoning content if present
    const existingReasoning = message.reasoningContent;
    const combinedReasoning = existingReasoning
      ? `${reasoningContent}\n\n${existingReasoning}`
      : reasoningContent;

    // Create new message with reasoning
    const updatedMessage: ContextMessage = {
      ...message,
      reasoningContent: combinedReasoning,
    };

    return {
      message: updatedMessage,
      wasAdded: true,
      reasoningContent,
    };
  }

  /**
   * Process a message for a specific model, adding reasoning if needed.
   *
   * Convenience method that checks if the model requires reasoning and
   * adds the block if necessary.
   *
   * @param message - The message to process
   * @param modelName - The target model name
   * @returns Result with the processed message
   *
   * @example
   * ```typescript
   * // For DeepSeek, adds reasoning
   * const result = handler.processForModel(message, 'deepseek-r1');
   *
   * // For GPT-4, returns unchanged
   * const result = handler.processForModel(message, 'gpt-4o');
   * ```
   */
  processForModel(message: ContextMessage, modelName: string): ReasoningBlockResult {
    if (!this.requiresReasoningBlock(modelName)) {
      return {
        message,
        wasAdded: false,
      };
    }

    return this.addReasoningBlock(message);
  }

  /**
   * Generate the reasoning content string.
   */
  private generateReasoningContent(): string {
    let content = REASONING_BLOCK_TEMPLATE.replace("{prefix}", this.thinkingPrefix);

    if (this.includeTimestamp) {
      const timestamp = new Date().toISOString();
      content = content.replace("</thinking>", `\nGenerated at: ${timestamp}\n</thinking>`);
    }

    return content;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a reasoning block handler with default settings.
 *
 * @returns A new ReasoningBlockHandler with default options
 */
export function createReasoningBlockHandler(
  options?: ReasoningBlockOptions
): ReasoningBlockHandler {
  return new ReasoningBlockHandler(options);
}

/**
 * Quick check if a model requires reasoning blocks.
 *
 * @param modelName - The model identifier
 * @returns True if the model requires reasoning blocks
 *
 * @example
 * ```typescript
 * if (requiresReasoningBlock('deepseek-r1')) {
 *   // Add reasoning block to summary
 * }
 * ```
 */
export function requiresReasoningBlock(modelName: string): boolean {
  const handler = new ReasoningBlockHandler();
  return handler.requiresReasoningBlock(modelName);
}

/**
 * Add a reasoning block to a message (standalone function).
 *
 * @param message - The message to add reasoning to
 * @param options - Optional handler configuration
 * @returns Result with the updated message
 */
export function addReasoningBlock(
  message: ContextMessage,
  options?: ReasoningBlockOptions
): ReasoningBlockResult {
  const handler = new ReasoningBlockHandler(options);
  return handler.addReasoningBlock(message);
}

// ============================================================================
// Reasoning Content Extraction (REQ-007)
// ============================================================================

/**
 * Result of extracting reasoning content from messages.
 */
export interface ExtractedReasoning {
  /** Key conclusions extracted from reasoning blocks */
  readonly conclusions: string[];
  /** Number of messages that contained reasoning */
  readonly messagesWithReasoning: number;
  /** Combined reasoning text for summary inclusion */
  readonly summaryText: string;
}

/**
 * Pattern to match <thinking> blocks in message content.
 */
const THINKING_BLOCK_PATTERN = /<thinking>([\s\S]*?)<\/thinking>/gi;

/**
 * Pattern to match key conclusion markers in reasoning text.
 * Matches patterns like "- Conclusion:", "* Key decision:", "Therefore:", etc.
 */
const CONCLUSION_PATTERNS = [
  /(?:^|\n)\s*[-*]\s*(?:conclusion|decision|result|therefore|hence|thus|finally|in summary)[:\s]+(.*?)(?=\n|$)/gi,
  /(?:^|\n)\s*(?:therefore|hence|thus|finally|in summary)[,:]?\s*(.*?)(?=\n|$)/gi,
  /(?:^|\n)\s*(?:the answer is|i will|i should|we need to)[:\s]*(.*?)(?=\n|$)/gi,
] as const;

/**
 * Extract reasoning content from messages for summary inclusion (REQ-007).
 *
 * Scans messages for `<thinking>` blocks and extracts key conclusions
 * that should be preserved in summaries. This ensures important
 * reasoning is not lost during compression.
 *
 * @param messages - Array of context messages to extract from
 * @returns Extracted reasoning content with conclusions and summary text
 *
 * @example
 * ```typescript
 * const messages = [
 *   {
 *     id: '1',
 *     role: 'assistant',
 *     content: 'Here is my analysis',
 *     reasoningContent: '<thinking>I need to check the file first. Conclusion: file.ts needs refactoring.</thinking>',
 *     priority: MessagePriority.NORMAL,
 *   },
 * ];
 *
 * const result = extractReasoningContent(messages);
 * // result.conclusions = ['file.ts needs refactoring']
 * // result.summaryText = '## Key Reasoning\n- file.ts needs refactoring'
 * ```
 */
export function extractReasoningContent(messages: ContextMessage[]): ExtractedReasoning {
  const allConclusions: string[] = [];
  let messagesWithReasoning = 0;

  for (const message of messages) {
    // Skip non-assistant messages (only assistants have reasoning)
    if (message.role !== "assistant") continue;

    // Check for explicit reasoningContent field
    const reasoningText = message.reasoningContent;
    if (reasoningText) {
      messagesWithReasoning++;
      const conclusions = extractConclusionsFromText(reasoningText);
      allConclusions.push(...conclusions);
    }

    // Also check for <thinking> blocks in the content
    const content = typeof message.content === "string" ? message.content : "";
    const thinkingMatches = content.matchAll(THINKING_BLOCK_PATTERN);
    for (const match of thinkingMatches) {
      const thinkingContent = match[1];
      if (thinkingContent) {
        const conclusions = extractConclusionsFromText(thinkingContent);
        allConclusions.push(...conclusions);
        if (conclusions.length > 0) {
          messagesWithReasoning++;
        }
      }
    }
  }

  // Deduplicate conclusions
  const uniqueConclusions = [...new Set(allConclusions)];

  // Format for summary inclusion
  const summaryText = formatReasoningForSummary(uniqueConclusions);

  return {
    conclusions: uniqueConclusions,
    messagesWithReasoning,
    summaryText,
  };
}

/**
 * Extract conclusion-like statements from reasoning text.
 */
function extractConclusionsFromText(text: string): string[] {
  const conclusions: string[] = [];

  for (const pattern of CONCLUSION_PATTERNS) {
    // Reset pattern state for each text
    pattern.lastIndex = 0;
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const conclusion = match[1]?.trim();
      if (conclusion && conclusion.length > 10 && conclusion.length < 200) {
        conclusions.push(conclusion);
      }
    }
  }

  // If no pattern-based conclusions found, extract key sentences
  if (conclusions.length === 0) {
    const keysentences = extractKeySentences(text);
    conclusions.push(...keysentences);
  }

  return conclusions;
}

/**
 * Extract key sentences from text when no conclusion patterns match.
 * Looks for short, actionable sentences.
 */
function extractKeySentences(text: string): string[] {
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 150);

  // Return up to 3 sentences that look like conclusions
  return sentences
    .filter(
      (s) =>
        s.toLowerCase().includes("need") ||
        s.toLowerCase().includes("should") ||
        s.toLowerCase().includes("will") ||
        s.toLowerCase().includes("must") ||
        s.toLowerCase().includes("important")
    )
    .slice(0, 3);
}

/**
 * Format extracted conclusions for summary inclusion.
 */
function formatReasoningForSummary(conclusions: string[]): string {
  if (conclusions.length === 0) {
    return "";
  }

  const lines = conclusions.map((c) => `- ${c}`);
  return `## Key Reasoning Conclusions\n${lines.join("\n")}`;
}
