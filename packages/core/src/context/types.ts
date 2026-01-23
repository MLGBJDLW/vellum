/**
 * Context Management System - Types and Interfaces
 *
 * Foundation types for managing LLM context windows including:
 * - Message priorities for truncation decisions
 * - Content blocks for multimodal messages
 * - Context state management
 * - Token budget allocation
 *
 * @module @vellum/core/context
 */

// ============================================================================
// Message Priority
// ============================================================================

/**
 * Priority levels for context messages (higher = more protected from removal).
 *
 * Priority values are spaced to allow future insertion of intermediate levels.
 *
 * @example
 * ```typescript
 * const msg: ContextMessage = {
 *   id: '1',
 *   role: 'user',
 *   content: 'Hello',
 *   priority: MessagePriority.NORMAL,
 * };
 * ```
 */
export const MessagePriority = {
  /** System messages - never remove */
  SYSTEM: 100,
  /** First user message, key context anchor */
  ANCHOR: 90,
  /** Last N messages (recent turns) */
  RECENT: 80,
  /** Tool use/result pairs - must stay together */
  TOOL_PAIR: 70,
  /** Standard conversation messages */
  NORMAL: 30,
} as const;

/** Type for message priority values */
export type MessagePriority = (typeof MessagePriority)[keyof typeof MessagePriority];

// ============================================================================
// Content Blocks
// ============================================================================

/**
 * Text content block for messages.
 */
export interface TextBlock {
  readonly type: "text";
  /** The text content */
  readonly text: string;
}

/**
 * Image source information for image blocks.
 */
export interface ImageSource {
  /** Source type (e.g., 'base64', 'url') */
  readonly type: string;
  /** Image data (base64 encoded or URL) */
  readonly data: string;
  /** Optional media type override */
  readonly media_type?: string;
}

/**
 * Image content block for multimodal messages.
 */
export interface ImageBlock {
  readonly type: "image";
  /** Image source information */
  readonly source: ImageSource;
  /** MIME type (e.g., 'image/png', 'image/jpeg') */
  readonly mediaType: string;
  /** Image width in pixels (for token calculation) */
  readonly width?: number;
  /** Image height in pixels (for token calculation) */
  readonly height?: number;
}

/**
 * Tool use block - represents a tool invocation by the assistant.
 */
export interface ToolUseBlock {
  readonly type: "tool_use";
  /** Unique identifier for this tool use (links to tool_result) */
  readonly id: string;
  /** Name of the tool being invoked */
  readonly name: string;
  /** Tool input parameters */
  readonly input: unknown;
}

/**
 * Tool result block - represents the result of a tool execution.
 *
 * Must be paired with a corresponding tool_use block via `tool_use_id`.
 */
export interface ToolResultBlock {
  readonly type: "tool_result";
  /** ID of the tool_use block this result corresponds to */
  readonly tool_use_id: string;
  /** Result content (string or nested content blocks) */
  readonly content: string | ContentBlock[];
  /** Whether the tool execution resulted in an error */
  readonly is_error?: boolean;
  /** Timestamp when this result was compacted/summarized (for pruning tracking) */
  readonly compactedAt?: number;
}

/**
 * Union type for all supported message content block types.
 *
 * Messages can contain multiple blocks of different types for multimodal content.
 */
export type ContentBlock = TextBlock | ImageBlock | ToolUseBlock | ToolResultBlock;

// ============================================================================
// Context Message
// ============================================================================

/** Valid message roles */
export type MessageRole = "user" | "assistant" | "system";

/**
 * Extended message type for context management.
 *
 * Extends the base message structure with priority, token counting,
 * and compression tracking capabilities.
 *
 * @example
 * ```typescript
 * const message: ContextMessage = {
 *   id: 'msg-123',
 *   role: 'assistant',
 *   content: [
 *     { type: 'text', text: 'Let me check that file.' },
 *     { type: 'tool_use', id: 'tool-1', name: 'read_file', input: { path: 'src/index.ts' } }
 *   ],
 *   priority: MessagePriority.TOOL_PAIR,
 *   tokens: 45,
 *   createdAt: Date.now(),
 * };
 * ```
 */
