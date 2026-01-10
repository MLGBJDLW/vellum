/**
 * Mention Expander
 *
 * Expands @ mentions into their actual content (file contents, git diffs, etc).
 * This module provides the core expansion logic for the mention system.
 *
 * @module core/mentions/expander
 */

import type { Dirent } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Mention } from "@vellum/shared";
import { parseMentions } from "@vellum/shared";
import { simpleGit } from "simple-git";
import {
  DEFAULT_EXPANSION_OPTIONS,
  type MentionExpansion,
  type MentionExpansionContext,
  type MentionExpansionMetadata,
  type MentionExpansionOptions,
  type MentionExpansionResult,
  type MentionHandler,
  type MentionHandlerRegistry,
} from "./types.js";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a successful expansion result.
 */
function successExpansion(
  mention: Mention,
  content: string,
  metadata?: MentionExpansionMetadata
): MentionExpansion {
  return {
    mention,
    content,
    success: true,
    metadata,
  };
}

/**
 * Create a failed expansion result.
 */
function failedExpansion(mention: Mention, error: string): MentionExpansion {
  return {
    mention,
    content: "",
    success: false,
    error,
  };
}

/**
 * Truncate content if it exceeds the maximum length.
 */
function truncateContent(
  content: string,
  maxLength: number
): { content: string; truncated: boolean; originalSize: number } {
  if (content.length <= maxLength) {
    return { content, truncated: false, originalSize: content.length };
  }
  return {
    content: `${content.slice(0, maxLength)}\n\n... [truncated]`,
    truncated: true,
    originalSize: content.length,
  };
}

/**
 * Resolve a potentially relative path against the cwd.
 */
function resolvePath(inputPath: string, cwd: string): string {
  // Handle home directory expansion
  if (inputPath.startsWith("~")) {
    const home = process.env.HOME || process.env.USERPROFILE || "";
    inputPath = path.join(home, inputPath.slice(1));
  }
  return path.resolve(cwd, inputPath);
}

/**
 * Format file size for display.
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// =============================================================================
// Mention Handlers
// =============================================================================

/**
 * Handle @file: mentions - read file contents.
 */
const handleFileMention: MentionHandler = async (mention, context, options) => {
  const filePath = resolvePath(mention.value, context.cwd);

  try {
    // Check file exists and get stats
    const stats = await fs.stat(filePath);

    if (!stats.isFile()) {
      return failedExpansion(mention, `Not a file: ${mention.value}`);
    }

    // Check file size
    if (stats.size > options.maxFileSize) {
      return failedExpansion(
        mention,
        `File too large (${formatFileSize(stats.size)}). Maximum: ${formatFileSize(options.maxFileSize)}`
      );
    }

    // Read file content
    const content = await fs.readFile(filePath, "utf-8");

    // Truncate if needed
    const {
      content: truncatedContent,
      truncated,
      originalSize,
    } = truncateContent(content, options.maxContentLength);

    // Count lines
    const lineCount = content.split("\n").length;

    // Build metadata
    const metadata: MentionExpansionMetadata | undefined = options.includeMetadata
      ? {
          fileSize: stats.size,
          lineCount,
          truncated,
          originalSize: truncated ? originalSize : undefined,
        }
      : undefined;

    // Format output with file header
    const formattedContent = `--- ${mention.value} ---\n${truncatedContent}`;

    return successExpansion(mention, formattedContent, metadata);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return failedExpansion(mention, `File not found: ${mention.value}`);
    }
    if (err.code === "EACCES") {
      return failedExpansion(mention, `Permission denied: ${mention.value}`);
    }
    return failedExpansion(mention, `Failed to read file: ${err.message}`);
  }
};

// =============================================================================
// Folder Scanning Helpers
// =============================================================================

/** Directories to skip when scanning */
const SKIP_DIRS = new Set(["node_modules", "__pycache__", ".git", ".svn", ".hg"]);

