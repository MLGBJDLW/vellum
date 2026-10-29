/**
 * LSP Confirm Dialog Component
 *
 * Modal dialog for confirming LSP server auto-mode actions in semi-auto mode.
 * Displays the server ID and action, allowing user to approve or deny.
 *
 * @module tui/components/Dialogs/LspConfirmDialog
 */

import type { ConfirmationRequest } from "@vellum/lsp";
import { Box, Text } from "ink";
import type React from "react";
import { useCallback, useId, useRef } from "react";
import { useInput } from "../../hooks/useTerminalInput.js";
import { Clickable } from "../common/Clickable.js";

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
  const dialogId = useId();
  const resolved = useRef<ConfirmationRequest | null>(null);
  const confirm = useCallback(
    (approved: boolean) => {
      if (!isFocused || resolved.current === request) return;
      resolved.current = request;
      onConfirm(approved);
    },
    [isFocused, request, onConfirm]
  );
  useInput(
    (input, key) => {
      if (input.toLowerCase() === "y" || key.return) {
        confirm(true);
      } else if (input.toLowerCase() === "n" || key.escape) {
        confirm(false);
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
      <Box marginTop={1} gap={1}>
        <Clickable
          id={`${dialogId}-yes`}
          width="auto"
          enabled={isFocused}
          onClick={() => confirm(true)}
        >
          <Text>[Y] Yes</Text>
        </Clickable>
        <Clickable
          id={`${dialogId}-no`}
          width="auto"
          enabled={isFocused}
          onClick={() => confirm(false)}
        >
          <Text>[N] No</Text>
        </Clickable>
      </Box>
    </Box>
  );
}
