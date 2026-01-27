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
import { fetchWithPool, type Mention, parseMentions } from "@vellum/shared";
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
      const response = await fetchWithPool(url, {
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
 * Run TypeScript type checking to detect problems.
 */
async function detectTypeScriptProblems(cwd: string): Promise<string[]> {
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);

  try {
    // Run tsc with --noEmit to check for errors without emitting files
    const { stdout, stderr } = await execAsync("npx tsc --noEmit --pretty false 2>&1", {
      cwd,
      timeout: 60000, // 60 seconds timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    const output = stdout || stderr || "";
    // Parse TypeScript error lines (format: file(line,col): error TSxxxx: message)
    const errorPattern = /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.+)$/gm;
    const errors: string[] = [];

    let match = errorPattern.exec(output);
    while (match !== null) {
      const [, file, line, col, severity, code, message] = match;
      errors.push(`${file}:${line}:${col} ${severity} ${code}: ${message}`);
      match = errorPattern.exec(output);
    }

    return errors;
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string };
    // tsc exits with non-zero when there are errors, which causes exec to reject
    const output = err.stdout || err.stderr || "";
    const errorPattern = /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.+)$/gm;
    const errors: string[] = [];

    let match = errorPattern.exec(output);
    while (match !== null) {
      const [, file, line, col, severity, code, message] = match;
      errors.push(`${file}:${line}:${col} ${severity} ${code}: ${message}`);
      match = errorPattern.exec(output);
    }

    return errors;
  }
}

/**
 * Run ESLint to detect problems.
 */
async function detectEslintProblems(cwd: string): Promise<string[]> {
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);

  try {
    const { stdout } = await execAsync("npx eslint . --format compact 2>&1", {
      cwd,
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
    });

    if (!stdout.trim()) return [];

    // Parse ESLint compact format: file: line:col: message [severity/rule]
    const lines = stdout.split("\n").filter((line) => line.includes(": line "));
    return lines.slice(0, 50); // Limit to 50 errors
  } catch (error) {
    const err = error as Error & { stdout?: string };
    if (err.stdout) {
      const lines = err.stdout.split("\n").filter((line) => line.includes(": line "));
      return lines.slice(0, 50);
    }
    return [];
  }
}

/**
 * Handle @problems mentions - get LSP diagnostics or run linters.
 */
const handleProblemsMention: MentionHandler = async (mention, context, options) => {
  // First, try the injected getProblems function (LSP integration)
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

  // Fallback: Run TypeScript and ESLint to detect problems
  try {
    const allProblems: string[] = [];

    // Try TypeScript first
    const tsProblems = await detectTypeScriptProblems(context.cwd);
    if (tsProblems.length > 0) {
      allProblems.push("=== TypeScript Errors ===", ...tsProblems);
    }

    // Try ESLint
    const eslintProblems = await detectEslintProblems(context.cwd);
    if (eslintProblems.length > 0) {
      if (allProblems.length > 0) allProblems.push("");
      allProblems.push("=== ESLint Problems ===", ...eslintProblems);
    }

    if (allProblems.length === 0) {
      return successExpansion(mention, "--- @problems ---\nNo problems found.");
    }

    // Truncate if needed
    const content = `--- @problems ---\n${allProblems.join("\n")}`;
    const { content: truncatedContent, truncated } = truncateContent(
      content,
      options.maxContentLength
    );

    return successExpansion(mention, truncatedContent, {
      truncated,
      lineCount: allProblems.length,
    });
  } catch (error) {
    const err = error as Error;
    return failedExpansion(mention, `Failed to detect problems: ${err.message}`);
  }
};

/**
 * Get recent shell history.
 */
