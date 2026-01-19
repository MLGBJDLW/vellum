/**
 * HotkeyHints Component
 *
 * Small, reusable hint bar for displaying discoverable keybindings.
 * Designed to be safe in narrow Ink layouts: single-line, dim, truncates.
 *
 * Memoized to prevent re-renders when parent context updates (e.g., message streaming).
 */

import { Box, Text } from "ink";
import type React from "react";
import { memo } from "react";

export type HotkeyHint = {
  readonly keys: string;
  readonly label: string;
};

export interface HotkeyHintsProps {
  readonly hints: ReadonlyArray<HotkeyHint>;
  /** Separator between items (default: " │ ") */
  readonly separator?: string;
}

/**
 * Compare two HotkeyHint arrays for equality.
 */
function hintsAreEqual(
  prevHints: ReadonlyArray<HotkeyHint>,
  nextHints: ReadonlyArray<HotkeyHint>
): boolean {
  if (prevHints.length !== nextHints.length) return false;
  for (let i = 0; i < prevHints.length; i++) {
    const prevHint = prevHints[i];
    const nextHint = nextHints[i];
    if (prevHint?.keys !== nextHint?.keys || prevHint?.label !== nextHint?.label) {
      return false;
    }
  }
  return true;
}

/**
 * Custom comparison for React.memo - only re-render when hints or separator actually change.
 */
function arePropsEqual(prev: HotkeyHintsProps, next: HotkeyHintsProps): boolean {
  return prev.separator === next.separator && hintsAreEqual(prev.hints, next.hints);
}

function HotkeyHintsImpl({ hints, separator = " │ " }: HotkeyHintsProps): React.JSX.Element {
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

export const HotkeyHints = memo(HotkeyHintsImpl, arePropsEqual);
