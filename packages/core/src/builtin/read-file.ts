/**
 * Read File Tool
 *
 * Reads file contents with optional line range support.
 * Implements path security to prevent traversal attacks.
 *
 * @module builtin/read-file
 */

import { readFile, stat } from "node:fs/promises";
import { z } from "zod";

import { defineTool, fail, ok } from "../types/index.js";
import { validatePath } from "./utils/index.js";

/**
 * Maximum file size allowed for reading (500KB).
 * Files larger than this will be rejected to prevent context overflow.
 */
const MAX_FILE_SIZE_BYTES = 500 * 1024;

/**
 * File size threshold for emitting a warning (100KB).
 * Files larger than this will include a warning in the output.
 */
const WARNING_FILE_SIZE_BYTES = 100 * 1024;

/**
 * Rough token estimation factor (characters per token).
 * Used to provide a token count estimate for the LLM.
 */
const CHARS_PER_TOKEN = 4;

/**
 * Result type for file size check
 */
type FileSizeCheckResult = { ok: true; warning?: string } | { ok: false; error: string };

/**
 * Check file size before reading to prevent context overflow.
 * Returns an error if file exceeds MAX_FILE_SIZE_BYTES,
 * or a warning if file exceeds WARNING_FILE_SIZE_BYTES.
 *
 * @param filePath - The resolved file path to check
 * @returns Promise with check result
 */
async function checkFileSize(filePath: string): Promise<FileSizeCheckResult> {
  const fileStats = await stat(filePath);
  const fileSizeBytes = fileStats.size;

  if (fileSizeBytes > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      error:
        `File too large: ${(fileSizeBytes / 1024).toFixed(1)}KB exceeds limit of ${MAX_FILE_SIZE_BYTES / 1024}KB. ` +
        `Consider reading a specific line range with startLine/endLine parameters.`,
    };
  }

  const warning =
    fileSizeBytes > WARNING_FILE_SIZE_BYTES
      ? `Warning: Large file (${(fileSizeBytes / 1024).toFixed(1)}KB). Consider reading specific sections.`
      : undefined;

  return { ok: true, warning };
}

/**
 * Result type for line range validation
 */
type LineRangeResult =
  | { ok: true; startLine: number; endLine: number }
  | { ok: false; error: string };

/**
 * Validate and normalize line range parameters.
 *
 * @param startLine - Optional start line (1-indexed)
 * @param endLine - Optional end line (1-indexed)
 * @param totalLines - Total number of lines in the file
 * @returns Validated line range or error
 */
function validateLineRange(
  startLine: number | undefined,
  endLine: number | undefined,
  totalLines: number
): LineRangeResult {
  const start = startLine ?? 1;
  let end = endLine ?? totalLines;

  if (start > totalLines) {
    return { ok: false, error: `Start line ${start} exceeds file length (${totalLines} lines)` };
  }

  if (end > totalLines) {
    end = totalLines;
  }

  if (start > end) {
    return { ok: false, error: `Start line (${start}) cannot be greater than end line (${end})` };
  }

  return { ok: true, startLine: start, endLine: end };
}

/**
 * Result type for lineRange string parsing
 */
type ParsedLineRange = { ok: true; start: number; end: number } | { ok: false; error: string };

/**
 * Parse a line range string like "100-250" into start and end numbers.
 *
 * @param range - Line range string in format "start-end" (e.g., "100-250")
 * @returns Parsed line range or error
 *
 * @example
 * parseLineRange("100-250") // { ok: true, start: 100, end: 250 }
 * parseLineRange("1-100")   // { ok: true, start: 1, end: 100 }
 * parseLineRange("invalid") // { ok: false, error: "..." }
 */
function parseLineRange(range: string): ParsedLineRange {
  const match = range.match(/^(\d+)-(\d+)$/);
  if (!match || !match[1] || !match[2]) {
    return {
      ok: false,
      error: `Invalid line range format: "${range}". Use format like "100-250" (start-end).`,
    };
  }

  const start = parseInt(match[1], 10);
  const end = parseInt(match[2], 10);

  if (start < 1) {
    return { ok: false, error: `Line range start must be positive, got ${start}` };
  }

  if (end < start) {
    return { ok: false, error: `Line range end (${end}) cannot be less than start (${start})` };
  }

  return { ok: true, start, end };
}

/**
 * Schema for read_file tool parameters
 */
export const readFileParamsSchema = z.object({
  /** File path to read (relative to working directory or absolute) */
  path: z.string().describe("The path to the file to read"),
  /** Optional start line (1-indexed, inclusive) */
  startLine: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Start line number (1-indexed, inclusive)"),
  /** Optional end line (1-indexed, inclusive) */
  endLine: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("End line number (1-indexed, inclusive)"),
  /** Alternative line range as string (takes precedence over startLine/endLine) */
  lineRange: z
    .string()
    .optional()
    .describe(
      'Line range as string, e.g., "100-250" (lines 100 to 250). Alternative to startLine/endLine.'
    ),
});

