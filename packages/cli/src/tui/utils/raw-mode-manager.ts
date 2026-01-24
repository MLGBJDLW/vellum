/**
 * Raw mode manager for stdin.
 *
 * Provides reference-counted locking to avoid race conditions where
 * one component disables raw mode while another still needs it.
 *
 * @module tui/utils/raw-mode-manager
 */

let lockCount = 0;
let originalRawMode: boolean | null = null;

function canToggleRawMode(): boolean {
  return Boolean(process.stdin.isTTY && typeof process.stdin.setRawMode === "function");
}

/**
 * Lock raw mode on (reference counted).
 */
export function lockRawMode(): void {
  if (!canToggleRawMode()) {
    return;
  }

  if (lockCount === 0) {
    originalRawMode = process.stdin.isRaw ?? false;
    if (!originalRawMode) {
      try {
        process.stdin.setRawMode(true);
      } catch {
        // Ignore raw mode errors
      }
    }
  }

  lockCount += 1;
}

/**
 * Unlock raw mode (reference counted).
 */
export function unlockRawMode(): void {
  if (!canToggleRawMode()) {
    return;
  }

  if (lockCount === 0) {
    return;
  }

  lockCount -= 1;

  if (lockCount === 0) {
    if (originalRawMode === false) {
      try {
        process.stdin.setRawMode(false);
      } catch {
        // Ignore raw mode errors
      }
    }
    originalRawMode = null;
  }
}

/**
 * Whether raw mode is currently locked on.
 */
export function isRawModeLocked(): boolean {
  return lockCount > 0;
}
