// ============================================
// Dynamic Tool Loader
// ============================================

import { type Dirent, existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import picomatch from "picomatch";
import type { z } from "zod";
import type { Tool, ToolKind } from "../types/tool.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for loading custom tools from directories.
 */
export interface LoadToolsOptions {
  /** Directories to scan for tool files */
  directories: string[];
  /** Glob pattern for matching tool files, default: "**\/*.tool.ts" */
  pattern?: string;
}

/**
 * Result of loading tools from a directory.
 */
export interface LoadToolsResult {
  /** Successfully loaded tools */
  tools: Tool<z.ZodType, unknown>[];
  /** Errors encountered during loading */
  errors: LoadToolError[];
}

/**
 * Error encountered while loading a tool file.
 */
export interface LoadToolError {
  /** Path to the file that failed to load */
  filePath: string;
  /** Error message describing the failure */
  message: string;
  /** Original error if available */
  cause?: unknown;
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Type guard to validate if an object is a valid Tool.
 *
 * Checks that the object has:
 * - definition.name (string)
 * - definition.description (string)
 * - definition.parameters (Zod schema)
 * - definition.kind (valid ToolKind)
 * - execute (function)
 *
 * @param obj - Object to validate
 * @returns True if obj is a valid Tool
 *
 * @example
 * ```typescript
 * const exported = await import('./my-tool.tool.ts');
 * if (isValidTool(exported.default)) {
 *   container.registerTool(exported.default);
 * }
 * ```
 */
export function isValidTool(obj: unknown): obj is Tool<z.ZodType, unknown> {
  if (obj === null || typeof obj !== "object") {
    return false;
  }

  const tool = obj as Record<string, unknown>;

  // Check for definition object
  if (!tool.definition || typeof tool.definition !== "object") {
    return false;
  }

  const definition = tool.definition as Record<string, unknown>;

  // Validate definition.name
  if (typeof definition.name !== "string" || definition.name.length === 0) {
    return false;
  }

  // Validate definition.description
  if (typeof definition.description !== "string") {
    return false;
  }

  // Validate definition.parameters (must be a Zod schema)
  if (!definition.parameters || typeof definition.parameters !== "object") {
    return false;
  }

  // Check if it's a Zod schema by looking for _zod property (Zod v4) or _def (Zod v3)
  const params = definition.parameters as Record<string, unknown>;
  const isZodSchema =
    "_zod" in params ||
    "_def" in params ||
    typeof (params as { parse?: unknown }).parse === "function";
  if (!isZodSchema) {
    return false;
  }

  // Validate definition.kind
  const validKinds: ToolKind[] = [
    "read",
    "write",
    "shell",
    "mcp",
    "browser",
    "agent",
    "task",
    "lsp",
  ];
  if (typeof definition.kind !== "string" || !validKinds.includes(definition.kind as ToolKind)) {
    return false;
  }

  // Validate execute function
  if (typeof tool.execute !== "function") {
    return false;
  }

  return true;
}

/**
 * Get validation error message for an invalid tool object.
 *
 * @param obj - Object that failed validation
 * @returns Human-readable error message
 */
export function getToolValidationError(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return "Export is not an object";
  }

  const tool = obj as Record<string, unknown>;

  if (!tool.definition || typeof tool.definition !== "object") {
    return "Missing or invalid 'definition' property";
  }

  const definition = tool.definition as Record<string, unknown>;

  if (typeof definition.name !== "string" || definition.name.length === 0) {
    return "Missing or invalid 'definition.name'";
  }

  if (typeof definition.description !== "string") {
    return "Missing or invalid 'definition.description'";
  }

  if (!definition.parameters || typeof definition.parameters !== "object") {
    return "Missing or invalid 'definition.parameters'";
  }

  const params = definition.parameters as Record<string, unknown>;
  const isZodSchema =
    "_zod" in params ||
    "_def" in params ||
    typeof (params as { parse?: unknown }).parse === "function";
  if (!isZodSchema) {
    return "'definition.parameters' is not a valid Zod schema";
  }

  const validKinds: ToolKind[] = [
    "read",
    "write",
    "shell",
    "mcp",
    "browser",
    "agent",
    "task",
    "lsp",
  ];
  if (typeof definition.kind !== "string" || !validKinds.includes(definition.kind as ToolKind)) {
    return `Invalid 'definition.kind': must be one of ${validKinds.join(", ")}`;
  }

  if (typeof tool.execute !== "function") {
    return "Missing or invalid 'execute' function";
  }

  return "Unknown validation error";
}

// =============================================================================
// Loader Functions
// =============================================================================

/**
 * Load custom tools from specified directories.
 *
 * Scans directories using the provided glob pattern (default: "**\/*.tool.ts"),
 * imports each matching file, and validates the exported tool.
 *
 * Supports both default exports and named exports. Named exports are
 * registered with the export name appended to the tool name if different
 * from "default".
 *
 * @param options - Loading options including directories and pattern
 * @returns Result containing loaded tools and any errors
 *
 * @example
 * ```typescript
 * const result = await loadCustomTools({
 *   directories: ["~/.config/vellum/tools", "./project-tools"],
 *   pattern: "**\/*.tool.ts",
 * });
 *
 * console.log(`Loaded ${result.tools.length} tools`);
 * for (const error of result.errors) {
 *   console.warn(`Failed to load ${error.filePath}: ${error.message}`);
 * }
 * ```
 */
export async function loadCustomTools(options: LoadToolsOptions): Promise<LoadToolsResult> {
  const { directories, pattern = "**/*.tool.ts" } = options;

  const tools: Tool<z.ZodType, unknown>[] = [];
  const errors: LoadToolError[] = [];

  // Create picomatch matcher for the pattern
  const isMatch = picomatch(pattern, { dot: false });

  for (const directory of directories) {
    await processDirectory(directory, isMatch, tools, errors);
  }

  return { tools, errors };
}

/**
 * Process a single directory for tool files.
 * @internal
 */
async function processDirectory(
  directory: string,
  isMatch: picomatch.Matcher,
  tools: Tool<z.ZodType, unknown>[],
  errors: LoadToolError[]
): Promise<void> {
  if (!existsSync(directory)) {
    return;
  }

  try {
    const files = await scanDirectory(directory, directory, isMatch);
    for (const filePath of files) {
      await importToolFile(filePath, tools, errors);
    }
  } catch {
    // Directory scan failed, skip silently
  }
}

/**
 * Import a single tool file and extract tools.
 * @internal
 */
async function importToolFile(
  filePath: string,
  tools: Tool<z.ZodType, unknown>[],
  errors: LoadToolError[]
): Promise<void> {
  try {
    const mod = await import(filePath);

    // Check for default export first
    if (mod.default && isValidTool(mod.default)) {
      tools.push(mod.default);
    } else if (mod.default) {
      errors.push({
        filePath,
        message: `Invalid default export: ${getToolValidationError(mod.default)}`,
      });
    }

    // Check for named exports (excluding default)
    extractNamedExports(mod, tools);
  } catch (error) {
    errors.push({
      filePath,
      message: error instanceof Error ? error.message : String(error),
      cause: error,
    });
  }
}

/**
 * Extract valid tools from named exports.
 * @internal
 */
function extractNamedExports(
  mod: Record<string, unknown>,
  tools: Tool<z.ZodType, unknown>[]
): void {
  for (const [exportName, exportValue] of Object.entries(mod)) {
    if (exportName === "default") continue;
    if (isValidTool(exportValue)) {
      tools.push(exportValue as Tool<z.ZodType, unknown>);
    }
  }
}

/**
 * Recursively scan a directory for files matching the pattern.
 *
 * @param baseDir - The base directory (for relative path calculation)
 * @param currentDir - Current directory being scanned
 * @param isMatch - Picomatch matcher function
 * @returns Array of absolute file paths matching the pattern
 */
async function scanDirectory(
  baseDir: string,
  currentDir: string,
  isMatch: picomatch.Matcher
): Promise<string[]> {
  const results: string[] = [];

  try {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      const relativePath = relative(baseDir, fullPath);

      await processEntry(entry, fullPath, relativePath, baseDir, isMatch, results);
    }
  } catch {
    // Skip directories we can't read
  }

  return results;
}

