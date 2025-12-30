/**
 * Autocomplete Component (T011)
 *
 * A dropdown component for command/option suggestions with keyboard navigation.
 * Filters options based on prefix match and displays highlighted results.
 *
 * @module tui/components/Input/Autocomplete
 */

import { Box, Text, useInput } from "ink";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the Autocomplete component.
 */
export interface AutocompleteProps {
  /** Current input value to filter options against */
  readonly input: string;
  /** All available options to filter from */
  readonly options: readonly string[];
  /** Callback when an option is selected (Tab or Enter) */
  readonly onSelect: (value: string) => void;
  /** Callback when autocomplete is cancelled (Escape) */
  readonly onCancel: () => void;
  /** Whether the autocomplete dropdown is visible (default: true) */
  readonly visible?: boolean;
  /** Maximum number of items to show (default: 5) */
  readonly maxVisible?: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Filter options by case-insensitive prefix match.
 *
 * @param options - All available options
 * @param input - Current input to match against
 * @returns Filtered array of matching options
 */
function filterOptions(options: readonly string[], input: string): string[] {
  if (!input) return [];

  const lowerInput = input.toLowerCase();
  return options.filter((opt) => opt.toLowerCase().startsWith(lowerInput));
}

/**
 * Highlight the matching portion of an option.
 *
 * @param option - The option text
 * @param matchLength - Length of the matching prefix
 * @returns JSX elements with highlighted match
 */
function HighlightedOption({
  option,
  matchLength,
  highlightColor,
  normalColor,
}: {
  option: string;
  matchLength: number;
  highlightColor: string;
  normalColor: string;
}) {
  const matchedPart = option.slice(0, matchLength);
  const restPart = option.slice(matchLength);

  return (
    <Text>
      <Text color={highlightColor} bold>
        {matchedPart}
      </Text>
      <Text color={normalColor}>{restPart}</Text>
    </Text>
  );
}

// =============================================================================
// Component
// =============================================================================

/**
 * Autocomplete provides a dropdown for filtering and selecting options.
 *
 * Features:
 * - Case-insensitive prefix filtering
 * - Keyboard navigation (Up/Down arrows)
 * - Selection via Tab or Enter
 * - Cancellation via Escape
 * - Highlighted matching portions
 * - Scrollable list with "[X more]" indicator
 *
 * @example
 * ```tsx
 * <Autocomplete
 *   input="/he"
 *   options={['/help', '/history', '/hello']}
 *   onSelect={(cmd) => setInput(cmd)}
 *   onCancel={() => setShowAutocomplete(false)}
 * />
 * // Shows: /help, /hello (prefix-filtered, with "/he" highlighted)
 * ```
 */
export function Autocomplete({
  input,
  options,
  onSelect,
  onCancel,
  visible = true,
  maxVisible = 5,
}: AutocompleteProps) {
  const { theme } = useTheme();

  // Currently selected index in the filtered list
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filter options based on input
  const filteredOptions = useMemo(() => filterOptions(options, input), [options, input]);

  // Calculate visible items and overflow count
  const visibleOptions = useMemo(() => {
    return filteredOptions.slice(0, maxVisible);
  }, [filteredOptions, maxVisible]);

  const overflowCount = filteredOptions.length - maxVisible;

  // Reset selection when input changes (which affects filtered options)
  // biome-ignore lint/correctness/useExhaustiveDependencies: Intentionally reset selection when input prop changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [input]);

  // Handle keyboard input
  useInput(
    useCallback(
      (_char, key) => {
        // Don't handle input if not visible or no options
        if (!visible || filteredOptions.length === 0) return;

        // Arrow down - move selection down
        if (key.downArrow) {
          setSelectedIndex((prev) => Math.min(prev + 1, filteredOptions.length - 1));
          return;
        }

        // Arrow up - move selection up
        if (key.upArrow) {
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          return;
        }

        // Tab or Enter - select current option
        if (key.tab || key.return) {
          const selected = filteredOptions[selectedIndex];
          if (selected) {
            onSelect(selected);
          }
          return;
        }

        // Escape - cancel autocomplete
        if (key.escape) {
          onCancel();
          return;
        }
      },
      [visible, filteredOptions, selectedIndex, onSelect, onCancel]
    ),
    { isActive: visible && filteredOptions.length > 0 }
  );

  // Don't render if not visible or no matching options
  if (!visible || filteredOptions.length === 0) {
    return null;
  }

  // Theme-based styling
  const borderColor = theme.semantic.border.default;
  const highlightColor = theme.colors.primary;
  const normalColor = theme.semantic.text.primary;
  const mutedColor = theme.semantic.text.muted;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={borderColor}
      paddingLeft={1}
      paddingRight={1}
    >
      {visibleOptions.map((option, index) => {
        const isSelected = index === selectedIndex;
        const matchLength = input.length;

        return (
          <Box key={option}>
            {isSelected ? (
              <Text inverse>
                <Text color={highlightColor} bold>
                  {"› "}
                </Text>
                <HighlightedOption
                  option={option}
                  matchLength={matchLength}
                  highlightColor={highlightColor}
                  normalColor={normalColor}
                />
              </Text>
            ) : (
              <Text>
                {"  "}
                <HighlightedOption
                  option={option}
                  matchLength={matchLength}
                  highlightColor={highlightColor}
                  normalColor={normalColor}
                />
              </Text>
            )}
          </Box>
        );
      })}

      {/* Show overflow indicator if there are more items */}
      {overflowCount > 0 && (
        <Box paddingTop={0}>
          <Text color={mutedColor} dimColor>
            [{overflowCount} more]
          </Text>
        </Box>
      )}
    </Box>
  );
}
