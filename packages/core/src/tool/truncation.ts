// ============================================
// Tool Output Truncation - T076
// ============================================
//
// Smart truncation of large tool outputs to prevent context window overflow.
// Preserves head/tail of content and optionally spills full output to temp file.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for output truncation.
 */
export interface TruncationOptions {
  /**
   * Maximum characters to allow before truncating.
   * @default 50000
   */
  maxLength?: number;

  /**
   * Characters to preserve at the start of content.
   * Can be a number or a percentage (0-1) of maxLength.
   * @default 0.4 (40% of maxLength)
   */
  preserveHead?: number;

  /**
   * Characters to preserve at the end of content.
   * @default 1000
   */
  preserveTail?: number;

  /**
   * Whether to write full content to a temp file when truncating.
   * @default false
   */
  spillToFile?: boolean;

  /**
   * Directory to write spill files to.
   * @default os.tmpdir()
   */
  spillDirectory?: string;

  /**
   * Prefix for spill file names.
   * @default "tool-output"
   */
  spillPrefix?: string;
}

/**
 * Result of truncation operation.
 */
export interface TruncationResult {
  /** The (possibly truncated) content */
  content: string;

  /** Whether truncation occurred */
  truncated: boolean;

  /** Original content length in characters */
  originalLength: number;

  /** Path to full content file if spillToFile was enabled */
  spillPath?: string;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Default maximum output length before truncation (20KB).
 *
 * Reduced from 50KB to 20KB to better manage context window usage:
 * - 20KB ≈ 5,000 tokens at 4 chars/token
 * - Leaves room for system prompt, conversation history, and tool definitions
 * - Prevents single tool outputs from dominating the context window
 * - Most useful output fits within 20KB; larger outputs can spill to file
 */
export const DEFAULT_MAX_LENGTH = 20_000;

/** Default characters to preserve at end */
export const DEFAULT_PRESERVE_TAIL = 1_000;

/** Default head preservation ratio (40%) */
export const DEFAULT_PRESERVE_HEAD_RATIO = 0.4;

// =============================================================================
// Content Detection
// =============================================================================

/**
 * Content type hints for smarter truncation.
 */
export type ContentType = "code" | "text" | "json" | "binary-like" | "unknown";

/**
 * Detect the likely content type of output.
 *
 * @param content - The content to analyze
 * @returns Detected content type
 */
export function detectContentType(content: string): ContentType {
  // Check for binary-like content (high ratio of non-printable chars)
  // Count control characters using char codes to avoid lint issues
  const sample = content.slice(0, 1000);
  let nonPrintableCount = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    // Control chars: 0x00-0x08, 0x0E-0x1F (excluding tab, newline, carriage return)
    if ((code >= 0 && code <= 8) || (code >= 14 && code <= 31)) {
      nonPrintableCount++;
    }
  }
  if (nonPrintableCount > 50) {
    return "binary-like";
  }

  // Check for JSON
  const trimmed = content.trim();
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      // Not valid JSON, continue detection
    }
  }

  // Check for code-like patterns
  const codePatterns = [
    /^(import|export|const|let|var|function|class|interface|type)\s/m,
    /^(def|class|import|from|async|await)\s/m,
    /^(public|private|protected|static|final)\s/m,
    /^#include\s*</m,
    /^\s*(if|else|for|while|switch|case)\s*\(/m,
    /[{};]\s*$/m,
  ];

  const sampleLines = content.slice(0, 2000).split("\n");
  let codeScore = 0;

  for (const line of sampleLines) {
    for (const pattern of codePatterns) {
      if (pattern.test(line)) {
        codeScore++;
        break;
      }
    }
  }

  if (codeScore >= 3) {
    return "code";
  }

  return "text";
}

// =============================================================================
// Truncation Marker
// =============================================================================

/**
 * Generate the truncation marker message.
 *
 * @param omittedChars - Number of characters omitted
 * @param spillPath - Optional path to full output file
 * @returns Formatted truncation marker
 */
function createTruncationMarker(omittedChars: number, spillPath?: string): string {
  const spillHint = spillPath ? `, full output at ${spillPath}` : "";

  return `\n\n--- [TRUNCATED: ${omittedChars.toLocaleString()} chars omitted${spillHint}] ---\n\n`;
}

// =============================================================================
// File Spillover
// =============================================================================

/**
 * Write content to a temporary file.
 *
 * @param content - Content to write
 * @param directory - Directory to write to
 * @param prefix - Filename prefix
 * @returns Path to the created file
 */
function spillToFile(content: string, directory: string, prefix: string): string {
  // Ensure directory exists
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }

  // Generate unique filename with timestamp
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const filename = `${prefix}-${timestamp}-${random}.txt`;
  const filepath = join(directory, filename);

  writeFileSync(filepath, content, "utf-8");

  return filepath;
}

