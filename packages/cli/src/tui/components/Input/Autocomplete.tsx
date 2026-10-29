/**
 * Autocomplete Component (T011)
 *
 * A dropdown component for command/option suggestions with keyboard navigation.
 * Filters options based on prefix match and displays highlighted results.
 *
 * @module tui/components/Input/Autocomplete
 */

import { Box, type DOMElement, Text } from "ink";
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useMouseInteractionEnabled } from "../../context/MouseContext.js";
import { useMouseScroll } from "../../hooks/useMouseScroll.js";
import { useInput } from "../../hooks/useTerminalInput.js";
import {
  type FuzzyResult,
  fuzzySearch,
  getHighlightSegments,
  type HighlightRange,
} from "../../services/fuzzy-search.js";
import { useTheme } from "../../theme/index.js";
import { Clickable, getVisibleClickBounds } from "../common/Clickable.js";

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
  /** Optional aliases for matching (e.g., quit -> exit) */
  readonly aliases?: readonly string[];
}

/**
 * Props for the Autocomplete component.
 */
export interface AutocompleteProps {
  /** Current input value to filter options against */
  readonly input: string;
  /** All available options to filter from (string[] for backward compat, or structured) */
  readonly options: readonly string[] | readonly AutocompleteOption[];
  /** Complete an option on mouse click; the parent owns keyboard Tab/Enter. */
  readonly onSelect: (value: string) => void;
  /** Callback when autocomplete is cancelled (Escape) */
  readonly onCancel: () => void;
  /** Callback when selection index changes (for parent to track selection state) */
  readonly onSelectionChange?: (
    index: number,
    hasOptions: boolean,
    selectedOption?: AutocompleteOption
  ) => void;
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
 * Fuzzy filtered option with highlight information.
 */
interface FilteredOption {
  readonly option: AutocompleteOption;
  readonly highlights: readonly HighlightRange[];
  readonly score: number;
}

/**
 * Filter options using fuzzy matching.
 *
 * @param options - All available options (normalized)
 * @param input - Current input to match against
 * @returns Filtered array of matching options with highlights, sorted by score
 */
function filterStructuredOptions(
  options: readonly AutocompleteOption[],
  input: string
): FilteredOption[] {
  if (!input) {
    // No input - return all options sorted alphabetically
    return [...options]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((opt) => ({ option: opt, highlights: [], score: 0 }));
  }

  // Use fuzzy search on the name field
  const results = fuzzySearch(options, input, "name", {
    threshold: -10000, // Allow weak matches for better UX
  });

  // Also check aliases with separate fuzzy search
  const optionsWithAliases = options.filter((opt) => opt.aliases && opt.aliases.length > 0);
  const aliasMatches = new Map<AutocompleteOption, FuzzyResult<AutocompleteOption>>();

  for (const opt of optionsWithAliases) {
    if (!opt.aliases) continue;
    for (const alias of opt.aliases) {
      const aliasResult = fuzzySearch([{ ...opt, name: alias }], input, "name");
      if (aliasResult.length > 0 && aliasResult[0]) {
        const existing = aliasMatches.get(opt);
        if (!existing || aliasResult[0].score > existing.score) {
          aliasMatches.set(opt, { ...aliasResult[0], item: opt });
        }
      }
    }
  }

  // Merge results: prefer name match, but include alias-only matches
  const resultMap = new Map<AutocompleteOption, FilteredOption>();

  for (const result of results) {
    resultMap.set(result.item, {
      option: result.item,
      highlights: result.highlights,
      score: result.score,
    });
  }

  // Add alias matches that aren't already in results (or have better score)
  for (const [opt, aliasResult] of aliasMatches) {
    const existing = resultMap.get(opt);
    if (!existing) {
      // Not matched by name, add with empty highlights (matched via alias)
      resultMap.set(opt, {
        option: opt,
        highlights: [], // Don't highlight name since alias matched
        score: aliasResult.score,
      });
    }
  }

  // Sort by score (higher is better)
  return Array.from(resultMap.values()).sort((a, b) => b.score - a.score);
}

/**
 * Group options by category.
 *
 * @param options - Filtered options to group (already sorted by score)
 * @param categoryOrder - Preferred order of categories
 * @returns Map of category -> options, ordered by categoryOrder
 */
function groupByCategory(
  options: readonly FilteredOption[],
  categoryOrder: readonly string[] = []
): Map<string, FilteredOption[]> {
  const groups = new Map<string, FilteredOption[]>();
  const uncategorized: FilteredOption[] = [];

  // First pass: collect all options by category
  for (const filteredOpt of options) {
    const category = filteredOpt.option.category || "";
    if (!category) {
      uncategorized.push(filteredOpt);
    } else {
      const group = groups.get(category);
      if (group) {
        group.push(filteredOpt);
      } else {
        groups.set(category, [filteredOpt]);
      }
    }
  }

  // Build ordered result
  const result = new Map<string, FilteredOption[]>();

  // Add categories in specified order first
  for (const cat of categoryOrder) {
    const group = groups.get(cat);
    if (group && group.length > 0) {
      // Sort by score within category (already sorted, but re-sort for consistency)
      group.sort((a, b) => b.score - a.score);
      result.set(cat, group);
      groups.delete(cat);
    }
  }

  // Add remaining categories alphabetically
  const remainingCategories = Array.from(groups.keys()).sort();
  for (const cat of remainingCategories) {
    const group = groups.get(cat);
    if (group && group.length > 0) {
      group.sort((a, b) => b.score - a.score);
      result.set(cat, group);
    }
  }

  // Add uncategorized at the end if any
  if (uncategorized.length > 0) {
    uncategorized.sort((a, b) => b.score - a.score);
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
  highlights?: readonly HighlightRange[]; // For fuzzy match highlighting
}

function flattenGroupedOptions(
  grouped: Map<string, FilteredOption[]>,
  categoryLabels: Record<string, string> = {}
): { items: FlattenedItem[]; selectableOptions: FilteredOption[] } {
  const items: FlattenedItem[] = [];
  const selectableOptions: FilteredOption[] = [];
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
    for (const filteredOpt of options) {
      items.push({
        type: "option",
        option: filteredOpt.option,
        selectableIndex,
        highlights: filteredOpt.highlights,
      });
      selectableOptions.push(filteredOpt);
      selectableIndex++;
    }
  }

  return { items, selectableOptions };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Highlight the matching portions of an option using fuzzy match ranges.
 *
 * @param option - The option text
 * @param highlights - Highlight ranges from fuzzy matching
 * @returns JSX elements with highlighted matches
 */
function HighlightedOption({
  option,
  highlights,
  highlightColor,
  normalColor,
}: {
  option: string;
  highlights: readonly HighlightRange[];
  highlightColor: string;
  normalColor: string;
}) {
  const segments = getHighlightSegments(option, highlights);

  return (
    <Text>
      {segments.map((segment, index) =>
        segment.highlighted ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: Stateless text cells are identified by their position, including repeated text.
          <Text key={`${index}-${segment.text}`} color={highlightColor} bold>
            {segment.text}
          </Text>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: Stateless text cells are identified by their position, including repeated text.
          <Text key={`${index}-${segment.text}`} color={normalColor}>
            {segment.text}
          </Text>
        )
      )}
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
function AutocompleteComponent({
  input,
  options,
  onSelect,
  onCancel,
  onSelectionChange,
  visible = true,
  active,
  maxVisible = 10,
  grouped = false,
  categoryOrder = [],
  categoryLabels = {},
}: AutocompleteProps) {
  const { theme } = useTheme();
  const mouseInteractionEnabled = useMouseInteractionEnabled();
  const menuRef = useRef<DOMElement>(null);
  const menuId = useId();
  const isActive = visible && (active ?? true);

  // Currently selected index in the selectable options
  const [selection, setSelection] = useState({ key: "", index: 0 });

  // Normalize and filter options
  const normalizedOptions = useMemo(() => normalizeOptions(options), [options]);

  const filteredOptions = useMemo(
    () => filterStructuredOptions(normalizedOptions, input),
    [normalizedOptions, input]
  );

  // Group and flatten for display
  const { displayItems, selectableOptions } = useMemo(() => {
    if (!grouped) {
      // Non-grouped mode: already sorted by score from filterStructuredOptions
      return {
        displayItems: filteredOptions.map(
          (filtered, i): FlattenedItem => ({
            type: "option",
            option: filtered.option,
            selectableIndex: i,
            highlights: filtered.highlights,
          })
        ),
        selectableOptions: filteredOptions,
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

  // Derive the reset before rendering or notifying the parent, so a changed
  // query/submenu can never temporarily expose the preceding menu's selection.
  const selectionKey = JSON.stringify([
    input,
    visible,
    selectableOptions.map(({ option }) => option.name),
  ]);
  const selectedIndex =
    selection.key === selectionKey
      ? clamp(selection.index, 0, Math.max(0, selectableOptions.length - 1))
      : 0;
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;
  if (selection.key !== selectionKey) setSelection({ key: selectionKey, index: 0 });

  const selectIndex = useCallback(
    (index: number) => {
      const next = clamp(index, 0, Math.max(0, selectableOptions.length - 1));
      selectedIndexRef.current = next;
      setSelection({ key: selectionKey, index: next });
      onSelectionChange?.(next, selectableOptions.length > 0, selectableOptions[next]?.option);
    },
    [onSelectionChange, selectableOptions, selectionKey]
  );

  const getMenuBounds = useCallback(() => {
    const bounds = getVisibleClickBounds(menuRef.current);
    return bounds ? { ...bounds, top: bounds.top - 1, left: bounds.left - 1 } : null;
  }, []);
  useMouseScroll({
    enabled: isActive && mouseInteractionEnabled && selectableOptions.length > 0,
    priority: 20,
    scrollSpeed: 1,
    bounds: getMenuBounds,
    onScroll: useCallback(
      (delta: number) => selectIndex(selectedIndexRef.current + delta),
      [selectIndex]
    ),
  });

  // Calculate visible items (windowed) for grouped display
  const { visibleItems, overflowCount } = useMemo(() => {
    if (displayItems.length <= maxVisible) {
      return { visibleItems: displayItems, overflowCount: 0 };
    }

    // Find window that includes the selected item
    // We need to map selectedIndex to display item position
    let selectedDisplayIndex = 0;
    for (let i = 0; i < displayItems.length; i++) {
      const item = displayItems[i];
      if (!item) continue;
      if (item.type === "option" && item.selectableIndex === selectedIndex) {
        selectedDisplayIndex = i;
        break;
      }
    }

    // Adjust window to keep selected visible
    let start = 0;
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
  }, [displayItems, maxVisible, selectedIndex]);

  // Notify parent of selection changes
  useEffect(() => {
    const selectedOption = selectableOptions[selectedIndex]?.option;
    onSelectionChange?.(selectedIndex, selectableOptions.length > 0, selectedOption);
  }, [selectedIndex, selectableOptions, onSelectionChange]);

  // Handle keyboard input for arrow navigation and escape only
  // Note: Enter/Tab selection is handled by parent CommandInput to avoid race condition
  useInput(
    useCallback(
      (_char, key) => {
        if (!visible || selectableOptions.length === 0) return;

        // Arrow down - move selection down
        if (key.downArrow) {
          selectIndex(selectedIndexRef.current + 1);
          return;
        }

        // Arrow up - move selection up
        if (key.upArrow) {
          selectIndex(selectedIndexRef.current - 1);
          return;
        }

        // Escape - cancel autocomplete
        if (key.escape) {
          onCancel();
          return;
        }
      },
      [visible, selectableOptions, onCancel, selectIndex]
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
      ref={menuRef}
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
        const opt = item.option;
        if (!opt) return null;
        const isSelected = item.selectableIndex === selectedIndex;
        const highlights = item.highlights ?? [];

        return (
          <Clickable
            key={`${selectionKey}:${opt.name}`}
            id={`${menuId}:${selectionKey}:${opt.name}`}
            enabled={isActive}
            onClick={() => {
              selectIndex(item.selectableIndex ?? 0);
              onSelect(opt.name);
            }}
          >
            {isSelected ? (
              <Text inverse>
                <Text color={highlightColor} bold>
                  {"› "}
                </Text>
                <HighlightedOption
                  option={opt.name}
                  highlights={highlights}
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
                  highlights={highlights}
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
          </Clickable>
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

/**
 * Memoized Autocomplete to prevent unnecessary re-renders.
 */
export const Autocomplete = memo(AutocompleteComponent);