/** Check if an item should be skipped */
function shouldSkipItem(name: string): boolean {
  return name.startsWith(".") || SKIP_DIRS.has(name);
}

/** Sort directory items: directories first, then alphabetically */
function sortDirItems(items: Dirent[]): Dirent[] {
  return items.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) {
      return a.isDirectory() ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

/**
 * Handle @folder: mentions - list directory contents.
 */
const handleFolderMention: MentionHandler = async (mention, context, options) => {
  const folderPath = resolvePath(mention.value, context.cwd);

  try {
    // Check folder exists and get stats
    const stats = await fs.stat(folderPath);

    if (!stats.isDirectory()) {
      return failedExpansion(mention, `Not a directory: ${mention.value}`);
    }

    // Read directory contents recursively
    const entries: string[] = [];
    const visited = new Set<string>();
    const maxFiles = options.maxFolderFiles;
    const maxDepth = options.maxFolderDepth;

    async function scanDir(dir: string, depth: number, prefix: string): Promise<void> {
      if (depth > maxDepth || entries.length >= maxFiles) return;

      const realDir = await fs.realpath(dir).catch(() => dir);
      if (visited.has(realDir)) return;
      visited.add(realDir);

      const items = sortDirItems(await fs.readdir(dir, { withFileTypes: true }));

      for (const item of items) {
        if (entries.length >= maxFiles) break;
        if (shouldSkipItem(item.name)) continue;

        const isDir = item.isDirectory();
        const displayName = isDir ? `${item.name}/` : item.name;
        entries.push(`${prefix}${displayName}`);

        if (isDir && depth < maxDepth) {
          await scanDir(path.join(dir, item.name), depth + 1, `${prefix}  `);
        }
      }
    }

    await scanDir(folderPath, 0, "");

    // Build output
    const fileCount = entries.length;
    const truncated = fileCount >= options.maxFolderFiles;

    const header = `--- ${mention.value}/ (${fileCount} items${truncated ? ", truncated" : ""}) ---`;
    const content = `${header}\n${entries.join("\n")}`;

    const metadata: MentionExpansionMetadata | undefined = options.includeMetadata
      ? {
          fileCount,
          truncated,
        }
      : undefined;

    return successExpansion(mention, content, metadata);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return failedExpansion(mention, `Folder not found: ${mention.value}`);
    }
    if (err.code === "EACCES") {
      return failedExpansion(mention, `Permission denied: ${mention.value}`);
    }
    return failedExpansion(mention, `Failed to read folder: ${err.message}`);
  }
};

/**
 * Handle @url: mentions - fetch URL content.
 */
