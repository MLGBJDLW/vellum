/**
 * Prompt Validate Command
 *
 * Validates prompt files across all customization directories.
 *
 * Usage:
 * - `vellum prompt validate` - Validate all prompt sources
 * - `vellum prompt validate --fix` - Auto-fix simple issues
 *
 * @module cli/commands/prompt/validate
 * @see REQ-016
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

import chalk from "chalk";

import { EXIT_CODES } from "../exit-codes.js";
import type { CommandContext, CommandResult, SlashCommand } from "../types.js";
import { error, success } from "../types.js";

// =============================================================================
// Constants
// =============================================================================

/**
 * Directories to scan for prompts
 */
const PROMPT_DIRECTORIES = [
  { name: "prompts", path: ".vellum/prompts" },
  { name: "commands", path: ".vellum/commands" },
  { name: "workflows", path: ".vellum/workflows" },
  { name: "skills", path: ".vellum/skills" },
  { name: "rules", path: ".vellum/rules" },
] as const;

/**
 * Valid file extensions for prompt files
 */
const VALID_EXTENSIONS = new Set([".md", ".markdown"]);

/**
 * YAML frontmatter pattern
 */
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---/;

// =============================================================================
// Types
// =============================================================================

/**
 * Validation issue severity
 */
export type ValidationSeverity = "error" | "warning" | "info";

/**
 * Single validation issue
 */
export interface ValidationIssue {
  /** Issue severity */
  severity: ValidationSeverity;
  /** File path relative to project root */
  file: string;
  /** Line number (1-based) */
  line?: number;
  /** Column number (1-based) */
  column?: number;
  /** Issue code for programmatic handling */
  code: string;
  /** Human-readable message */
  message: string;
  /** Whether this issue can be auto-fixed */
  fixable: boolean;
}

/**
 * Options for validate command
 */
export interface PromptValidateOptions {
  /** Auto-fix simple issues */
  fix?: boolean;
  /** Show verbose output */
  verbose?: boolean;
  /** Output as JSON */
  json?: boolean;
  /** Working directory (defaults to process.cwd()) */
  cwd?: string;
}

/**
 * Result of validation
 */
export interface PromptValidateResult {
  /** Whether validation passed (no errors) */
  valid: boolean;
  /** Total files scanned */
  filesScanned: number;
  /** All issues found */
  issues: ValidationIssue[];
  /** Number of issues fixed (if --fix) */
  issuesFixed: number;
  /** Exit code */
  exitCode: number;
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Check for trailing whitespace
 */
function checkTrailingWhitespace(content: string, file: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line !== line.trimEnd()) {
      issues.push({
        severity: "warning",
        file,
        line: i + 1,
        code: "trailing-whitespace",
        message: "Trailing whitespace",
        fixable: true,
      });
    }
  }

  return issues;
}

/**
 * Check for missing newline at EOF
 */
function checkMissingNewlineAtEof(content: string, file: string): ValidationIssue | null {
  if (content.length > 0 && !content.endsWith("\n")) {
    return {
      severity: "warning",
      file,
      line: content.split("\n").length,
      code: "missing-newline-eof",
      message: "Missing newline at end of file",
      fixable: true,
    };
  }
  return null;
}

/**
 * Check for valid frontmatter
 */
function checkFrontmatter(content: string, file: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check if file starts with frontmatter
  if (!content.startsWith("---")) {
    issues.push({
      severity: "error",
      file,
      line: 1,
      code: "missing-frontmatter",
      message: "File must start with YAML frontmatter (---)",
      fixable: false,
    });
    return issues;
  }

  // Check if frontmatter is properly closed
  const match = content.match(FRONTMATTER_PATTERN);
  if (!match) {
    issues.push({
      severity: "error",
      file,
      line: 1,
      code: "unclosed-frontmatter",
      message: "YAML frontmatter is not properly closed",
      fixable: false,
    });
    return issues;
  }

  // Parse frontmatter for basic validation
  const frontmatterContent = match[1]!;
  const frontmatterLines = frontmatterContent.split("\n");

  // Check for inconsistent indentation
  let expectedIndent: string | null = null;
  for (let i = 0; i < frontmatterLines.length; i++) {
    const line = frontmatterLines[i]!;
    if (line.trim() === "") continue;

    // Check for tabs vs spaces
    const leadingWhitespace = line.match(/^(\s*)/)?.[1] ?? "";
    if (leadingWhitespace.includes("\t") && leadingWhitespace.includes(" ")) {
      issues.push({
        severity: "warning",
        file,
        line: i + 2, // +2 because frontmatter starts at line 2
        code: "mixed-indentation",
        message: "Mixed tabs and spaces in indentation",
        fixable: true,
      });
    }

    // Detect indent style
    if (leadingWhitespace.length > 0 && expectedIndent === null) {
      expectedIndent = leadingWhitespace.includes("\t") ? "\t" : "  ";
    }
  }

  // Check for required fields based on file location
  const hasName = frontmatterContent.includes("name:");
  const hasId = frontmatterContent.includes("id:");

  if (!hasName && !hasId) {
    issues.push({
      severity: "warning",
      file,
      line: 1,
      code: "missing-identifier",
      message: "Frontmatter should have 'name' or 'id' field",
      fixable: false,
    });
  }

  return issues;
}

