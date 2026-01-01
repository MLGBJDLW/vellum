// ============================================
// Session Summary Service
// ============================================

/**
 * Session summary generation and management service.
 *
 * Provides rule-based and LLM-powered summary generation for sessions,
 * including automatic title extraction and sliding window analysis.
 *
 * @module @vellum/core/session/summary
 */

import type { SessionMessage } from "./message.js";
import type { Session } from "./types.js";

// =============================================================================
// Constants
// =============================================================================

/** Maximum characters for a summary */
const MAX_SUMMARY_LENGTH = 500;

/** Maximum characters for a title */
const MAX_TITLE_LENGTH = 50;

/** Default titles that should be replaced with extracted titles */
const DEFAULT_TITLES = ["new session", "untitled", "untitled session", "session", ""];

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Configuration options for the SessionSummaryService.
 */
export interface SummaryConfig {
  /** Maximum number of messages to include in summary window */
  maxMessages: number;
  /** Minimum messages required before generating a summary */
  minMessagesForSummary: number;
  /** Whether to automatically update session title from summary */
  autoUpdateTitle: boolean;
}

/**
 * Default configuration values for SummaryConfig.
 */
export const DEFAULT_SUMMARY_CONFIG: SummaryConfig = {
  maxMessages: 20,
  minMessagesForSummary: 10,
  autoUpdateTitle: true,
};

/**
 * Type for an optional LLM call function for summary generation.
 */
export type LLMCallFunction = (prompt: string) => Promise<string>;

// =============================================================================
// SessionSummaryService Class
// =============================================================================

/**
 * Service for generating and managing session summaries.
 *
 * Supports both rule-based (no LLM required) and LLM-powered summary generation.
 * Includes automatic title extraction and sliding window analysis.
 *
 * @example
 * ```typescript
 * const summaryService = new SessionSummaryService();
 *
 * // Check if summary is needed
 * if (summaryService.shouldGenerateSummary(session)) {
 *   // Generate with rule-based fallback
 *   const summary = await summaryService.generateSummary(session);
 *   const updated = summaryService.applySummary(session, summary);
 * }
 * ```
 */
export class SessionSummaryService {
  private readonly config: SummaryConfig;

  /**
   * Creates a new SessionSummaryService instance.
   *
   * @param config - Partial configuration options (merged with defaults)
   */
  constructor(config?: Partial<SummaryConfig>) {
    this.config = { ...DEFAULT_SUMMARY_CONFIG, ...config };
  }

  /**
   * Generates a summary for a session.
   *
   * Uses a sliding window approach to analyze the last N messages.
   * If an LLM call function is provided, uses it for intelligent summarization.
   * Otherwise, falls back to rule-based extraction.
   *
   * @param session - The session to summarize
   * @param llmCall - Optional LLM function for intelligent summary
   * @returns Summary string (max 500 characters)
   */
  async generateSummary(session: Session, llmCall?: LLMCallFunction): Promise<string> {
    // Handle empty sessions gracefully
    if (session.messages.length === 0) {
      return "Empty session with no messages.";
    }

    // Get sliding window of messages
    const windowMessages = this.getMessageWindow(session.messages);

    // Use LLM if provided
    if (llmCall) {
      return this.generateLLMSummary(windowMessages, llmCall);
    }

    // Fall back to rule-based summary
    return this.generateRuleBasedSummary(windowMessages);
  }

  /**
   * Checks if a session needs a summary to be generated.
   *
   * Returns true if:
   * - Message count >= minMessagesForSummary AND no existing summary
   * - Message count has increased significantly since last summary
   *
   * @param session - The session to check
   * @returns Whether a summary should be generated
   */
  shouldGenerateSummary(session: Session): boolean {
    const { messageCount } = session.metadata;
    const { summary } = session.metadata;

    // No summary yet and enough messages
    if (!summary && messageCount >= this.config.minMessagesForSummary) {
      return true;
    }

    // Has summary but messages have increased significantly (2x minMessages since last)
    if (summary && messageCount >= this.config.minMessagesForSummary * 2) {
      return true;
    }

    return false;
  }