const handleUrlMention: MentionHandler = async (mention, _context, options) => {
  let url = mention.value;

  // Add https:// if no protocol specified
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }

  try {
    // Validate URL
    new URL(url);
  } catch {
    return failedExpansion(mention, `Invalid URL: ${mention.value}`);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.urlTimeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: options.followRedirects ? "follow" : "manual",
        headers: {
          "User-Agent": "Vellum-AI-Assistant/1.0",
          Accept: "text/html,text/plain,application/json,*/*",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return failedExpansion(mention, `HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type") || "text/plain";
      const text = await response.text();

      // Truncate if needed
      const { content, truncated, originalSize } = truncateContent(text, options.maxContentLength);

      // Format output
      const header = `--- ${url} ---`;
      const formattedContent = `${header}\n${content}`;

      const metadata: MentionExpansionMetadata | undefined = options.includeMetadata
        ? {
            contentType,
            truncated,
            originalSize: truncated ? originalSize : undefined,
          }
        : undefined;

      return successExpansion(mention, formattedContent, metadata);
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  } catch (error) {
    const err = error as Error;
    if (err.name === "AbortError") {
      return failedExpansion(mention, `URL fetch timed out after ${options.urlTimeout}ms`);
    }
    return failedExpansion(mention, `Failed to fetch URL: ${err.message}`);
  }
};

/**
 * Handle @git-diff mentions - get current git changes.
 */
const handleGitDiffMention: MentionHandler = async (mention, context, options) => {
  const gitRoot = context.gitRoot || context.cwd;

  try {
    // Check if .git exists
    const gitDir = path.join(gitRoot, ".git");
    await fs.access(gitDir);
  } catch {
    return failedExpansion(mention, "Not in a git repository");
  }

  try {
    const git = simpleGit(gitRoot);

    // Get staged and unstaged changes
    const [stagedDiff, unstagedDiff, status] = await Promise.all([
      git.diff(["--cached"]),
      git.diff(),
      git.status(),
    ]);

    // Combine diffs
    const parts: string[] = [];

    if (stagedDiff.trim()) {
      parts.push(`=== Staged Changes ===\n${stagedDiff}`);
    }

    if (unstagedDiff.trim()) {
      parts.push(`=== Unstaged Changes ===\n${unstagedDiff}`);
    }

    // Add untracked files
    if (status.not_added.length > 0) {
      parts.push(`=== Untracked Files ===\n${status.not_added.join("\n")}`);
    }

    if (parts.length === 0) {
      return successExpansion(mention, "--- @git-diff ---\nNo changes detected.");
    }

    const content = `--- @git-diff ---\n${parts.join("\n\n")}`;
    const {
      content: truncatedContent,
      truncated,
      originalSize,
    } = truncateContent(content, options.maxContentLength);

    const lineCount = content.split("\n").length;
    const metadata: MentionExpansionMetadata | undefined = options.includeMetadata
      ? {
          lineCount,
          truncated,
          originalSize: truncated ? originalSize : undefined,
        }
      : undefined;

    return successExpansion(mention, truncatedContent, metadata);
  } catch (error) {
    const err = error as Error;
    return failedExpansion(mention, `Git operation failed: ${err.message}`);
  }
};

/**
 * Handle @problems mentions - get LSP diagnostics.
 */
const handleProblemsMention: MentionHandler = async (mention, context, _options) => {
  if (context.getProblems) {
    try {
      const problems = await context.getProblems();
      const content = `--- @problems ---\n${problems || "No problems found."}`;
      return successExpansion(mention, content);
    } catch (error) {
      const err = error as Error;
      return failedExpansion(mention, `Failed to get problems: ${err.message}`);
    }
  }

  return failedExpansion(
    mention,
    "@problems is not available in this context (LSP integration required)"
  );
};

/**
 * Handle @terminal mentions - get terminal output.
 */
const handleTerminalMention: MentionHandler = async (mention, context, _options) => {
  if (context.getTerminalOutput) {
    try {
      const output = await context.getTerminalOutput();
      const content = `--- @terminal ---\n${output || "No terminal output available."}`;
      return successExpansion(mention, content);
    } catch (error) {
      const err = error as Error;
      return failedExpansion(mention, `Failed to get terminal output: ${err.message}`);
    }
  }

  return failedExpansion(
    mention,
    "@terminal is not available in this context (terminal integration required)"
  );
};

/**
 * Handle @codebase: mentions - semantic search.
 */
const handleCodebaseMention: MentionHandler = async (mention, context, _options) => {
  if (context.searchCodebase) {
    try {
      const results = await context.searchCodebase(mention.value);
      const content = `--- @codebase:${mention.value} ---\n${results || "No results found."}`;
      return successExpansion(mention, content);
    } catch (error) {
      const err = error as Error;
      return failedExpansion(mention, `Codebase search failed: ${err.message}`);
    }
  }

  return failedExpansion(
    mention,
    "@codebase is not available in this context (semantic search integration required)"
  );
};

// =============================================================================
// Handler Registry
// =============================================================================

/**
 * Registry mapping mention types to their handlers.
 */
const mentionHandlers: MentionHandlerRegistry = {
  file: handleFileMention,
  folder: handleFolderMention,
  url: handleUrlMention,
  "git-diff": handleGitDiffMention,
  problems: handleProblemsMention,
  terminal: handleTerminalMention,
  codebase: handleCodebaseMention,
};

// =============================================================================
// Public API
// =============================================================================

/**
 * Expand a single mention into its content.
 *
 * @param mention - The mention to expand
 * @param context - Expansion context (cwd, etc)
 * @param options - Expansion options
 * @returns Promise resolving to the expansion result
 *
 * @example
 * ```typescript
 * const expansion = await expandMention(
 *   { type: "file", raw: "@file:./src/index.ts", value: "./src/index.ts", start: 0, end: 20 },
 *   { cwd: "/project" }
 * );
 * if (expansion.success) {
 *   console.log(expansion.content);
 * }
 * ```
 */
export async function expandMention(
  mention: Mention,
  context: MentionExpansionContext,
  options: MentionExpansionOptions = {}
): Promise<MentionExpansion> {
  const opts: Required<MentionExpansionOptions> = {
    ...DEFAULT_EXPANSION_OPTIONS,
    ...options,
  };

  const handler = mentionHandlers[mention.type];
  if (!handler) {
    return failedExpansion(mention, `Unknown mention type: ${mention.type}`);
  }

  try {
    return await handler(mention, context, opts);
  } catch (error) {
    const err = error as Error;
    return failedExpansion(mention, `Unexpected error: ${err.message}`);
  }
}

/**
 * Expand all mentions in a text string.
 *
 * @param text - Text containing mentions
 * @param context - Expansion context (cwd, etc)
 * @param options - Expansion options
 * @returns Promise resolving to the full expansion result
 *
 * @example
 * ```typescript
 * const result = await expandAllMentions(
 *   "Review @file:./src/index.ts and check @git-diff",
 *   { cwd: "/project" }
 * );
 * console.log(`Expanded ${result.successCount} mentions`);
 * console.log(result.expandedText);
 * ```
 */
export async function expandAllMentions(
  text: string,
  context: MentionExpansionContext,
  options: MentionExpansionOptions = {}
): Promise<MentionExpansionResult> {
  const mentions = parseMentions(text);

  if (mentions.length === 0) {
    return {
      originalText: text,
      expandedText: text,
      expansions: [],
      successCount: 0,
      failureCount: 0,
    };
  }

  // Expand all mentions in parallel
  const expansions = await Promise.all(
    mentions.map((mention) => expandMention(mention, context, options))
  );

  // Build the expanded text by replacing mentions with their content
  // We need to process from end to start to preserve positions
  const sortedExpansions = [...expansions].sort((a, b) => b.mention.start - a.mention.start);

  let expandedText = text;
  for (const expansion of sortedExpansions) {
    const { mention, content, success } = expansion;
    const replacement = success
      ? `\n${content}\n`
      : `[Error expanding ${mention.raw}: ${expansion.error}]`;
    expandedText =
      expandedText.slice(0, mention.start) + replacement + expandedText.slice(mention.end);
  }

  // Count successes and failures
  const successCount = expansions.filter((e) => e.success).length;
  const failureCount = expansions.length - successCount;

  return {
    originalText: text,
    expandedText: expandedText.trim(),
    expansions,
    successCount,
    failureCount,
  };
}

/**
 * Get a preview of what a mention would expand to (first N chars).
 *
 * @param mention - The mention to preview
 * @param context - Expansion context
 * @param maxLength - Maximum preview length (default: 200)
 * @returns Promise resolving to a preview string
 */
export async function previewMention(
  mention: Mention,
  context: MentionExpansionContext,
  maxLength: number = 200
): Promise<string> {
  const expansion = await expandMention(mention, context, {
    maxContentLength: maxLength,
    includeMetadata: false,
  });

  if (!expansion.success) {
    return `[Error: ${expansion.error}]`;
  }

  return expansion.content;
}
