/**
 * Centralized Cursor Management
 *
 * Singleton to prevent race conditions from multiple components
 * trying to show/hide the cursor simultaneously.
 *
 * @module tui/utils/cursor-manager
 */

import { getActiveStdout } from "../buffered-stdout.js";

const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";

/**
 * Cursor manager implementation
 */
class CursorManagerImpl {
  private _hidden = false;
  private _locked = false;

  /** Get the active stdout stream (uses BufferedStdout when available) */
  private get _stdout(): NodeJS.WriteStream {
    return getActiveStdout();
  }

  /**
   * Hide the cursor (idempotent).
   * Does nothing if cursor is already hidden or locked.
   */
  hide(): void {
    if (!this._hidden && !this._locked) {
      try {
        this._stdout.write(HIDE_CURSOR);
        this._hidden = true;
      } catch {
        // Ignore write errors (e.g., closed stdout)
      }
    }
  }

  /**
   * Show the cursor (idempotent).
   * Does nothing if cursor is already visible or locked.
   */
  show(): void {
    if (this._hidden && !this._locked) {
      try {
        this._stdout.write(SHOW_CURSOR);
        this._hidden = false;
      } catch {
        // Ignore write errors (e.g., closed stdout)
      }
    }
  }

  /**
   * Lock cursor in hidden state (for TUI mode).
   * While locked, show() has no effect.
   */
  lock(): void {
    this._locked = true;
    this.forceHide();
  }

  /**
   * Unlock cursor control.
   * After unlocking, show() and hide() work normally.
   */
  unlock(): void {
    this._locked = false;
  }

  /**
   * Force hide cursor (bypasses lock, for cleanup).
   * Use only for critical cleanup scenarios.
   */
  forceHide(): void {
    try {
      this._stdout.write(HIDE_CURSOR);
      this._hidden = true;
    } catch {
      // Ignore write errors
    }
  }

  /**
   * Force show cursor (bypasses lock, for cleanup on exit).
   * Use only for exit/cleanup scenarios.
   */
  forceShow(): void {
    try {
      this._stdout.write(SHOW_CURSOR);
      this._hidden = false;
    } catch {
      // Ignore write errors
    }
  }

  /**
   * Whether the cursor is currently hidden.
   */
  get isHidden(): boolean {
    return this._hidden;
  }

  /**
   * Whether cursor control is locked.
   */
  get isLocked(): boolean {
    return this._locked;
  }
}

/**
 * Global cursor manager singleton.
 * Use this instead of directly writing cursor escape codes.
 *
 * @example
 * ```ts
 * // Lock cursor hidden for TUI session
 * CursorManager.lock();
 *
 * // On exit, restore cursor
 * CursorManager.unlock();
 * CursorManager.show();
 * ```
 */
export const CursorManager = new CursorManagerImpl();

export type { CursorManagerImpl };
