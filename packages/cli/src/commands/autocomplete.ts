/**
 * Autocomplete State Management
 *
 * Provides state management and fuzzy scoring for slash command autocomplete.
 * Used by AutocompletePanel component for real-time command suggestions.
 *
 * @module cli/commands/autocomplete
 */

import type { CommandRegistry } from "./registry.js";
import type { SlashCommand } from "./types.js";

// =============================================================================
// T022: State Types
// =============================================================================

/**
 * Autocomplete candidate with scoring information
 */
export interface AutocompleteCandidate {
  /** The command being suggested */
  readonly command: SlashCommand;
  /** Match score (higher = better match) */
  readonly score: number;
  /** Character ranges that matched the query [start, end) */
  readonly matchRanges: readonly [start: number, end: number][];
}

/**
 * State for autocomplete feature
 */
export interface AutocompleteState {
  /** Whether autocomplete is currently active */
  readonly active: boolean;
  /** Current search query (text after /) */
  readonly query: string;
  /** Matched command candidates sorted by score */
  readonly candidates: readonly AutocompleteCandidate[];
  /** Currently selected candidate index */
  readonly selectedIndex: number;
  /** Precomputed highlight ranges for each command name */
  readonly highlights: Map<string, readonly [start: number, end: number][]>;
}

/**
 * Initial autocomplete state
 */
export const initialAutocompleteState: AutocompleteState = {
  active: false,
  query: "",
  candidates: [],
  selectedIndex: 0,
  highlights: new Map(),
};

// =============================================================================
// T024: Action Types
// =============================================================================

/**
 * Actions for autocomplete reducer
 */
export type AutocompleteAction =
  | { readonly type: "INPUT_CHANGE"; readonly query: string; readonly registry: CommandRegistry }
  | { readonly type: "SELECT_PREV" }
  | { readonly type: "SELECT_NEXT" }
  | { readonly type: "TAB_COMPLETE" }
  | { readonly type: "CANCEL" };

// =============================================================================
// T023: Fuzzy Scoring Constants
// =============================================================================

/**
 * Scoring weights for fuzzy matching
 */
const SCORE_WEIGHTS = {
  /** Bonus for exact match (query equals command name) */
  EXACT_MATCH: 100,
  /** Bonus for prefix match (query is prefix of command name) */
  PREFIX_MATCH: 80,
  /** Bonus for matching at word boundary (after - or _) */
  WORD_BOUNDARY: 3,
  /** Minimum bonus for consecutive character match */
  CONSECUTIVE_MIN: 1,
  /** Maximum bonus for consecutive character match */
  CONSECUTIVE_MAX: 5,
  /** Base score per matched character */
  CHAR_MATCH: 10,
  /** Penalty per unmatched character in target */
  UNMATCHED_PENALTY: -1,
} as const;

// =============================================================================
// T023: Fuzzy Score Function
// =============================================================================

/**
 * Result of fuzzy scoring
 */
export interface FuzzyScoreResult {
  /** Total match score (higher = better match) */
  readonly score: number;
  /** Character ranges that matched [start, end) */
  readonly ranges: readonly [start: number, end: number][];
}

/**
 * Calculate fuzzy match score between query and target
 *
 * Scoring rules:
 * - Exact match: +100 (query equals command name)
 * - Prefix match: +80 (query is prefix of command name)
 * - Word boundary: +3 (match at start of word after - or _)
 * - Consecutive chars: +1-5 (bonus for consecutive matches)
 * - Base char match: +10 per matched character
 * - Unmatched penalty: -1 per unmatched character in target
 *
 * @param query - Search query (lowercase comparison)
 * @param target - Target string to match against
 * @returns Score and matched character ranges, or null if no match
 *
 * @example
 * ```typescript
 * fuzzyScore('h', 'help');
 * // { score: 90, ranges: [[0, 1]] }  // prefix match + char match
 *
 * fuzzyScore('help', 'help');
 * // { score: 140, ranges: [[0, 4]] }  // exact match + char matches
 *
 * fuzzyScore('gc', 'git-commit');
 * // { score: 26, ranges: [[0, 1], [4, 5]] }  // word boundary bonus
 * ```
 */
