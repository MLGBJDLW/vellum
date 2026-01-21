/**
 * Open External Service
 *
 * Cross-platform service for opening files, URLs, and editors.
 * Wraps the `open` library with error handling and logging.
 *
 * @module tui/services/open-external
 */

import open from "open";

// =============================================================================
// Types
// =============================================================================

/**
 * Result of an open operation
 */
export type OpenResult<T = void> = { success: true; data: T } | { success: false; error: string };

/**
 * Options for opening in an editor
 */
export interface OpenInEditorOptions {
  /** Line number to navigate to (1-indexed) */
  readonly line?: number;
  /** Column number to navigate to (1-indexed) */
  readonly column?: number;
  /** Preferred editor (defaults to VS Code if available) */
  readonly editor?: "vscode" | "default";
}

// =============================================================================
// URL Validation
// =============================================================================

/**
 * Check if a string is a valid URL
 *
 * @param target - String to validate
 * @returns true if target is a valid http/https URL
 */
export function isValidUrl(target: string): boolean {
  try {
    const url = new URL(target);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Open a URL in the default browser
 *
 * @param url - URL to open (must be http:// or https://)
 * @returns Promise resolving to operation result
 *
 * @example
 * ```typescript
 * const result = await openUrl('https://github.com/vellum');
 * if (result.success) {
 *   console.log('Browser opened');
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export async function openUrl(url: string): Promise<OpenResult> {
  if (!isValidUrl(url)) {
    return {
      success: false,
      error: `Invalid URL: ${url}. Must be http:// or https://`,
    };
  }

  try {
    await open(url);
    return { success: true, data: undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Failed to open URL "${url}": ${message}`,
    };
  }
}

/**
 * Open a file with the system's default application
 *
 * @param filePath - Path to the file to open
 * @returns Promise resolving to operation result
 *
 * @example
 * ```typescript
 * // Open image in default viewer
 * await openFile('/path/to/image.png');
 *
 * // Open PDF in default reader
 * await openFile('/docs/manual.pdf');
 * ```
 */
export async function openFile(filePath: string): Promise<OpenResult> {
  if (!filePath || filePath.trim() === "") {
    return {
      success: false,
      error: "File path cannot be empty",
    };
  }

  try {
    await open(filePath);
    return { success: true, data: undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Failed to open file "${filePath}": ${message}`,
    };
  }
}

/**
 * Open a file in the default text editor
 *
 * Attempts to use VS Code if available, falls back to system editor.
 * Supports navigation to specific line/column.
 *
 * @param filePath - Path to the file to open
 * @param options - Editor options (line, column, editor preference)
 * @returns Promise resolving to operation result
 *
 * @example
 * ```typescript
 * // Open at specific line
 * await openInEditor('/src/index.ts', { line: 42 });
 *
 * // Open at line and column
 * await openInEditor('/src/index.ts', { line: 42, column: 10 });
 *
 * // Force VS Code
 * await openInEditor('/src/index.ts', { editor: 'vscode' });
 * ```
 */
export async function openInEditor(
  filePath: string,
  options: OpenInEditorOptions = {}
): Promise<OpenResult> {
  if (!filePath || filePath.trim() === "") {
    return {
      success: false,
      error: "File path cannot be empty",
    };
  }

  const { line, column, editor = "vscode" } = options;

  try {
    if (editor === "vscode") {
      // VS Code supports file:line:column format via --goto flag
      // Command: code --goto file:line:column
      let target = filePath;
      if (line !== undefined) {
        target += `:${line}`;
        if (column !== undefined) {
          target += `:${column}`;
        }
      }

      // Use 'code' command directly (VS Code CLI)
      await open(target, { app: { name: "code", arguments: ["--goto"] } });
    } else {
      // Fallback to system default editor
      // Note: Line/column navigation may not be supported
      await open(filePath, { app: { name: "editor" } });
    }

    return { success: true, data: undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // If VS Code fails, provide helpful message
    if (editor === "vscode" && message.includes("ENOENT")) {
      return {
        success: false,
        error: `VS Code not found. Install it or use system default editor.`,
      };
    }

    return {
      success: false,
      error: `Failed to open "${filePath}" in editor: ${message}`,
    };
  }
}

/**
 * Open a directory in the system file manager
 *
 * @param dirPath - Path to the directory to open
 * @returns Promise resolving to operation result
 *
 * @example
 * ```typescript
 * await openDirectory('/path/to/project');
 * ```
 */
export async function openDirectory(dirPath: string): Promise<OpenResult> {
  if (!dirPath || dirPath.trim() === "") {
    return {
      success: false,
      error: "Directory path cannot be empty",
    };
  }

  try {
    await open(dirPath);
    return { success: true, data: undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Failed to open directory "${dirPath}": ${message}`,
    };
  }
}

// =============================================================================
// Convenience Exports
// =============================================================================

/**
 * Open external service singleton
 *
 * Provides namespaced access to all open operations.
 */
export const openExternalService = {
  openUrl,
  openFile,
  openInEditor,
  openDirectory,
  isValidUrl,
} as const;