/**
 * Check for duplicate keys in YAML frontmatter
 */
function checkDuplicateKeys(content: string, file: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const match = content.match(FRONTMATTER_PATTERN);
  if (!match || !match[1]) return issues;

  const frontmatterContent = match[1];
  const lines = frontmatterContent.split("\n");
  const seenKeys = new Map<string, number>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const keyMatch = line.match(/^(\w+):/);
    if (keyMatch?.[1]) {
      const key = keyMatch[1];
      const prevLine = seenKeys.get(key);
      if (prevLine !== undefined) {
        issues.push({
          severity: "error",
          file,
          line: i + 2,
          code: "duplicate-key",
          message: `Duplicate key '${key}' (first occurrence at line ${prevLine})`,
          fixable: false,
        });
      } else {
        seenKeys.set(key, i + 2);
      }
    }
  }

  return issues;
}

// =============================================================================
// Auto-Fix Functions
// =============================================================================

/**
 * Fix trailing whitespace in content
 */
function fixTrailingWhitespace(content: string): string {
  return content
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
}

/**
 * Fix missing newline at EOF
 */
function fixMissingNewlineAtEof(content: string): string {
  if (content.length > 0 && !content.endsWith("\n")) {
    return `${content}\n`;
  }
  return content;
}

/**
 * Fix mixed indentation (convert tabs to spaces)
 */
function fixMixedIndentation(content: string): string {
  const match = content.match(FRONTMATTER_PATTERN);
  if (!match || !match[1]) return content;

  const frontmatterContent = match[1];
  const fixedFrontmatter = frontmatterContent.replace(/\t/g, "  ");

  return content.replace(frontmatterContent, fixedFrontmatter);
}

/**
 * Apply all auto-fixes to content
 */
function applyFixes(content: string, issues: ValidationIssue[]): string {
  let fixed = content;

  const hasMixedIndent = issues.some((i) => i.code === "mixed-indentation");
  const hasTrailingWhitespace = issues.some((i) => i.code === "trailing-whitespace");
  const hasMissingNewline = issues.some((i) => i.code === "missing-newline-eof");

  if (hasMixedIndent) {
    fixed = fixMixedIndentation(fixed);
  }

  if (hasTrailingWhitespace) {
    fixed = fixTrailingWhitespace(fixed);
  }

  if (hasMissingNewline) {
    fixed = fixMissingNewlineAtEof(fixed);
  }

  return fixed;
}

// =============================================================================
// File Scanning
// =============================================================================

/**
 * Get all markdown files in a directory recursively
 */
function getMarkdownFiles(dir: string, rootDir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  const files: string[] = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...getMarkdownFiles(fullPath, rootDir));
    } else if (stat.isFile() && VALID_EXTENSIONS.has(extname(entry))) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Validate a single file
 */
function validateFile(filePath: string, rootDir: string): ValidationIssue[] {
  const relativePath = relative(rootDir, filePath);
  const content = readFileSync(filePath, "utf-8");
  const issues: ValidationIssue[] = [];

  // Run all checks
  issues.push(...checkFrontmatter(content, relativePath));
  issues.push(...checkTrailingWhitespace(content, relativePath));
  issues.push(...checkDuplicateKeys(content, relativePath));

  const newlineIssue = checkMissingNewlineAtEof(content, relativePath);
  if (newlineIssue) {
    issues.push(newlineIssue);
  }

  return issues;
}

// =============================================================================
// Command Execution
// =============================================================================

/**
 * Execute prompt validate command
 *
 * @param options - Command options
 * @returns Validation result
 */
