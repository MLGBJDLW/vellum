/**
 * Recall Memory Tool
 *
 * Retrieves key-value pairs from .vellum/memory/ directory.
 * Returns null for missing keys (not an error).
 *
 * @module builtin/recall-memory
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { defineTool, fail, ok } from "../types/index.js";
import type { SavedMemoryEntry } from "./save-memory.js";

/** Base path for memory storage relative to working directory */
const MEMORY_BASE_PATH = ".vellum/memory";

/** Default namespace for memories */
const DEFAULT_NAMESPACE = "default";

/** Pattern for valid memory keys (alphanumeric and dashes) */
const KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;

/**
 * Schema for recall_memory tool parameters
 */
export const recallMemoryParamsSchema = z.object({
  /** Memory key to retrieve */
  key: z
    .string()
    .min(1)
    .max(100)
    .regex(
      KEY_PATTERN,
      "Key must be alphanumeric with optional dashes, cannot start or end with dash"
    )
    .describe("Memory key to retrieve"),
  /** Namespace to look in (default: 'default') */
  namespace: z
    .string()
    .min(1)
    .max(50)
    .regex(
      KEY_PATTERN,
      "Namespace must be alphanumeric with optional dashes, cannot start or end with dash"
    )
    .optional()
    .default(DEFAULT_NAMESPACE)
    .describe("Namespace to look in (default: 'default')"),
});

/** Inferred type for recall_memory parameters */
export type RecallMemoryParams = z.infer<typeof recallMemoryParamsSchema>;

/** Output type for recall_memory tool */
export interface RecallMemoryOutput {
  /** Whether the memory was found */
  found: boolean;
  /** The stored value (if found) */
  value?: string;
  /** ISO timestamp when memory was stored (if found) */
  storedAt?: string;
  /** ISO timestamp when memory was last updated (if found) */
  updatedAt?: string;
  /** Memory key */
  key: string;
  /** Namespace searched */
  namespace: string;
}

/**
 * Recall memory tool implementation
 *
 * Retrieves a previously saved memory from .vellum/memory/{namespace}/{key}.json.
 * Returns { found: false } for missing keys instead of an error.
 *
 * @example
 * ```typescript
 * // Recall from default namespace
 * const result = await recallMemoryTool.execute(
 *   { key: "user-preference" },
 *   ctx
 * );
 *
 * if (result.success && result.output.found) {
 *   console.log(result.output.value);
 * }
 *
 * // Recall from custom namespace
 * const result = await recallMemoryTool.execute(
 *   { key: "api-endpoint", namespace: "config" },
 *   ctx
 * );
 * ```
 */
export const recallMemoryTool = defineTool<typeof recallMemoryParamsSchema, RecallMemoryOutput>({
  name: "recall_memory",
  description:
    "Retrieve a previously saved memory by key. Returns { found: false } if the memory doesn't exist. Memories are stored in .vellum/memory/{namespace}/{key}.json.",
  parameters: recallMemoryParamsSchema,
  kind: "read",
  category: "memory",

  async execute(input, ctx) {
    // Check for cancellation
    if (ctx.abortSignal.aborted) {
      return fail("Operation was cancelled");
    }

    const { key, namespace = DEFAULT_NAMESPACE } = input;

    // Build file path
    const memoryFilePath = join(ctx.workingDir, MEMORY_BASE_PATH, namespace, `${key}.json`);

    try {
      // Try to read the memory file
      const content = await readFile(memoryFilePath, { encoding: "utf-8" });
      const memoryEntry = JSON.parse(content) as SavedMemoryEntry;

      return ok({
        found: true,
        value: memoryEntry.value,
        storedAt: memoryEntry.storedAt,
        updatedAt: memoryEntry.updatedAt,
        key,
        namespace,
      });
    } catch (error) {
      // Check if it's a "file not found" error
      if (error instanceof Error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "ENOENT") {
          // Memory not found - this is NOT an error, just return found: false
          return ok({
            found: false,
            key,
            namespace,
          });
        }

        // Other errors (permission denied, invalid JSON, etc.)
        return fail(`Failed to recall memory: ${error.message}`);
      }

      return fail("Unknown error while recalling memory");
    }
  },

  shouldConfirm(_input, _ctx) {
    // Read-only operation, no confirmation needed
    return false;
  },
});
