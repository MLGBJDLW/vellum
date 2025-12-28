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
import type { AgentMode } from "./modes.js";

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
// Provider Headers
// =============================================================================

/**
 * Provider-specific system prompt headers
 */
const PROVIDER_HEADERS: Record<string, string> = {
  anthropic: `You are Claude, an AI assistant created by Anthropic to be helpful, harmless, and honest.`,
  openai: `You are a helpful AI assistant.`,
  google: `You are Gemini, a helpful AI assistant.`,
  deepseek: `You are DeepSeek, a helpful AI assistant.`,
};

/**
 * Get provider-specific header
 *
 * @param providerType - Provider type
 * @returns Provider header or empty string
 */
export function getProviderHeader(providerType?: string): string {
  if (!providerType) {
    return "";
  }

  // Check for partial matches (e.g., "anthropic" matches "anthropic-claude")
  for (const [key, header] of Object.entries(PROVIDER_HEADERS)) {
    if (providerType.includes(key)) {
      return header;
    }
  }

  return "";
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

// =============================================================================
// System Prompt Builder
// =============================================================================

/**
 * Build the complete system prompt.
 *
 * Assembles all sections in order:
 * 1. Provider header
 * 2. Environment info
 * 3. Rule files (AGENTS.md, CLAUDE.md)
 * 4. Mode-specific prompt
 * 5. Custom instructions
 *
 * @param config - System prompt configuration
 * @returns Assembled system prompt result
 *
 * @example
 * ```typescript
 * const result = await buildSystemPrompt({
 *   cwd: '/home/user/project',
 *   mode: 'code',
 *   providerType: 'anthropic',
 * });
 *
 * console.log(result.prompt);
 * ```
 */
export async function buildSystemPrompt(config: SystemPromptConfig): Promise<SystemPromptResult> {
  const validated = SystemPromptConfigSchema.parse(config);
  const sections: string[] = [];
  const includedFiles: string[] = [];

  // 1. Provider header
  const providerHeader = getProviderHeader(validated.providerType);
  if (providerHeader) {
    sections.push(providerHeader);
  }

  // 2. Environment info
  if (validated.includeEnvironment !== false) {
    sections.push(buildEnvironmentInfo(validated));
  }

  // 3. Rule files
  if (validated.includeRuleFiles !== false) {
    const localFiles = await findLocalRuleFiles(validated.cwd, validated.projectRoot);
    const globalFiles = await findGlobalRuleFiles();
    const allFiles = [...localFiles, ...globalFiles];

    for (const filepath of allFiles) {
      const content = await readRuleFile(filepath);
      if (content) {
        sections.push(content);
        includedFiles.push(filepath);
      }
    }
  }

  // 4. Mode-specific prompt
  if (validated.modePrompt) {
    sections.push(validated.modePrompt);
  }

  // 5. Custom instructions
  if (validated.customInstructions) {
    for (const instruction of validated.customInstructions) {
      if (instruction.trim()) {
        sections.push(instruction);
      }
    }
  }

  // Filter empty sections and join
  const filteredSections = sections.filter((s) => s.trim().length > 0);
  const prompt = filteredSections.join("\n\n");

  return {
    sections: filteredSections,
    prompt,
    includedFiles,
  };
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Build a simple system prompt for a mode.
 *
 * @param mode - Agent mode
 * @param cwd - Current working directory
 * @param options - Additional options
 * @returns Assembled system prompt string
 *
 * @example
 * ```typescript
 * const prompt = await buildModePrompt('code', '/home/user/project');
 * ```
 */
export async function buildModePrompt(
  mode: AgentMode,
  cwd: string,
  options?: {
    providerType?: string;
    modePrompt?: string;
    customInstructions?: string[];
  }
): Promise<string> {
  const result = await buildSystemPrompt({
    cwd,
    mode,
    providerType: options?.providerType,
    modePrompt: options?.modePrompt,
    customInstructions: options?.customInstructions,
    includeEnvironment: true,
    includeRuleFiles: true,
  });

  return result.prompt;
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
