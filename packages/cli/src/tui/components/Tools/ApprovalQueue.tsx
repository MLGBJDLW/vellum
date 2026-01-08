/**
 * ApprovalQueue Component (T030)
 *
 * A queue component for batch approval of multiple tool executions.
 * Displays pending approvals with navigation and batch actions.
 * Supports keyboard navigation and individual/batch approval.
 *
 * @module tui/components/Tools/ApprovalQueue
 */

import type { VellumTheme } from "@vellum/shared";
import { Box, Text, useInput } from "ink";
import type React from "react";
import { useCallback, useState } from "react";
import type { ToolExecution } from "../../context/ToolsContext.js";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the ApprovalQueue component.
 */
export interface ApprovalQueueProps {
  /** List of tool executions pending approval */
  readonly executions: ToolExecution[];
  /** Callback when a single execution is approved */
  readonly onApprove: (id: string) => void;
  /** Callback when a single execution is rejected */
  readonly onReject: (id: string) => void;
  /** Callback to approve all pending executions */
  readonly onApproveAll: () => void;
  /** Callback to reject all pending executions */
  readonly onRejectAll: () => void;
  /** Whether the queue is currently focused (default: true) */
  readonly isFocused?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Maximum number of items visible in the queue */
const MAX_VISIBLE_ITEMS = 5;

/** Number keys for quick selection (1-9) */
const NUMBER_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Truncate tool name to fit display.
 *
 * @param name - Tool name to truncate
 * @param maxLength - Maximum length (default: 30)
 * @returns Truncated name
 */
function truncateToolName(name: string, maxLength = 30): string {
  if (name.length <= maxLength) {
    return name;
  }
  return `${name.slice(0, maxLength - 1)}…`;
}

/**
 * Get a brief summary of tool parameters.
 *
 * @param params - Tool parameters
 * @returns Brief parameter summary
 */
function getParamSummary(params: Record<string, unknown>): string {
  const keys = Object.keys(params);
  if (keys.length === 0) {
    return "no params";
  }
  if (keys.length === 1) {
    const key = keys[0];
    if (key !== undefined) {
      const value = params[key];
      if (typeof value === "string" && value.length < 20) {
        return `${key}: ${value}`;
      }
    }
    return "1 param";
  }
  return `${keys.length} params`;
}

// =============================================================================
// Sub-Components
// =============================================================================

/**
 * Header showing queue count and batch action hints.
 */
function QueueHeader({
  count,
  theme,
}: {
  readonly count: number;
  readonly theme: VellumTheme;
}): React.JSX.Element {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={theme.colors.warning} bold>
          Pending Approvals: {count}
        </Text>
      </Box>
      <Box gap={2}>
        <Text dimColor>
          <Text color={theme.colors.success}>[a]</Text> approve all
        </Text>
        <Text dimColor>
          <Text color={theme.colors.error}>[r]</Text> reject all
        </Text>
        <Text dimColor>
          <Text color={theme.colors.info}>[↑↓]</Text> navigate
        </Text>
        <Text dimColor>
          <Text color={theme.colors.success}>[y]</Text> approve
        </Text>
        <Text dimColor>
          <Text color={theme.colors.error}>[n]</Text> reject
        </Text>
      </Box>
    </Box>
  );
}

/**
 * Single queue item showing tool info.
 */
function QueueItem({
  execution,
  index,
  isSelected,
  theme,
}: {
  readonly execution: ToolExecution;
  readonly index: number;
  readonly isSelected: boolean;
  readonly theme: VellumTheme;
}): React.JSX.Element {
  const displayIndex = index + 1;
  const bgColor = isSelected ? theme.semantic.background.elevated : undefined;
  const paramSummary = getParamSummary(execution.params);

  return (
    <Box>
      <Text backgroundColor={bgColor}>
        {isSelected ? "▸ " : "  "}
        <Text dimColor>{displayIndex}.</Text>{" "}
        <Text color={theme.colors.primary} bold={isSelected}>
          {truncateToolName(execution.toolName)}
        </Text>
        <Text dimColor> ({paramSummary})</Text>
      </Text>
    </Box>
  );
}

/**
 * Empty state when no approvals pending.
 */
function EmptyState({ theme }: { readonly theme: VellumTheme }): React.JSX.Element {
  return (
    <Box paddingY={1}>
      <Text color={theme.colors.muted}>No pending approvals</Text>
    </Box>
  );
}

/**
 * Scroll indicator for long lists.
 */
