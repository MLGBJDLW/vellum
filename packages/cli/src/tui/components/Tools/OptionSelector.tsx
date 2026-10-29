/**
 * OptionSelector Component
 *
 * TUI component for selecting options from a list with keyboard navigation.
 * Used by ask_followup_question tool when suggestions are provided.
 *
 * @module tui/components/Tools/OptionSelector
 */

import { Box, Text } from "ink";
import type React from "react";
import { useCallback, useId, useRef, useState } from "react";
import { useMouseInteractionEnabled } from "../../context/MouseContext.js";
import { useInput } from "../../hooks/useTerminalInput.js";
import { useTheme } from "../../theme/index.js";
import { Clickable } from "../common/Clickable.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the OptionSelector component.
 */
export interface OptionSelectorProps {
  /** Question to display above options */
  readonly question: string;
  /** Options to select from */
  readonly options: readonly string[];
  /** Callback when option is selected */
  readonly onSelect: (option: string, index: number) => void;
  /** Callback when cancelled (Esc pressed) */
  readonly onCancel?: () => void;
  /** Whether the selector is focused/active */
  readonly isFocused?: boolean;
  /** Whether to show the default help text footer */
  readonly showHelpText?: boolean;
}

// =============================================================================
// OptionSelector Component
// =============================================================================

/**
 * OptionSelector - Interactive component for selecting options from a list.
 *
 * Features:
 * - Arrow key navigation (up/down)
 * - Number shortcuts (1-9 for quick selection)
 * - Enter to confirm selection
 * - Esc to cancel/skip
 * - Visual indication of focused option
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   return (
 *     <OptionSelector
 *       question="Which approach do you prefer?"
 *       options={["Option A", "Option B", "Option C"]}
 *       onSelect={(option, index) => console.log(`Selected: ${option}`)}
 *       onCancel={() => console.log("Cancelled")}
 *       isFocused
 *     />
 *   );
 * }
 * ```
 */
export function OptionSelector({
  question,
  options,
  onSelect,
  onCancel,
  isFocused = true,
  showHelpText = true,
}: OptionSelectorProps): React.ReactElement {
  const { theme } = useTheme();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectorId = useId();
  const interactionEnabled = useMouseInteractionEnabled();
  const active = isFocused && interactionEnabled;
  const requestKey = JSON.stringify([question, options]);
  const decision = useRef({ requestKey, handled: false });
  if (decision.current.requestKey !== requestKey) {
    decision.current = { requestKey, handled: false };
  }
  const selectOption = useCallback(
    (index: number) => {
      const option = options[index];
      if (!active || decision.current.handled || option === undefined) return;
      decision.current.handled = true;
      onSelect(option, index);
    },
    [active, options, onSelect]
  );
  const cancel = useCallback(() => {
    if (!active || decision.current.handled || !onCancel) return;
    decision.current.handled = true;
    onCancel();
  }, [active, onCancel]);

  // Handle keyboard input
  useInput(
    useCallback(
      (input: string, key) => {
        if (!active || decision.current.handled) return;

        // Number key shortcuts (1-9)
        const num = Number.parseInt(input, 10);
        if (!Number.isNaN(num) && num >= 1 && num <= Math.min(options.length, 9)) {
          selectOption(num - 1);
          return;
        }

        // Arrow key navigation
        if (key.upArrow) {
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
          return;
        }

        if (key.downArrow) {
          setSelectedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
          return;
        }

        // Enter to confirm
        if (key.return) {
          selectOption(selectedIndex);
          return;
        }

        // Esc to cancel
        if (key.escape) {
          cancel();
        }
      },
      [active, options, selectedIndex, selectOption, cancel]
    ),
    { isActive: active }
  );

  const maxShortcut = Math.min(options.length, 9);

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Question */}
      <Text color={theme.semantic.text.secondary}>↳ {question}</Text>

      {/* Options list */}
      <Box flexDirection="column" marginTop={1}>
        {options.map((option, index) => {
          const isSelected = index === selectedIndex;
          const prefix = isSelected ? "▸" : " ";
          const shortcut = index < 9 ? `${index + 1}` : " ";

          return (
            <Clickable
              key={`opt-${option}`}
              id={`option-${selectorId}-${index}`}
              onClick={() => selectOption(index)}
              height={1}
              enabled={active}
            >
              <Text color={isSelected ? theme.colors.primary : undefined} bold={isSelected}>
                {prefix} [{shortcut}] {option}
              </Text>
            </Clickable>
          );
        })}
      </Box>

      {/* Help text */}
      {showHelpText && (
        <Box marginTop={1}>
          <Text dimColor>↑↓: Navigate | 1-{maxShortcut}: Quick select | Enter: Confirm</Text>
        </Box>
      )}
      {onCancel && (
        <Box marginTop={showHelpText ? 0 : 1}>
          <Clickable
            id={`option-${selectorId}-skip`}
            width="auto"
            enabled={active}
            onClick={cancel}
          >
            <Text dimColor>Esc: Skip</Text>
          </Clickable>
        </Box>
      )}
    </Box>
  );
}

// =============================================================================
// Exports
// =============================================================================

export type { OptionSelectorProps as OptionSelectorPropsType };
