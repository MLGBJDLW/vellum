/**
 * Save Memory Tool
 *
 * Persists key-value pairs to .vellum/memory/ directory.
 * Supports namespaced storage for organization.
 *
 * @module builtin/save-memory
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { defineTool, fail, ok } from "../types/index.js";

/** Base path for memory storage relative to working directory */
const MEMORY_BASE_PATH = ".vellum/memory";

/** Default namespace for memories */
const DEFAULT_NAMESPACE = "default";

/** Pattern for valid memory keys (alphanumeric and dashes) */
const KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;

/**
 * Schema for save_memory tool parameters
 */
export const saveMemoryParamsSchema = z.object({
  /** Memory key (alphanumeric and dashes only) */
  key: z
    .string()
    .min(1)
    .max(100)
    .regex(
      KEY_PATTERN,
      "Key must be alphanumeric with optional dashes, cannot start or end with dash"
    )
    .describe("Memory key (alphanumeric and dashes only)"),
  /** Value to store */
  value: z.string().describe("Value to store"),
  /** Optional namespace for organization (default: 'default') */
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
    .describe("Optional namespace for organization (default: 'default')"),
});

/** Inferred type for save_memory parameters */
export type SaveMemoryParams = z.infer<typeof saveMemoryParamsSchema>;

/** Memory entry structure stored in JSON */
export interface SavedMemoryEntry {
  /** The stored value */
  value: string;
  /** ISO timestamp when memory was stored */
  storedAt: string;
  /** ISO timestamp when memory was last updated */
  updatedAt: string;
  /** Namespace the memory belongs to */
  namespace: string;
  /** Memory key */
  key: string;
}

/** Output type for save_memory tool */
export interface SaveMemoryOutput {
  /** Confirmation message */
  message: string;
  /** Path where memory was stored */
  path: string;
  /** Memory key */
  key: string;
  /** Namespace used */
  namespace: string;
  /** Whether this was a new memory (true) or update (false) */
  created: boolean;
}

/**
 * Load existing memory entry if it exists
 */
async function loadExistingMemory(filePath: string): Promise<SavedMemoryEntry | null> {
  try {
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(filePath, { encoding: "utf-8" });
    return JSON.parse(content) as SavedMemoryEntry;
  } catch {
    return null;
  }
}

/**
 * Save memory tool implementation
 *
 * Persists a key-value pair to .vellum/memory/{namespace}/{key}.json.
 * Creates directories automatically if they don't exist.
 * Updates existing memories if they already exist.
 *
 * @example
 * ```typescript
 * // Save to default namespace
 * const result = await saveMemoryTool.execute(
 *   { key: "user-preference", value: "dark-mode" },
 *   ctx
 * );
 *
 * // Save to custom namespace
 * const result = await saveMemoryTool.execute(
 *   {
 *     key: "api-endpoint",
 *     value: "https://api.example.com",
 *     namespace: "config"
 *   },
 *   ctx
 * );
 * ```
 */
export const saveMemoryTool = defineTool({
  name: "save_memory",
  description:
    "Save a key-value pair to persistent memory. Memories are stored in .vellum/memory/{namespace}/{key}.json. Use namespaces to organize different types of memories.",
  parameters: saveMemoryParamsSchema,
  kind: "write",
  category: "memory",

  async execute(input, ctx) {
    // Check for cancellation
    if (ctx.abortSignal.aborted) {
      return fail("Operation was cancelled");
    }

    const { key, value, namespace = DEFAULT_NAMESPACE } = input;

    // Build file path
    const memoryDir = join(ctx.workingDir, MEMORY_BASE_PATH, namespace);
    const memoryFilePath = join(memoryDir, `${key}.json`);

    // Check permission for write operation
    const hasPermission = await ctx.checkPermission("write", memoryFilePath);
    if (!hasPermission) {
      return fail(`Permission denied: cannot save memory to ${memoryFilePath}`);
    }

    try {
      // Check if memory already exists
      const existing = await loadExistingMemory(memoryFilePath);
      const now = new Date().toISOString();

      const memoryEntry: SavedMemoryEntry = {
        value,
        storedAt: existing?.storedAt || now,
        updatedAt: now,
        namespace,
        key,
      };

      // Create directory if needed
      await mkdir(memoryDir, { recursive: true });

      // Write memory file
      await writeFile(memoryFilePath, JSON.stringify(memoryEntry, null, 2), {
        encoding: "utf-8",
      });

      const created = existing === null;

      return ok({
        message: created
          ? `Saved new memory '${key}' in namespace '${namespace}'`
          : `Updated memory '${key}' in namespace '${namespace}'`,
        path: memoryFilePath,
        key,
        namespace,
        created,
      });
    } catch (error) {
      if (error instanceof Error) {
        return fail(`Failed to save memory: ${error.message}`);
      }
      return fail("Unknown error while saving memory");
    }
  },

  shouldConfirm(_input, _ctx) {
    // Memory saves are generally low-risk, no confirmation needed
    return false;
  },
});