async function getShellHistory(_cwd: string): Promise<string | null> {
  const os = await import("node:os");
  const homeDir = os.homedir();
  const shell = process.env.SHELL || "";

  // Determine history file based on shell
  let historyFile: string;
  if (shell.includes("zsh")) {
    historyFile = path.join(homeDir, ".zsh_history");
  } else if (shell.includes("fish")) {
    historyFile = path.join(homeDir, ".local", "share", "fish", "fish_history");
  } else if (process.platform === "win32") {
    // PowerShell history location
    historyFile = path.join(
      homeDir,
      "AppData",
      "Roaming",
      "Microsoft",
      "Windows",
      "PowerShell",
      "PSReadLine",
      "ConsoleHost_history.txt"
    );
  } else {
    historyFile = path.join(homeDir, ".bash_history");
  }

  try {
    const content = await fs.readFile(historyFile, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    // Return last 30 commands
    return lines.slice(-30).join("\n");
  } catch {
    return null;
  }
}

/**
 * Check for Vellum's terminal output log.
 */
async function getVellumTerminalOutput(cwd: string): Promise<string | null> {
  const vellumLogPath = path.join(cwd, ".vellum", "terminal.log");

  try {
    const content = await fs.readFile(vellumLogPath, "utf-8");
    const lines = content.split("\n");
    // Return last 100 lines
    return lines.slice(-100).join("\n");
  } catch {
    return null;
  }
}

/**
 * Handle @terminal mentions - get terminal output.
 */
const handleTerminalMention: MentionHandler = async (mention, context, options) => {
  // First, try the injected getTerminalOutput function
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

  // Fallback: Try to get terminal output from various sources
  try {
    // First, try Vellum's own terminal log
    const vellumOutput = await getVellumTerminalOutput(context.cwd);
    if (vellumOutput) {
      const content = `--- @terminal (Vellum log) ---\n${vellumOutput}`;
      const { content: truncatedContent, truncated } = truncateContent(
        content,
        options.maxContentLength
      );
      return successExpansion(mention, truncatedContent, {
        truncated,
      });
    }

    // Second, try shell history
    const shellHistory = await getShellHistory(context.cwd);
    if (shellHistory) {
      const content = `--- @terminal (shell history) ---\n${shellHistory}`;
      const { content: truncatedContent, truncated } = truncateContent(
        content,
        options.maxContentLength
      );
      return successExpansion(mention, truncatedContent, {
        truncated,
      });
    }

    return successExpansion(
      mention,
      "--- @terminal ---\nNo terminal output available. Run some commands first."
    );
  } catch (error) {
    const err = error as Error;
    return failedExpansion(mention, `Failed to get terminal output: ${err.message}`);
  }
};

// =============================================================================
// Codebase Search Helpers
// =============================================================================

/** File extensions to search in codebase */
const SEARCHABLE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".yaml",
  ".yml",
  ".toml",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".cs",
  ".rb",
  ".php",
  ".swift",
  ".kt",
  ".scala",
  ".vue",
  ".svelte",
]);

/** Directories to skip in codebase search */
const SEARCH_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  "coverage",
  "__pycache__",
  ".pytest_cache",
  "target",
  "vendor",
]);

interface CodebaseMatch {
  file: string;
  line: number;
  content: string;
  context?: string[];
}

/**
 * Search codebase using ripgrep (fast, if available).
 */
async function searchWithRipgrep(
  query: string,
  cwd: string,
  maxResults: number
): Promise<CodebaseMatch[] | null> {
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);

  try {
    // Check if ripgrep is available
    await execAsync("rg --version", { cwd });

    const { stdout } = await execAsync(
      `rg --json --max-count ${maxResults} --context 2 --ignore-case ${JSON.stringify(query)}`,
      {
        cwd,
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
      }
    );

    if (!stdout.trim()) return [];

    const matches: CodebaseMatch[] = [];
    const lines = stdout.split("\n").filter(Boolean);

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === "match" && parsed.data) {
          matches.push({
            file: parsed.data.path?.text || "",
            line: parsed.data.line_number || 0,
            content: parsed.data.lines?.text?.trim() || "",
          });
        }
      } catch {
        // Skip malformed JSON lines
      }
    }

    return matches;
  } catch {
    // ripgrep not available or failed
    return null;
  }
}

/**
 * Check if a path should be skipped during scanning.
 */