export async function executePromptValidate(
  options: PromptValidateOptions = {}
): Promise<PromptValidateResult> {
  const rootDir = options.cwd ?? process.cwd();
  const allIssues: ValidationIssue[] = [];
  const filesToFix = new Map<string, ValidationIssue[]>();
  let filesScanned = 0;
  let issuesFixed = 0;

  // Scan all prompt directories
  for (const { name, path } of PROMPT_DIRECTORIES) {
    const dirPath = join(rootDir, path);

    if (!existsSync(dirPath)) {
      if (options.verbose) {
        console.log(chalk.gray(`Skipping ${name}: ${path} not found`));
      }
      continue;
    }

    const files = getMarkdownFiles(dirPath, rootDir);

    if (options.verbose) {
      console.log(chalk.blue(`\nScanning ${name}/ (${files.length} files)`));
    }

    for (const file of files) {
      filesScanned++;
      const issues = validateFile(file, rootDir);

      if (issues.length > 0) {
        allIssues.push(...issues);

        // Collect fixable issues per file
        const fixableIssues = issues.filter((i) => i.fixable);
        if (fixableIssues.length > 0) {
          filesToFix.set(file, fixableIssues);
        }
      }
    }
  }

  // Apply fixes if requested
  if (options.fix && filesToFix.size > 0) {
    for (const [filePath, issues] of filesToFix) {
      const content = readFileSync(filePath, "utf-8");
      const fixed = applyFixes(content, issues);

      if (fixed !== content) {
        writeFileSync(filePath, fixed, "utf-8");
        issuesFixed += issues.length;

        if (options.verbose) {
          const relativePath = relative(rootDir, filePath);
          console.log(chalk.green(`  Fixed: ${relativePath}`));
        }
      }
    }
  }

  // Calculate results
  const errors = allIssues.filter((i) => i.severity === "error");
  const warnings = allIssues.filter((i) => i.severity === "warning");
  const unfixedIssues = allIssues.filter((i) => !i.fixable || !options.fix);
  const hasErrors = errors.length > 0;

  // Output results
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          valid: !hasErrors,
          filesScanned,
          errors: errors.length,
          warnings: warnings.length,
          issuesFixed,
          issues: allIssues,
        },
        null,
        2
      )
    );
  } else {
    // Display issues in file:line format
    if (unfixedIssues.length > 0 || !options.fix) {
      console.log(chalk.bold("\n📋 Validation Results\n"));

      for (const issue of allIssues) {
        if (options.fix && issue.fixable) continue;

        const location = issue.line ? `:${issue.line}` : "";
        const prefix =
          issue.severity === "error"
            ? chalk.red("✖")
            : issue.severity === "warning"
              ? chalk.yellow("⚠")
              : chalk.blue("ℹ");

        console.log(`${prefix} ${issue.file}${location}: ${issue.message} (${issue.code})`);
      }
    }

    // Summary
    console.log(chalk.bold("\n📊 Summary"));
    console.log(chalk.gray(`  Files scanned: ${filesScanned}`));
    console.log(chalk.gray(`  Errors: ${errors.length}`));
    console.log(chalk.gray(`  Warnings: ${warnings.length}`));

    if (options.fix && issuesFixed > 0) {
      console.log(chalk.green(`  Issues fixed: ${issuesFixed}`));
    }

    if (hasErrors) {
      console.log(chalk.red("\n❌ Validation failed"));
    } else if (warnings.length > 0) {
      console.log(chalk.yellow("\n⚠ Validation passed with warnings"));
    } else {
      console.log(chalk.green("\n✅ Validation passed"));
    }
  }

  return {
    valid: !hasErrors,
    filesScanned,
    issues: allIssues,
    issuesFixed,
    exitCode: hasErrors ? EXIT_CODES.ERROR : EXIT_CODES.SUCCESS,
  };
}

// =============================================================================
// Slash Command Definition
// =============================================================================

/**
 * Prompt validate slash command for TUI
 */
export const promptValidateCommand: SlashCommand = {
  name: "prompt-validate",
  description: "Validate prompt files in .vellum/ directories",
  kind: "builtin",
  category: "config",
  aliases: ["validate-prompts"],
  namedArgs: [
    {
      name: "fix",
      shorthand: "f",
      type: "boolean",
      description: "Auto-fix simple issues (trailing whitespace, etc.)",
      required: false,
      default: false,
    },
    {
      name: "verbose",
      shorthand: "v",
      type: "boolean",
      description: "Show verbose output",
      required: false,
      default: false,
    },
    {
      name: "json",
      shorthand: "j",
      type: "boolean",
      description: "Output as JSON",
      required: false,
      default: false,
    },
  ],
  examples: [
    "/prompt-validate           - Validate all prompts",
    "/prompt-validate --fix     - Auto-fix simple issues",
    "/prompt-validate --json    - Output as JSON",
  ],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const fix = ctx.parsedArgs.named.fix as boolean | undefined;
    const verbose = ctx.parsedArgs.named.verbose as boolean | undefined;
    const json = ctx.parsedArgs.named.json as boolean | undefined;

    const result = await executePromptValidate({
      fix: fix ?? false,
      verbose: verbose ?? false,
      json: json ?? false,
    });

    if (result.valid) {
      return success(
        `Validated ${result.filesScanned} files. ${result.issuesFixed} issues fixed.`,
        {
          filesScanned: result.filesScanned,
          issues: result.issues,
          issuesFixed: result.issuesFixed,
        }
      );
    }

    const errorCount = result.issues.filter((i) => i.severity === "error").length;
    return error(
      "INTERNAL_ERROR",
      `Validation failed with ${errorCount} error(s). Run with --verbose for details.`
    );
  },
};

// =============================================================================
// CLI Entry Point
// =============================================================================

/**
 * Run prompt validate command from CLI
 *
 * @param options - CLI options
 */
export async function runPromptValidateCli(options: {
  fix?: boolean;
  verbose?: boolean;
  json?: boolean;
}): Promise<void> {
  const result = await executePromptValidate({
    fix: options.fix ?? false,
    verbose: options.verbose ?? false,
    json: options.json ?? false,
  });

  process.exit(result.exitCode);
}
