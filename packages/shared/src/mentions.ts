/**
 * @ Mention Types and Utilities
 *
 * Provides types, regex patterns, and parsing utilities for @ mentions
 * in the Vellum TUI. Mentions allow users to reference files, folders,
 * URLs, and other contextual information.
 *
 * @module shared/mentions
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Types of @ mentions supported by Vellum.
 *
 * - `file`: Reference a specific file (@file:./src/index.ts)
 * - `folder`: Reference a directory (@folder:./src)
 * - `url`: Reference a web URL (@url:https://example.com)
 * - `codebase`: Semantic search query (@codebase:authentication logic)
 * - `git-diff`: Current git changes (@git-diff)
 * - `problems`: LSP diagnostics/errors (@problems)
 * - `terminal`: Recent terminal output (@terminal)
 */
export type MentionType =
  | "file"
  | "folder"
  | "url"
  | "codebase"
  | "git-diff"
  | "problems"
  | "terminal";

/**
 * All supported mention types as an array for iteration.
 */
export const MENTION_TYPES: readonly MentionType[] = [
  "file",
  "folder",
  "url",
  "codebase",
  "git-diff",
  "problems",
  "terminal",
] as const;

/**
 * Types that require a value (path, URL, or query).
 */
export const MENTION_TYPES_WITH_VALUE: readonly MentionType[] = [
  "file",
  "folder",
  "url",
  "codebase",
] as const;

/**
 * Types that are standalone (no value required).
 */
export const MENTION_TYPES_STANDALONE: readonly MentionType[] = [
  "git-diff",
  "problems",
  "terminal",
] as const;

/**
 * A parsed @ mention from user input.
 */
export interface Mention {
  /** Type of the mention */
  readonly type: MentionType;
  /** Raw string as entered by user (e.g., "@file:./src/index.ts") */
  readonly raw: string;
  /** Extracted value (e.g., "./src/index.ts") - empty for standalone types */
  readonly value: string;
  /** Start position in the original text (0-indexed) */
  readonly start: number;
  /** End position in the original text (exclusive) */
  readonly end: number;
}

/**
 * Suggestion for autocomplete when typing @ mentions.
 */
export interface MentionSuggestion {
  /** Type of mention */
  readonly type: MentionType;
  /** Display label (e.g., "file") */
  readonly label: string;
  /** Human-readable description */
  readonly description: string;
  /** Icon identifier (optional) */
  readonly icon?: string;
  /** Example usage */
  readonly example?: string;
}

// =============================================================================
// Regex Patterns
// =============================================================================

/**
 * Regex to match @ mentions in text.
 *
 * Matches patterns like:
 * - @file:./src/index.ts
 * - @folder:./src
 * - @url:https://example.com
 * - @codebase:search query here
 * - @git-diff
 * - @problems
 * - @terminal
 *
 * The @ must be at line start or preceded by whitespace to avoid
 * matching @ in URLs or email addresses.
 *
 * Breakdown:
 * - `(?:^|\s)` - Line start or whitespace before @
 * - `@(file|folder|url|codebase|git-diff|problems|terminal)` - Mention type
 * - `(?::([^\s]+))?` - Optional colon and value (non-whitespace)
 *
 * Capturing groups:
 * - Group 1: Mention type
 * - Group 2: Value (if present)
 */
export const MENTION_REGEX =
  /(?:^|\s)@(file|folder|url|codebase|git-diff|problems|terminal)(?::([^\s]+))?/g;

/**
 * Regex to detect partial @ mention for autocomplete triggering.
 * Matches "@" followed by optional partial type.
 */
export const MENTION_PARTIAL_REGEX = /@([a-z-]*)$/i;

/**
 * Regex to detect @ mention with type and partial value.
 * Used for path/value autocomplete after the colon.
 */
export const MENTION_VALUE_PARTIAL_REGEX = /@(file|folder|url|codebase):([^\s]*)$/i;

// =============================================================================
// Parsing Functions
// =============================================================================

/**
 * Parse all @ mentions from a text string.
 *
 * @param text - Input text to parse
 * @returns Array of parsed mentions with their positions
 *
 * @example
 * ```typescript
 * const mentions = parseMentions("Check @file:./src/index.ts and @git-diff");
 * // Returns [
 * //   { type: "file", raw: "@file:./src/index.ts", value: "./src/index.ts", start: 6, end: 26 },
 * //   { type: "git-diff", raw: "@git-diff", value: "", start: 31, end: 40 }
 * // ]
 * ```
 */
export function parseMentions(text: string): Mention[] {
  const mentions: Mention[] = [];
  const regex = new RegExp(MENTION_REGEX.source, "g");

  let match = regex.exec(text);
  while (match !== null) {
    const fullMatch = match[0];
    const type = match[1] as MentionType;
    const value = match[2] ?? "";

    // Calculate actual start (skip leading whitespace if present)
    const leadingWhitespace = fullMatch.startsWith(" ") || fullMatch.startsWith("\t") ? 1 : 0;
    const atIndex = match.index + leadingWhitespace;

    // Build the raw mention string (without leading whitespace)
    const raw = value ? `@${type}:${value}` : `@${type}`;

    mentions.push({
      type,
      raw,
      value,
      start: atIndex,
      end: atIndex + raw.length,
    });

    match = regex.exec(text);
  }

  return mentions;
}

/**
 * Check if a mention type requires a value.
 *
 * @param type - The mention type to check
 * @returns true if the type requires a value (file, folder, url, codebase)
 */
export function mentionRequiresValue(type: MentionType): boolean {
  return MENTION_TYPES_WITH_VALUE.includes(type);
}

