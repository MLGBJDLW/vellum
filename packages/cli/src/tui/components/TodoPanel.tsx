/**
 * TodoPanel Component (Phase 26)
 *
 * React Ink component for displaying and managing todos in a scrollable list.
 * Supports filtering by status, keyboard navigation, and expandable details.
 *
 * @module tui/components/TodoPanel
 */

import { Box, type DOMElement, Text } from "ink";
import type React from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useMouseScroll } from "../hooks/useMouseScroll.js";
import { useInput } from "../hooks/useTerminalInput.js";
import { useTUITranslation } from "../i18n/index.js";
import { useTheme } from "../theme/index.js";
import { isEndKey, isHomeKey } from "../types/ink-extended.js";
import { Clickable, getVisibleClickBounds } from "./common/Clickable.js";
import { TodoItem, type TodoItemData } from "./TodoItem.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Filter options for todo list display
 */
export type TodoFilterStatus = "all" | "pending" | "in-progress" | "completed";

/**
 * Props for the TodoPanel component.
 */
export interface TodoPanelProps {
  /** List of todo items to display */
  readonly items: readonly TodoItemData[];
  /** Maximum height in lines */
  readonly maxHeight?: number;
  readonly width?: number;
  /** Whether the panel is focused for keyboard input */
  readonly isFocused?: boolean;
  /** Allow visible sidebar mouse actions without claiming keyboard focus. */
  readonly mouseEnabled?: boolean;
  /** Initial filter status */
  readonly initialFilter?: TodoFilterStatus;
  /** Callback when a todo item is selected */
  readonly onSelectItem?: (item: TodoItemData) => void;
  /** Callback when Enter is pressed on an item */
  readonly onActivateItem?: (item: TodoItemData) => void;
  /** Callback when filter changes */
  readonly onFilterChange?: (filter: TodoFilterStatus) => void;
  /** Callback to refresh the todo list */
  readonly onRefresh?: () => void;
}

// =============================================================================
// Constants
// =============================================================================

/** Default maximum height */
const DEFAULT_MAX_HEIGHT = 15;

/** Number of items per page */
const PAGE_SIZE = 5;

/** Available filter options in cycle order */
const FILTER_CYCLE: TodoFilterStatus[] = ["all", "pending", "in-progress", "completed"];