function ScrollIndicator({
  currentIndex,
  totalCount,
  visibleCount,
  theme,
}: {
  readonly currentIndex: number;
  readonly totalCount: number;
  readonly visibleCount: number;
  readonly theme: VellumTheme;
}): React.JSX.Element | null {
  if (totalCount <= visibleCount) {
    return null;
  }

  const hasMore = currentIndex + visibleCount < totalCount;
  const hasPrevious = currentIndex > 0;

  return (
    <Box marginTop={1}>
      <Text color={theme.colors.muted} dimColor>
        {hasPrevious && "↑ more above "}
        {hasPrevious && hasMore && "| "}
        {hasMore && "↓ more below"}
        {!hasPrevious && !hasMore && ""}
      </Text>
    </Box>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * ApprovalQueue displays a list of pending tool executions for batch approval.
 *
 * Features:
 * - Shows count of pending approvals
 * - Lists queued executions with tool name and parameter summary
 * - Keyboard navigation with arrow keys
 * - Number keys (1-9) for quick selection
 * - 'a' to approve all, 'r' to reject all
 * - 'y' to approve selected, 'n' to reject selected
 *
 * @param props - Component props
 * @returns The rendered queue component
 *
 * @example
 * ```tsx
 * <ApprovalQueue
 *   executions={pendingExecutions}
 *   onApprove={(id) => handleApprove(id)}
 *   onReject={(id) => handleReject(id)}
 *   onApproveAll={() => handleApproveAll()}
 *   onRejectAll={() => handleRejectAll()}
 * />
 * ```
 */
export function ApprovalQueue({
  executions,
  onApprove,
  onReject,
  onApproveAll,
  onRejectAll,
  isFocused = true,
}: ApprovalQueueProps): React.JSX.Element {
  const { theme } = useTheme();
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Calculate visible window for scrolling
  const startIndex = Math.max(
    0,
    Math.min(
      selectedIndex - Math.floor(MAX_VISIBLE_ITEMS / 2),
      executions.length - MAX_VISIBLE_ITEMS
    )
  );
  const visibleExecutions = executions.slice(startIndex, startIndex + MAX_VISIBLE_ITEMS);

  /**
   * Handle navigation to previous item.
   */
  const navigateUp = useCallback(() => {
    setSelectedIndex((prev) => Math.max(0, prev - 1));
  }, []);

  /**
   * Handle navigation to next item.
   */
  const navigateDown = useCallback(() => {
    setSelectedIndex((prev) => Math.min(executions.length - 1, prev + 1));
  }, [executions.length]);

  /**
   * Handle number key selection.
   */
  const selectByNumber = useCallback(
    (num: number) => {
      const targetIndex = startIndex + num - 1;
      if (targetIndex >= 0 && targetIndex < executions.length) {
        setSelectedIndex(targetIndex);
      }
    },
    [startIndex, executions.length]
  );

  /**
   * Approve the currently selected execution.
   */
  const approveSelected = useCallback(() => {
    if (executions.length > 0 && selectedIndex < executions.length) {
      const execution = executions[selectedIndex];
      if (execution) {
        onApprove(execution.id);
        // Adjust selection if needed
        if (selectedIndex >= executions.length - 1 && selectedIndex > 0) {
          setSelectedIndex(selectedIndex - 1);
        }
      }
    }
  }, [executions, selectedIndex, onApprove]);

  /**
   * Reject the currently selected execution.
   */
  const rejectSelected = useCallback(() => {
    if (executions.length > 0 && selectedIndex < executions.length) {
      const execution = executions[selectedIndex];
      if (execution) {
        onReject(execution.id);
        // Adjust selection if needed
        if (selectedIndex >= executions.length - 1 && selectedIndex > 0) {
          setSelectedIndex(selectedIndex - 1);
        }
      }
    }
  }, [executions, selectedIndex, onReject]);

  // Handle keyboard input
  useInput(
    (input, key) => {
      // Navigation
      if (key.upArrow) {
        navigateUp();
        return;
      }
      if (key.downArrow) {
        navigateDown();
        return;
      }

      // Batch actions
      if (input.toLowerCase() === "a") {
        onApproveAll();
        return;
      }
      if (input.toLowerCase() === "r") {
        onRejectAll();
        return;
      }

      // Individual actions
      if (input.toLowerCase() === "y") {
        approveSelected();
        return;
      }
      if (input.toLowerCase() === "n") {
        rejectSelected();
        return;
      }

      // Number key selection
      const numberIndex = NUMBER_KEYS.indexOf(input);
      if (numberIndex !== -1) {
        selectByNumber(numberIndex + 1);
      }
    },
    { isActive: isFocused && executions.length > 0 }
  );

  // Empty state
  if (executions.length === 0) {
    return <EmptyState theme={theme} />;
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.semantic.border.default}
      padding={1}
    >
      <QueueHeader count={executions.length} theme={theme} />

      <Box flexDirection="column">
        {visibleExecutions.map((execution, visibleIdx) => {
          const actualIndex = startIndex + visibleIdx;
          return (
            <QueueItem
              key={execution.id}
              execution={execution}
              index={actualIndex}
              isSelected={actualIndex === selectedIndex}
              theme={theme}
            />
          );
        })}
      </Box>

      <ScrollIndicator
        currentIndex={startIndex}
        totalCount={executions.length}
        visibleCount={MAX_VISIBLE_ITEMS}
        theme={theme}
      />
    </Box>
  );
}
