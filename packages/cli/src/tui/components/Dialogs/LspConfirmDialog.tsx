/**
 * LSP Confirm Dialog Component
 *
 * Modal dialog for confirming LSP server auto-mode actions in semi-auto mode.
 * Displays the server ID and action, allowing user to approve or deny.
 *
 * @module tui/components/Dialogs/LspConfirmDialog
 */

import type { ConfirmationRequest } from "@vellum/lsp";
import { Box, Text, useInput } from "ink";
import type React from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for LspConfirmDialog component
 */
export interface LspConfirmDialogProps {
  /** The confirmation request to display */
  readonly request: ConfirmationRequest;
  /** Callback when user confirms or denies the action */
  readonly onConfirm: (approved: boolean) => void;
  /** Whether dialog is currently focused (default: true) */
  readonly isFocused?: boolean;
}

// =============================================================================
// Component
// =============================================================================

/**
 * LSP Confirm Dialog component.
 *
 * Displays a confirmation prompt for LSP server actions (install/start).
 * User can press Y/Enter to approve or N/Escape to deny.
 *
 * @example
 * ```tsx
 * <LspConfirmDialog
 *   request={{
 *     serverId: "typescript",
 *     languageId: "typescript",
 *     action: "install",
 *     message: "TypeScript language server is not installed.",
 *   }}
 *   onConfirm={(approved) => console.log("User approved:", approved)}
 * />
 * ```
 */
export function LspConfirmDialog({
  request,
  onConfirm,
  isFocused = true,
}: LspConfirmDialogProps): React.JSX.Element {
  useInput(
    (input, key) => {
      if (input.toLowerCase() === "y" || key.return) {
        onConfirm(true);
      } else if (input.toLowerCase() === "n" || key.escape) {
        onConfirm(false);
      }
    },
    { isActive: isFocused }
  );

  const actionText = request.action === "install" ? "Install" : "Start";

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} width="100%">
      <Text bold color="yellow">
        [LSP] {actionText} {request.serverId}?
      </Text>
      <Text dimColor>{request.message}</Text>
      <Box marginTop={1}>
        <Text>[Y] Yes [N] No</Text>
      </Box>
    </Box>
  );
}
