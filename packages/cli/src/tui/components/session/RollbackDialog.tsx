/**
 * RollbackDialog Component
 *
 * Modal confirmation dialog for session rollback operations.
 * Displays a warning about data loss and requires user confirmation.
 *
 * @module tui/components/session/RollbackDialog
 */

import type { SessionCheckpoint } from "@vellum/core";
import { Box, Text, useInput } from "ink";
import type React from "react";
import { useTUITranslation } from "../../i18n/index.js";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the RollbackDialog component
 */
export interface RollbackDialogProps {
  /** Checkpoint to rollback to */
  readonly checkpoint: SessionCheckpoint | null;
  /** Number of messages that will be lost */
  readonly messagesToLose: number;
  /** Whether the dialog is open */
  readonly isOpen: boolean;
  /** Callback when user confirms rollback */
  readonly onConfirm: () => void;
  /** Callback when user cancels */
  readonly onCancel: () => void;
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * RollbackDialog displays a confirmation prompt for rollback operations.
 *
 * Features:
 * - Shows checkpoint details
 * - Displays warning about message loss
 * - y/n confirmation
 * - Red warning styling
 *
 * Keybindings:
 * - y/Y/Enter: Confirm rollback
 * - n/N/Escape: Cancel
 *
 * @example
 * ```tsx
 * <RollbackDialog
 *   checkpoint={selectedCheckpoint}
 *   messagesToLose={5}
 *   isOpen={showDialog}
 *   onConfirm={() => {
 *     handleRollback();
 *     setShowDialog(false);
 *   }}
 *   onCancel={() => setShowDialog(false)}
 * />
 * ```
 */
export function RollbackDialog({
  checkpoint,
  messagesToLose,
  isOpen,
  onConfirm,
  onCancel,
}: RollbackDialogProps): React.JSX.Element | null {
  const { theme } = useTheme();
  const { t } = useTUITranslation();

  // Get colors from theme
  const errorColor = theme.colors.error;
  const warningColor = theme.colors.warning;
  const successColor = theme.colors.success;
  const textColor = theme.semantic.text.primary;
  const mutedColor = theme.semantic.text.muted;
  const borderColor = errorColor; // Use error color for border to emphasize danger

  /**
   * Handle keyboard input
   */
  useInput(
    (input, key) => {
      // Confirm: y, Y, or Enter
      if (input === "y" || input === "Y" || key.return) {
        onConfirm();
        return;
      }

      // Cancel: n, N, or Escape
      if (input === "n" || input === "N" || key.escape) {
        onCancel();
        return;
      }
    },
    { isActive: isOpen }
  );

  if (!isOpen || !checkpoint) {
    return null;
  }

  const checkpointDescription = checkpoint.description ?? "(no description)";
  const checkpointIdShort = checkpoint.id.slice(0, 8);

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={borderColor}
      paddingX={2}
      paddingY={1}
    >
      {/* Title */}
      <Box marginBottom={1}>
        <Text bold color={errorColor}>
          ⚠️ {t("persistence.rollback.confirm")}
        </Text>
      </Box>

      {/* Checkpoint Info */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color={textColor}>
          Checkpoint: <Text color={mutedColor}>[{checkpointIdShort}]</Text>{" "}
          <Text bold>{checkpointDescription}</Text>
        </Text>
        <Text color={mutedColor}>Message index: {checkpoint.messageIndex}</Text>
      </Box>

      {/* Warning Message */}
      <Box marginBottom={1} paddingX={1}>
        <Text color={warningColor} bold>
          {t("persistence.rollback.warning", { count: messagesToLose })}
        </Text>
      </Box>

      {/* Emphasis on irreversibility */}
      <Box marginBottom={1}>
        <Text color={errorColor} dimColor>
          This action cannot be undone.
        </Text>
      </Box>

      {/* Action Buttons */}
      <Box flexDirection="row" gap={2}>
        <Box>
          <Text color={successColor}>[y]</Text>
          <Text color={textColor}> Confirm</Text>
        </Box>
        <Box>
          <Text color={errorColor}>[n]</Text>
          <Text color={textColor}> Cancel</Text>
        </Box>
      </Box>
    </Box>
  );
}

// =============================================================================
// Exports
// =============================================================================

export default RollbackDialog;
