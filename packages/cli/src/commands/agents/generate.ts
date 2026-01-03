/**
 * Agents Generate Command
 *
 * Generates AGENTS.md based on project analysis (package.json, tsconfig.json, etc.)
 * Uses template-based generation without LLM calls.
 *
 * @module cli/commands/agents/generate
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import chalk from "chalk";

import type { CommandContext, CommandResult } from "../types.js";
import { error, success } from "../types.js";
import type { AgentsGenerateOptions } from "./index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Detected project information
 */
interface DetectedProjectInfo {
  /** Project name from package.json */
  name: string;
  /** Description from package.json */
  description?: string;
  /** Detected programming language */
  language: string;
  /** Detected framework */
  framework?: string;
  /** Package manager (npm, pnpm, yarn) */
  packageManager?: string;
  /** Build tool (vite, webpack, etc.) */
  buildTool?: string;
  /** Test framework */
  testFramework?: string;
  /** Detected patterns/conventions */
  patterns: string[];
}

/**
 * Detection result with confidence
 */
interface DetectionResult {
  /** Detected project info */
  info: DetectedProjectInfo;
  /** Files that were analyzed */
  analyzedFiles: string[];
}

// =============================================================================
// Project Detection
// =============================================================================

/**
 * Read and parse package.json
 */