export function fuzzyScore(query: string, target: string): FuzzyScoreResult | null {
  if (!query) {
    // Empty query matches everything with base score
    return { score: 0, ranges: [] };
  }

  const lowerQuery = query.toLowerCase();
  const lowerTarget = target.toLowerCase();

  // Check for exact match first
  if (lowerQuery === lowerTarget) {
    return {
      score: SCORE_WEIGHTS.EXACT_MATCH + SCORE_WEIGHTS.CHAR_MATCH * query.length,
      ranges: [[0, target.length]],
    };
  }

  // Check for prefix match
  if (lowerTarget.startsWith(lowerQuery)) {
    return {
      score:
        SCORE_WEIGHTS.PREFIX_MATCH +
        SCORE_WEIGHTS.CHAR_MATCH * query.length +
        SCORE_WEIGHTS.UNMATCHED_PENALTY * (target.length - query.length),
      ranges: [[0, query.length]],
    };
  }

  // Fuzzy matching
  return fuzzyMatchCharacters(lowerQuery, lowerTarget, target);
}

/**
 * Internal fuzzy matching for non-exact, non-prefix matches
 */
function fuzzyMatchCharacters(
  lowerQuery: string,
  lowerTarget: string,
  target: string
): FuzzyScoreResult | null {
  const ranges: [number, number][] = [];
  let score = 0;
  let queryIndex = 0;
  let consecutiveCount = 0;
  let lastMatchIndex = -2; // -2 so first match isn't considered consecutive

  for (let i = 0; i < target.length && queryIndex < lowerQuery.length; i++) {
    if (lowerTarget[i] === lowerQuery[queryIndex]) {
      score += scoreMatchedChar(i, lastMatchIndex, consecutiveCount, target);
      consecutiveCount = i === lastMatchIndex + 1 ? consecutiveCount + 1 : 1;
      updateRanges(ranges, i);
      lastMatchIndex = i;
      queryIndex++;
    } else if (queryIndex > 0) {
      score += SCORE_WEIGHTS.UNMATCHED_PENALTY;
    }
  }

  // All query characters must be found
  if (queryIndex < lowerQuery.length) {
    return null;
  }

  return { score, ranges };
}

/**
 * Calculate score for a matched character
 */
function scoreMatchedChar(
  i: number,
  lastMatchIndex: number,
  consecutiveCount: number,
  target: string
): number {
  let charScore = SCORE_WEIGHTS.CHAR_MATCH;

  // Word boundary bonus
  if (i === 0 || target[i - 1] === "-" || target[i - 1] === "_") {
    charScore += SCORE_WEIGHTS.WORD_BOUNDARY;
  }

  // Consecutive bonus
  if (i === lastMatchIndex + 1) {
    charScore += Math.min(consecutiveCount + 1, SCORE_WEIGHTS.CONSECUTIVE_MAX);
  } else {
    charScore += SCORE_WEIGHTS.CONSECUTIVE_MIN;
  }

  return charScore;
}

/**
 * Update match ranges with new match at index i
 */
function updateRanges(ranges: [number, number][], i: number): void {
  const lastRange = ranges.length > 0 ? ranges[ranges.length - 1] : undefined;
  if (lastRange && lastRange[1] === i) {
    lastRange[1] = i + 1;
  } else {
    ranges.push([i, i + 1]);
  }
}

// =============================================================================
// T025: Highlight Computation
// =============================================================================

/**
 * Compute highlight ranges for all candidates
 *
 * Creates a Map of command names to their highlight ranges for
 * efficient lookup during rendering.
 *
 * @param candidates - List of autocomplete candidates
 * @returns Map of command name to highlight ranges
 *
 * @example
 * ```typescript
 * const highlights = computeHighlights(candidates);
 * const ranges = highlights.get('help'); // [[0, 1]] for query 'h'
 * ```
 */
export function computeHighlights(
  candidates: readonly AutocompleteCandidate[]
): Map<string, readonly [start: number, end: number][]> {
  const highlights = new Map<string, readonly [start: number, end: number][]>();

  for (const candidate of candidates) {
    highlights.set(candidate.command.name, candidate.matchRanges);
  }

  return highlights;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Compute candidates from registry for a given query
 */
function computeCandidates(
  query: string,
  registry: CommandRegistry
): readonly AutocompleteCandidate[] {
  const candidates: AutocompleteCandidate[] = [];

  // Get all commands from registry
  for (const command of registry.list()) {
    // Score against command name
    const result = fuzzyScore(query, command.name);

    if (result) {
      candidates.push({
        command,
        score: result.score,
        matchRanges: result.ranges,
      });
    }

    // Also check aliases for better matching
    if (command.aliases) {
      for (const alias of command.aliases) {
        const aliasResult = fuzzyScore(query, alias);
        if (aliasResult && aliasResult.score > (result?.score ?? 0)) {
          // Better alias match - update candidate
          const existing = candidates.find((c) => c.command === command);
          if (existing) {
            // Remove existing and add better one
            const index = candidates.indexOf(existing);
            candidates.splice(index, 1);
          }
          candidates.push({
            command,
            score: aliasResult.score,
            matchRanges: aliasResult.ranges,
          });
          break;
        }
      }
    }
  }

  // Sort by score descending, then alphabetically for ties
  candidates.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.command.name.localeCompare(b.command.name);
  });

  return candidates;
}