/**
 * Process a single directory entry (file, directory, or symlink).
 * @internal
 */
async function processEntry(
  entry: Dirent,
  fullPath: string,
  relativePath: string,
  baseDir: string,
  isMatch: picomatch.Matcher,
  results: string[]
): Promise<void> {
  if (entry.isDirectory()) {
    const subResults = await scanDirectory(baseDir, fullPath, isMatch);
    results.push(...subResults);
  } else if (entry.isFile()) {
    if (isMatch(relativePath)) {
      results.push(fullPath);
    }
  } else if (entry.isSymbolicLink()) {
    await processSymlink(fullPath, relativePath, baseDir, isMatch, results);
  }
}

/**
 * Handle symbolic link entries.
 * @internal
 */
async function processSymlink(
  fullPath: string,
  relativePath: string,
  baseDir: string,
  isMatch: picomatch.Matcher,
  results: string[]
): Promise<void> {
  try {
    const stats = await stat(fullPath);
    if (stats.isDirectory()) {
      const subResults = await scanDirectory(baseDir, fullPath, isMatch);
      results.push(...subResults);
    } else if (stats.isFile() && isMatch(relativePath)) {
      results.push(fullPath);
    }
  } catch {
    // Skip broken symlinks
  }
}

/**
 * Load a single tool file.
 *
 * Convenience function for loading a specific tool file.
 *
 * @param filePath - Path to the tool file
 * @returns The loaded tool, or null if loading failed
 *
 * @example
 * ```typescript
 * const tool = await loadToolFile("./my-custom.tool.ts");
 * if (tool) {
 *   container.registerTool(tool);
 * }
 * ```
 */
export async function loadToolFile(filePath: string): Promise<Tool<z.ZodType, unknown> | null> {
  try {
    const mod = await import(filePath);

    // Prefer default export
    if (mod.default && isValidTool(mod.default)) {
      return mod.default;
    }

    // Fall back to first valid named export
    for (const [_, exportValue] of Object.entries(mod)) {
      if (isValidTool(exportValue)) {
        return exportValue as Tool<z.ZodType, unknown>;
      }
    }

    return null;
  } catch {
    return null;
  }
}
