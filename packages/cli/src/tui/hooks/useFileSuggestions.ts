/**
 * useFileSuggestions Hook
 *
 * Provides file and folder suggestions for @ mention autocomplete.
 * Scans the file system and returns matching suggestions based on partial path input.
 *
 * @module tui/hooks/useFileSuggestions
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FileSuggestion } from "../components/Input/MentionAutocomplete.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for file suggestions.
 */
export interface UseFileSuggestionsOptions {
  /** Working directory for resolving paths */
  readonly cwd: string;
  /** Whether to include files (default: true) */
  readonly includeFiles?: boolean;
  /** Whether to include directories (default: true) */
  readonly includeDirectories?: boolean;
  /** File extensions to filter (e.g., ['.ts', '.tsx']) */
  readonly extensions?: readonly string[];
  /** Maximum number of suggestions */
  readonly maxSuggestions?: number;
  /** Debounce delay in ms */
  readonly debounceMs?: number;
}

/**
 * Result of the useFileSuggestions hook.
 */
export interface UseFileSuggestionsResult {
  /** Current file/folder suggestions */
  readonly suggestions: readonly FileSuggestion[];
  /** Whether suggestions are loading */
  readonly loading: boolean;
  /** Error message if scan failed */
  readonly error: string | null;
  /** Refresh suggestions manually */
  readonly refresh: () => void;
}

// =============================================================================
// Constants
// =============================================================================

/** Directories to skip when scanning */
const SKIP_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "__pycache__",
  ".cache",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".output",
  "target",
  "vendor",
]);

/** Default options */
const DEFAULT_OPTIONS: Required<Omit<UseFileSuggestionsOptions, "cwd">> = {
  includeFiles: true,
  includeDirectories: true,
  extensions: [],
  maxSuggestions: 50,
  debounceMs: 100,
};

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook to provide file/folder suggestions for a partial path.
 *
 * @param partialPath - The partial path entered by the user
 * @param options - Configuration options
 * @returns File suggestions, loading state, and error
 *
 * @example
 * ```tsx
 * const { suggestions, loading } = useFileSuggestions("./src/", {
 *   cwd: "/project",
 *   includeFiles: true,
 *   includeDirectories: true,
 * });
 * ```
 */
export function useFileSuggestions(
  partialPath: string,
  options: UseFileSuggestionsOptions
): UseFileSuggestionsResult {
  const [suggestions, setSuggestions] = useState<FileSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Memoize options to avoid recreating object on each render
  const cwd = options.cwd;
  const includeFiles = options.includeFiles ?? DEFAULT_OPTIONS.includeFiles;
  const includeDirectories = options.includeDirectories ?? DEFAULT_OPTIONS.includeDirectories;
  const extensions = options.extensions ?? DEFAULT_OPTIONS.extensions;
  const maxSuggestions = options.maxSuggestions ?? DEFAULT_OPTIONS.maxSuggestions;
  const debounceMs = options.debounceMs ?? DEFAULT_OPTIONS.debounceMs;

  const refresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshTrigger enables manual refresh
  useEffect(() => {
    let cancelled = false;
    const opts: Required<UseFileSuggestionsOptions> = {
      cwd,
      includeFiles,
      includeDirectories,
      extensions,
      maxSuggestions,
      debounceMs,
    };

    const timeoutId = setTimeout(async () => {
      if (cancelled) return;

      setLoading(true);
      setError(null);

      try {
        const result = await scanForSuggestions(partialPath, opts);
        if (!cancelled) {
          setSuggestions(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          setSuggestions([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [
    partialPath,
    cwd,
    includeFiles,
    includeDirectories,
    extensions,
    maxSuggestions,
    debounceMs,
    refreshTrigger,
  ]);

  return useMemo(
    () => ({ suggestions, loading, error, refresh }),
    [suggestions, loading, error, refresh]
  );
}

// =============================================================================
// Helper Functions
// =============================================================================

/** Parse partial path into scan directory and match prefix */
function parsePartialPath(partialPath: string): { scanDir: string; matchPrefix: string } {
  const normalizedPartial = partialPath.replace(/\\/g, "/");

  if (normalizedPartial.endsWith("/") || normalizedPartial === "") {
    return { scanDir: normalizedPartial || ".", matchPrefix: "" };
  }

  const lastSlash = normalizedPartial.lastIndexOf("/");
  if (lastSlash === -1) {
    return { scanDir: ".", matchPrefix: normalizedPartial };
  }

  return {
    scanDir: normalizedPartial.slice(0, lastSlash + 1) || ".",
    matchPrefix: normalizedPartial.slice(lastSlash + 1),
  };
}

/** Check if entry should be included based on filters */
function shouldIncludeEntry(
  entry: { name: string; isDirectory: () => boolean },
  matchPrefix: string,
  includeFiles: boolean,
  includeDirectories: boolean,
  extensions: readonly string[]
): boolean {
  const isDir = entry.isDirectory();
  const lowerName = entry.name.toLowerCase();
  const lowerPrefix = matchPrefix.toLowerCase();

  // Skip hidden files unless searching for them
  if (entry.name.startsWith(".") && !matchPrefix.startsWith(".")) return false;

  // Skip ignored directories
  if (isDir && SKIP_DIRECTORIES.has(entry.name)) return false;

  // Check prefix match
  if (lowerPrefix && !lowerName.startsWith(lowerPrefix)) return false;

  // Filter by type
  if (isDir && !includeDirectories) return false;
  if (!isDir && !includeFiles) return false;

  // Filter by extension (only for files)
  if (!isDir && extensions.length > 0) {
    const ext = path.extname(entry.name).toLowerCase();
    if (!extensions.includes(ext)) return false;
  }

  return true;
}

/**
 * Scan for file/folder suggestions based on partial path.
 */
async function scanForSuggestions(
  partialPath: string,
  options: Required<UseFileSuggestionsOptions>
): Promise<FileSuggestion[]> {
  const { cwd, includeFiles, includeDirectories, extensions, maxSuggestions } = options;

  const { scanDir, matchPrefix } = parsePartialPath(partialPath);
  const fullScanDir = path.resolve(cwd, scanDir);

  // Check if directory exists
  try {
    const stats = await fs.stat(fullScanDir);
    if (!stats.isDirectory()) return [];
  } catch {
    return [];
  }

  // Read and filter directory contents
  const entries = await fs.readdir(fullScanDir, { withFileTypes: true });
  const suggestions: FileSuggestion[] = [];

  for (const entry of entries) {
    if (!shouldIncludeEntry(entry, matchPrefix, includeFiles, includeDirectories, extensions)) {
      continue;
    }

    const isDirectory = entry.isDirectory();
    const fullPath = scanDir === "." ? entry.name : `${scanDir}${entry.name}`;

    suggestions.push({
      name: entry.name,
      path: fullPath,
      isDirectory,
      extension: isDirectory ? undefined : path.extname(entry.name).slice(1),
    });

    if (suggestions.length >= maxSuggestions) break;
  }

  // Sort: directories first, then alphabetically
  suggestions.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return suggestions;
}
