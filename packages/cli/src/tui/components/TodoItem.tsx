/**
 * TodoItem Component (Phase 26)
 *
 * Individual todo item component for the TodoPanel.
 * Displays status icon, title, and optional description preview.
 *
 * @module tui/components/TodoItem
 */

import { Box, Text } from "ink";
import type React from "react";
import { useTUITranslation } from "../i18n/index.js";
import { useTheme } from "../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Todo status values
 */
export type TodoStatus = "pending" | "in-progress" | "completed";

/**
 * Simplified todo item for display
 */
export interface TodoItemData {
  /** Unique identifier */
  readonly id: string | number;
  /** Task title/text */
  readonly title: string;
  /** Current status */
  readonly status: TodoStatus;
  /** Optional description */
  readonly description?: string;
  /** ISO timestamp when created */
  readonly createdAt: string;
  /** ISO timestamp when completed */
  readonly completedAt?: string;
}

/**
 * Props for the TodoItem component.
 */
export interface TodoItemProps {
  /** The todo item data */
  readonly item: TodoItemData;
  /** Whether this item is currently selected */
  readonly isSelected: boolean;
  /** Available width for rendering */
  readonly width: number;
  /** Whether to show expanded details */
  readonly isExpanded?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Status icons */
const STATUS_ICONS: Record<TodoStatus, string> = {
  pending: "o",
  "in-progress": "~",
  completed: "+",
};

/** Status colors */
const STATUS_COLORS: Record<TodoStatus, string> = {
  pending: "yellow",
  "in-progress": "cyan",
  completed: "green",
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Truncate text to a maximum length.
 */
function truncate(text: string, maxLength: number): string {
  const singleLine = text.replace(/\n/g, " ").trim();
  if (singleLine.length <= maxLength) {
    return singleLine;
  }
  return `${singleLine.slice(0, maxLength - 1)}…`;
}

/**
 * Format a date for display.
 */
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${month}/${day} ${hours}:${minutes}`;
  } catch {
    return "";
  }
}

// =============================================================================
// TodoItem Component
// =============================================================================

/**
 * TodoItem - Renders a single todo item.
 *
 * Shows status icon, title, and optional description preview.
 * Supports selection highlighting and expanded details view.
 *
 * @example
 * ```tsx
 * <TodoItem
 *   item={{ id: "1", title: "Task", status: "pending", createdAt: "..." }}
 *   isSelected={true}
 *   width={80}
 * />
 * ```
 */
export function TodoItem({
  item,
  isSelected,
  width,
  isExpanded = false,
}: TodoItemProps): React.JSX.Element {
  const { theme } = useTheme();
  const { t } = useTUITranslation();
  const icon = STATUS_ICONS[item.status];
  const statusColor = STATUS_COLORS[item.status];

  // Calculate available width for title
  const fixedWidth = 4 + 2 + 12; // selector + icon + spacing + date
  const titleWidth = Math.max(width - fixedWidth - 4, 15);

  if (isExpanded) {
    return (
      <Box flexDirection="column">
        {/* Main line */}
        <Box>
          {isSelected && (
            <Text color={theme.colors.primary} bold>
              {"› "}
            </Text>
          )}
          {!isSelected && <Text dimColor>{"  "}</Text>}

          <Text color={statusColor} bold>
            {icon}{" "}
          </Text>
          <Text
            color={item.status === "completed" ? theme.colors.muted : undefined}
            strikethrough={item.status === "completed"}
            bold={isSelected}
          >
            {item.title}
          </Text>
        </Box>

        {/* Expanded details */}
        <Box flexDirection="column" marginLeft={4} marginTop={0}>
          {item.description && (
            <Box>
              <Text dimColor> </Text>
              <Text color={theme.colors.muted}>{truncate(item.description, width - 8)}</Text>
            </Box>
          )}
          <Box>
            <Text dimColor> {t("todo.created")}</Text>
            <Text>{formatDate(item.createdAt)}</Text>
            {item.completedAt && (
              <>
                <Text dimColor> • {t("todo.completed")}</Text>
                <Text color={theme.colors.success}>{formatDate(item.completedAt)}</Text>
              </>
            )}
          </Box>
        </Box>
      </Box>
    );
  }

  // Compact view
  return (
    <Box>
      {isSelected && (
        <Text color={theme.colors.primary} bold>
          {"› "}
        </Text>
      )}
      {!isSelected && <Text dimColor>{"  "}</Text>}

      <Text color={statusColor} bold>
        {icon}{" "}
      </Text>
      <Text
        color={item.status === "completed" ? theme.colors.muted : undefined}
        strikethrough={item.status === "completed"}
      >
        {truncate(item.title, titleWidth)}
      </Text>
      <Text dimColor> </Text>
      <Text dimColor>{formatDate(item.createdAt)}</Text>
    </Box>
  );
}
