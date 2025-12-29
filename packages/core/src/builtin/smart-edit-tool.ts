/**
 * Smart Edit Tool - T035a
 *
 * Standalone smart_edit tool for intelligent text replacement.
 * Uses SmartEditEngine with configurable strategy override.
 *
 * @module builtin/smart-edit-tool
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { createSmartEditEngine, type StrategyName } from "../tool/smart-edit.js";
import { defineTool, fail, ok } from "../types/index.js";
import { validatePath } from "./utils/index.js";

/**
 * Strategy options for the smart_edit tool
 */
const strategySchema = z.enum(["auto", "exact", "whitespace", "fuzzy", "block"]);

/**
 * Schema for smart_edit tool parameters
 */
export const smartEditParamsSchema = z.object({
  /** File path to edit (relative to working directory or absolute) */
  path: z.string().describe("The path to the file to edit"),
  /** Text to find in the file */
  search: z.string().describe("The text to find and replace"),
  /** Replacement text */
  replace: z.string().describe("The replacement text"),
  /** Strategy override (optional, default: auto) */
  strategy: strategySchema
    .optional()
    .default("auto")
    .describe("Matching strategy: auto (try all), exact, whitespace, fuzzy, or block"),
});

/** Inferred type for smart_edit parameters */
export type SmartEditParams = z.infer<typeof smartEditParamsSchema>;

/** Output type for smart_edit tool */
export interface SmartEditOutput {
  /** The resolved path that was edited */
  path: string;
  /** Whether the edit was applied */
  applied: boolean;
  /** The strategy that was used */
  strategyUsed: StrategyName;
  /** Confidence score of the match (0.0-1.0) */
  confidence: number;
  /** Additional details about the match */
  details?: {
    position?: number;
    matchLength?: number;
    similarity?: number;
  };
}

/**
 * Smart Edit tool implementation
 *
 * Performs intelligent text replacement with multiple matching strategies.
 * Falls back through strategies in order until a match is found.
 *
 * Strategies:
 * - exact: Direct string match (confidence: 1.0)
 * - whitespace: Normalize whitespace before matching (confidence: 0.95)
 * - fuzzy: Line-by-line similarity matching (confidence: 0.8-0.95)
 * - block: Find larger context block (confidence: 0.7-0.9)
 *
 * @example
 * ```typescript
 * // Auto strategy (tries all in order)
 * const result = await smartEditTool.execute({
 *   path: "file.ts",
 *   search: "const x = 1;",
 *   replace: "const x = 2;",
 * }, ctx);
 *
 * // Force exact match only
 * const result = await smartEditTool.execute({
 *   path: "file.ts",
 *   search: "const x = 1;",
 *   replace: "const x = 2;",
 *   strategy: "exact",
 * }, ctx);
 * ```
 */
export const smartEditTool = defineTool({
  name: "smart_edit",
  description:
    "Intelligently find and replace text in a file using multiple matching strategies. " +
    "Handles whitespace differences, fuzzy matching, and block context matching. " +
    "Use 'strategy' parameter to force a specific matching approach.",
  parameters: smartEditParamsSchema,
  kind: "write",
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

    // Check permission for write operation
    const hasPermission = await ctx.checkPermission("write", resolvedPath);
    if (!hasPermission) {
      return fail(`Permission denied: cannot write to ${input.path}`);
    }

    try {
      // Read the current file content
      let content: string;
      try {
        content = await readFile(resolvedPath, { encoding: "utf-8" });
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "ENOENT") {
          return fail(`File not found: ${input.path}`);
        }
        throw error;
      }

      // Create SmartEdit engine
      const engine = createSmartEditEngine();

      // Apply the edit
      let result;
      if (input.strategy === "auto") {
        result = engine.apply(content, input.search, input.replace);
      } else {
        result = engine.applyWithStrategy(
          content,
          input.search,
          input.replace,
          input.strategy as StrategyName
        );
      }

      // If no match found, return failure
      if (!result.success) {
        return fail(
          result.error ?? `Could not find matching text using strategy '${result.strategy}'`
        );
      }

      // Create parent directories if needed
      const parentDir = dirname(resolvedPath);
      await mkdir(parentDir, { recursive: true });

      // Write the modified content
      await writeFile(resolvedPath, result.output, { encoding: "utf-8" });

      return ok({
        path: resolvedPath,
        applied: true,
        strategyUsed: result.strategy,
        confidence: result.confidence,
        details: result.matchDetails,
      });
    } catch (error) {
      if (error instanceof Error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "EACCES") {
          return fail(`Access denied: ${input.path}`);
        }
        return fail(`Failed to apply smart edit: ${error.message}`);
      }
      return fail("Unknown error occurred while applying smart edit");
    }
  },

  shouldConfirm(_input, _ctx) {
    // Write operations typically need confirmation
    return true;
  },
});