/** Filter display labels */
const FILTER_LABELS: Record<TodoFilterStatus, string> = {
  all: "All",
  pending: "Pending",
  "in-progress": "In Progress",
  completed: "Completed",
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Filter todos based on status filter.
 */
function filterTodos(
  items: readonly TodoItemData[],
  filter: TodoFilterStatus
): readonly TodoItemData[] {
  if (filter === "all") {
    return items;
  }
  return items.filter((item) => item.status === filter);
}

/**
 * Get visible entries based on scroll position.
 */
function getVisibleEntries<T>(
  entries: readonly T[],
  scrollOffset: number,
  maxVisible: number
): readonly T[] {
  return entries.slice(scrollOffset, scrollOffset + maxVisible);
}

/**
 * Calculate progress statistics.
 */
function calculateProgress(items: readonly TodoItemData[]): {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  percentage: number;
} {
  const total = items.length;
  const pending = items.filter((i) => i.status === "pending").length;
  const inProgress = items.filter((i) => i.status === "in-progress").length;
  const completed = items.filter((i) => i.status === "completed").length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { total, pending, inProgress, completed, percentage };
}

// =============================================================================
// ProgressBar Component
// =============================================================================

interface ProgressBarProps {
  percentage: number;
  width: number;
}

function ProgressBar({ percentage, width }: ProgressBarProps): React.JSX.Element {
  const { theme } = useTheme();
  const barWidth = Math.max(width - 6, 10); // Account for percentage text
  const filledWidth = Math.round((percentage / 100) * barWidth);
  const emptyWidth = barWidth - filledWidth;

  return (
    <Box>
      <Text color={theme.colors.success}>{"█".repeat(filledWidth)}</Text>
      <Text dimColor>{"░".repeat(emptyWidth)}</Text>
      <Text dimColor> {percentage}%</Text>
    </Box>
  );
}

// =============================================================================
// Main TodoPanel Component
// =============================================================================

/**
 * TodoPanel - Displays todos in a scrollable list with filtering.
 *
 * Features:
 * - j/k or arrow keys for navigation
 * - Tab to cycle filters
 * - Enter to toggle expand
 * - Page up/down support
 * - Progress summary with bar
 * - Refresh on 'r' key
 *
 * @example
 * ```tsx
 * <TodoPanel
 *   items={todoItems}
 *   maxHeight={12}
 *   isFocused={true}
 *   onActivateItem={(item) => console.log("Selected:", item.title)}
 * />
 * ```
 */
export function TodoPanel({
  items,
  maxHeight = DEFAULT_MAX_HEIGHT,
  width = 80,
  isFocused = true,
  mouseEnabled = isFocused,
  initialFilter = "all",
  onSelectItem,
  onActivateItem,
  onFilterChange,
  onRefresh,
}: TodoPanelProps): React.JSX.Element {
  const { theme } = useTheme();
  const { t } = useTUITranslation();
  const panelId = useId();
  const panelNode = useRef<DOMElement>(null);
  const getBounds = useCallback(() => {
    const bounds = getVisibleClickBounds(panelNode.current);
    return bounds && { ...bounds, left: bounds.left - 1, top: bounds.top - 1 };
  }, []);

  // Track selection, scroll, filter, and expansion
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;
  const [scrollOffset, setScrollOffset] = useState(0);
  const [filter, setFilter] = useState<TodoFilterStatus>(initialFilter);
  const [expandedId, setExpandedId] = useState<string | number | null>(null);

  // Filter items
  const filteredItems = useMemo(() => filterTodos(items, filter), [items, filter]);

  // Calculate visible items (account for header and footer)
  const maxVisible = Math.max(1, maxHeight - 6);

  useEffect(() => {
    setSelectedIndex((index) => Math.min(index, Math.max(0, filteredItems.length - 1)));
    setScrollOffset((offset) => Math.min(offset, Math.max(0, filteredItems.length - maxVisible)));
  }, [filteredItems.length, maxVisible]);

  // Get visible entries
  const visibleEntries = useMemo(
    () => getVisibleEntries(filteredItems, scrollOffset, maxVisible),
    [filteredItems, scrollOffset, maxVisible]
  );

  // Get selected item
  const selectedItem = filteredItems[selectedIndex];

  // Calculate progress
  const progress = useMemo(() => calculateProgress(items), [items]);

  // Scroll indicators
  const canScrollUp = scrollOffset > 0;
  const canScrollDown = scrollOffset + maxVisible < filteredItems.length;

  /**
   * Navigate to a specific index.
   */
  const navigateToIndex = useCallback(
    (newIndex: number) => {
      const maxIndex = Math.max(0, filteredItems.length - 1);
      const clampedIndex = Math.max(0, Math.min(newIndex, maxIndex));
      selectedIndexRef.current = clampedIndex;
      setSelectedIndex(clampedIndex);

      // Adjust scroll to keep selection visible
      setScrollOffset((offset) =>
        clampedIndex < offset
          ? clampedIndex
          : clampedIndex >= offset + maxVisible
            ? clampedIndex - maxVisible + 1
            : offset
      );

      // Notify parent
      if (onSelectItem && filteredItems[clampedIndex]) {
        onSelectItem(filteredItems[clampedIndex]);
      }
    },
    [filteredItems, maxVisible, onSelectItem]
  );

  /**
   * Cycle to next filter.
   */
  const selectFilter = useCallback(
    (nextFilter: TodoFilterStatus) => {
      setFilter(nextFilter);
      selectedIndexRef.current = 0;
      setSelectedIndex(0);
      setScrollOffset(0);
      setExpandedId(null);
      onFilterChange?.(nextFilter);
    },
    [onFilterChange]
  );
  const cycleFilter = useCallback(() => {
    const currentIdx = FILTER_CYCLE.indexOf(filter);
    const nextIdx = (currentIdx + 1) % FILTER_CYCLE.length;
    const nextFilter = FILTER_CYCLE[nextIdx] ?? "all";
    selectFilter(nextFilter);
  }, [filter, selectFilter]);
  const activateItem = useCallback(
    (item: TodoItemData) => {
      if (expandedId === item.id) onActivateItem?.(item);
      else setExpandedId(item.id);
    },
    [expandedId, onActivateItem]
  );
  useMouseScroll({
    enabled: mouseEnabled,
    bounds: getBounds,
    onScroll: (delta) => navigateToIndex(selectedIndexRef.current + delta),
  });

  // Handle keyboard input
  useInput(
    (input, key) => {
      if (!isFocused) return;

      // Navigation down
      if (input === "j" || key.downArrow) {
        navigateToIndex(selectedIndex + 1);
        return;
      }

      // Navigation up
      if (input === "k" || key.upArrow) {
        navigateToIndex(selectedIndex - 1);
        return;
      }

      // Page down
      if (key.pageDown || (key.ctrl && input === "d")) {
        navigateToIndex(selectedIndex + PAGE_SIZE);
        return;
      }

      // Page up
      if (key.pageUp || (key.ctrl && input === "u")) {
        navigateToIndex(selectedIndex - PAGE_SIZE);
        return;
      }

      // Home
      if (input === "g" || isHomeKey(input)) {
        navigateToIndex(0);
        return;
      }

      // End
      if (input === "G" || isEndKey(input)) {
        navigateToIndex(filteredItems.length - 1);
        return;
      }

      // Tab to cycle filter
      if (key.tab) {
        cycleFilter();
        return;
      }

      // Enter to toggle expand or activate
      if (key.return && selectedItem) {
        activateItem(selectedItem);
        return;
      }

      // Escape to collapse
      if (key.escape) {
        setExpandedId(null);
        return;
      }

      // Refresh
      if (input === "r") {
        onRefresh?.();
        return;
      }
    },
    { isActive: isFocused }
  );

  // Estimate terminal width (fallback)
  const estimatedWidth = width;

  // Empty state
  if (items.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text color={theme.colors.primary} bold>
            {t("todo.title")}
          </Text>
        </Box>
        <Text dimColor>{t("todo.empty")}</Text>
        <Text dimColor>{t("todo.emptyHint")}</Text>
        {onRefresh && (
          <Clickable id={`${panelId}-refresh`} enabled={mouseEnabled} onClick={onRefresh}>
            <Text dimColor>[r] Refresh</Text>
          </Clickable>
        )}
      </Box>
    );
  }

  // No items match filter
  if (filteredItems.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        {/* Header */}
        <Box marginBottom={1}>
          <Text color={theme.colors.primary} bold>
            {t("todo.title")}
          </Text>
          <Text dimColor> ({items.length} total)</Text>
        </Box>

        {/* Filter indicator */}
        <Box marginBottom={1}>
          <Text dimColor>{t("todo.filter")}</Text>
          <Clickable
            id={`${panelId}-filter`}
            width="auto"
            enabled={mouseEnabled}
            onClick={cycleFilter}
          >
            <Text color={theme.colors.accent} bold>
              {FILTER_LABELS[filter]}
            </Text>
          </Clickable>
        </Box>

        <Text dimColor>{t("todo.noMatch", { filter })}</Text>
        <Text dimColor>{t("todo.changeFilter")}</Text>
        {onRefresh && (
          <Clickable id={`${panelId}-refresh`} enabled={mouseEnabled} onClick={onRefresh}>
            <Text dimColor>[r] Refresh</Text>
          </Clickable>
        )}
      </Box>
    );
  }

  return (
    <Box ref={panelNode} flexDirection="column">
      {/* Header with progress */}
      <Box marginBottom={1} paddingX={1} flexDirection="column">
        <Box>
          <Text color={theme.colors.primary} bold>
            {t("todo.title")}
          </Text>
          <Text dimColor>
            {" "}
            ({filteredItems.length}
            {filter !== "all" ? ` ${filter}` : ""} / {items.length} total)
          </Text>
        </Box>

        {/* Progress bar */}
        <Box marginTop={0}>
          <ProgressBar
            percentage={progress.percentage}
            width={Math.max(6, Math.min(40, width - 16))}
          />
          <Text dimColor>
            {" "}
            ({progress.completed}/{progress.total} done)
          </Text>
        </Box>
      </Box>

      {/* Filter tabs */}
      <Box paddingX={1} marginBottom={1}>
        {width < 60 ? (
          <Clickable id={`${panelId}-filter`} enabled={mouseEnabled} onClick={cycleFilter}>
            <Text dimColor wrap="truncate">
              {FILTER_LABELS[filter]} · Tab to filter
            </Text>
          </Clickable>
        ) : (
          FILTER_CYCLE.map((f, i) => (
            <Box key={f}>
              {i > 0 && <Text dimColor> │ </Text>}
              <Clickable
                id={`${panelId}-filter-${f}`}
                width="auto"
                enabled={mouseEnabled}
                onClick={() => selectFilter(f)}
              >
                <Text
                  color={f === filter ? theme.colors.primary : theme.colors.muted}
                  bold={f === filter}
                >
                  {FILTER_LABELS[f]}
                </Text>
              </Clickable>
            </Box>
          ))
        )}
      </Box>

      {/* Scroll indicator - up */}
      {canScrollUp && (
        <Box paddingX={1}>
          <Clickable
            id={`${panelId}-previous`}
            enabled={mouseEnabled}
            onClick={() => navigateToIndex(selectedIndex - PAGE_SIZE)}
          >
            <Text dimColor>↑ {scrollOffset} more above</Text>
          </Clickable>
        </Box>
      )}

      {/* Todo list */}
      <Box flexDirection="column" paddingX={1}>
        {visibleEntries.map((item, i) => (
          <Clickable
            key={item.id}
            id={`${panelId}-item-${item.id}`}
            enabled={mouseEnabled}
            onClick={() => {
              navigateToIndex(scrollOffset + i);
              activateItem(item);
            }}
          >
            <TodoItem
              item={item}
              isSelected={scrollOffset + i === selectedIndex}
              width={estimatedWidth}
              isExpanded={expandedId === item.id}
            />
          </Clickable>
        ))}
      </Box>

      {/* Scroll indicator - down */}
      {canScrollDown && (
        <Box paddingX={1}>
          <Clickable
            id={`${panelId}-next`}
            enabled={mouseEnabled}
            onClick={() => navigateToIndex(selectedIndex + PAGE_SIZE)}
          >
            <Text dimColor>↓ {filteredItems.length - scrollOffset - maxVisible} more below</Text>
          </Clickable>
        </Box>
      )}
      <Box paddingX={1} gap={2}>
        {onRefresh && (
          <Clickable
            id={`${panelId}-refresh`}
            width="auto"
            enabled={mouseEnabled}
            onClick={onRefresh}
          >
            <Text dimColor>[r] Refresh</Text>
          </Clickable>
        )}
        {expandedId !== null && (
          <Clickable
            id={`${panelId}-collapse`}
            width="auto"
            enabled={mouseEnabled}
            onClick={() => setExpandedId(null)}
          >
            <Text dimColor>[Esc] Collapse</Text>
          </Clickable>
        )}
      </Box>

      {/* Help hint */}
      {isFocused && (
        <Box marginTop={1} paddingX={1} flexDirection="column">
          <Text dimColor>{t("todo.keybindings")}</Text>
        </Box>
      )}
    </Box>
  );
}