// =============================================================================
// Main Truncation Function
// =============================================================================

/**
 * Truncate output content if it exceeds the maximum length.
 *
 * Preserves the head and tail of the content, inserting a truncation marker
 * in the middle. Optionally writes the full content to a temp file.
 *
 * @param output - The output string to truncate
 * @param options - Truncation options
 * @returns Truncation result with content and metadata
 *
 * @example
 * ```typescript
 * const result = truncateOutput(largeOutput, {
 *   maxLength: 10000,
 *   spillToFile: true,
 * });
 *
 * if (result.truncated) {
 *   console.log(`Truncated from ${result.originalLength} chars`);
 *   if (result.spillPath) {
 *     console.log(`Full output at: ${result.spillPath}`);
 *   }
 * }
 * ```
 */
export function truncateOutput(output: string, options: TruncationOptions = {}): TruncationResult {
  const originalLength = output.length;
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;

  // No truncation needed
  if (originalLength <= maxLength) {
    return {
      content: output,
      truncated: false,
      originalLength,
    };
  }

  // Calculate head/tail sizes
  const preserveTail = options.preserveTail ?? DEFAULT_PRESERVE_TAIL;
  let preserveHead: number;

  if (options.preserveHead !== undefined) {
    // If preserveHead is a ratio (0-1), convert to absolute
    preserveHead =
      options.preserveHead <= 1
        ? Math.floor(maxLength * options.preserveHead)
        : options.preserveHead;
  } else {
    preserveHead = Math.floor(maxLength * DEFAULT_PRESERVE_HEAD_RATIO);
  }

  // Handle edge cases
  if (preserveHead + preserveTail >= originalLength) {
    // Content would fit if we didn't have overhead - don't truncate
    return {
      content: output,
      truncated: false,
      originalLength,
    };
  }

  // Detect content type for potential adjustments
  const contentType = detectContentType(output);

  // For code, try to break at line boundaries
  let head = output.slice(0, preserveHead);
  let tail = output.slice(-preserveTail);

  if (contentType === "code" || contentType === "text") {
    // Trim head to last complete line
    const headLastNewline = head.lastIndexOf("\n");
    if (headLastNewline > preserveHead * 0.8) {
      head = head.slice(0, headLastNewline + 1);
    }

    // Trim tail to first complete line
    const tailFirstNewline = tail.indexOf("\n");
    if (tailFirstNewline > 0 && tailFirstNewline < preserveTail * 0.2) {
      tail = tail.slice(tailFirstNewline + 1);
    }
  }

  // Handle binary-like content - don't try to be smart
  if (contentType === "binary-like") {
    head = output.slice(0, preserveHead);
    tail = output.slice(-preserveTail);
  }

  // Calculate omitted characters
  const headEnd = output.indexOf(head) + head.length;
  const tailStart = output.lastIndexOf(tail);
  const omittedChars = tailStart - headEnd;

  // Spill to file if requested
  let spillPath: string | undefined;
  if (options.spillToFile) {
    const spillDir = options.spillDirectory ?? tmpdir();
    const spillPrefix = options.spillPrefix ?? "tool-output";
    spillPath = spillToFile(output, spillDir, spillPrefix);
  }

  // Build truncated content
  const marker = createTruncationMarker(omittedChars, spillPath);
  const truncatedContent = head + marker + tail;

  return {
    content: truncatedContent,
    truncated: true,
    originalLength,
    spillPath,
  };
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Check if content would be truncated without actually truncating.
 *
 * @param output - The output to check
 * @param maxLength - Maximum allowed length
 * @returns True if content exceeds maxLength
 */
export function wouldTruncate(output: string, maxLength: number = DEFAULT_MAX_LENGTH): boolean {
  return output.length > maxLength;
}

/**
 * Truncate with file spillover enabled by default.
 *
 * @param output - The output to truncate
 * @param options - Truncation options (spillToFile defaults to true)
 * @returns Truncation result
 */
export function truncateWithSpill(
  output: string,
  options: TruncationOptions = {}
): TruncationResult {
  return truncateOutput(output, {
    ...options,
    spillToFile: options.spillToFile ?? true,
  });
}

/**
 * Create a configured truncation function with preset options.
 *
 * @param defaultOptions - Default options to apply
 * @returns Configured truncation function
 *
 * @example
 * ```typescript
 * const truncate = createTruncator({
 *   maxLength: 30000,
 *   spillToFile: true,
 *   spillDirectory: '/tmp/vellum-outputs',
 * });
 *
 * const result = truncate(output);
 * ```
 */
export function createTruncator(
  defaultOptions: TruncationOptions
): (output: string, options?: TruncationOptions) => TruncationResult {
  return (output: string, options: TruncationOptions = {}) =>
    truncateOutput(output, { ...defaultOptions, ...options });
}