export interface ContextMessage {
  /** Unique message identifier */
  readonly id: string;
  /** Message role */
  readonly role: MessageRole;
  /** Message content (string or content blocks) */
  readonly content: string | ContentBlock[];
  /** Priority level for truncation decisions */
  readonly priority: MessagePriority;
  /** Cached token count for this message */
  readonly tokens?: number;
  /** Whether this message is a summary of other messages */
  readonly isSummary?: boolean;
  /** If this is a summary, the unique identifier for linking */
  readonly condenseId?: string;
  /** Points to the condenseId of the summary that replaced original messages */
  readonly condenseParent?: string;
  /** Points to original message before truncation (for rollback) */
  readonly truncationParent?: string;
  /** Timestamp when message was created */
  readonly createdAt?: number;
  /**
   * Reasoning content from models that support chain-of-thought (REQ-003).
   *
   * Contains the model's internal reasoning/thinking process when using
   * models like Claude with extended thinking or o1 with reasoning tokens.
   * This is separate from the main content to allow for:
   * - Separate token accounting
   * - Selective truncation (reasoning can be trimmed first)
   * - Debugging/transparency of model reasoning
   *
   * @example
   * ```typescript
   * const message: ContextMessage = {
   *   id: 'msg-123',
   *   role: 'assistant',
   *   content: 'The answer is 42.',
   *   reasoningContent: 'Let me think through this step by step...',
   *   priority: MessagePriority.NORMAL,
   * };
   * ```
   */
  readonly reasoningContent?: string;
  /** Additional metadata for extensibility */
  readonly metadata?: Record<string, unknown>;
}

// ============================================================================
// Context State
// ============================================================================

/**
 * Context manager health state.
 *
 * State transitions:
 * - `healthy` → `warning` (tokens >= 75%)
 * - `warning` → `critical` (tokens >= 85%) or back to `healthy`
 * - `critical` → `overflow` (tokens >= 95%) or back to `warning`
 * - `overflow` → `critical` (after aggressive truncation)
 */
export type ContextState = "healthy" | "warning" | "critical" | "overflow";

// ============================================================================
// Management Results
// ============================================================================

/**
 * Result of a manage() operation on the context.
 *
 * Contains the new state, token metrics, and a log of actions taken.
 */
export interface ManageResult {
  /** Current context state after management */
  readonly state: ContextState;
  /** Total token count after management */
  readonly tokenCount: number;
  /** Budget utilization as a decimal (0.0 - 1.0) */
  readonly budgetUsed: number;
  /** List of actions taken during management */
  readonly actions: readonly string[];
  /** Checkpoint ID if one was created */
  readonly checkpoint?: string;
}

// ============================================================================
// Token Budget
// ============================================================================

/**
 * Token budget allocation result.
 *
 * Calculates how tokens are distributed across different reserves.
 *
 * @example
 * ```typescript
 * // For a 200K context window with 2K system and 5K tools:
 * const budget: TokenBudget = {
 *   totalWindow: 200_000,
 *   outputReserve: 40_000,
 *   systemReserve: 2_000,
 *   historyBudget: 153_000, // 200K - 40K - 2K - 5K
 * };
 * ```
 */
export interface TokenBudget {
  /** Full context window size */
  readonly totalWindow: number;
  /** Tokens reserved for LLM output */
  readonly outputReserve: number;
  /** Tokens reserved for system messages */
  readonly systemReserve: number;
  /** Available budget for conversation history */
  readonly historyBudget: number;
}

// ============================================================================
// Threshold Configuration
// ============================================================================

/**
 * Threshold configuration for context state transitions.
 *
 * Values are decimal ratios (0.0 - 1.0) of budget utilization.
 *
 * @example
 * ```typescript
 * const thresholds: ThresholdConfig = {
 *   warning: 0.75,   // 75% triggers warning state
 *   critical: 0.85,  // 85% triggers critical state
 *   overflow: 0.95,  // 95% triggers overflow state
 * };
 * ```
 */
export interface ThresholdConfig {
  /** Budget ratio that triggers warning state (e.g., 0.75 = 75%) */
  readonly warning: number;
  /** Budget ratio that triggers critical state (e.g., 0.85 = 85%) */
  readonly critical: number;
  /** Budget ratio that triggers overflow state (e.g., 0.95 = 95%) */
  readonly overflow: number;
}

// ============================================================================
// Image Token Calculator
// ============================================================================

/**
 * Interface for provider-specific image token calculation.
 *
 * Different LLM providers have different formulas for calculating
 * the token cost of images based on dimensions and detail level.
 *
 * @example
 * ```typescript
 * class AnthropicImageCalculator implements ImageCalculator {
 *   calculateTokens(block: ImageBlock): number {
 *     const { width = 0, height = 0 } = block;
 *     // Anthropic formula: (width * height) / 750
 *     return Math.ceil((width * height) / 750);
 *   }
 * }
 * ```
 */
export interface ImageCalculator {
  /**
   * Calculate the token cost for an image block.
   *
   * @param block - The image block to calculate tokens for
   * @returns The estimated token count for the image
   */
  calculateTokens(block: ImageBlock): number;
}

// ============================================================================
// Default Values
// ============================================================================

/**
 * Default threshold configuration values.
 */
export const DEFAULT_THRESHOLDS: ThresholdConfig = {
  warning: 0.75,
  critical: 0.85,
  overflow: 0.95,
} as const;

/**
 * Default message priority for unclassified messages.
 */
export const DEFAULT_PRIORITY: MessagePriority = MessagePriority.NORMAL;
