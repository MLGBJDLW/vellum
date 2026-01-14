// ============================================
// System Prompt Assembly
// ============================================

/**
 * Builds the system prompt for LLM requests.
 *
 * Assembles:
 * - Provider-specific headers
 * - Environment information (OS, cwd, date)
 * - Custom instruction files (AGENTS.md, CLAUDE.md)
 * - Mode-specific prompts
 *
 * @module @vellum/core/agent/prompt
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { z } from "zod";

// =============================================================================
// Constants
// =============================================================================

/**
 * Local rule files to search for (in order of priority)
 */
const LOCAL_RULE_FILES = ["AGENTS.md", "CLAUDE.md", "CONTEXT.md"] as const;

/**
 * Global rule file paths
 */
const GLOBAL_RULE_PATHS = [
  path.join(os.homedir(), ".config", "vellum", "AGENTS.md"),
  path.join(os.homedir(), ".claude", "CLAUDE.md"),
] as const;

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for system prompt assembly
 */
export const SystemPromptConfigSchema = z.object({
  /** Current working directory */
  cwd: z.string(),
  /** Project root directory */
  projectRoot: z.string().optional(),
  /** Agent mode */
  mode: z.enum(["plan", "code", "draft", "debug", "ask"]),
  /** Mode-specific prompt content */
  modePrompt: z.string().optional(),
  /** Provider type for provider-specific headers */
  providerType: z.string().optional(),
  /** Custom instructions to include */
  customInstructions: z.array(z.string()).optional(),
  /** Whether to include environment info */
  includeEnvironment: z.boolean().default(true),
  /** Whether to search for rule files */
  includeRuleFiles: z.boolean().default(true),
  /** File tree for context (optional) */
  fileTree: z.string().optional(),
  /** Whether this is a Git repository */
  isGitRepo: z.boolean().optional(),
});

export type SystemPromptConfig = z.infer<typeof SystemPromptConfigSchema>;

/**
 * Result of system prompt assembly
 */
export interface SystemPromptResult {
  /** Assembled prompt sections */
  sections: string[];
  /** Full assembled prompt */
  prompt: string;
  /** Files that were included */
  includedFiles: string[];
}

// =============================================================================
// Environment Info
// =============================================================================

/**
 * Build environment information section
 *
 * @param config - System prompt config
 * @returns Environment info string
 */
export function buildEnvironmentInfo(
  config: Pick<SystemPromptConfig, "cwd" | "isGitRepo" | "fileTree">
): string {
  const lines = [
    `Here is some useful information about the environment you are running in:`,
    `<env>`,
    `  Working directory: ${config.cwd}`,
    `  Is directory a git repo: ${config.isGitRepo ? "yes" : "no"}`,
    `  Platform: ${process.platform}`,
    `  Today's date: ${new Date().toDateString()}`,
    `</env>`,
  ];

  if (config.fileTree) {
    lines.push(`<files>`, `  ${config.fileTree}`, `</files>`);
  }

  return lines.join("\n");
}

// =============================================================================
// Rule File Discovery
// =============================================================================

/**
 * Find rule files in the project directory
 *
 * @param cwd - Current working directory
 * @param projectRoot - Project root directory
 * @returns Array of file paths found
 */
export async function findLocalRuleFiles(cwd: string, projectRoot?: string): Promise<string[]> {
  const found: string[] = [];
  const searchDirs = projectRoot ? [cwd, projectRoot] : [cwd];
  const seen = new Set<string>();

  for (const dir of searchDirs) {
    for (const filename of LOCAL_RULE_FILES) {
      const filepath = path.join(dir, filename);
      if (seen.has(filepath)) continue;
      seen.add(filepath);

      try {
        await fs.access(filepath);
        found.push(filepath);
        // Only use first match per directory
        break;
      } catch {
        // File doesn't exist, continue
      }
    }
  }

  return found;
}

/**
 * Find global rule files
 *
 * @returns Array of global rule file paths found
 */
export async function findGlobalRuleFiles(): Promise<string[]> {
  const found: string[] = [];

  for (const filepath of GLOBAL_RULE_PATHS) {
    try {
      await fs.access(filepath);
      found.push(filepath);
      // Only use first match
      break;
    } catch {
      // File doesn't exist, continue
    }
  }

  return found;
}

/**
 * Read rule file content with header
 *
 * @param filepath - Path to rule file
 * @returns Content with source header or empty string
 */
export async function readRuleFile(filepath: string): Promise<string> {
  try {
    const content = await fs.readFile(filepath, "utf-8");
    return `Instructions from: ${filepath}\n${content}`;
  } catch {
    return "";
  }
}

/**
 * Build environment-only prompt section.
 *
 * @param cwd - Current working directory
 * @param isGitRepo - Whether this is a Git repository
 * @param fileTree - Optional file tree
 * @returns Environment info string
 */
export function buildEnvironmentSection(cwd: string, isGitRepo = false, fileTree?: string): string {
  return buildEnvironmentInfo({
    cwd,
    isGitRepo,
    fileTree,
  });
}

// =============================================================================
// PromptBuilder Bridge (T028)
// =============================================================================

/**
 * Converts a PromptBuilder output to the existing SystemPromptResult format.
 *
 * This bridge function allows the new PromptBuilder system to integrate
 * seamlessly with existing code that expects SystemPromptResult.
 *
 * @param builder - The PromptBuilder instance to convert
 * @param includedFiles - Optional list of files included in the prompt
 * @returns A SystemPromptResult compatible with existing code
 *
 * @example
 * ```typescript
 * import { PromptBuilder } from '../prompts/index.js';
 * import { fromPromptBuilder } from './prompt.js';
 *
 * const builder = new PromptBuilder()
 *   .withBase("System instructions")
 *   .withRole("coder", "Coding rules");
 *
 * const result = fromPromptBuilder(builder);
 * console.log(result.prompt);
 * ```
 */
export function fromPromptBuilder(
  builder: {
    build: () => string;
    getLayers: () => readonly { content: string; priority: number; source: string }[];
  },
  includedFiles: string[] = []
): SystemPromptResult {
  const prompt = builder.build();
  const layers = builder.getLayers();

  // Extract sections from layers, maintaining order
  const sections = layers
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .map((layer) => layer.content)
    .filter((content) => content.length > 0);

  return {
    sections,
    prompt,
    includedFiles,
  };
}
