/**
 * CheckpointPanel Component
 *
 * Modal panel for managing session checkpoints.
 * Allows viewing, creating, and rolling back to checkpoints.
 *
 * @module tui/components/session/CheckpointPanel
 */

import type { SessionCheckpoint } from "@vellum/core";
import { Box, type DOMElement, Text } from "ink";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMouseScroll } from "../../hooks/useMouseScroll.js";
import { useInput } from "../../hooks/useTerminalInput.js";
import { useTUITranslation } from "../../i18n/index.js";
import { useTheme } from "../../theme/index.js";
import { truncateToDisplayWidth } from "../../utils/index.js";
import { Clickable, getVisibleClickBounds } from "../common/Clickable.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the CheckpointPanel component
 */
export interface CheckpointPanelProps {
  /** List of checkpoints to display */
  readonly checkpoints: readonly SessionCheckpoint[];
  /** Current message count (for calculating messages to lose) */
  readonly currentMessageCount: number;
  /** Whether the panel is open */
  readonly isOpen: boolean;
  /** Callback when a checkpoint is selected for rollback */
  readonly onRollback: (checkpointId: string) => void;
  /** Callback when a new checkpoint is requested */
  readonly onCreateCheckpoint: (description?: string) => void;
  /** Callback when a checkpoint is deleted */
  readonly onDeleteCheckpoint: (checkpointId: string) => void;
  /** Callback to close the panel */
  readonly onClose: () => void;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format a date for display.
 */
function formatDate(date: Date): string {
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Truncate text with ellipsis.
 * Uses string-width for accurate CJK/Emoji handling.
 */
function truncate(text: string, maxLength: number): string {
  return truncateToDisplayWidth(text, maxLength);
}

// =============================================================================
// CheckpointItem Sub-Component
// =============================================================================

interface CheckpointItemProps {
  readonly checkpoint: SessionCheckpoint;
  readonly isSelected: boolean;
  readonly messagesToLose: number;
  readonly primaryColor: string;
  readonly warningColor: string;
  readonly textColor: string;
  readonly mutedColor: string;
}

function CheckpointItem({
  checkpoint,
  isSelected,
  messagesToLose,
  primaryColor,
  warningColor,
  textColor,
  mutedColor,
}: CheckpointItemProps): React.JSX.Element {
  const indicator = isSelected ? "▶" : " ";
  const description = checkpoint.description ?? "(no description)";
  const idShort = checkpoint.id.slice(0, 8);
  const dateStr = formatDate(new Date(checkpoint.createdAt));

  return (
    <Box flexDirection="row" paddingX={1}>
      <Text color={isSelected ? primaryColor : mutedColor}>{indicator} </Text>
      <Box flexDirection="row" justifyContent="space-between" flexGrow={1}>
        <Box flexDirection="row" gap={1}>
          <Text color={isSelected ? primaryColor : mutedColor} dimColor={!isSelected}>
            [{idShort}]
          </Text>
          <Text color={isSelected ? primaryColor : textColor} bold={isSelected}>
            {truncate(description, 30)}
          </Text>
        </Box>
        <Box flexDirection="row" gap={1}>
          <Text color={mutedColor}>{dateStr}</Text>
          <Text color={mutedColor}>|</Text>
          <Text color={mutedColor}>msg #{checkpoint.messageIndex}</Text>
          {messagesToLose > 0 && <Text color={warningColor}>(-{messagesToLose})</Text>}
        </Box>
      </Box>
    </Box>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * CheckpointPanel displays and manages session checkpoints.
 *
 * Keybindings:
 * - j/k or ↑/↓: Navigate checkpoints
 * - Enter: Rollback to selected checkpoint
 * - n: Create new checkpoint
 * - d: Delete selected checkpoint
 * - Escape/q: Close panel
 *
 * @example
 * ```tsx
 * <CheckpointPanel
 *   checkpoints={checkpoints}
 *   currentMessageCount={messages.length}
 *   isOpen={showPanel}
 *   onRollback={(id) => handleRollback(id)}
 *   onCreateCheckpoint={(desc) => handleCreate(desc)}
 *   onDeleteCheckpoint={(id) => handleDelete(id)}
 *   onClose={() => setShowPanel(false)}
 * />
 * ```
 */
export function CheckpointPanel({
  checkpoints,
  currentMessageCount,
  isOpen,
  onRollback,
  onCreateCheckpoint,
  onDeleteCheckpoint,
  onClose,
}: CheckpointPanelProps): React.JSX.Element | null {
  const { theme } = useTheme();
  const { t } = useTUITranslation();

  // Selection state
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const listRef = useRef<DOMElement>(null);
  const maxVisible = 8;
  const maxOffset = Math.max(0, checkpoints.length - maxVisible);
  useEffect(() => {
    setSelectedIndex((index) => Math.min(index, Math.max(0, checkpoints.length - 1)));
    setScrollOffset((offset) => Math.min(offset, maxOffset));
  }, [checkpoints.length, maxOffset]);
  useEffect(() => {
    setScrollOffset((offset) =>
      selectedIndex < offset
        ? selectedIndex
        : selectedIndex >= offset + maxVisible
          ? selectedIndex - maxVisible + 1
          : offset
    );
  }, [selectedIndex]);
  useMouseScroll({
    enabled: isOpen,
    bounds: () => {
      const bounds = getVisibleClickBounds(listRef.current);
      return bounds ? { ...bounds, top: bounds.top - 1, left: bounds.left - 1 } : null;
    },
    onScroll: (delta) =>
      setScrollOffset((offset) => Math.max(0, Math.min(offset + delta, maxOffset))),
  });

  // Get colors from theme
  const primaryColor = theme.brand.primary;
  const warningColor = theme.colors.warning;
  const textColor = theme.semantic.text.primary;
  const mutedColor = theme.semantic.text.muted;
  const borderColor = theme.semantic.border.default;

  /**
   * Calculate messages that would be lost for a checkpoint.
   */
  const getMessagesToLose = useCallback(
    (checkpoint: SessionCheckpoint): number => {
      return currentMessageCount - checkpoint.messageIndex;
    },
    [currentMessageCount]
  );

  /**
   * Handle navigation keys (j/k, arrows)
   */
  const handleNavigation = useCallback(
    (input: string, key: { downArrow: boolean; upArrow: boolean }): boolean => {
      if (input === "j" || key.downArrow) {
        setSelectedIndex((prev) => Math.max(0, Math.min(prev + 1, checkpoints.length - 1)));
        return true;
      }
      if (input === "k" || key.upArrow) {
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        return true;
      }
      return false;
    },
    [checkpoints.length]
  );

  /**
   * Handle action keys (Enter, n, d)
   */
  const handleAction = useCallback(
    (input: string, key: { return: boolean }): boolean => {
      if (key.return && checkpoints.length > 0) {
        const checkpoint = checkpoints[selectedIndex];
        if (checkpoint) {
          onRollback(checkpoint.id);
        }
        return true;
      }
      if (input === "n") {
        onCreateCheckpoint();
        return true;
      }
      if (input === "d" && checkpoints.length > 0) {
        const checkpoint = checkpoints[selectedIndex];
        if (checkpoint) {
          onDeleteCheckpoint(checkpoint.id);
          if (selectedIndex >= checkpoints.length - 1) {
            setSelectedIndex(Math.max(0, checkpoints.length - 2));
          }
        }
        return true;
      }
      return false;
    },
    [checkpoints, selectedIndex, onRollback, onCreateCheckpoint, onDeleteCheckpoint]
  );

  /**
   * Handle keyboard input.
   */
  useInput(
    (input, key) => {
      if (handleNavigation(input, key)) return;
      if (handleAction(input, key)) return;
      if (key.escape || input === "q") {
        onClose();
      }
    },
    { isActive: isOpen }
  );

  if (!isOpen) {
    return null;
  }

  const isEmpty = checkpoints.length === 0;

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={borderColor}
      paddingX={1}
      paddingY={0}
    >
      {/* Header */}
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <Text bold color={primaryColor}>
          📌 {t("persistence.checkpoint.title")}
        </Text>
        <Box gap={1}>
          <Text dimColor>j/k navigate</Text>
          <Clickable
            id="checkpoint-rollback"
            width="auto"
            enabled={isOpen && !isEmpty}
            onClick={() => handleAction("", { return: true })}
          >
            <Text dimColor>Enter rollback</Text>
          </Clickable>
          <Clickable
            id="checkpoint-new"
            width="auto"
            enabled={isOpen}
            onClick={() => handleAction("n", { return: false })}
          >
            <Text dimColor>n new</Text>
          </Clickable>
          <Clickable
            id="checkpoint-delete"
            width="auto"
            enabled={isOpen && !isEmpty}
            onClick={() => handleAction("d", { return: false })}
          >
            <Text dimColor>d delete</Text>
          </Clickable>
          <Clickable id="checkpoint-close" width="auto" enabled={isOpen} onClick={onClose}>
            <Text dimColor>Esc close</Text>
          </Clickable>
        </Box>
      </Box>

      {/* Checkpoint List */}
      {isEmpty ? (
        <Box paddingX={1} paddingY={1}>
          <Text color={mutedColor}>{t("persistence.checkpoint.empty")}</Text>
        </Box>
      ) : (
        <Box ref={listRef} flexDirection="column">
          {checkpoints.slice(scrollOffset, scrollOffset + maxVisible).map((checkpoint, index) => (
            <Clickable
              key={checkpoint.id}
              id={`checkpoint-${checkpoint.id}`}
              enabled={isOpen}
              onClick={() => setSelectedIndex(scrollOffset + index)}
            >
              <CheckpointItem
                checkpoint={checkpoint}
                isSelected={scrollOffset + index === selectedIndex}
                messagesToLose={getMessagesToLose(checkpoint)}
                primaryColor={primaryColor}
                warningColor={warningColor}
                textColor={textColor}
                mutedColor={mutedColor}
              />
            </Clickable>
          ))}
        </Box>
      )}

      {/* Footer - Warning for selected checkpoint */}
      {!isEmpty &&
        (() => {
          const selectedCheckpoint = checkpoints[selectedIndex];
          if (!selectedCheckpoint) return null;
          const messagesToLose = getMessagesToLose(selectedCheckpoint);
          return (
            <Box marginTop={1} paddingX={1}>
              {messagesToLose > 0 ? (
                <Text color={warningColor}>
                  ⚠ Rollback will remove {messagesToLose} message
                  {messagesToLose === 1 ? "" : "s"}
                </Text>
              ) : (
                <Text color={mutedColor}>Already at this checkpoint</Text>
              )}
            </Box>
          );
        })()}
    </Box>
  );
}

// =============================================================================
// Exports
// =============================================================================

export default CheckpointPanel;
