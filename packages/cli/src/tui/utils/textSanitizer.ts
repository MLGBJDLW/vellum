/**
 * Text Sanitizer for TUI
 *
 * Provides consistent text normalization across all TUI components.
 * Centralizes sanitization logic previously scattered in TextInput.
 *
 * @module tui/utils/textSanitizer
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Options for text sanitization.
 */
export interface SanitizeOptions {
  /** Convert tabs to spaces (default: 2) */
  readonly tabWidth?: number;
  /** Maximum line length before wrap hint (default: 0 = no limit) */
  readonly maxLineLength?: number;
  /** Strip ALL ANSI codes (default: false, just sanitize dangerous ones) */
  readonly stripAllAnsi?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Default tab width in spaces */
const DEFAULT_TAB_WIDTH = 2;

/**
 * SGR (Select Graphic Rendition) pattern - safe color/style codes
 * Format: ESC [ <params> m
 * Params: 0-109 for colors/styles
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: Intentional - matching ANSI SGR sequences
const SGR_PATTERN = /\x1b\[[\d;]*m/g;

/**
 * All CSI (Control Sequence Introducer) sequences
 * Format: ESC [ <params> <final byte>
 * Final bytes: 0x40-0x7E (@-~)
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: Intentional - matching all ANSI CSI sequences
const CSI_PATTERN = /\x1b\[[\d;?]*[ -/]*[@-~]/g;

/**
 * OSC (Operating System Command) sequences
 * Format: ESC ] ... BEL or ESC ] ... ST
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: Intentional - matching ANSI OSC sequences
const OSC_PATTERN = /\x1b\][^\x07]*(?:\x07|\x1b\\)/g;

/**
 * Control characters to strip (except \t=0x09, \n=0x0A, \x1B=ESC for ANSI)
 * Includes: NUL-HT(0x00-0x08), VT-FF(0x0B-0x0C), SO-SUB(0x0E-0x1A), FS-US(0x1C-0x1F), DEL(0x7F), C1(0x80-0x9F)
 * Note: ESC(0x1B) is preserved for ANSI sequences
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: Intentional - stripping dangerous control characters
const CONTROL_CHARS_PATTERN = /[\x00-\x08\x0b\x0c\x0e-\x1a\x1c-\x1f\x7f\x80-\x9f]/g;

/**
 * Standalone ESC characters (not part of a valid sequence)
 * Matches ESC not followed by [ or ]
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: Intentional - matching orphan escape characters
const ORPHAN_ESC_PATTERN = /\x1b(?![[\]])/g;

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Sanitize text for safe TUI rendering (without ANSI awareness).
 *
 * Performs the following transformations:
 * 1. CRLF → LF (Windows line endings)
 * 2. Lone CR → LF (old Mac line endings)
 * 3. Unicode line/paragraph separators → LF
 * 4. Remove dangerous control characters (keeps \n, \t, \x1B for ANSI)
 * 5. Tab → spaces (configurable width)
 *
 * @param text - Raw text to sanitize
 * @param options - Sanitization options
 * @returns Sanitized text safe for rendering
 *
 * @example
 * ```ts
 * // Basic usage
 * const clean = sanitizeText("Hello\r\nWorld\t!");
 * // => "Hello\nWorld  !"
 *
 * // Custom tab width
 * const clean = sanitizeText("A\tB", { tabWidth: 4 });
 * // => "A    B"
 * ```
 */
export function sanitizeText(text: string, options?: SanitizeOptions): string {
  const tabWidth = options?.tabWidth ?? DEFAULT_TAB_WIDTH;

  // Step 1-3: Normalize line endings
  let result = text
    .replace(/\r\n/g, "\n") // CRLF → LF
    .replace(/\r/g, "\n") // Lone CR → LF
    .replace(/\u2028|\u2029/g, "\n"); // Unicode line separators

  // Step 4: Remove dangerous control characters (keep \n=0x0A, \t=0x09, \x1B=ESC)
  result = result.replace(CONTROL_CHARS_PATTERN, "");

  // Step 5: Convert tabs to spaces
  if (tabWidth > 0) {
    const spaces = " ".repeat(tabWidth);
    result = result.replace(/\t/g, spaces);
  }

  return result;
}

/**
 * Sanitize ANSI codes using an allow-list approach.
 *
 * Keeps safe codes:
 * - SGR (Select Graphic Rendition): Colors and text styles `\x1b[...m`
 *
 * Removes dangerous codes:
 * - Cursor movement: `\x1b[...H`, `\x1b[...A/B/C/D/E/F/G`
 * - Screen clearing: `\x1b[...J`, `\x1b[...K`
 * - Scrolling: `\x1b[...S`, `\x1b[...T`
 * - Other CSI sequences
 * - OSC sequences (terminal titles, hyperlinks in raw form)
 *
 * @param text - Text containing ANSI codes
 * @param options - Sanitization options
 * @returns Text with only safe ANSI codes preserved
 *
 * @example
 * ```ts
 * // Colors preserved
 * const text = "\x1b[31mRed\x1b[0m";
 * sanitizeAnsi(text) // => "\x1b[31mRed\x1b[0m"
 *
 * // Cursor movement removed
 * const text = "\x1b[2JCleared\x1b[H";
 * sanitizeAnsi(text) // => "Cleared"
 *
 * // Strip all ANSI
 * sanitizeAnsi(text, { stripAllAnsi: true }) // => "Cleared"
 * ```
 */
export function sanitizeAnsi(text: string, options?: SanitizeOptions): string {
  if (options?.stripAllAnsi) {
    // Remove ALL ANSI sequences
    return text.replace(CSI_PATTERN, "").replace(OSC_PATTERN, "");
  }

  // Collect safe SGR sequences and their positions
  const sgrRegex = new RegExp(SGR_PATTERN.source, "g");

  // Build set of exact positions of safe SGR sequences
  const safePositions = new Map<number, number>(); // start -> end
  for (let match = sgrRegex.exec(text); match !== null; match = sgrRegex.exec(text)) {
    safePositions.set(match.index, match.index + match[0].length);
  }

  // Remove dangerous CSI sequences (not SGR)
  let result = "";
  let lastIndex = 0;
  const csiRegex = new RegExp(CSI_PATTERN.source, "g");

  for (let match = csiRegex.exec(text); match !== null; match = csiRegex.exec(text)) {
    const start = match.index;
    const end = start + match[0].length;

    // Add text before this match
    result += text.slice(lastIndex, start);

    // Check if this is a safe SGR sequence
    const isSafe = safePositions.has(start) && safePositions.get(start) === end;
    if (isSafe) {
      result += match[0];
    }
    // Otherwise, skip (remove) the dangerous sequence

    lastIndex = end;
  }

  // Add remaining text
  result += text.slice(lastIndex);

  // Remove OSC sequences (titles, hyperlinks, etc.)
  result = result.replace(OSC_PATTERN, "");

  return result;
}

/**
 * Combined sanitization: text normalization + ANSI filtering.
 *
 * This is the recommended function for most use cases.
 * Applies both `sanitizeAnsi` and `sanitizeText` in sequence.
 *
 * @param text - Raw text to sanitize
 * @param options - Sanitization options
 * @returns Fully sanitized text safe for TUI rendering
 *
 * @example
 * ```ts
 * // Combined sanitization
 * const raw = "Hello\r\nWorld\x1b[2J\x1b[31mRed\x1b[0m\t!";
 * const clean = sanitize(raw);
 * // => "Hello\nWorld\x1b[31mRed\x1b[0m  !"
 * ```
 */
export function sanitize(text: string, options?: SanitizeOptions): string {
  // Step 1: Sanitize ANSI (remove dangerous sequences, keep colors)
  const ansiClean = sanitizeAnsi(text, options);

  // Step 2: Sanitize text (normalize line endings, remove control chars, convert tabs)
  const textClean = sanitizeText(ansiClean, options);

  // Step 3: Remove any orphan ESC characters left behind (incomplete sequences)
  return textClean.replace(ORPHAN_ESC_PATTERN, "");
}
