/**
 * Mention System Module
 *
 * Provides the mention expansion system for the Vellum TUI.
 * Re-exports shared types and provides core expansion functionality.
 *
 * @module core/mentions
 */

// Re-export shared types for convenience
export type {
  Mention,
  MentionSuggestion,
  MentionType,
} from "@vellum/shared";

export {
  getAllMentionSuggestions,
  getMentionFormat,
  getMentionSuggestions,
  hasMentions,
  MENTION_PARTIAL_REGEX,
  MENTION_REGEX,
  MENTION_TYPES,
  MENTION_TYPES_STANDALONE,
  MENTION_TYPES_WITH_VALUE,
  MENTION_VALUE_PARTIAL_REGEX,
  mentionIsStandalone,
  mentionRequiresValue,
  parseMentions,
  stripMentions,
  validateMentionValue,
} from "@vellum/shared";

// Export expander
export {
  expandAllMentions,
  expandMention,
  previewMention,
} from "./expander.js";

// Export types
export type {
  MentionExpansion,
  MentionExpansionContext,
  MentionExpansionMetadata,
  MentionExpansionOptions,
  MentionExpansionResult,
  MentionHandler,
  MentionHandlerRegistry,
} from "./types.js";

export {
  DEFAULT_EXPANSION_OPTIONS,
  MentionErrorCode,
} from "./types.js";