function shouldSkipPath(name: string): boolean {
  return name.startsWith(".") || SEARCH_SKIP_DIRS.has(name);
}

/**
 * Process a single file and extract matching lines.
 */
async function processFileForMatches(
  fullPath: string,
  cwd: string,
  queryLower: string,
  matches: CodebaseMatch[],
  maxResults: number
): Promise<void> {
  const stat = await fs.stat(fullPath);
  // Skip large files (> 1MB)
  if (stat.size > 1024 * 1024) return;

  const content = await fs.readFile(fullPath, "utf-8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length && matches.length < maxResults; i++) {
    const line = lines[i];
    if (line?.toLowerCase().includes(queryLower)) {
      const relativePath = path.relative(cwd, fullPath);
      matches.push({
        file: relativePath,
        line: i + 1,
        content: line.trim().slice(0, 200),
      });
    }
  }
}

/**
 * Search codebase using built-in file scanning (slower fallback).
 */
async function searchWithFileScanning(
  query: string,
  cwd: string,
  maxResults: number
): Promise<CodebaseMatch[]> {
  const matches: CodebaseMatch[] = [];
  const queryLower = query.toLowerCase();
  const visited = new Set<string>();

  async function processEntry(
    entry: import("node:fs").Dirent,
    dir: string,
    depth: number
  ): Promise<void> {
    if (shouldSkipPath(entry.name)) return;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await scanDirectory(fullPath, depth + 1);
      return;
    }

    if (!entry.isFile()) return;

    const ext = path.extname(entry.name).toLowerCase();
    if (!SEARCHABLE_EXTENSIONS.has(ext)) return;

    await processFileForMatches(fullPath, cwd, queryLower, matches, maxResults).catch(() => {});
  }

  async function scanDirectory(dir: string, depth: number): Promise<void> {
    if (depth > 10 || matches.length >= maxResults) return;

    const realDir = await fs.realpath(dir).catch(() => dir);
    if (visited.has(realDir)) return;
    visited.add(realDir);

    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);

    for (const entry of entries) {
      if (matches.length >= maxResults) break;
      await processEntry(entry, dir, depth);
    }
  }

  await scanDirectory(cwd, 0);
  return matches;
}

/**
 * Handle @codebase: mentions - semantic search across the codebase.
 */
const handleCodebaseMention: MentionHandler = async (mention, context, options) => {
  const query = mention.value;

  if (!query.trim()) {
    return failedExpansion(mention, "Codebase search requires a query (e.g., @codebase:auth)");
  }

  // First, try the injected searchCodebase function (semantic search)
  if (context.searchCodebase) {
    try {
      const results = await context.searchCodebase(query);
      const content = `--- @codebase:${query} ---\n${results || "No results found."}`;
      return successExpansion(mention, content);
    } catch (error) {
      const err = error as Error;
      return failedExpansion(mention, `Codebase search failed: ${err.message}`);
    }
  }

  // Fallback: Use ripgrep or file scanning
  try {
    const maxResults = 30;

    // Try ripgrep first (much faster)
    let matches = await searchWithRipgrep(query, context.cwd, maxResults);

    // Fall back to file scanning if ripgrep not available
    if (matches === null) {
      matches = await searchWithFileScanning(query, context.cwd, maxResults);
    }

    if (matches.length === 0) {
      return successExpansion(
        mention,
        `--- @codebase:${query} ---\nNo results found for: ${query}`
      );
    }

    // Format results
    const formattedResults = matches.map((m) => `${m.file}:${m.line}: ${m.content}`).join("\n");

    const content = `--- @codebase:${query} (${matches.length} matches) ---\n${formattedResults}`;
    const { content: truncatedContent, truncated } = truncateContent(
      content,
      options.maxContentLength
    );

    return successExpansion(mention, truncatedContent, {
      truncated,
      lineCount: matches.length,
    });
  } catch (error) {
    const err = error as Error;
    return failedExpansion(mention, `Codebase search failed: ${err.message}`);
  }
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
