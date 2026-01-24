/**
 * Kitty Keyboard Protocol Support
 *
 * Implements detection and control of the Kitty keyboard protocol for enhanced
 * key reporting in terminals that support it (Kitty, WezTerm, iTerm2, etc.).
 *
 * Based on: https://sw.kovidgoyal.net/kitty/keyboard-protocol/
 *
 * Benefits:
 * - Disambiguate Ctrl+Shift combinations (e.g., Ctrl+Shift+Z)
 * - Distinguish Ctrl+Enter from Enter
 * - Support additional key combinations (Ctrl+;, etc.)
 *
 * @module tui/utils/kitty-keyboard-protocol
 */

import * as fs from "node:fs";
import { getActiveStdout } from "../buffered-stdout.js";
import { lockRawMode, unlockRawMode } from "./raw-mode-manager.js";

// =============================================================================
// Constants
// =============================================================================

/** Query progressive enhancement support (CSI ? u) + device attributes (CSI c) */
const QUERY_PROTOCOL = "\x1b[?u\x1b[c";

/** Disable Kitty keyboard protocol (CSI < u) */
const DISABLE_PROTOCOL = "\x1b[<u";

/** Detection timeout in milliseconds */
const DETECTION_TIMEOUT_MS = 200;

/** Extended timeout if partial response received */
const EXTENDED_TIMEOUT_MS = 1000;

// =============================================================================
// Protocol Flags
// =============================================================================

/**
 * Kitty protocol progressive enhancement flags.
 * These control what additional information the terminal reports.
 */
export const KittyFlags = {
  /** Disambiguate escape codes (recommended baseline) */
  DISAMBIGUATE: 1,
  /** Report event types (press/repeat/release) */
  REPORT_EVENTS: 2,
  /** Report alternate keys */
  REPORT_ALTERNATE: 4,
  /** Report all keys as escape codes */
  REPORT_ALL_KEYS: 8,
  /** Report associated text */
  REPORT_TEXT: 16,
} as const;

// =============================================================================
// Modifier Bit Flags (CSI u format)
// =============================================================================

/**
 * Modifier bit flags as encoded in CSI u sequences.
 * The modifier value is (bits + 1), so Shift alone = 2, Ctrl alone = 5, etc.
 */
export const KittyModifiers = {
  SHIFT: 1,
  ALT: 2,
  CTRL: 4,
  SUPER: 8,
  HYPER: 16,
  META: 32,
  CAPS_LOCK: 64,
  NUM_LOCK: 128,
} as const;

// =============================================================================
// State
// =============================================================================

/** Whether detection has completed */
let detectionComplete = false;

/** Whether the terminal supports Kitty protocol */
let kittySupported = false;

/** Whether Kitty protocol is currently enabled */
let kittyEnabled = false;

// =============================================================================
// Public API
// =============================================================================

/**
 * Check if Kitty keyboard protocol is supported by the terminal.
 * Must call detectKittyKeyboardProtocol() first.
 */
export function isKittyKeyboardSupported(): boolean {
  return kittySupported;
}

/**
 * Check if Kitty keyboard protocol is currently enabled.
 */
export function isKittyKeyboardEnabled(): boolean {
  return kittyEnabled;
}

/**
 * Detect whether the terminal supports Kitty keyboard protocol.
 *
 * This function queries the terminal for progressive enhancement support
 * and device attributes. It must be called once at app startup before
 * other Kitty protocol functions.
 *
 * @returns Promise that resolves to true if Kitty protocol is supported
 */
export async function detectKittyKeyboardProtocol(): Promise<boolean> {
  if (detectionComplete) {
    return kittySupported;
  }

  return new Promise((resolve) => {
    // Require TTY for protocol detection
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      detectionComplete = true;
      resolve(false);
      return;
    }

    // Lock raw mode for escape sequence handling
    lockRawMode();

    let responseBuffer = "";
    let progressiveEnhancementReceived = false;
    let timeoutId: NodeJS.Timeout | undefined;

    const finish = (): void => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }

      process.stdin.removeListener("data", handleData);

      unlockRawMode();

      detectionComplete = true;
      resolve(kittySupported);
    };

    const handleData = (data: Buffer): void => {
      if (timeoutId === undefined) {
        // Race condition: already timed out
        return;
      }

      responseBuffer += data.toString();

      // Check for progressive enhancement response (CSI ? <flags> u)
      // Terminal responds with current flags when queried
      if (responseBuffer.includes("\x1b[?") && responseBuffer.includes("u")) {
        progressiveEnhancementReceived = true;

        // Extend timeout to wait for full response
        clearTimeout(timeoutId);
        timeoutId = setTimeout(finish, EXTENDED_TIMEOUT_MS);
      }

      // Check for device attributes response (CSI ? <attrs> c)
      // This indicates the terminal responded to our query
      if (responseBuffer.includes("\x1b[?") && responseBuffer.includes("c")) {
        if (progressiveEnhancementReceived) {
          kittySupported = true;
        }
        finish();
      }
    };

    process.stdin.on("data", handleData);

    // Send query: progressive enhancement + device attributes
    fs.writeSync(process.stdout.fd, QUERY_PROTOCOL);

    // Initial timeout for non-responsive terminals
    timeoutId = setTimeout(finish, DETECTION_TIMEOUT_MS);
  });
}

