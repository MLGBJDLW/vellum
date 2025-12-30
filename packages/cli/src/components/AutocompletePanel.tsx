/**
 * Autocomplete Panel Component
 *
 * Renders command suggestions with fuzzy match highlighting
 * for the slash command autocomplete feature.
 *
 * @module cli/components/AutocompletePanel
 */

import { Box, Text } from "ink";
import type { SlashCommand } from "../commands/types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Autocomplete suggestion item
 */
export interface AutocompleteSuggestion {
  /** The command being suggested */
  readonly command: SlashCommand;
  /** Match score (higher = better match) */
  readonly score: number;
  /** Highlighted parts of the command name */
  readonly highlights?: readonly [start: number, end: number][];
}

/**
 * Props for the AutocompletePanel component
 */
export interface AutocompletePanelProps {
  /**
   * List of suggestions to display
   */
  readonly suggestions: readonly AutocompleteSuggestion[];

  /**
   * Currently selected index
   */
  readonly selectedIndex: number;

  /**
   * Maximum number of suggestions to show
   * @default 5
   */
  readonly maxVisible?: number;

  /**
   * Whether the panel is visible
   * @default true
   */
  readonly visible?: boolean;

  /**
   * Current search query (for highlight context)
   */
  readonly query?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Highlight matching characters in a string
 *
 * @param text - Text to highlight
 * @param query - Search query for highlighting
 * @returns Array of text segments with highlight info
 */
function highlightMatches(
  text: string,
  query: string
): Array<{ text: string; highlighted: boolean }> {
  if (!query) {
    return [{ text, highlighted: false }];
  }

  const segments: Array<{ text: string; highlighted: boolean }> = [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  let lastIndex = 0;
  let queryIndex = 0;

  for (let i = 0; i < text.length && queryIndex < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIndex]) {
      // Add non-highlighted segment before this match
      if (i > lastIndex) {
        segments.push({ text: text.slice(lastIndex, i), highlighted: false });
      }
      // Add highlighted character
      segments.push({ text: text[i] ?? "", highlighted: true });
      lastIndex = i + 1;
      queryIndex++;
    }
  }

  // Add remaining non-highlighted text
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), highlighted: false });
  }

  return segments;
}

// =============================================================================
// Components
// =============================================================================

/**
 * Render a single suggestion item
 */
function SuggestionItem({
  suggestion,
  isSelected,
  query,
}: {
  readonly suggestion: AutocompleteSuggestion;
  readonly isSelected: boolean;
  readonly query?: string;
}): React.ReactElement {
  const { command } = suggestion;
  const nameSegments = highlightMatches(command.name, query ?? "");

  return (
    <Box>
      <Text color={isSelected ? "cyan" : "white"} bold={isSelected}>
        {isSelected ? "▸ " : "  "}
      </Text>
      <Text color={isSelected ? "cyan" : "gray"}>/ </Text>
      {nameSegments.map((segment, index) => (
        <Text
          key={`${index}-${segment.text}`}
          color={isSelected ? "cyan" : segment.highlighted ? "yellow" : "white"}
          bold={segment.highlighted}
        >
          {segment.text}
        </Text>
      ))}
      {command.aliases && command.aliases.length > 0 && (
        <Text color="gray" dimColor>
          {" "}
          ({command.aliases.join(", ")})
        </Text>
      )}
      <Text color="gray"> - {command.description}</Text>
    </Box>
  );
}

/**
 * Autocomplete panel component
 *
 * Displays a list of command suggestions with:
 * - Fuzzy match highlighting
 * - Selected item indicator
 * - Command aliases
 * - Command descriptions
 *
 * @example
 * ```tsx
 * <AutocompletePanel
 *   suggestions={[
 *     { command: helpCommand, score: 100 },
 *     { command: historyCommand, score: 80 },
 *   ]}
 *   selectedIndex={0}
 *   query="h"
 * />
 * ```
 */
export function AutocompletePanel({
  suggestions,
  selectedIndex,
  maxVisible = 5,
  visible = true,
  query,
}: AutocompletePanelProps): React.ReactElement | null {
  if (!visible || suggestions.length === 0) {
    return null;
  }

  // Calculate visible window around selected item
  const visibleSuggestions = suggestions.slice(0, maxVisible);
  const hasMore = suggestions.length > maxVisible;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
      {visibleSuggestions.map((suggestion, index) => (
        <SuggestionItem
          key={suggestion.command.name}
          suggestion={suggestion}
          isSelected={index === selectedIndex}
          query={query}
        />
      ))}
      {hasMore && (
        <Text color="gray" dimColor>
          ... {suggestions.length - maxVisible} more
        </Text>
      )}
    </Box>
  );
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if any alias starts with the query
 */
function aliasStartsWithQuery(
  aliases: readonly string[] | undefined,
  query: string
): { match: boolean; length: number } {
  if (!aliases) return { match: false, length: 0 };
  for (const alias of aliases) {
    if (alias.toLowerCase().startsWith(query)) {
      return { match: true, length: alias.length };
    }
  }
  return { match: false, length: 0 };
}

/**
 * Calculate fuzzy match score between query and name
 */
function calculateFuzzyScore(lowerName: string, lowerQuery: string): number {
  let queryIndex = 0;
  let score = 0;

  for (let i = 0; i < lowerName.length && queryIndex < lowerQuery.length; i++) {
    if (lowerName[i] === lowerQuery[queryIndex]) {
      // Bonus for consecutive matches
      const prevMatch = queryIndex > 0 && i > 0 && lowerName[i - 1] === lowerQuery[queryIndex - 1];
      if (prevMatch) score += 20;
      // Bonus for match at word boundary
      const wordBoundary = i === 0 || lowerName[i - 1] === "-" || lowerName[i - 1] === "_";
      if (wordBoundary) score += 30;
      score += 10;
      queryIndex++;
    }
  }

  return queryIndex === lowerQuery.length ? score : 0;
}

/**
 * Calculate fuzzy match score for a command
 *
 * @param command - Command to score
 * @param query - Search query
 * @returns Match score (0 = no match, higher = better match)
 */
export function calculateMatchScore(command: SlashCommand, query: string): number {
  if (!query) return 100;

  const lowerQuery = query.toLowerCase();
  const lowerName = command.name.toLowerCase();

  // Exact prefix match - highest score
  if (lowerName.startsWith(lowerQuery)) {
    return 1000 - lowerName.length;
  }

  // Alias prefix match
  const aliasMatch = aliasStartsWithQuery(command.aliases, lowerQuery);
  if (aliasMatch.match) {
    return 800 - aliasMatch.length;
  }

  // Substring match
  if (lowerName.includes(lowerQuery)) {
    return 500 - lowerName.indexOf(lowerQuery);
  }

  // Fuzzy match
  return calculateFuzzyScore(lowerName, lowerQuery);
}

/**
 * Filter and sort commands by match score
 *
 * @param commands - Commands to filter
 * @param query - Search query
 * @returns Sorted suggestions
 */
export function filterCommands(
  commands: readonly SlashCommand[],
  query: string
): AutocompleteSuggestion[] {
  return commands
    .map((command) => ({
      command,
      score: calculateMatchScore(command, query),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
}