async function readPackageJson(cwd: string): Promise<Record<string, unknown> | null> {
  try {
    const content = await fs.readFile(path.join(cwd, "package.json"), "utf-8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Read and parse tsconfig.json
 */
async function readTsConfig(cwd: string): Promise<Record<string, unknown> | null> {
  try {
    const content = await fs.readFile(path.join(cwd, "tsconfig.json"), "utf-8");
    // Remove comments (tsconfig allows them)
    const cleaned = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Check if a file exists
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
 * Detect framework from dependencies
 */
function detectFramework(
  deps: Record<string, string>,
  devDeps: Record<string, string>
): string | undefined {
  const allDeps = { ...deps, ...devDeps };

  // React-based
  if (allDeps.next) return "Next.js";
  if (allDeps.react) return "React";
  if (allDeps.vue) return "Vue";
  if (allDeps.svelte) return "Svelte";
  if (allDeps["@angular/core"]) return "Angular";

  // Node.js
  if (allDeps.express) return "Express";
  if (allDeps.fastify) return "Fastify";
  if (allDeps.koa) return "Koa";
  if (allDeps.hono) return "Hono";
  if (allDeps.nestjs || allDeps["@nestjs/core"]) return "NestJS";

  return undefined;
}

/**
 * Detect package manager
 */
async function detectPackageManager(cwd: string): Promise<string> {
  if (await fileExists(path.join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (await fileExists(path.join(cwd, "yarn.lock"))) return "yarn";
  if (await fileExists(path.join(cwd, "bun.lockb"))) return "bun";
  return "npm";
}

/**
 * Detect build tool
 */
function detectBuildTool(
  deps: Record<string, string>,
  devDeps: Record<string, string>
): string | undefined {
  const allDeps = { ...deps, ...devDeps };

  if (allDeps.vite) return "Vite";
  if (allDeps.webpack) return "Webpack";
  if (allDeps.esbuild) return "esbuild";
  if (allDeps.rollup) return "Rollup";
  if (allDeps.parcel) return "Parcel";
  if (allDeps.turbo || allDeps.turbopack) return "Turbopack";

  return undefined;
}

/**
 * Detect test framework
 */
function detectTestFramework(
  deps: Record<string, string>,
  devDeps: Record<string, string>
): string | undefined {
  const allDeps = { ...deps, ...devDeps };

  if (allDeps.vitest) return "Vitest";
  if (allDeps.jest) return "Jest";
  if (allDeps.mocha) return "Mocha";
  if (allDeps["@playwright/test"]) return "Playwright";
  if (allDeps.cypress) return "Cypress";

  return undefined;
}

/**
 * Detect language from project files
 */
async function detectLanguage(cwd: string, pkg: Record<string, unknown> | null): Promise<string> {
  // Check for TypeScript
  if (await fileExists(path.join(cwd, "tsconfig.json"))) return "TypeScript";

  // Check package.json
  if (pkg) {
    const devDeps = (pkg.devDependencies as Record<string, string>) ?? {};
    if (devDeps.typescript) return "TypeScript";
  }

  // Check for other languages
  if (await fileExists(path.join(cwd, "pyproject.toml"))) return "Python";
  if (await fileExists(path.join(cwd, "Cargo.toml"))) return "Rust";
  if (await fileExists(path.join(cwd, "go.mod"))) return "Go";
  if (await fileExists(path.join(cwd, "pom.xml"))) return "Java";
  if (await fileExists(path.join(cwd, "build.gradle"))) return "Java";

  // Default to JavaScript if package.json exists
  if (pkg) return "JavaScript";

  return "Unknown";
}

/**
 * Detect project patterns/conventions
 */
async function detectPatterns(cwd: string): Promise<string[]> {
  const patterns: string[] = [];

  // Check for monorepo
  if (
    (await fileExists(path.join(cwd, "pnpm-workspace.yaml"))) ||
    (await fileExists(path.join(cwd, "lerna.json")))
  ) {
    patterns.push("Monorepo");
  }

  // Check for common configs
  if (
    (await fileExists(path.join(cwd, ".eslintrc.json"))) ||
    (await fileExists(path.join(cwd, "eslint.config.js")))
  ) {
    patterns.push("ESLint");
  }
  if (
    (await fileExists(path.join(cwd, ".prettierrc"))) ||
    (await fileExists(path.join(cwd, "prettier.config.js")))
  ) {
    patterns.push("Prettier");
  }
  if (await fileExists(path.join(cwd, "biome.json"))) {
    patterns.push("Biome");
  }
  if (await fileExists(path.join(cwd, ".github/workflows"))) {
    patterns.push("GitHub Actions");
  }

  return patterns;
}

/**
 * Analyze project and detect information
 */
async function analyzeProject(cwd: string): Promise<DetectionResult> {
  const analyzedFiles: string[] = [];

  // Read package.json
  const pkg = await readPackageJson(cwd);
  if (pkg) analyzedFiles.push("package.json");

  // Read tsconfig.json
  const tsconfig = await readTsConfig(cwd);
  if (tsconfig) analyzedFiles.push("tsconfig.json");

  // Extract info from package.json
  const deps = (pkg?.dependencies as Record<string, string>) ?? {};
  const devDeps = (pkg?.devDependencies as Record<string, string>) ?? {};

  // Detect various aspects
  const language = await detectLanguage(cwd, pkg);
  const framework = detectFramework(deps, devDeps);
  const packageManager = await detectPackageManager(cwd);
  const buildTool = detectBuildTool(deps, devDeps);
  const testFramework = detectTestFramework(deps, devDeps);
  const patterns = await detectPatterns(cwd);

  return {
    info: {
      name: (pkg?.name as string) ?? path.basename(cwd),
      description: pkg?.description as string | undefined,
      language,
      framework,
      packageManager,
      buildTool,
      testFramework,
      patterns,
    },
    analyzedFiles,
  };
}

// =============================================================================
// Template Generation
// =============================================================================

/**
 * Generate AGENTS.md content from detected info
 */
function generateAgentsMd(info: DetectedProjectInfo): string {
  const lines: string[] = [];

  // Frontmatter
  lines.push("---");
  lines.push(`name: "${info.name}"`);
  lines.push('version: "1.0.0"');
  if (info.description) {
    lines.push(`description: "${info.description.replace(/"/g, '\\"')}"`);
  }
  lines.push("priority: 100");
  lines.push("merge:");
  lines.push("  strategy: extend");
  lines.push("  arrays: append");
  lines.push("---");
  lines.push("");

  // Instructions header
  lines.push("# Instructions");
  lines.push("");
  lines.push(`You are an AI coding assistant for ${info.name}.`);
  lines.push("");

  // Tech stack
  lines.push("## Tech Stack");
  lines.push("");
  lines.push(`- ${info.language}`);
  if (info.framework) {
    lines.push(`- ${info.framework}`);
  }
  if (info.buildTool) {
    lines.push(`- ${info.buildTool}`);
  }
  if (info.testFramework) {
    lines.push(`- ${info.testFramework}`);
  }
  if (info.packageManager && info.packageManager !== "npm") {
    lines.push(`- Package Manager: ${info.packageManager}`);
  }
  lines.push("");

  // Patterns
  if (info.patterns.length > 0) {
    lines.push("## Project Patterns");
    lines.push("");
    for (const pattern of info.patterns) {
      lines.push(`- ${pattern}`);
    }
    lines.push("");
  }

  // Coding standards
  lines.push("## Coding Standards");
  lines.push("");
  lines.push("- Follow existing project conventions");
  lines.push("- Write clean, readable, well-documented code");
  lines.push("- Use meaningful variable and function names");
  lines.push("- Add appropriate comments for complex logic");

  // Language-specific standards
  if (info.language === "TypeScript") {
    lines.push("- Use proper TypeScript types, avoid `any`");
    lines.push("- Prefer `const` over `let`, avoid `var`");
  }
  if (info.testFramework) {
    lines.push(`- Write tests using ${info.testFramework}`);
  }
  lines.push("");

  // Allowed tools
  lines.push("## Allowed Tools");
  lines.push("");
  lines.push("allowed-tools:");
  lines.push('  - "@readonly"');
  lines.push('  - "@edit"');

  // Safe shell commands based on package manager
  if (info.packageManager) {
    lines.push(`  - "Bash(${info.packageManager} run *)"`);
    lines.push(`  - "Bash(${info.packageManager} test *)"`);
  }
  lines.push('  - "!Bash"');
  lines.push("");

  return lines.join("\n");
}

/**
 * Format detection summary for display
 */
function formatDetectionSummary(result: DetectionResult): string {
  const { info, analyzedFiles } = result;
  const lines: string[] = [];

  lines.push(chalk.bold("📊 Project Analysis"));
  lines.push(chalk.gray("━".repeat(40)));
  lines.push("");
  lines.push(`${chalk.gray("Name:")} ${info.name}`);
  lines.push(`${chalk.gray("Language:")} ${chalk.cyan(info.language)}`);

  if (info.framework) {
    lines.push(`${chalk.gray("Framework:")} ${chalk.cyan(info.framework)}`);
  }
  if (info.packageManager) {
    lines.push(`${chalk.gray("Package Manager:")} ${info.packageManager}`);
  }
  if (info.buildTool) {
    lines.push(`${chalk.gray("Build Tool:")} ${info.buildTool}`);
  }
  if (info.testFramework) {
    lines.push(`${chalk.gray("Test Framework:")} ${info.testFramework}`);
  }
  if (info.patterns.length > 0) {
    lines.push(`${chalk.gray("Patterns:")} ${info.patterns.join(", ")}`);
  }

  lines.push("");
  lines.push(chalk.gray(`Analyzed: ${analyzedFiles.join(", ")}`));

  return lines.join("\n");
}

// =============================================================================
// Command Handler
// =============================================================================

/**
 * Execute agents generate command
 *
 * @param options - Command options
 * @returns Command result
 */
export async function handleAgentsGenerate(options: AgentsGenerateOptions): Promise<CommandResult> {
  const cwd = process.cwd();
  const outputPath = options.output ? path.resolve(options.output) : path.join(cwd, "AGENTS.md");

  try {
    // Analyze project
    const result = await analyzeProject(cwd);

    // Generate content
    const content = generateAgentsMd(result.info);

    // Dry run - just show what would be generated
    if (options.dryRun) {
      const summary = formatDetectionSummary(result);
      const preview = [
        summary,
        "",
        chalk.bold("📄 Generated AGENTS.md Preview:"),
        chalk.gray("━".repeat(40)),
        "",
        chalk.gray(content),
        "",
        chalk.yellow(`Would write to: ${outputPath}`),
      ].join("\n");

      return success(preview);
    }

    // Check if file exists (unless --merge is specified)
    if (!options.merge) {
      try {
        await fs.access(outputPath);
        return error(
          "OPERATION_NOT_ALLOWED",
          `${outputPath} already exists. Use --merge to combine with existing file, or delete it first.`
        );
      } catch {
        // File doesn't exist, good to proceed
      }
    }

    // Handle merge with existing file
    if (options.merge) {
      try {
        const existing = await fs.readFile(outputPath, "utf-8");
        // For basic merge, append generated content as a comment
        const merged = [
          existing,
          "",
          "<!-- Generated additions from `vellum agents generate` -->",
          "",
          content,
        ].join("\n");
        await fs.writeFile(outputPath, merged, "utf-8");
      } catch {
        // No existing file, just write new content
        await fs.writeFile(outputPath, content, "utf-8");
      }
    } else {
      // Write new file
      await fs.writeFile(outputPath, content, "utf-8");
    }

    // Format success message
    const summary = formatDetectionSummary(result);
    const successMsg = [
      summary,
      "",
      chalk.green(`✅ Created ${outputPath}`),
      "",
      chalk.gray("Next steps:"),
      chalk.gray("  • Review and customize the generated AGENTS.md"),
      chalk.gray(`  • Run ${chalk.cyan("/agents validate")} to check syntax`),
      chalk.gray(`  • Run ${chalk.cyan("/agents show")} to view merged config`),
    ].join("\n");

    return success(successMsg, { filePath: outputPath });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error("INTERNAL_ERROR", `Failed to generate AGENTS.md: ${message}`);
  }
}

/**
 * Execute handler for command context
 */
export async function executeGenerate(ctx: CommandContext): Promise<CommandResult> {
  const options: AgentsGenerateOptions = {
    output: ctx.parsedArgs.named.output as string | undefined,
    merge: ctx.parsedArgs.named.merge as boolean | undefined,
    dryRun: ctx.parsedArgs.named["dry-run"] as boolean | undefined,
  };

  return handleAgentsGenerate(options);
}
