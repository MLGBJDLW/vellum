/**
 * Open Slash Command
 *
 * Opens files and URLs using system defaults:
 * - /open <url> - Open URL in browser
 * - /open <file> - Open file with default app
 * - /open -e <file> - Open file in editor (supports :line)
 *
 * @module cli/commands/open
 */

import * as path from "node:path";
import { isValidUrl, openFile, openInEditor, openUrl } from "../tui/services/open-external.js";
import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { error, success } from "./types.js";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse file path with optional line number
 *
 * Supports formats:
 * - /path/to/file.ts
 * - /path/to/file.ts:42
 * - C:\path\to\file.ts:42 (Windows)
 *
 * @param input - Path string potentially containing :line suffix
 * @returns Parsed path and optional line number
 */
function parsePathWithLine(input: string): { filePath: string; line?: number } {
  // Windows absolute path check (C:\, D:\, etc.)
  const isWindowsAbsolute = /^[a-zA-Z]:[/\\]/.test(input);

  // Find the last colon that's followed by a number (line indicator)
  // For Windows paths, skip the drive letter colon
  const searchStart = isWindowsAbsolute ? 2 : 0;
  const colonIndex = input.lastIndexOf(":");

  if (colonIndex > searchStart) {
    const potentialLine = input.slice(colonIndex + 1);
    const lineNum = parseInt(potentialLine, 10);

    if (!Number.isNaN(lineNum) && lineNum > 0) {
      return {
        filePath: input.slice(0, colonIndex),
        line: lineNum,
      };
    }
  }

  return { filePath: input };
}

/**
 * Resolve path relative to current working directory
 */
function resolvePath(inputPath: string, cwd: string): string {
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }
  return path.resolve(cwd, inputPath);
}

// =============================================================================
// Command Implementation
// =============================================================================

/**
 * Open command handler
 */
async function executeOpen(ctx: CommandContext): Promise<CommandResult> {
  const target = ctx.parsedArgs.positional[0] as string | undefined;
  const inEditor = ctx.parsedArgs.named.editor === true || ctx.parsedArgs.named.e === true;

  if (!target) {
    return error(
      "MISSING_ARGUMENT",
      "Missing target. Usage: /open <url|file> or /open -e <file>[:line]",
      ["/open https://example.com", "/open ./README.md", "/open -e src/index.ts:42"]
    );
  }

  // URL handling
  if (isValidUrl(target)) {
    if (inEditor) {
      return error(
        "INVALID_ARGUMENT",
        "Cannot open URL in editor. Use /open <url> without -e flag."
      );
    }

    const result = await openUrl(target);
    if (result.success) {
      return success(`Opened ${target} in browser`);
    }
    return error("INTERNAL_ERROR", result.error);
  }

  // File handling
  const cwd = ctx.session.cwd ?? process.cwd();
  const { filePath, line } = parsePathWithLine(target);
  const resolvedPath = resolvePath(filePath, cwd);

  if (inEditor) {
    const result = await openInEditor(resolvedPath, { line });
    if (result.success) {
      const location = line ? `${resolvedPath}:${line}` : resolvedPath;
      return success(`Opened ${location} in editor`);
    }
    return error("INTERNAL_ERROR", result.error);
  }

  // Default: open with system default application
  const result = await openFile(resolvedPath);
  if (result.success) {
    return success(`Opened ${resolvedPath}`);
  }
  return error("INTERNAL_ERROR", result.error);
}

// =============================================================================
// Command Definition
// =============================================================================

/**
 * /open command - Open files and URLs externally
 *
 * @example
 * ```
 * /open https://github.com      # Open URL in browser
 * /open ./README.md             # Open file with default app
 * /open -e src/index.ts         # Open in editor (VS Code)
 * /open -e src/index.ts:42      # Open in editor at line 42
 * ```
 */
export const openCommand: SlashCommand = {
  name: "open",
  description: "Open a file or URL with system default or editor",
  kind: "builtin",
  category: "navigation",
  aliases: ["o"],
  positionalArgs: [
    {
      name: "target",
      type: "string",
      description: "URL or file path to open (supports :line for editor)",
      required: true,
    },
  ],
  namedArgs: [
    {
      name: "editor",
      shorthand: "e",
      type: "boolean",
      description: "Open in text editor (VS Code) instead of default app",
      required: false,
      default: false,
    },
  ],
  examples: [
    "/open https://github.com",
    "/open ./README.md",
    "/open -e src/index.ts",
    "/open -e src/index.ts:42",
  ],
  execute: executeOpen,
};