/**
 * Enable Kitty keyboard protocol.
 *
 * Sends the escape sequence to enable enhanced key reporting.
 * Only enables if the terminal supports it (call detectKittyKeyboardProtocol first).
 *
 * @param flags - Protocol flags to enable (default: DISAMBIGUATE)
 */
export function enableKittyKeyboardProtocol(flags: number = KittyFlags.DISAMBIGUATE): void {
  if (kittyEnabled) {
    return;
  }

  try {
    // Use active stdout (may be buffered)
    getActiveStdout().write(`\x1b[>${flags}u`);
    kittyEnabled = true;
  } catch {
    // Ignore write errors (stdout may be closed)
  }
}

/**
 * Disable Kitty keyboard protocol.
 *
 * Sends the escape sequence to restore normal key reporting.
 * Should be called on application exit to restore terminal state.
 */
export function disableKittyKeyboardProtocol(): void {
  if (!kittyEnabled) {
    return;
  }

  try {
    getActiveStdout().write(DISABLE_PROTOCOL);
    kittyEnabled = false;
  } catch {
    // Ignore write errors (stdout may be closed)
  }
}

/**
 * Detect and enable Kitty protocol in a single call.
 *
 * Convenience function that:
 * 1. Detects if the terminal supports Kitty protocol
 * 2. Enables it if supported
 * 3. Registers cleanup handlers for exit signals
 *
 * @returns Promise that resolves when detection is complete
 */
export async function detectAndEnableKittyProtocol(): Promise<void> {
  if (detectionComplete) {
    return;
  }

  const supported = await detectKittyKeyboardProtocol();

  if (supported) {
    enableKittyKeyboardProtocol();

    // Register cleanup handlers
    const cleanup = (): void => {
      try {
        disableKittyKeyboardProtocol();
      } catch {
        // Ignore errors during cleanup
      }
    };

    process.on("exit", cleanup);
    process.on("SIGTERM", cleanup);
    process.on("SIGINT", cleanup);
  }
}

/**
 * Re-enable Kitty protocol after it may have been disabled.
 *
 * Useful after returning from external processes (editors, pagers)
 * that may have changed the terminal mode.
 */
export function reEnableKittyProtocol(): void {
  if (kittySupported && !kittyEnabled) {
    enableKittyKeyboardProtocol();
  }
}

// =============================================================================
// Enhanced Key Parsing
// =============================================================================

/**
 * Parsed enhanced key event from Kitty protocol.
 */
export interface EnhancedKeyEvent {
  /** Unicode codepoint or functional key number */
  readonly keyCode: number;
  /** Character representation (if printable) */
  readonly char: string | undefined;
  /** Shift modifier pressed */
  readonly shift: boolean;
  /** Alt/Option modifier pressed */
  readonly alt: boolean;
  /** Ctrl modifier pressed */
  readonly ctrl: boolean;
  /** Super/Cmd/Win modifier pressed */
  readonly super: boolean;
  /** Event type (1=press, 2=repeat, 3=release) */
  readonly eventType: 1 | 2 | 3 | undefined;
  /** Raw sequence for debugging */
  readonly raw: string;
}

/**
 * Parse an enhanced key sequence from Kitty protocol.
 *
 * CSI u format: CSI keycode ; modifiers u
 * CSI ~ format: CSI keycode ; modifiers ~
 *
 * @param data - Raw input data
 * @returns Parsed key event or undefined if not a valid Kitty sequence
 */
export function parseEnhancedKey(data: string): EnhancedKeyEvent | undefined {
  // Match CSI u format: ESC [ number ; modifiers u
  // Also match CSI ~ format: ESC [ number ; modifiers ~
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Terminal escape sequences require control characters
  const match = data.match(/^\x1b\[(\d+)(?:;(\d+))?([u~])$/);
  if (!match) {
    return undefined;
  }

  const keyCode = parseInt(match[1] ?? "0", 10);
  const modifierValue = match[2] ? parseInt(match[2], 10) - 1 : 0;

  // Extract event type from upper bits (if REPORT_EVENTS enabled)
  const eventType = (((modifierValue >> 7) & 0x03) as 1 | 2 | 3 | undefined) || undefined;
  const modifiers = modifierValue & 0x7f;

  const shift = (modifiers & KittyModifiers.SHIFT) !== 0;
  const alt = (modifiers & KittyModifiers.ALT) !== 0;
  const ctrl = (modifiers & KittyModifiers.CTRL) !== 0;
  const superMod = (modifiers & KittyModifiers.SUPER) !== 0;

  // Convert keycode to character if it's a printable Unicode codepoint
  let char: string | undefined;
  if (keyCode >= 32 && keyCode <= 0x10ffff) {
    try {
      char = String.fromCodePoint(keyCode);
    } catch {
      // Invalid codepoint
    }
  }

  return {
    keyCode,
    char,
    shift,
    alt,
    ctrl,
    super: superMod,
    eventType,
    raw: data,
  };
}

/**
 * Check if input data contains a Kitty protocol sequence.
 *
 * @param data - Raw input data
 * @returns True if data appears to be a Kitty protocol sequence
 */
export function isKittySequence(data: string): boolean {
  // Quick check for CSI u or CSI ~ patterns
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Terminal escape sequences require control characters
  return /\x1b\[\d+(?:;\d+)?[u~]/.test(data);
}
