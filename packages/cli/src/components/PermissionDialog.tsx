/**
 * PermissionDialog Component (T036)
 *
 * Ink-based terminal UI component for permission prompts.
 * Displays tool permission requests with Allow/Deny/Always Allow options.
 *
 * @module @vellum/cli
 */

import { Box, Text, useInput } from "ink";
import { useState } from "react";

/**
 * Permission dialog response options.
 * Matches PermissionResponse from @vellum/core:
 * - "once": Allow this time only
 * - "always": Always allow this tool
 * - "reject": Deny this request
 */
export type PermissionDialogResponse = "once" | "always" | "reject";

/**
 * Props for PermissionDialog component.
 */
export interface PermissionDialogProps {
  /** Name of the tool requesting permission */
  toolName: string;
  /** Optional description of the operation */
  description?: string;
  /** Optional parameters being passed (sanitized) */
  params?: Record<string, unknown>;
  /** Callback when user makes a selection */
  onResponse: (response: PermissionDialogResponse) => void;
  /** Whether the dialog is active (captures input) */
  isActive?: boolean;
}

/**
 * Button option for the dialog.
 */
interface ButtonOption {
  key: string;
  label: string;
  value: PermissionDialogResponse;
  color: string;
}

const BUTTON_OPTIONS: ButtonOption[] = [
  { key: "y", label: "[Y] Allow Once", value: "once", color: "green" },
  { key: "n", label: "[N] Deny", value: "reject", color: "red" },
  { key: "a", label: "[A] Always Allow", value: "always", color: "cyan" },
];

/**
 * PermissionDialog displays a terminal UI for permission requests.
 *
 * Features:
 * - Shows tool name and operation details
 * - Three response options: Allow, Deny, Always Allow
 * - Keyboard shortcuts (Y/N/A) for quick response
 * - Visual highlighting of selected option
 *
 * @example
 * ```tsx
 * <PermissionDialog
 *   toolName="write_file"
 *   description="Write to /etc/config"
 *   onResponse={(response) => console.log(response)}
 *   isActive={true}
 * />
 * ```
 */
export function PermissionDialog({
  toolName,
  description,
  params,
  onResponse,
  isActive = true,
}: PermissionDialogProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput(
    (input, key) => {
      // Handle keyboard shortcuts
      const lowerInput = input.toLowerCase();

      if (lowerInput === "y") {
        onResponse("once");
        return;
      }
      if (lowerInput === "n") {
        onResponse("reject");
        return;
      }
      if (lowerInput === "a") {
        onResponse("always");
        return;
      }

      // Handle arrow keys for navigation
      if (key.leftArrow) {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : BUTTON_OPTIONS.length - 1));
        return;
      }
      if (key.rightArrow) {
        setSelectedIndex((prev) => (prev < BUTTON_OPTIONS.length - 1 ? prev + 1 : 0));
        return;
      }

      // Handle Enter to confirm selection
      if (key.return) {
        const option = BUTTON_OPTIONS[selectedIndex];
        if (option) {
          onResponse(option.value);
        }
        return;
      }
    },
    { isActive }
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={2}
      paddingY={1}
      marginY={1}
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="yellow">
          ⚠️ Permission Required
        </Text>
      </Box>

      {/* Tool Info */}
      <Box marginBottom={1}>
        <Text>
          Tool:{" "}
          <Text bold color="cyan">
            {toolName}
          </Text>
        </Text>
      </Box>

      {/* Description */}
      {description && (
        <Box marginBottom={1}>
          <Text dimColor>{description}</Text>
        </Box>
      )}

      {/* Parameters (if provided) */}
      {params && Object.keys(params).length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>Parameters:</Text>
          {Object.entries(params)
            .slice(0, 3)
            .map(([key, value]) => (
              <Box key={key} marginLeft={2}>
                <Text dimColor>
                  {key}: {String(value).slice(0, 50)}
                  {String(value).length > 50 ? "..." : ""}
                </Text>
              </Box>
            ))}
          {Object.keys(params).length > 3 && (
            <Box marginLeft={2}>
              <Text dimColor>... and {Object.keys(params).length - 3} more</Text>
            </Box>
          )}
        </Box>
      )}

      {/* Buttons */}
      <Box gap={2}>
        {BUTTON_OPTIONS.map((option, index) => (
          <Box key={option.key}>
            <Text
              color={option.color}
              bold={index === selectedIndex}
              inverse={index === selectedIndex}
            >
              {" "}
              {option.label}{" "}
            </Text>
          </Box>
        ))}
      </Box>

      {/* Help text */}
      <Box marginTop={1}>
        <Text dimColor>Press Y/N/A or use ←→ and Enter</Text>
      </Box>
    </Box>
  );
}

export default PermissionDialog;
