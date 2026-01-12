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
 * Structured option for autocomplete with optional metadata.
 */
export interface AutocompleteOption {
  /** Option name/value */
  readonly name: string;
  /** Optional description */
  readonly description?: string;
  /** Optional category for grouping */
  readonly category?: string;
}

/**
 * Props for the Autocomplete component.
 */
export interface AutocompleteProps {
  /** Current input value to filter options against */
  readonly input: string;
  /** All available options to filter from (string[] for backward compat, or structured) */
  readonly options: readonly string[] | readonly AutocompleteOption[];
  /** Callback when an option is selected (Tab or Enter) */
  readonly onSelect: (value: string) => void;
  /** Callback when autocomplete is cancelled (Escape) */
  readonly onCancel: () => void;
  /** Whether the autocomplete dropdown is visible (default: true) */
  readonly visible?: boolean;
  /**
   * Whether the autocomplete should capture keyboard input (default: same as `visible`).
   *
   * This allows rendering suggestions while the input cursor is no longer in the
   * command token, without hijacking Enter/history behavior.
   */
  readonly active?: boolean;
  /** Maximum number of items to show (default: 5) */
  readonly maxVisible?: number;
  /** Enable category grouping (default: false) */
  readonly grouped?: boolean;
  /** Category display order (optional, unspecified categories go last) */
  readonly categoryOrder?: readonly string[];
  /** Category labels for i18n (category key -> display label) */
  readonly categoryLabels?: Record<string, string>;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Normalize options to structured format.
 * Handles both string[] and AutocompleteOption[] inputs.
 */
function normalizeOptions(
  options: readonly string[] | readonly AutocompleteOption[]
): AutocompleteOption[] {
  if (options.length === 0) return [];

  // Check if first item is a string
  if (typeof options[0] === "string") {
    return (options as readonly string[]).map((opt) => ({ name: opt }));
  }

  return [...(options as readonly AutocompleteOption[])];
}

/**
 * Filter options by case-insensitive prefix match.
 *
 * @param options - All available options (normalized)
 * @param input - Current input to match against
 * @returns Filtered array of matching options
 */
function filterStructuredOptions(
  options: readonly AutocompleteOption[],
  input: string
): AutocompleteOption[] {
  if (!input) return [...options];

  const lowerInput = input.toLowerCase();
  return options.filter((opt) => opt.name.toLowerCase().startsWith(lowerInput));
}

/**
 * Group options by category.
 *
 * @param options - Filtered options to group
 * @param categoryOrder - Preferred order of categories
 * @returns Map of category -> options, ordered by categoryOrder
 */
function groupByCategory(
  options: readonly AutocompleteOption[],
  categoryOrder: readonly string[] = []
): Map<string, AutocompleteOption[]> {
  const groups = new Map<string, AutocompleteOption[]>();
  const uncategorized: AutocompleteOption[] = [];

  // First pass: collect all options by category
  for (const opt of options) {
    const category = opt.category || "";
    if (!category) {
      uncategorized.push(opt);
    } else {
      const group = groups.get(category);
      if (group) {
        group.push(opt);
      } else {
        groups.set(category, [opt]);
      }
    }
  }

  // Build ordered result
  const result = new Map<string, AutocompleteOption[]>();

  // Add categories in specified order first
  for (const cat of categoryOrder) {
    const group = groups.get(cat);
    if (group && group.length > 0) {
      // Sort commands within category alphabetically
      group.sort((a, b) => a.name.localeCompare(b.name));
      result.set(cat, group);
      groups.delete(cat);
    }
  }

  // Add remaining categories alphabetically
  const remainingCategories = Array.from(groups.keys()).sort();
  for (const cat of remainingCategories) {
    const group = groups.get(cat);
    if (group && group.length > 0) {
      group.sort((a, b) => a.name.localeCompare(b.name));
      result.set(cat, group);
    }
  }

  // Add uncategorized at the end if any
  if (uncategorized.length > 0) {
    uncategorized.sort((a, b) => a.name.localeCompare(b.name));
    result.set("", uncategorized);
  }

  return result;
}

/**
 * Flatten grouped options into a single array with category markers.
 * Returns items in display order with indices for keyboard navigation.
 */
interface FlattenedItem {
  type: "category" | "option";
  option?: AutocompleteOption;
  category?: string;
  selectableIndex?: number; // Only for options
}

function flattenGroupedOptions(
  grouped: Map<string, AutocompleteOption[]>,
  categoryLabels: Record<string, string> = {}
): { items: FlattenedItem[]; selectableOptions: AutocompleteOption[] } {
  const items: FlattenedItem[] = [];
  const selectableOptions: AutocompleteOption[] = [];
  let selectableIndex = 0;

  for (const [category, options] of grouped) {
    // Add category header (if category name is not empty)
    if (category) {
      items.push({
        type: "category",
        category: categoryLabels[category] || category,
      });
    }

    // Add options
    for (const opt of options) {
      items.push({
        type: "option",
        option: opt,
        selectableIndex,
      });
      selectableOptions.push(opt);
      selectableIndex++;
    }
  }

  return { items, selectableOptions };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
 * - Category grouping with headers
 *
 * @example
 * ```tsx
 * // Simple string options (backward compatible)
 * <Autocomplete
 *   input="/he"
 *   options={['/help', '/history', '/hello']}
 *   onSelect={(cmd) => setInput(cmd)}
 *   onCancel={() => setShowAutocomplete(false)}
 * />
 *
 * // Grouped options with categories
 * <Autocomplete
 *   input="/he"
 *   options={[
 *     { name: 'help', description: 'Show help', category: 'system' },
 *     { name: 'history', description: 'Show history', category: 'session' },
 *   ]}
 *   grouped={true}
 *   categoryOrder={['system', 'session']}
 *   categoryLabels={{ system: 'System', session: 'Session' }}
 *   onSelect={(cmd) => setInput(cmd)}
 *   onCancel={() => setShowAutocomplete(false)}
 * />
 * ```
 */
export function Autocomplete({
  input,
  options,
  onSelect,
  onCancel,
  visible = true,
  active,
  maxVisible = 10,
  grouped = false,
  categoryOrder = [],
  categoryLabels = {},
}: AutocompleteProps) {
  const { theme } = useTheme();

  const isActive = active ?? visible;

  // Currently selected index in the selectable options
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Window start index for scrollable rendering (in terms of display items)
  const [windowStart, setWindowStart] = useState(0);

  // Normalize and filter options
  const normalizedOptions = useMemo(() => normalizeOptions(options), [options]);

  const filteredOptions = useMemo(
    () => filterStructuredOptions(normalizedOptions, input),
    [normalizedOptions, input]
  );

  // Group and flatten for display
  const { displayItems, selectableOptions } = useMemo(() => {
    if (!grouped) {
      // Non-grouped mode: simple list
      const sorted = [...filteredOptions].sort((a, b) => a.name.localeCompare(b.name));
      return {
        displayItems: sorted.map(
          (opt, i): FlattenedItem => ({ type: "option", option: opt, selectableIndex: i })
        ),
        selectableOptions: sorted,
      };
    }

    // Grouped mode
    const groupedMap = groupByCategory(filteredOptions, categoryOrder);
    const { items, selectableOptions: selectable } = flattenGroupedOptions(
      groupedMap,
      categoryLabels
    );
    return { displayItems: items, selectableOptions: selectable };
  }, [filteredOptions, grouped, categoryOrder, categoryLabels]);

  // Calculate visible items (windowed) for grouped display
  const { visibleItems, overflowCount } = useMemo(() => {
    if (displayItems.length <= maxVisible) {
      return { visibleItems: displayItems, overflowCount: 0 };
    }

    // Find window that includes the selected item
    // We need to map selectedIndex to display item position
    let selectedDisplayIndex = 0;
    for (let i = 0; i < displayItems.length; i++) {
      // biome-ignore lint/style/noNonNullAssertion: Index guaranteed valid in for-loop
      const item = displayItems[i]!;
      if (item.type === "option" && item.selectableIndex === selectedIndex) {
        selectedDisplayIndex = i;
        break;
      }
    }

    // Adjust window to keep selected visible
    let start = windowStart;
    if (selectedDisplayIndex < start) {
      start = selectedDisplayIndex;
    } else if (selectedDisplayIndex >= start + maxVisible) {
      start = selectedDisplayIndex - maxVisible + 1;
    }

    // Clamp to valid range
    const maxStart = Math.max(0, displayItems.length - maxVisible);
    start = Math.max(0, Math.min(start, maxStart));

    const items = displayItems.slice(start, start + maxVisible);
    const overflow = Math.max(0, displayItems.length - (start + maxVisible));

    return { visibleItems: items, overflowCount: overflow };
  }, [displayItems, maxVisible, windowStart, selectedIndex]);

  // Reset selection when input changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: Intentionally reset selection when input prop changes
  useEffect(() => {
    setSelectedIndex(0);
    setWindowStart(0);
  }, [input]);

  // Keep selection in bounds when filtered list changes
  useEffect(() => {
    if (selectableOptions.length === 0) {
      setSelectedIndex(0);
      setWindowStart(0);
      return;
    }

    const clampedIndex = clamp(selectedIndex, 0, selectableOptions.length - 1);
    if (clampedIndex !== selectedIndex) {
      setSelectedIndex(clampedIndex);
    }
  }, [selectableOptions.length, selectedIndex]);

  // Handle keyboard input
  useInput(
    useCallback(
      (_char, key) => {
        if (!visible || selectableOptions.length === 0) return;

        // Arrow down - move selection down
        if (key.downArrow) {
          setSelectedIndex((prev) => Math.min(prev + 1, selectableOptions.length - 1));
          return;
        }

        // Arrow up - move selection up
        if (key.upArrow) {
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          return;
        }

        // Tab or Enter - select current option
        if (key.tab || key.return) {
          const selected = selectableOptions[selectedIndex];
          if (selected) {
            onSelect(selected.name);
          }
          return;
        }

        // Escape - cancel autocomplete
        if (key.escape) {
          onCancel();
          return;
        }
      },
      [visible, selectableOptions, selectedIndex, onSelect, onCancel]
    ),
    { isActive: isActive && selectableOptions.length > 0 }
  );

  // Don't render if not visible or no matching options
  if (!visible || selectableOptions.length === 0) {
    return null;
  }

  // Theme-based styling
  const borderColor = theme.semantic.border.default;
  const highlightColor = theme.colors.primary;
  const normalColor = theme.semantic.text.primary;
  const mutedColor = theme.semantic.text.muted;
  const categoryColor = theme.colors.secondary;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={borderColor}
      paddingLeft={1}
      paddingRight={1}
    >
      {visibleItems.map((item, displayIdx) => {
        if (item.type === "category") {
          // Render category header
          return (
            <Box key={`cat-${item.category}`} marginTop={displayIdx > 0 ? 1 : 0}>
              <Text color={categoryColor} bold dimColor>
                ─── {item.category} ───
              </Text>
            </Box>
          );
        }

        // Render option
        // biome-ignore lint/style/noNonNullAssertion: Option guaranteed when item.type is 'option'
        const opt = item.option!;
        const isSelected = item.selectableIndex === selectedIndex;
        const matchLength = input.length;

        return (
          <Box key={opt.name} flexDirection="row">
            {isSelected ? (
              <Text inverse>
                <Text color={highlightColor} bold>
                  {"› "}
                </Text>
                <HighlightedOption
                  option={opt.name}
                  matchLength={matchLength}
                  highlightColor={highlightColor}
                  normalColor={normalColor}
                />
                {opt.description && <Text color={mutedColor}> - {opt.description}</Text>}
              </Text>
            ) : (
              <Text>
                {"  "}
                <HighlightedOption
                  option={opt.name}
                  matchLength={matchLength}
                  highlightColor={highlightColor}
                  normalColor={normalColor}
                />
                {opt.description && (
                  <Text color={mutedColor} dimColor>
                    {" "}
                    - {opt.description}
                  </Text>
                )}
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
