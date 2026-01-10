/**
 * HotkeyHints Component
 *
 * Small, reusable hint bar for displaying discoverable keybindings.
 * Designed to be safe in narrow Ink layouts: single-line, dim, truncates.
 */

import { Box, Text } from "ink";
import type React from "react";

export type HotkeyHint = {
  readonly keys: string;
  readonly label: string;
};

export interface HotkeyHintsProps {
  readonly hints: ReadonlyArray<HotkeyHint>;
  /** Separator between items (default: " │ ") */
  readonly separator?: string;
}

export function HotkeyHints({ hints, separator = " │ " }: HotkeyHintsProps): React.JSX.Element {
  if (hints.length === 0) {
    return <Box />;
  }

  return (
    <Box>
      <Text dimColor wrap="truncate">
        {hints.map((hint, index) => (
          <Text key={`${hint.keys}-${hint.label}`}>
            {index > 0 ? separator : ""}
            <Text bold>{hint.keys}</Text>
            <Text> {hint.label}</Text>
          </Text>
        ))}
      </Text>
    </Box>
  );
}