  /**
   * Applies a summary to a session.
   *
   * Updates session.metadata.summary and optionally extracts
   * and updates the title if autoUpdateTitle is enabled.
   *
   * @param session - The session to update
   * @param summary - The summary to apply
   * @returns Updated session with summary applied
   */
  applySummary(session: Session, summary: string): Session {
    // Truncate summary if too long
    const truncatedSummary = this.truncateText(summary, MAX_SUMMARY_LENGTH);

    // Create updated metadata
    const updatedMetadata = {
      ...session.metadata,
      summary: truncatedSummary,
      updatedAt: new Date(),
    };

    // Auto-update title if enabled and title is default
    if (this.config.autoUpdateTitle && this.isDefaultTitle(session.metadata.title)) {
      const extractedTitle = this.extractTitle(truncatedSummary);
      if (extractedTitle) {
        updatedMetadata.title = extractedTitle;
      }
    }

    return {
      ...session,
      metadata: updatedMetadata,
    };
  }

  /**
   * Extracts a short title from a summary.
   *
   * Uses the first sentence or key phrase, truncated to max 50 characters.
   *
   * @param summary - The summary to extract title from
   * @returns Extracted title (max 50 characters)
   */
  extractTitle(summary: string): string {
    if (!summary || summary.trim().length === 0) {
      return "";
    }

    // Try to get first sentence
    const sentences = summary.split(/[.!?]+/);
    let title = sentences[0]?.trim() || "";

    // If first sentence is too long, try to find a key phrase
    if (title.length > MAX_TITLE_LENGTH) {
      // Look for a shorter phrase up to first comma or colon
      const shortPhrase = title.split(/[,:]/)[0]?.trim();
      if (shortPhrase && shortPhrase.length <= MAX_TITLE_LENGTH) {
        title = shortPhrase;
      } else {
        // Truncate with ellipsis
        title = this.truncateText(title, MAX_TITLE_LENGTH - 3) + "...";
      }
    }

    // Clean up any leading/trailing punctuation or whitespace
    title = title.replace(/^[\s\-:]+|[\s\-:]+$/g, "");

    return title;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Gets the sliding window of messages to analyze.
   */
  private getMessageWindow(messages: SessionMessage[]): SessionMessage[] {
    const { maxMessages } = this.config;
    if (messages.length <= maxMessages) {
      return messages;
    }
    return messages.slice(-maxMessages);
  }

  /**
   * Generates an LLM-powered summary.
   */
  private async generateLLMSummary(
    messages: SessionMessage[],
    llmCall: LLMCallFunction
  ): Promise<string> {
    const conversationText = this.formatMessagesForLLM(messages);

    const prompt = `Summarize this conversation in a concise paragraph (max 500 characters). Focus on:
1. The user's main intent or goal
2. Key topics discussed
3. Important outcomes or decisions

Conversation:
${conversationText}

Summary:`;

    try {
      const summary = await llmCall(prompt);
      return this.truncateText(summary.trim(), MAX_SUMMARY_LENGTH);
    } catch {
      // Fall back to rule-based on LLM failure
      return this.generateRuleBasedSummary(messages);
    }
  }

  /**
   * Generates a rule-based summary without LLM.
   */
  private generateRuleBasedSummary(messages: SessionMessage[]): string {
    const parts: string[] = [];

    // 1. Extract user's first message (intent)
    const firstUserMessage = this.findFirstUserMessage(messages);
    if (firstUserMessage) {
      const intent = this.extractTextContent(firstUserMessage);
      if (intent) {
        const truncatedIntent = this.truncateText(intent, 150);
        parts.push(`User intent: ${truncatedIntent}`);
      }
    }

    // 2. Extract key topics (unique meaningful words)
    const topics = this.extractKeyTopics(messages);
    if (topics.length > 0) {
      parts.push(`Topics: ${topics.slice(0, 5).join(", ")}`);
    }

    // 3. Extract tools used
    const toolsUsed = this.extractToolsUsed(messages);
    if (toolsUsed.length > 0) {
      parts.push(`Tools used: ${toolsUsed.slice(0, 5).join(", ")}`);
    }

    // 4. Add message count context
    parts.push(`Messages: ${messages.length}`);

    const summary = parts.join(". ");
    return this.truncateText(summary, MAX_SUMMARY_LENGTH);
  }

  /**
   * Formats messages for LLM prompt.
   */
  private formatMessagesForLLM(messages: SessionMessage[]): string {
    return messages
      .map((msg) => {
        const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
        const content = this.extractTextContent(msg);
        return `${role}: ${this.truncateText(content, 200)}`;
      })
      .join("\n");
  }

  /**
   * Finds the first user message in the conversation.
   */
  private findFirstUserMessage(messages: SessionMessage[]): SessionMessage | undefined {
    return messages.find((msg) => msg.role === "user");
  }

  /**
   * Extracts text content from a message.
   */
  private extractTextContent(message: SessionMessage): string {
    const textParts = message.parts
      .filter((part) => part.type === "text")
      .map((part) => (part as { type: "text"; text: string }).text);

    return textParts.join(" ").trim();
  }

  /**
   * Extracts key topics from messages.
   */
  private extractKeyTopics(messages: SessionMessage[]): string[] {
    const allText = messages
      .map((msg) => this.extractTextContent(msg))
      .join(" ")
      .toLowerCase();

    // Extract words that look like topics (capitalized words, technical terms)
    const words = allText.match(/\b[a-z]{4,}\b/g) || [];

    // Count word frequency
    const wordCounts = new Map<string, number>();
    for (const word of words) {
      // Skip common stop words
      if (this.isStopWord(word)) continue;
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }

    // Sort by frequency and return top words
    return [...wordCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  /**
   * Extracts tool names used in the session.
   */
  private extractToolsUsed(messages: SessionMessage[]): string[] {
    const tools = new Set<string>();

    for (const message of messages) {
      for (const part of message.parts) {
        if (part.type === "tool") {
          tools.add((part as { type: "tool"; name: string }).name);
        }
      }
    }

    return [...tools];
  }

  /**
   * Checks if a word is a common stop word.
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      "the",
      "and",
      "for",
      "are",
      "but",
      "not",
      "you",
      "all",
      "can",
      "her",
      "was",
      "one",
      "our",
      "out",
      "day",
      "had",
      "has",
      "his",
      "how",
      "its",
      "may",
      "new",
      "now",
      "old",
      "see",
      "way",
      "who",
      "boy",
      "did",
      "get",
      "let",
      "put",
      "say",
      "she",
      "too",
      "use",
      "this",
      "that",
      "with",
      "have",
      "from",
      "they",
      "been",
      "call",
      "will",
      "each",
      "make",
      "like",
      "time",
      "just",
      "know",
      "take",
      "come",
      "than",
      "them",
      "only",
      "over",
      "such",
      "also",
      "back",
      "into",
      "when",
      "your",
      "what",
      "there",
      "some",
      "would",
      "could",
      "should",
      "about",
      "which",
      "their",
      "these",
      "other",
      "being",
      "here",
      "want",
      "need",
      "please",
      "help",
      "thanks",
      "thank",
      "hello",
    ]);
    return stopWords.has(word);
  }

  /**
   * Checks if a title is a default title that should be replaced.
   */
  private isDefaultTitle(title: string): boolean {
    return DEFAULT_TITLES.includes(title.toLowerCase().trim());
  }

  /**
   * Truncates text to a maximum length.
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.slice(0, maxLength);
  }
}