// =============================================================================
// T024: Autocomplete Reducer
// =============================================================================

/**
 * Reducer for autocomplete state management
 *
 * Handles:
 * - INPUT_CHANGE: Update query and recompute candidates
 * - SELECT_PREV: Move selection up (wraps to bottom)
 * - SELECT_NEXT: Move selection down (wraps to top)
 * - TAB_COMPLETE: Returns state with selected candidate (for completion)
 * - CANCEL: Reset state and deactivate
 *
 * @param state - Current autocomplete state
 * @param action - Action to perform
 * @returns New autocomplete state
 *
 * @example
 * ```typescript
 * let state = initialAutocompleteState;
 *
 * // User types '/h'
 * state = autocompleteReducer(state, {
 *   type: 'INPUT_CHANGE',
 *   query: 'h',
 *   registry,
 * });
 * // state.candidates contains matching commands
 *
 * // User presses down arrow
 * state = autocompleteReducer(state, { type: 'SELECT_NEXT' });
 * // state.selectedIndex is 1
 *
 * // User presses Tab
 * state = autocompleteReducer(state, { type: 'TAB_COMPLETE' });
 * // Use state.candidates[state.selectedIndex] for completion
 * ```
 */
export function autocompleteReducer(
  state: AutocompleteState,
  action: AutocompleteAction
): AutocompleteState {
  switch (action.type) {
    case "INPUT_CHANGE": {
      const { query, registry } = action;

      // Empty query deactivates autocomplete
      if (!query) {
        return {
          ...initialAutocompleteState,
          active: false,
        };
      }

      // Compute candidates from registry
      const candidates = computeCandidates(query, registry);

      // Compute highlights for all candidates
      const highlights = computeHighlights(candidates);

      return {
        active: candidates.length > 0,
        query,
        candidates,
        selectedIndex: 0, // Reset selection on new query
        highlights,
      };
    }

    case "SELECT_PREV": {
      if (!state.active || state.candidates.length === 0) {
        return state;
      }

      // Wrap to bottom if at top
      const newIndex =
        state.selectedIndex <= 0 ? state.candidates.length - 1 : state.selectedIndex - 1;

      return {
        ...state,
        selectedIndex: newIndex,
      };
    }

    case "SELECT_NEXT": {
      if (!state.active || state.candidates.length === 0) {
        return state;
      }

      // Wrap to top if at bottom
      const newIndex =
        state.selectedIndex >= state.candidates.length - 1 ? 0 : state.selectedIndex + 1;

      return {
        ...state,
        selectedIndex: newIndex,
      };
    }

    case "TAB_COMPLETE": {
      // State is returned as-is for the caller to read selectedIndex
      // The caller will use candidates[selectedIndex] for completion
      // Then dispatch CANCEL or INPUT_CHANGE with completed text
      return state;
    }

    case "CANCEL": {
      return {
        ...initialAutocompleteState,
        active: false,
      };
    }

    default: {
      // Type guard for exhaustiveness checking
      const exhaustiveCheck: never = action;
      throw new Error(`Unknown action type: ${JSON.stringify(exhaustiveCheck)}`);
    }
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get the currently selected candidate (if any)
 *
 * @param state - Current autocomplete state
 * @returns Selected candidate or undefined
 */
export function getSelectedCandidate(state: AutocompleteState): AutocompleteCandidate | undefined {
  if (!state.active || state.candidates.length === 0) {
    return undefined;
  }
  return state.candidates[state.selectedIndex];
}

/**
 * Check if autocomplete should be shown
 *
 * @param state - Current autocomplete state
 * @returns True if autocomplete panel should be visible
 */
export function shouldShowAutocomplete(state: AutocompleteState): boolean {
  return state.active && state.candidates.length > 0;
}
