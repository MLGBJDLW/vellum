/**
 * Mouse Event Parser
 *
 * Parses SGR (DEC 1006) and X10 legacy mouse sequences into structured events.
 * Provides terminal control sequences for enabling/disabling mouse tracking.
 *
 * SGR format: ESC [ < Pb ; Px ; Py M (press) or ESC [ < Pb ; Px ; Py m (release)
 * X10 format: ESC [ M Cb Cx Cy (3 raw bytes after 'M')
 *
 * Button encoding (Pb / Cb):
 *   Bits 0-1: button number (0=left, 1=middle, 2=right, 3=release in X10)
 *   Bit 2 (0x04): shift modifier
 *   Bit 3 (0x08): meta/alt modifier
 *   Bit 4 (0x10): ctrl modifier
 *   Bit 5 (0x20): motion event
 *   Bit 6 (0x40): wheel event (64=up, 65=down)
 *
 * Reference: xterm ctlseqs, Claude Code mouse implementation
 *
 * @module tui/utils/mouse-parser
 */

// =============================================================================
// Types
// =============================================================================

/** Mouse button identifier */
export type MouseButton = "left" | "middle" | "right" | "none";

/** Mouse action type */
export type MouseAction = "press" | "release" | "move" | "wheelup" | "wheeldown";

/** Parsed mouse event */
export interface MouseEvent {
  /** Which button is involved */
  button: MouseButton;
  /** What action occurred */
  action: MouseAction;
  /** 1-based column (x coordinate) */
  col: number;
  /** 1-based row (y coordinate) */
  row: number;
  /** Whether Shift was held */
  shift: boolean;
  /** Whether Meta/Alt was held */
  meta: boolean;
  /** Whether Ctrl was held */
  ctrl: boolean;
  /** Original escape sequence */
  raw: string;
}

// =============================================================================
// Constants — Bit Masks
// =============================================================================

/** Bits 0-1: button number */
const BUTTON_MASK = 0x03;

/** Bit 2 (0x04): shift modifier */
const SHIFT_BIT = 0x04;

/** Bit 3 (0x08): meta/alt modifier */
const META_BIT = 0x08;

/** Bit 4 (0x10): ctrl modifier */
const CTRL_BIT = 0x10;

/** Bit 5 (0x20): motion flag */
const MOTION_BIT = 0x20;

/** Bit 6 (0x40): wheel flag */
const WHEEL_BIT = 0x40;

// =============================================================================
// Constants — Terminal Control Sequences
// =============================================================================

/**
 * Enable full SGR mouse tracking.
 *
 * Combines:
 *   DEC 1000 — Basic mouse press/release reporting
 *   DEC 1002 — Button-event tracking (drags)
 *   DEC 1003 — Any-event tracking (all motion)
 *   DEC 1006 — SGR extended coordinates (supports >223 columns)
 */
export const MOUSE_ENABLE =
  "\x1b[?1000h" + // enable basic mouse reporting
  "\x1b[?1002h" + // enable button-event (drag) tracking
  "\x1b[?1003h" + // enable any-event (motion) tracking
  "\x1b[?1006h";  // enable SGR extended mode

/**
 * Disable all mouse tracking.
 *
 * Reverses all DEC private modes enabled by MOUSE_ENABLE.
 * Order: disable in reverse order of enable for clean teardown.
 */
export const MOUSE_DISABLE =
  "\x1b[?1006l" + // disable SGR extended mode
  "\x1b[?1003l" + // disable any-event tracking
  "\x1b[?1002l" + // disable button-event tracking
  "\x1b[?1000l";  // disable basic mouse reporting

/**
 * Enable wheel-only mouse tracking (no motion/drag reporting).
 *
 * Combines:
 *   DEC 1000 — Basic mouse press/release (includes wheel)
 *   DEC 1006 — SGR extended coordinates
 *
 * Omits DEC 1002/1003 so motion events are not reported.
 */
export const MOUSE_ENABLE_WHEEL_ONLY =
  "\x1b[?1000h" + // enable basic mouse reporting (includes wheel)
  "\x1b[?1006h";  // enable SGR extended mode

// =============================================================================
// Regex Patterns
// =============================================================================

/**
 * SGR mouse sequence: ESC [ < Pb ; Px ; Py M/m
 *
 * Capture groups:
 *   1 — Pb (button/modifier bits, decimal)
 *   2 — Px (column, 1-based, decimal)
 *   3 — Py (row, 1-based, decimal)
 *   4 — M (press) or m (release)
 */
const SGR_MOUSE_RE = new RegExp("^\\x1b\\[<(\\d+);(\\d+);(\\d+)([Mm])$");

/**
 * X10 legacy mouse sequence: ESC [ M followed by 3 raw bytes.
 * We match the prefix and then read 3 bytes manually.
 */
const X10_MOUSE_PREFIX = "\x1b[M";

// =============================================================================
// Detection
// =============================================================================

/**
 * Quick check whether `data` starts with a mouse escape sequence.
 *
 * Checks for both SGR (`ESC [ <`) and X10 (`ESC [ M`) prefixes.
 */
export function isMouseSequence(data: string): boolean {
  if (data.length < 3) return false;
  // Both formats start with ESC [
  if (data.charCodeAt(0) !== 0x1b || data.charCodeAt(1) !== 0x5b) return false;
  const third = data.charCodeAt(2);
  // SGR: ESC [ <   (0x3c)
  // X10: ESC [ M   (0x4d)
  return third === 0x3c || third === 0x4d;
}

// =============================================================================
// Parsing Helpers
// =============================================================================

/**
 * Decode the button number from the low 2 bits.
 *
 * In non-wheel, non-motion contexts:
 *   0 = left, 1 = middle, 2 = right, 3 = release (X10 only)
 */
