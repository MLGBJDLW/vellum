/**
 * Synchronized Update - DEC 2026 protocol
 *
 * Prevents terminal flickering by batching output.
 * Supported in VS Code Terminal 1.85+, iTerm2, Kitty
 *
 * @module tui/utils/synchronized-update
 */

import { getActiveStdout } from "../buffered-stdout.js";

const BEGIN_SYNC = "\x1b[?2026h";
const END_SYNC = "\x1b[?2026l";

let syncDepth = 0;

/**
 * Execute a function with synchronized terminal updates.
 * All output within the callback will be batched and rendered atomically.
 *
 * @param fn - The function to execute within synchronized updates
 * @returns The return value of the function
 *
 * @example
 * ```ts
 * syncUpdate(() => {
 *   process.stdout.write('Line 1\n');
 *   process.stdout.write('Line 2\n');
 * });
 * // Both lines rendered atomically without flicker
 * ```
 */
export function syncUpdate<T>(fn: () => T): T {
  if (syncDepth === 0) {
    getActiveStdout().write(BEGIN_SYNC);
  }
  syncDepth++;
  try {
    return fn();
  } finally {
    syncDepth--;
    if (syncDepth === 0) {
      getActiveStdout().write(END_SYNC);
    }
  }
}

/**
 * Check if synchronized updates are supported by the current terminal.
 *
 * @returns true if DEC 2026 protocol is supported
 */
export function isSyncUpdateSupported(): boolean {
  // VS Code 1.85+, iTerm2, Kitty support DEC 2026
  const term = process.env.TERM_PROGRAM?.toLowerCase() ?? "";
  const termVersion = process.env.TERM_PROGRAM_VERSION ?? "";

  if (term === "vscode") {
    // VS Code 1.85.0 added sync update support
    const [major = 0] = termVersion.split(".").map(Number);
    return major >= 1; // Most recent VS Code versions support it
  }

  if (term === "iterm.app" || term === "kitty") {
    return true;
  }

  // Check for explicit support via COLORTERM
  return process.env.COLORTERM === "truecolor";
}
