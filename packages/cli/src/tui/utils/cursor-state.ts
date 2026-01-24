/**
 * Shared cursor state for BufferedStdout and CursorManager.
 *
 * Keeps a single source of truth for whether the terminal cursor
 * should be considered hidden/locked across modules.
 *
 * @module tui/utils/cursor-state
 */

let cursorHidden = false;
let cursorLocked = false;

export function setCursorHidden(hidden: boolean): void {
  cursorHidden = hidden;
}

export function setCursorLocked(locked: boolean): void {
  cursorLocked = locked;
}

export function isCursorHidden(): boolean {
  return cursorHidden;
}

export function isCursorLocked(): boolean {
  return cursorLocked;
}
