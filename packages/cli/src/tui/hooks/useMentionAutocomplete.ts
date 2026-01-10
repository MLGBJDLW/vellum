/**
 * useMentionAutocomplete Hook
 *
 * Manages @ mention autocomplete state and logic.
 * Detects @ patterns in input and provides suggestions for types or values.
 *
 * @module tui/hooks/useMentionAutocomplete
 */

import {
  MENTION_PARTIAL_REGEX,
  MENTION_VALUE_PARTIAL_REGEX,
  type MentionType,
  mentionRequiresValue,
} from "@vellum/shared";
import { useCallback, useMemo } from "react";
import type { MentionAutocompleteMode } from "../components/Input/MentionAutocomplete.js";
import { useFileSuggestions } from "./useFileSuggestions.js";

// =============================================================================
// Types
// =============================================================================

/**
 * State of the mention autocomplete system.
 */
export interface MentionAutocompleteState {
  /** Whether autocomplete should be visible */
  readonly visible: boolean;
  /** Whether autocomplete should capture keyboard input */
  readonly active: boolean;
  /** Current mode: type selection or value completion */
  readonly mode: MentionAutocompleteMode;
  /** The detected mention type (in value mode) */
  readonly mentionType: MentionType | null;
  /** The partial input to filter against */
  readonly filterText: string;
  /** Start position of the mention in the input */
  readonly mentionStart: number;
}

/**
 * Options for useMentionAutocomplete.
 */
export interface UseMentionAutocompleteOptions {
  /** Current working directory for file suggestions */
  readonly cwd: string;
}

/**
 * Result of the useMentionAutocomplete hook.
 */
export interface UseMentionAutocompleteResult {
  /** Current autocomplete state */
  readonly state: MentionAutocompleteState;
  /** File suggestions (for file/folder mentions) */
  readonly fileSuggestions: ReturnType<typeof useFileSuggestions>;
  /** Handle selection of a type or value */
  readonly handleSelect: (value: string, mode: MentionAutocompleteMode) => string;
  /** Get completed input value after selection */
  readonly getCompletedValue: (
    currentValue: string,
    selectedValue: string,
    mode: MentionAutocompleteMode
  ) => string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Detect @ mention pattern in input and determine autocomplete state.
 */
function detectMentionPattern(value: string): MentionAutocompleteState {
  const defaultState: MentionAutocompleteState = {
    visible: false,
    active: false,
    mode: "type",
    mentionType: null,
    filterText: "",
    mentionStart: -1,
  };

  if (!value.includes("@")) {
    return defaultState;
  }

  // Check for @type: pattern (value mode)
  const valueMatch = value.match(MENTION_VALUE_PARTIAL_REGEX);
  if (valueMatch) {
    const mentionType = valueMatch[1] as MentionType;
    const partialValue = valueMatch[2] || "";
    const fullMatch = valueMatch[0];
    const mentionStart = value.lastIndexOf(fullMatch);

    return {
      visible: true,
      active: true,
      mode: "value",
      mentionType,
      filterText: partialValue,
      mentionStart,
    };
  }

  // Check for @ or @partial pattern (type mode)
  const typeMatch = value.match(MENTION_PARTIAL_REGEX);
  if (typeMatch) {
    const partialType = typeMatch[1] || "";
    const atIndex = value.lastIndexOf("@");

    // Check if @ is at start or after whitespace
    if (atIndex === 0 || /\s/.test(value[atIndex - 1] || "")) {
      return {
        visible: true,
        active: true,
        mode: "type",
        mentionType: null,
        filterText: partialType,
        mentionStart: atIndex,
      };
    }
  }

  return defaultState;
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook to manage @ mention autocomplete.
 *
 * @param inputValue - Current input value
 * @param options - Configuration options
 * @returns Autocomplete state and handlers
 *
 * @example
 * ```tsx
 * const { state, fileSuggestions, handleSelect } = useMentionAutocomplete(
 *   inputValue,
 *   { cwd: "/project" }
 * );
 *
 * if (state.visible) {
 *   return (
 *     <MentionAutocomplete
 *       mode={state.mode}
 *       input={state.filterText}
 *       mentionType={state.mentionType}
 *       fileSuggestions={fileSuggestions.suggestions}
 *       onSelect={(v, m) => setValue(handleSelect(v, m))}
 *     />
 *   );
 * }
 * ```
 */
export function useMentionAutocomplete(
  inputValue: string,
  options: UseMentionAutocompleteOptions
): UseMentionAutocompleteResult {
  // Detect mention pattern in input
  const state = useMemo(() => detectMentionPattern(inputValue), [inputValue]);

  // Get file suggestions when in value mode for file/folder types
  const shouldLoadFiles =
    state.visible &&
    state.mode === "value" &&
    (state.mentionType === "file" || state.mentionType === "folder");

  const fileSuggestions = useFileSuggestions(shouldLoadFiles ? state.filterText : "", {
    cwd: options.cwd,
    includeFiles: state.mentionType === "file",
    includeDirectories: true, // Always include directories for navigation
  });

  /**
   * Get the completed input value after a selection.
   */
  const getCompletedValue = useCallback(
    (currentValue: string, selectedValue: string, mode: MentionAutocompleteMode): string => {
      if (state.mentionStart === -1) return currentValue;

      const beforeMention = currentValue.slice(0, state.mentionStart);

      if (mode === "type") {
        // Type was selected, build the mention prefix
        const needsValue = mentionRequiresValue(selectedValue as MentionType);
        if (needsValue) {
          // Add colon and prepare for value input
          return `${beforeMention}@${selectedValue}:`;
        }
        // Standalone mention, add space
        return `${beforeMention}@${selectedValue} `;
      }

      // Value was selected
      if (state.mentionType) {
        // Check if selected value is a directory
        const isDir = fileSuggestions.suggestions.find(
          (s) => s.path === selectedValue
        )?.isDirectory;

        if (isDir) {
          // Directory selected, allow further navigation
          return `${beforeMention}@${state.mentionType}:${selectedValue}/`;
        }
        // File selected, complete the mention
        return `${beforeMention}@${state.mentionType}:${selectedValue} `;
      }

      return currentValue;
    },
    [state.mentionStart, state.mentionType, fileSuggestions.suggestions]
  );

  /**
   * Handle selection and return the new input value.
   */
  const handleSelect = useCallback(
    (selectedValue: string, mode: MentionAutocompleteMode): string => {
      return getCompletedValue(inputValue, selectedValue, mode);
    },
    [inputValue, getCompletedValue]
  );

  return {
    state,
    fileSuggestions,
    handleSelect,
    getCompletedValue,
  };
}