function decodeButton(btnBits: number): MouseButton {
  switch (btnBits & BUTTON_MASK) {
    case 0:
      return "left";
    case 1:
      return "middle";
    case 2:
      return "right";
    default:
      // btn 3 in X10 means release with no specific button
      return "none";
  }
}

/**
 * Determine the action and button from the full button value and suffix.
 *
 * @param btn - Full button value including modifier/flag bits
 * @param isRelease - true if the suffix indicates release ('m' in SGR, btn=3 in X10)
 */
function decodeAction(
  btn: number,
  isRelease: boolean,
): { button: MouseButton; action: MouseAction } {
  // Wheel events: bit 6 (0x40) is set
  if (btn & WHEEL_BIT) {
    // Wheel up: lower bits = 0 (btn value 64), Wheel down: lower bits = 1 (btn value 65)
    const wheelDir = (btn & BUTTON_MASK) === 0 ? "wheelup" : "wheeldown";
    return { button: "none", action: wheelDir };
  }

  // Motion events: bit 5 (0x20) is set, and this is not a press/release
  if ((btn & MOTION_BIT) && !isRelease) {
    return { button: decodeButton(btn), action: "move" };
  }

  // Press or release
  if (isRelease) {
    return { button: decodeButton(btn), action: "release" };
  }

  return { button: decodeButton(btn), action: "press" };
}

/**
 * Extract modifier key state from button value.
 *
 * @param btn - Full button value
 */
function decodeModifiers(btn: number): {
  shift: boolean;
  meta: boolean;
  ctrl: boolean;
} {
  return {
    shift: (btn & SHIFT_BIT) !== 0,
    meta: (btn & META_BIT) !== 0,
    ctrl: (btn & CTRL_BIT) !== 0,
  };
}

// =============================================================================
// SGR Parser
// =============================================================================

/**
 * Attempt to parse an SGR mouse sequence.
 *
 * @returns Parsed MouseEvent or null if not an SGR sequence
 */
function parseSgr(data: string): MouseEvent | null {
  const match = SGR_MOUSE_RE.exec(data);
  if (!match) return null;

  const m1 = match[1]; const m2 = match[2]; const m3 = match[3]; const m4 = match[4];
  const btn = Number.parseInt(m1 ?? "0", 10);
  const col = Number.parseInt(m2 ?? "0", 10);
  const row = Number.parseInt(m3 ?? "0", 10);
  const isRelease = m4 === "m";

  const { button, action } = decodeAction(btn, isRelease);
  const modifiers = decodeModifiers(btn);

  return {
    button,
    action,
    col,
    row,
    ...modifiers,
    raw: data,
  };
}

// =============================================================================
// X10 Legacy Parser
// =============================================================================

/**
 * Attempt to parse an X10 legacy mouse sequence.
 *
 * X10 format: ESC [ M Cb Cx Cy
 *   Cb = button byte + 32
 *   Cx = column byte + 32 (1-based)
 *   Cy = row byte + 32 (1-based)
 *
 * @returns Parsed MouseEvent or null if not a valid X10 sequence
 */
function parseX10(data: string): MouseEvent | null {
  // X10 requires exactly 6 characters: ESC [ M Cb Cx Cy
  if (data.length !== 6) return null;
  if (!data.startsWith(X10_MOUSE_PREFIX)) return null;

  // Bytes at positions 3, 4, 5 are Cb, Cx, Cy (each offset by 32)
  const cb = data.charCodeAt(3) - 32;
  const cx = data.charCodeAt(4) - 32;
  const cy = data.charCodeAt(5) - 32;

  // Sanity check: coordinates must be positive
  if (cx < 1 || cy < 1) return null;

  // In X10 mode, button 3 means release (no specific button)
  const isRelease = (cb & BUTTON_MASK) === 3 && !(cb & WHEEL_BIT);
  const { button, action } = decodeAction(cb, isRelease);
  const modifiers = decodeModifiers(cb);

  return {
    button,
    action,
    col: cx,
    row: cy,
    ...modifiers,
    raw: data,
  };
}

// =============================================================================
// Main Parser
// =============================================================================

/**
 * Parse a mouse escape sequence into a structured MouseEvent.
 *
 * Supports both SGR (DEC 1006) and X10 legacy formats:
 *   - SGR: `ESC [ < Pb ; Px ; Py M/m`  (preferred, supports large coordinates)
 *   - X10: `ESC [ M Cb Cx Cy`           (fallback, 3 raw bytes after M)
 *
 * @param data - Raw string data from stdin
 * @returns Parsed MouseEvent, or null if `data` is not a mouse sequence
 */
export function parseMouseEvent(data: string): MouseEvent | null {
  // Try SGR first (more common in modern terminals)
  const sgr = parseSgr(data);
  if (sgr) return sgr;

  // Fall back to X10 legacy
  return parseX10(data);
}

// =============================================================================
// Terminal Control Utilities
// =============================================================================

/**
 * Enable mouse tracking on a writable stream.
 *
 * @param stream - The output stream (typically process.stdout)
 * @param mode - 'full' for all events, 'wheel-only' for scroll only
 */
export function enableMouseTracking(
  stream: NodeJS.WriteStream,
  mode: "full" | "wheel-only",
): void {
  const seq = mode === "full" ? MOUSE_ENABLE : MOUSE_ENABLE_WHEEL_ONLY;
  stream.write(seq);
}

/**
 * Disable mouse tracking on a writable stream.
 *
 * @param stream - The output stream (typically process.stdout)
 */
export function disableMouseTracking(stream: NodeJS.WriteStream): void {
  stream.write(MOUSE_DISABLE);
}
