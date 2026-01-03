/**
 * Skill CLI Commands
 *
 * Provides commands for managing skills:
 * - skill list: List all available skills
 * - skill show: Show details of a specific skill
 * - skill create: Create a new skill from template
 * - skill validate: Validate skill(s)
 *
 * @module cli/commands/skill
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { confirm, input, select } from "@inquirer/prompts";
import {
  createSkillManager,
  SkillDiscovery,
  type SkillLocation,
  SkillParser,
  type SkillScan,
  type SkillSource,
  type SkillTrigger,
} from "@vellum/core";
import chalk from "chalk";
import { EXIT_CODES } from "./exit-codes.js";
import type { CommandResult } from "./types.js";
import { error, success } from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for skill list command
 */
export interface SkillListOptions {
  /** Filter by source (workspace, user, global, builtin) */
  source?: SkillSource;
  /** Output as JSON */
  json?: boolean;
  /** Show full descriptions */
  verbose?: boolean;
}

/**
 * Options for skill show command
 */
export interface SkillShowOptions {
  /** Show full SKILL.md content */
  content?: boolean;
  /** Output as JSON */
  json?: boolean;
}

/**
 * Options for skill create command
 */
export interface SkillCreateOptions {
  /** Location to create skill (workspace, user, global) */
  location?: SkillSource;
  /** Non-interactive mode */
  nonInteractive?: boolean;
  /** Force overwrite if exists */
  force?: boolean;
}

/**
 * Options for skill validate command
 */
export interface SkillValidateOptions {
  /** Validate single skill by name */
  skill?: string;
  /** Treat warnings as errors */
  strict?: boolean;
  /** Output as JSON */
  json?: boolean;
}

/**
 * JSON output for skill list
 */
interface SkillListJson {
  success: boolean;
  skills: Array<{
    name: string;
    description: string;
    source: SkillSource;
    path: string;
    version?: string;
    tags: string[];
    triggers: Array<{ type: string; pattern?: string }>;
  }>;
  total: number;
}

/**
 * JSON output for skill show
 */
interface SkillShowJson {
  success: boolean;
  skill: {
    name: string;
    description: string;
    source: SkillSource;
    path: string;
    version?: string;
    priority: number;
    tags: string[];
    dependencies: string[];
    triggers: Array<{ type: string; pattern?: string }>;
    content?: string;
    sections?: {
      rules?: string;
      patterns?: string;
      antiPatterns?: string;
      examples?: string;
      references?: string;
    };
  } | null;
}

/**
 * Validation result for a single skill
 */