/** Inferred type for read_file parameters */
export type ReadFileParams = z.infer<typeof readFileParamsSchema>;

/** Output type for read_file tool */
export interface ReadFileOutput {
  /** The file content (or specified line range) */
  content: string;
  /** The resolved path that was read */
  path: string;
  /** Total number of lines in the file */
  totalLines: number;
  /** Start line that was read (1-indexed) */
  startLine: number;
  /** End line that was read (1-indexed) */
  endLine: number;
  /** Estimated token count (chars/4) for context budgeting */
  estimatedTokens?: number;
  /** Warning message if file is large but still readable */
  warning?: string;
  /** Lines read range (for pagination clarity) */
  linesRead: { start: number; end: number };
  /** Whether there are more lines after the current read range */
  hasMoreLines: boolean;
  /** Next start line for pagination (only present if hasMoreLines is true) */
  nextStartLine?: number;
}

/**
 * Read file tool implementation
 *
 * Reads file contents with optional line range support.
 * Uses path security validation to prevent directory traversal attacks.
 *
 * @example
 * ```typescript
 * // Read entire file
 * const result = await readFileTool.execute(
 *   { path: "src/index.ts" },
 *   ctx
 * );
 *
 * // Read specific line range
 * const result = await readFileTool.execute(
 *   { path: "src/index.ts", startLine: 10, endLine: 20 },
 *   ctx
 * );
 * ```
 */
export const readFileTool = defineTool({
  name: "read_file",
  description:
    "Read a file's content. Can read entire file or specific line range. " +
    'Use lineRange (e.g., "100-250") or startLine/endLine for partial reads. ' +
    "Output includes pagination hints (nextStartLine) for continuing to read large files.",
  parameters: readFileParamsSchema,
  kind: "read",
  category: "filesystem",

  async execute(input, ctx) {
    // Check for cancellation
    if (ctx.abortSignal.aborted) {
      return fail("Operation was cancelled");
    }

    // Validate path security
    const pathResult = validatePath(input.path, ctx.workingDir);
    if (!pathResult.valid) {
      return fail(pathResult.error ?? "Path traversal not allowed");
    }

    const resolvedPath = pathResult.sanitizedPath;

    try {
      // Check file size before reading (T076 - prevent context overflow)
      const sizeCheck = await checkFileSize(resolvedPath);
      if (!sizeCheck.ok) {
        return fail(sizeCheck.error);
      }

      // Read the file
      const content = await readFile(resolvedPath, { encoding: "utf-8" });
      const lines = content.split("\n");
      const totalLines = lines.length;

      // Determine effective start/end (lineRange takes precedence)
      let effectiveStart = input.startLine;
      let effectiveEnd = input.endLine;

      if (input.lineRange) {
        const parsed = parseLineRange(input.lineRange);
        if (!parsed.ok) {
          return fail(parsed.error);
        }
        effectiveStart = parsed.start;
        effectiveEnd = parsed.end;
      }

      // Validate and normalize line range
      const lineRange = validateLineRange(effectiveStart, effectiveEnd, totalLines);
      if (!lineRange.ok) {
        return fail(lineRange.error);
      }

      // Extract the requested line range (convert from 1-indexed to 0-indexed)
      const selectedLines = lines.slice(lineRange.startLine - 1, lineRange.endLine);
      const selectedContent = selectedLines.join("\n");

      // Calculate token estimate for context budgeting
      const estimatedTokens = Math.ceil(selectedContent.length / CHARS_PER_TOKEN);

      // Calculate pagination hints
      const hasMoreLines = lineRange.endLine < totalLines;

      return ok({
        content: selectedContent,
        path: resolvedPath,
        totalLines,
        startLine: lineRange.startLine,
        endLine: lineRange.endLine,
        estimatedTokens,
        ...(sizeCheck.warning && { warning: sizeCheck.warning }),
        // Pagination hints
        linesRead: { start: lineRange.startLine, end: lineRange.endLine },
        hasMoreLines,
        ...(hasMoreLines && { nextStartLine: lineRange.endLine + 1 }),
      });
    } catch (error) {
      if (error instanceof Error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "ENOENT") {
          return fail(`File not found: ${input.path}`);
        }
        if (nodeError.code === "EACCES") {
          return fail(`Access denied: ${input.path}`);
        }
        if (nodeError.code === "EISDIR") {
          return fail(`Path is a directory, not a file: ${input.path}`);
        }
        return fail(`Failed to read file: ${error.message}`);
      }
      return fail("Unknown error occurred while reading file");
    }
  },

  shouldConfirm(_input, _ctx) {
    // Read operations don't need confirmation
    return false;
  },
});