/**
 * Check if a mention type is standalone (no value).
 *
 * @param type - The mention type to check
 * @returns true if the type is standalone (git-diff, problems, terminal)
 */
export function mentionIsStandalone(type: MentionType): boolean {
  return MENTION_TYPES_STANDALONE.includes(type);
}

/**
 * Validate a mention's value based on its type.
 *
 * @param type - The mention type
 * @param value - The value to validate
 * @returns Error message if invalid, undefined if valid
 */
export function validateMentionValue(type: MentionType, value: string): string | undefined {
  if (mentionIsStandalone(type)) {
    // Standalone types should not have values
    if (value) {
      return `@${type} does not accept a value`;
    }
    return undefined;
  }

  // Value-requiring types must have a value
  if (!value) {
    return `@${type} requires a value (e.g., @${type}:path)`;
  }

  // Type-specific validation
  switch (type) {
    case "url": {
      // Basic URL validation
      try {
        new URL(value);
      } catch {
        // Try with protocol prefix
        if (!value.startsWith("http://") && !value.startsWith("https://")) {
          try {
            new URL(`https://${value}`);
          } catch {
            return "Invalid URL format";
          }
        } else {
          return "Invalid URL format";
        }
      }
      return undefined;
    }
    case "file":
    case "folder":
      // Path validation is lenient - just check for empty
      return value.trim() ? undefined : `@${type} requires a non-empty path`;
    case "codebase":
      // Codebase search accepts any non-empty query
      return value.trim() ? undefined : "@codebase requires a search query";
    default:
      return undefined;
  }
}

// =============================================================================
// Suggestion Functions
// =============================================================================

/**
 * Get all mention type suggestions for autocomplete.
 *
 * @returns Array of suggestions for all mention types
 */
export function getAllMentionSuggestions(): MentionSuggestion[] {
  return [
    {
      type: "file",
      label: "file",
      description: "Include a file's contents",
      icon: "📄",
      example: "@file:./src/index.ts",
    },
    {
      type: "folder",
      label: "folder",
      description: "List a directory's contents",
      icon: "📁",
      example: "@folder:./src",
    },
    {
      type: "url",
      label: "url",
      description: "Fetch content from a URL",
      icon: "🌐",
      example: "@url:https://example.com",
    },
    {
      type: "codebase",
      label: "codebase",
      description: "Search the codebase semantically",
      icon: "🔍",
      example: "@codebase:authentication logic",
    },
    {
      type: "git-diff",
      label: "git-diff",
      description: "Include current git changes",
      icon: "📝",
    },
    {
      type: "problems",
      label: "problems",
      description: "Include LSP diagnostics/errors",
      icon: "⚠️",
    },
    {
      type: "terminal",
      label: "terminal",
      description: "Include recent terminal output",
      icon: "💻",
    },
  ];
}

/**
 * Get mention suggestions filtered by a partial type string.
 *
 * @param partial - Partial mention type (e.g., "fi" matches "file")
 * @returns Filtered array of suggestions
 *
 * @example
 * ```typescript
 * getMentionSuggestions("fi");
 * // Returns [{ type: "file", label: "file", ... }]
 *
 * getMentionSuggestions("git");
 * // Returns [{ type: "git-diff", label: "git-diff", ... }]
 * ```
 */
export function getMentionSuggestions(partial: string): MentionSuggestion[] {
  const all = getAllMentionSuggestions();
  if (!partial) {
    return all;
  }

  const lower = partial.toLowerCase();
  return all.filter((s) => s.label.toLowerCase().startsWith(lower));
}

/**
 * Get the display format for a mention type.
 *
 * @param type - The mention type
 * @returns Format string showing how to use the mention
 */
export function getMentionFormat(type: MentionType): string {
  if (mentionIsStandalone(type)) {
    return `@${type}`;
  }
  return `@${type}:<value>`;
}

// =============================================================================
// Text Manipulation
// =============================================================================

/**
 * Remove all mentions from text, leaving the rest intact.
 *
 * @param text - Input text with mentions
 * @returns Text with mentions removed
 *
 * @example
 * ```typescript
 * stripMentions("Check @file:./src and @git-diff for changes");
 * // Returns "Check  and  for changes"
 * ```
 */
export function stripMentions(text: string): string {
  return text.replace(new RegExp(MENTION_REGEX.source, "g"), (match) => {
    // Preserve leading whitespace
    return match.startsWith(" ") || match.startsWith("\t") ? " " : "";
  });
}

/**
 * Extract the text portion without mentions, cleaned up.
 *
 * @param text - Input text with mentions
 * @returns Cleaned text with mentions removed and whitespace normalized
 */
export function extractTextWithoutMentions(text: string): string {
  return stripMentions(text).replace(/\s+/g, " ").trim();
}

/**
 * Check if the text contains any mentions.
 *
 * @param text - Input text to check
 * @returns true if the text contains at least one mention
 */
export function hasMentions(text: string): boolean {
  return new RegExp(MENTION_REGEX.source).test(text);
}

/**
 * Count mentions in text.
 *
 * @param text - Input text to check
 * @returns Number of mentions found
 */
export function countMentions(text: string): number {
  return parseMentions(text).length;
}

/**
 * Count mentions by type.
 *
 * @param text - Input text to check
 * @returns Map of mention type to count
 */
export function countMentionsByType(text: string): Map<MentionType, number> {
  const mentions = parseMentions(text);
  const counts = new Map<MentionType, number>();

  for (const mention of mentions) {
    counts.set(mention.type, (counts.get(mention.type) ?? 0) + 1);
  }

  return counts;
}