interface SkillValidationResult {
  name: string;
  path: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * JSON output for skill validate
 */
interface SkillValidateJson {
  success: boolean;
  results: SkillValidationResult[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
    warnings: number;
  };
}

// =============================================================================
// Skill Template
// =============================================================================

/**
 * Template for creating new skills
 */
const SKILL_TEMPLATE = `---
name: "{name}"
description: "{description}"
version: "1.0.0"
priority: 50
tags:
  - custom
triggers:
  - type: keyword
    pattern: "{name}"
globs:
  - "**/*.ts"
  - "**/*.tsx"
---

# {name}

{description}

## Rules

<!-- Define the rules this skill enforces -->

- Rule 1: Description of rule
- Rule 2: Description of rule

## Patterns

<!-- Provide code patterns to follow -->

\`\`\`typescript
// Good pattern example
\`\`\`

## Anti-Patterns

<!-- Provide patterns to avoid -->

\`\`\`typescript
// Anti-pattern example - DON'T do this
\`\`\`

## Examples

<!-- Provide usage examples -->

### Example 1

Description of the example.

## References

<!-- Link to external documentation -->

- [Reference Name](https://example.com)
`;

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get skill source path based on location type
 */
function getSkillSourcePath(location: SkillSource, workspacePath: string): string {
  switch (location) {
    case "workspace":
      return path.join(workspacePath, ".vellum", "skills");
    case "user":
      return path.join(os.homedir(), ".vellum", "skills");
    case "global":
      return path.join(workspacePath, ".github", "skills");
    default:
      throw new Error(`Cannot create skills in ${location} location`);
  }
}

/**
 * Ensure directory exists
 */
async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Check if file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Format skill source with color
 */
function formatSource(source: SkillSource): string {
  const colors: Record<SkillSource, (s: string) => string> = {
    workspace: chalk.green,
    user: chalk.blue,
    global: chalk.yellow,
    builtin: chalk.gray,
  };
  const colorFn = colors[source] ?? chalk.white;
  return colorFn(source);
}

/**
 * Truncate string with ellipsis
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength - 3)}...`;
}

// =============================================================================
// List Command (T034)
// =============================================================================

/**
 * Execute skill list command
 */
export async function handleSkillList(options: SkillListOptions = {}): Promise<CommandResult> {
  try {
    const manager = createSkillManager({
      loader: { discovery: { workspacePath: process.cwd() } },
    });

    await manager.initialize();
    let skills = manager.getAllSkills();

    // Filter by source if specified
    if (options.source) {
      skills = skills.filter((s: SkillScan) => s.source === options.source);
    }

    // JSON output
    if (options.json) {
      const output: SkillListJson = {
        success: true,
        skills: skills.map((s: SkillScan) => ({
          name: s.name,
          description: s.description,
          source: s.source,
          path: s.path,
          version: s.version,
          tags: s.tags,
          triggers: s.triggers.map((t: SkillTrigger) => ({
            type: t.type,
            pattern: t.pattern,
          })),
        })),
        total: skills.length,
      };
      return success(JSON.stringify(output, null, 2));
    }

    // Table output
    if (skills.length === 0) {
      return success(chalk.yellow("No skills found."));
    }

    const lines: string[] = [];
    lines.push(chalk.bold.cyan("\n📚 Available Skills\n"));

    // Header
    const nameWidth = 25;
    const sourceWidth = 10;
    const descWidth = options.verbose ? 60 : 40;

    lines.push(
      chalk.gray(
        `${"Name".padEnd(nameWidth)} ${"Source".padEnd(sourceWidth)} ${"Description".padEnd(descWidth)}`
      )
    );
    lines.push(chalk.gray("─".repeat(nameWidth + sourceWidth + descWidth + 2)));

    // Rows
    for (const skill of skills) {
      const name = chalk.white(truncate(skill.name, nameWidth).padEnd(nameWidth));
      const source = formatSource(skill.source).padEnd(sourceWidth + 10); // Account for ANSI codes
      const desc = truncate(skill.description, descWidth);

      lines.push(`${name} ${source} ${desc}`);

      // Verbose mode: show triggers
      if (options.verbose && skill.triggers.length > 0) {
        for (const trigger of skill.triggers) {
          const triggerStr =
            trigger.type === "always"
              ? chalk.gray("  └─ always active")
              : chalk.gray(`  └─ ${trigger.type}: ${trigger.pattern}`);
          lines.push(triggerStr);
        }
      }
    }

    lines.push(chalk.gray(`\nTotal: ${skills.length} skill(s)`));

    return success(lines.join("\n"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error("INTERNAL_ERROR", `Failed to list skills: ${message}`);
  }
}

// =============================================================================
// Show Command (T035)
// =============================================================================

/**
 * Execute skill show command
 */
export async function handleSkillShow(
  name: string,
  options: SkillShowOptions = {}
): Promise<CommandResult> {
  try {
    const manager = createSkillManager({
      loader: { discovery: { workspacePath: process.cwd() } },
    });

    await manager.initialize();

    // Find skill by name
    const scan = manager.getSkill(name);

    if (!scan) {
      if (options.json) {
        const output: SkillShowJson = { success: false, skill: null };
        return error("RESOURCE_NOT_FOUND", JSON.stringify(output, null, 2));
      }
      return error("RESOURCE_NOT_FOUND", chalk.red(`Skill not found: ${name}`));
    }

    // Load full skill content
    const loaded = await manager.loadSkill(name);

    // JSON output
    if (options.json) {
      const output: SkillShowJson = {
        success: true,
        skill: {
          name: scan.name,
          description: scan.description,
          source: scan.source,
          path: scan.path,
          version: scan.version,
          priority: scan.priority,
          tags: scan.tags,
          dependencies: scan.dependencies,
          triggers: scan.triggers.map((t: SkillTrigger) => ({
            type: t.type,
            pattern: t.pattern,
          })),
          content: options.content ? loaded?.raw : undefined,
          sections: loaded
            ? {
                rules: loaded.rules || undefined,
                patterns: loaded.patterns || undefined,
                antiPatterns: loaded.antiPatterns || undefined,
                examples: loaded.examples || undefined,
                references: loaded.referencesSection || undefined,
              }
            : undefined,
        },
      };
      return success(JSON.stringify(output, null, 2));
    }

    // Formatted output
    const lines: string[] = [];
    lines.push(chalk.bold.cyan(`\n📖 Skill: ${scan.name}\n`));

    lines.push(`${chalk.white("Description:")} ${scan.description}`);
    lines.push(`${chalk.white("Source:")} ${formatSource(scan.source)}`);
    lines.push(`${chalk.white("Path:")} ${chalk.gray(scan.path)}`);
    lines.push(`${chalk.white("Priority:")} ${scan.priority}`);

    if (scan.version) {
      lines.push(`${chalk.white("Version:")} ${scan.version}`);
    }

    if (scan.tags.length > 0) {
      lines.push(
        `${chalk.white("Tags:")} ${scan.tags.map((t: string) => chalk.cyan(t)).join(", ")}`
      );
    }

    if (scan.dependencies.length > 0) {
      lines.push(
        chalk.white("Dependencies:") +
          " " +
          scan.dependencies.map((d: string) => chalk.yellow(d)).join(", ")
      );
    }

    // Triggers
    lines.push(chalk.white("\nTriggers:"));
    for (const trigger of scan.triggers) {
      if (trigger.type === "always") {
        lines.push(chalk.gray("  • always active"));
      } else {
        lines.push(chalk.gray(`  • ${trigger.type}: ${trigger.pattern}`));
      }
    }

    // Show full content if requested
    if (options.content && loaded) {
      lines.push(chalk.white("\n─── SKILL.md Content ───\n"));
      lines.push(loaded.raw);
    } else if (loaded) {
      // Show section summaries
      lines.push(chalk.white("\nSections:"));
      if (loaded.rules) lines.push(chalk.gray("  • Rules (✓)"));
      if (loaded.patterns) lines.push(chalk.gray("  • Patterns (✓)"));
      if (loaded.antiPatterns) lines.push(chalk.gray("  • Anti-Patterns (✓)"));
      if (loaded.examples) lines.push(chalk.gray("  • Examples (✓)"));
      if (loaded.referencesSection) lines.push(chalk.gray("  • References (✓)"));

      lines.push(chalk.gray("\nUse --content to show full SKILL.md content"));
    }

    return success(lines.join("\n"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error("INTERNAL_ERROR", `Failed to show skill: ${message}`);
  }
}

// =============================================================================
// Create Command (T036)
// =============================================================================

/**
 * Execute skill create command
 */
export async function handleSkillCreate(
  name: string,
  options: SkillCreateOptions = {}
): Promise<{ success: boolean; path?: string; error?: string; exitCode: number }> {
  try {
    const workspacePath = process.cwd();
    let location = options.location;

    // Interactive location selection
    if (!location && !options.nonInteractive) {
      console.log(chalk.bold.blue("\n🛠️  Create New Skill\n"));

      location = await select({
        message: "Where would you like to create the skill?",
        choices: [
          { name: "Workspace (.vellum/skills/) - Project-specific", value: "workspace" as const },
          { name: "User (~/.vellum/skills/) - Available across projects", value: "user" as const },
          { name: "Global (.github/skills/) - Claude compatibility", value: "global" as const },
        ],
      });
    }

    // Default to workspace
    location = location ?? "workspace";

    // Validate location
    if (location === "builtin") {
      console.error(chalk.red("Cannot create skills in builtin location"));
      return { success: false, error: "Invalid location", exitCode: EXIT_CODES.ERROR };
    }

    // Get target path
    const skillsDir = getSkillSourcePath(location, workspacePath);
    const skillDir = path.join(skillsDir, name);
    const manifestPath = path.join(skillDir, "SKILL.md");

    // Check if skill already exists
    if ((await fileExists(manifestPath)) && !options.force) {
      if (options.nonInteractive) {
        console.error(chalk.red(`Skill already exists: ${name}. Use --force to overwrite.`));
        return { success: false, error: "Skill already exists", exitCode: EXIT_CODES.ERROR };
      }

      const shouldOverwrite = await confirm({
        message: `Skill "${name}" already exists at ${skillDir}. Overwrite?`,
        default: false,
      });

      if (!shouldOverwrite) {
        console.log(chalk.gray("Aborted."));
        return { success: false, error: "Aborted by user", exitCode: EXIT_CODES.SUCCESS };
      }
    }

    // Get description
    let description = "A custom skill";
    if (!options.nonInteractive) {
      description = await input({
        message: "Brief description of the skill:",
        default: description,
      });
    }

    // Generate skill content from template
    const content = SKILL_TEMPLATE.replace(/\{name\}/g, name).replace(
      /\{description\}/g,
      description
    );

    // Create directories and file
    await ensureDir(skillDir);
    await fs.writeFile(manifestPath, content, "utf-8");

    // Create optional subdirectories
    await ensureDir(path.join(skillDir, "scripts"));
    await ensureDir(path.join(skillDir, "references"));

    console.log(chalk.green(`\n✅ Created skill: ${name}`));
    console.log(chalk.gray(`   Path: ${skillDir}`));
    console.log(chalk.gray("\n   Next steps:"));
    console.log(chalk.gray(`   1. Edit ${manifestPath}`));
    console.log(chalk.gray(`   2. Add scripts to ${path.join(skillDir, "scripts")}`));
    console.log(chalk.gray(`   3. Run 'vellum skill validate --skill ${name}' to verify`));

    return { success: true, path: skillDir, exitCode: EXIT_CODES.SUCCESS };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\n❌ Failed to create skill: ${message}`));
    return { success: false, error: message, exitCode: EXIT_CODES.ERROR };
  }
}

// =============================================================================
// Validate Command (T037)
// =============================================================================

/**
 * Validate a single skill
 */
async function validateSingleSkill(
  skillPath: string,
  parser: SkillParser,
  strict: boolean
): Promise<SkillValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const name = path.basename(skillPath);

  try {
    const manifestPath = path.join(skillPath, "SKILL.md");

    // Check if SKILL.md exists
    if (!(await fileExists(manifestPath))) {
      errors.push("SKILL.md not found");
      return { name, path: skillPath, valid: false, errors, warnings };
    }

    // Parse the skill
    const result = await parser.parseMetadata(manifestPath, "workspace");

    if (!result) {
      errors.push("Failed to parse SKILL.md");
      return { name, path: skillPath, valid: false, errors, warnings };
    }

    // Check required fields
    if (!result.name || result.name.trim() === "") {
      errors.push("Missing required field: name");
    }

    if (!result.description || result.description.trim() === "") {
      warnings.push("Missing description");
    }

    if (!result.triggers || result.triggers.length === 0) {
      warnings.push("No triggers defined - skill will only activate with 'always' trigger");
    }

    // Validate triggers
    for (const trigger of result.triggers || []) {
      if (trigger.type !== "always" && !trigger.pattern) {
        errors.push(`Trigger of type '${trigger.type}' must have a pattern`);
      }
    }

    // In strict mode, warnings become errors
    if (strict && warnings.length > 0) {
      errors.push(...warnings.map((w) => `[strict] ${w}`));
      warnings.length = 0;
    }

    return {
      name: result.name || name,
      path: skillPath,
      valid: errors.length === 0,
      errors,
      warnings,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Parse error: ${message}`);
    return { name, path: skillPath, valid: false, errors, warnings };
  }
}

/**
 * Execute skill validate command
 */
export async function handleSkillValidate(
  options: SkillValidateOptions = {}
): Promise<CommandResult> {
  try {
    const workspacePath = process.cwd();
    const parser = new SkillParser();
    const results: SkillValidationResult[] = [];

    if (options.skill) {
      // Validate single skill by name
      const discovery = new SkillDiscovery({ workspacePath });
      const discovered = await discovery.discoverAll();

      const skillLocation = discovered.deduplicated.find(
        (loc: SkillLocation) => path.basename(loc.path) === options.skill
      );

      if (!skillLocation) {
        if (options.json) {
          const output: SkillValidateJson = {
            success: false,
            results: [],
            summary: { total: 0, valid: 0, invalid: 1, warnings: 0 },
          };
          return error("RESOURCE_NOT_FOUND", JSON.stringify(output, null, 2));
        }
        return error("RESOURCE_NOT_FOUND", chalk.red(`Skill not found: ${options.skill}`));
      }

      const result = await validateSingleSkill(skillLocation.path, parser, options.strict ?? false);
      results.push(result);
    } else {
      // Validate all skills
      const discovery = new SkillDiscovery({ workspacePath });
      const discovered = await discovery.discoverAll();

      for (const location of discovered.deduplicated) {
        const result = await validateSingleSkill(location.path, parser, options.strict ?? false);
        results.push(result);
      }
    }

    // Calculate summary
    const summary = {
      total: results.length,
      valid: results.filter((r) => r.valid).length,
      invalid: results.filter((r) => !r.valid).length,
      warnings: results.reduce((acc, r) => acc + r.warnings.length, 0),
    };

    // JSON output
    if (options.json) {
      const output: SkillValidateJson = {
        success: summary.invalid === 0,
        results,
        summary,
      };
      return summary.invalid === 0
        ? success(JSON.stringify(output, null, 2))
        : error("INVALID_ARGUMENT", JSON.stringify(output, null, 2));
    }

    // Formatted output
    const lines: string[] = [];
    lines.push(chalk.bold.cyan("\n🔍 Skill Validation Results\n"));

    if (results.length === 0) {
      lines.push(chalk.yellow("No skills found to validate."));
      return success(lines.join("\n"));
    }

    for (const result of results) {
      const icon = result.valid ? chalk.green("✅") : chalk.red("❌");
      lines.push(`${icon} ${chalk.white(result.name)}`);
      lines.push(chalk.gray(`   ${result.path}`));

      for (const err of result.errors) {
        lines.push(chalk.red(`   ✗ ${err}`));
      }

      for (const warn of result.warnings) {
        lines.push(chalk.yellow(`   ⚠ ${warn}`));
      }

      lines.push("");
    }

    // Summary
    lines.push(chalk.gray("─".repeat(50)));
    lines.push(
      `${chalk.white("Total:")} ${summary.total}  ` +
        `${chalk.green("Valid:")} ${summary.valid}  ` +
        `${chalk.red("Invalid:")} ${summary.invalid}  ` +
        `${chalk.yellow("Warnings:")} ${summary.warnings}`
    );

    const allValid = summary.invalid === 0;
    lines.push(
      allValid
        ? chalk.green("\n✅ All skills are valid!")
        : chalk.red("\n❌ Some skills have errors.")
    );

    return allValid ? success(lines.join("\n")) : error("INVALID_ARGUMENT", lines.join("\n"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error("INTERNAL_ERROR", `Failed to validate skills: ${message}`);
  }
}

// =============================================================================
// Migrate Command (T052)
// =============================================================================

/**
 * Supported migration sources
 */
export type MigrationSource = "claude" | "roo";

/**
 * Options for skill migrate command
 */
export interface SkillMigrateOptions {
  /** Source format to migrate from */
  from: MigrationSource;
  /** Target location for migrated skills */
  location?: SkillSource;
  /** Output as JSON */
  json?: boolean;
  /** Dry run (don't actually write files) */
  dryRun?: boolean;
}

/**
 * JSON output for skill migrate
 */
interface SkillMigrateJson {
  success: boolean;
  source: MigrationSource;
  migrated: Array<{
    originalPath: string;
    targetPath: string;
    name: string;
  }>;
  errors: Array<{
    path: string;
    error: string;
  }>;
  summary: {
    total: number;
    migrated: number;
    failed: number;
  };
}

/**
 * Get source paths based on migration source type
 */
function getMigrationSourcePaths(source: MigrationSource, workspacePath: string): string[] {
  switch (source) {
    case "claude":
      return [
        // Claude Code skill locations
        path.join(workspacePath, ".github", "skills"),
        path.join(workspacePath, ".claude", "skills"),
        path.join(os.homedir(), ".claude", "skills"),
      ];
    case "roo":
      return [
        // Roo Code skill locations
        path.join(workspacePath, ".roo", "skills"),
        path.join(os.homedir(), ".roo", "skills"),
      ];
    default:
      return [];
  }
}

/**
 * Check if a SKILL.md needs migration (missing Vellum-specific fields)
 */
async function needsMigration(manifestPath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(manifestPath, "utf-8");
    // Check if it has Vellum-specific frontmatter fields
    const hasVellumFields = content.includes("priority:") && content.includes("triggers:");
    return !hasVellumFields;
  } catch {
    return false;
  }
}

/**
 * Parse old skill format and convert to Vellum format
 */
async function convertSkillFormat(manifestPath: string, source: MigrationSource): Promise<string> {
  const content = await fs.readFile(manifestPath, "utf-8");

  // Parse existing frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    // No frontmatter, create new skill from content
    const skillName = path.basename(path.dirname(manifestPath));
    const firstLine = content.split("\n").find((l) => l.startsWith("# "));
    const title = firstLine?.replace(/^#\s*/, "") ?? skillName;

    return `---
name: "${skillName}"
description: "${title}"
version: "1.0.0"
priority: 50
tags:
  - migrated
  - ${source}
triggers:
  - type: keyword
    pattern: "${skillName}"
globs:
  - "**/*"
---

${content}`;
  }

  // Parse existing YAML frontmatter - guaranteed to exist after the regex match
  const frontmatter = frontmatterMatch[1] ?? "";
  const body = content.slice(frontmatterMatch[0].length).trim();

  // Extract existing fields
  const nameMatch = frontmatter.match(/^name:\s*["']?(.+?)["']?\s*$/m);

  const name = nameMatch?.[1] ?? path.basename(path.dirname(manifestPath));

  // Check for existing triggers or globs
  const hasExistingTriggers = frontmatter.includes("triggers:");
  const hasExistingGlobs = frontmatter.includes("globs:");
  const hasExistingPriority = frontmatter.includes("priority:");

  // Build new frontmatter
  let newFrontmatter = frontmatter.trim();

  // Add priority if missing
  if (!hasExistingPriority) {
    newFrontmatter += `\npriority: 50`;
  }

  // Add tags
  if (!frontmatter.includes("tags:")) {
    newFrontmatter += `\ntags:\n  - migrated\n  - ${source}`;
  }

  // Add triggers if missing
  if (!hasExistingTriggers) {
    const safeName = name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    newFrontmatter += `\ntriggers:\n  - type: keyword\n    pattern: "${safeName}"`;
  }

  // Add globs if missing
  if (!hasExistingGlobs) {
    newFrontmatter += `\nglobs:\n  - "**/*"`;
  }

  return `---
${newFrontmatter}
---

${body}`;
}

/**
 * Migration result for a single skill
 */
interface MigrationEntry {
  originalPath: string;
  targetPath: string;
  name: string;
}

/**
 * Migration error for a single skill
 */
interface MigrationError {
  path: string;
  error: string;
}

/**
 * Migrate a single skill directory
 */
async function migrateSkillDirectory(
  skillDir: string,
  manifestPath: string,
  targetBasePath: string,
  source: MigrationSource,
  dryRun: boolean
): Promise<{ entry?: MigrationEntry; error?: MigrationError }> {
  const skillName = path.basename(skillDir);
  const targetPath = path.join(targetBasePath, skillName);
  const targetManifest = path.join(targetPath, "SKILL.md");

  // Skip if target already exists (unless it's the same location)
  if ((await fileExists(targetManifest)) && targetPath !== skillDir) {
    return {
      error: { path: manifestPath, error: `Target already exists: ${targetPath}` },
    };
  }

  try {
    const needsConversion = await needsMigration(manifestPath);
    const convertedContent = needsConversion
      ? await convertSkillFormat(manifestPath, source)
      : await fs.readFile(manifestPath, "utf-8");

    if (!dryRun) {
      await ensureDir(targetPath);
      await fs.writeFile(targetManifest, convertedContent, "utf-8");

      // Copy subdirectories
      for (const subdir of ["scripts", "references", "assets"]) {
        const sourceSubdir = path.join(skillDir, subdir);
        const targetSubdir = path.join(targetPath, subdir);
        if (await fileExists(sourceSubdir)) {
          await fs.cp(sourceSubdir, targetSubdir, { recursive: true });
        }
      }
    }

    return {
      entry: { originalPath: manifestPath, targetPath: targetManifest, name: skillName },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: { path: manifestPath, error: message } };
  }
}

/**
 * Scan a source path for skills to migrate
 */
async function scanSourcePathForSkills(
  sourcePath: string,
  targetBasePath: string,
  source: MigrationSource,
  dryRun: boolean
): Promise<{ migrated: MigrationEntry[]; errors: MigrationError[] }> {
  const migrated: MigrationEntry[] = [];
  const errors: MigrationError[] = [];

  if (!(await fileExists(sourcePath))) {
    return { migrated, errors };
  }

  try {
    const entries = await fs.readdir(sourcePath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) {
        continue;
      }

      const skillDir = path.join(sourcePath, entry.name);
      const manifestPath = path.join(skillDir, "SKILL.md");

      if (!(await fileExists(manifestPath))) {
        continue;
      }

      const result = await migrateSkillDirectory(
        skillDir,
        manifestPath,
        targetBasePath,
        source,
        dryRun
      );

      if (result.entry) {
        migrated.push(result.entry);
      }
      if (result.error) {
        errors.push(result.error);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push({ path: sourcePath, error: message });
  }

  return { migrated, errors };
}

/**
 * Format migration output as text
 */
function formatMigrationOutput(
  sourcePaths: string[],
  migrated: MigrationEntry[],
  errors: MigrationError[],
  targetBasePath: string,
  source: MigrationSource,
  dryRun: boolean
): string {
  const lines: string[] = [];
  const modeLabel = dryRun ? " (dry run)" : "";
  lines.push(chalk.bold.cyan(`\n🔄 Skill Migration from ${source}${modeLabel}\n`));

  if (migrated.length === 0 && errors.length === 0) {
    lines.push(chalk.yellow(`No ${source} skills found to migrate.`));
    lines.push(chalk.gray("\nSearched locations:"));
    for (const p of sourcePaths) {
      lines.push(chalk.gray(`  • ${p}`));
    }
    return lines.join("\n");
  }

  if (migrated.length > 0) {
    lines.push(chalk.green("✅ Migrated Skills:"));
    for (const m of migrated) {
      lines.push(chalk.white(`  • ${m.name}`));
      lines.push(chalk.gray(`    ${m.originalPath}`));
      lines.push(chalk.gray(`    → ${m.targetPath}`));
    }
    lines.push("");
  }

  if (errors.length > 0) {
    lines.push(chalk.red("❌ Failed:"));
    for (const e of errors) {
      lines.push(chalk.red(`  • ${e.path}`));
      lines.push(chalk.red(`    ${e.error}`));
    }
    lines.push("");
  }

  const summary = {
    total: migrated.length + errors.length,
    migrated: migrated.length,
    failed: errors.length,
  };
  lines.push(chalk.gray("─".repeat(50)));
  lines.push(
    `${chalk.white("Total:")} ${summary.total}  ` +
      `${chalk.green("Migrated:")} ${summary.migrated}  ` +
      `${chalk.red("Failed:")} ${summary.failed}`
  );

  if (dryRun) {
    lines.push(chalk.yellow("\n⚠️  Dry run - no files were modified."));
    lines.push(chalk.gray("Remove --dry-run to perform actual migration."));
  } else if (summary.migrated > 0) {
    lines.push(chalk.green(`\n✅ Successfully migrated ${summary.migrated} skill(s)!`));
    lines.push(chalk.gray(`Target location: ${targetBasePath}`));
  }

  return lines.join("\n");
}

/**
 * Execute skill migrate command
 */
export async function handleSkillMigrate(options: SkillMigrateOptions): Promise<CommandResult> {
  try {
    const workspacePath = process.cwd();
    const sourcePaths = getMigrationSourcePaths(options.from, workspacePath);
    const targetLocation = options.location ?? "workspace";

    if (targetLocation === "builtin") {
      return error("INVALID_ARGUMENT", "Cannot migrate skills to builtin location");
    }

    const targetBasePath = getSkillSourcePath(targetLocation, workspacePath);
    const allMigrated: MigrationEntry[] = [];
    const allErrors: MigrationError[] = [];

    // Scan all source paths
    for (const sourcePath of sourcePaths) {
      const { migrated, errors } = await scanSourcePathForSkills(
        sourcePath,
        targetBasePath,
        options.from,
        options.dryRun ?? false
      );
      allMigrated.push(...migrated);
      allErrors.push(...errors);
    }

    const summary = {
      total: allMigrated.length + allErrors.length,
      migrated: allMigrated.length,
      failed: allErrors.length,
    };

    // JSON output
    if (options.json) {
      const output: SkillMigrateJson = {
        success: allErrors.length === 0,
        source: options.from,
        migrated: allMigrated,
        errors: allErrors,
        summary,
      };
      return summary.failed === 0
        ? success(JSON.stringify(output, null, 2))
        : error("INTERNAL_ERROR", JSON.stringify(output, null, 2));
    }

    // Formatted output
    const outputText = formatMigrationOutput(
      sourcePaths,
      allMigrated,
      allErrors,
      targetBasePath,
      options.from,
      options.dryRun ?? false
    );

    return summary.failed === 0 ? success(outputText) : error("INTERNAL_ERROR", outputText);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error("INTERNAL_ERROR", `Migration failed: ${message}`);
  }
}

// =============================================================================
// Export Command Definitions for Commander.js (T038)
// =============================================================================

export {
  handleSkillList as executeSkillList,
  handleSkillShow as executeSkillShow,
  handleSkillCreate as executeSkillCreate,
  handleSkillValidate as executeSkillValidate,
  handleSkillMigrate as executeSkillMigrate,
};
