/**
 * Extended Key type for ink's useInput hook.
 *
 * The @jrichman/ink fork (and some versions of ink) don't include `home` and `end`
 * properties in the Key type. This module provides an extended type and helper
 * function to detect these keys from raw input.
 *
 * @module ink-extended
 */

import type { Key } from "ink";

/**
 * Extended Key type that includes home and end key detection.
 * These are not present in the base ink Key type but are commonly needed
 * for navigation in TUI applications.
 */
export interface ExtendedKey extends Key {
  /** Home key was pressed (jump to beginning) */
  home: boolean;
  /** End key was pressed (jump to end) */
  end: boolean;
}

/**
 * ANSI escape sequences for Home and End keys.
 * Different terminal emulators may send different sequences.
 */
const HOME_SEQUENCES = [
  "\x1b[H", // CSI H
  "\x1b[1~", // CSI 1 ~
  "\x1bOH", // SS3 H (application mode)
];

const END_SEQUENCES = [
  "\x1b[F", // CSI F
  "\x1b[4~", // CSI 4 ~
  "\x1bOF", // SS3 F (application mode)
];

/**
 * Extends the ink Key object with home and end key detection.
 * Call this with the raw input string and the key object from useInput.
 *
 * @param input - The raw input string from useInput
 * @param key - The Key object from useInput
 * @returns Extended key object with home and end properties
 *
 * @example
 * ```tsx
 * import { useInput } from 'ink';
 * import { extendKey } from '../types/ink-extended';
 *
 * useInput((input, key) => {
 *   const extKey = extendKey(input, key);
 *   if (extKey.home) {
 *     // Handle Home key
 *   }
 *   if (extKey.end) {
 *     // Handle End key
 *   }
 * });
 * ```
 */
export function extendKey(input: string, key: Key): ExtendedKey {
  return {
    ...key,
    home: HOME_SEQUENCES.includes(input),
    end: END_SEQUENCES.includes(input),
  };
}

/**
 * Check if the input represents a Home key press.
 * Use this for simple boolean checks without needing the full extended key.
 */
export function isHomeKey(input: string): boolean {
  return HOME_SEQUENCES.includes(input);
}

/**
 * Check if the input represents an End key press.
 * Use this for simple boolean checks without needing the full extended key.
 */
export function isEndKey(input: string): boolean {
  return END_SEQUENCES.includes(input);
}
