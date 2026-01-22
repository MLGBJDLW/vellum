/**
 * Shell Integration (Phase 37)
 * @module cli/commands/shell-integration
 */

import { z } from "zod";

// =============================================================================
// Completion Schemas
// =============================================================================

export const CompletionInputSchema = z.object({
  input: z.string(),
  cursorPosition: z.number().int().nonnegative().optional(),
  previousWords: z.array(z.string()).optional(),
  currentWord: z.string().optional(),
  commandLine: z.string().optional(),
});
export type CompletionInput = z.infer<typeof CompletionInputSchema>;
export type CompletionInputInput = z.input<typeof CompletionInputSchema>;

export const CompletionResultTypeSchema = z.enum(["values"]);
export type CompletionResultType = z.infer<typeof CompletionResultTypeSchema>;

export const CompletionResultSchema = z.object({
  type: CompletionResultTypeSchema.default("values"),
  values: z.array(z.string()),
  descriptions: z.array(z.string()).optional(),
});
export type CompletionResult = z.infer<typeof CompletionResultSchema>;
export type CompletionResultInput = z.input<typeof CompletionResultSchema>;

export interface CompletionProvider {
  readonly name: string;
  complete(input: CompletionInput): Promise<CompletionResult>;
}

export class CompletionCache {
  private readonly cache = new Map<string, CompletionResult>();

  get(key: string): CompletionResult | undefined {
    return this.cache.get(key);
  }

  set(key: string, value: CompletionResult): void {
    this.cache.set(key, value);
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

const sharedCache = new CompletionCache();

export function getSharedCache(): CompletionCache {
  return sharedCache;
}

// =============================================================================
// Shell Type Schema
// =============================================================================

export const ShellTypeSchema = z.enum(["bash", "zsh", "fish", "powershell", "cmd"]);
export type ShellType = z.infer<typeof ShellTypeSchema>;

// =============================================================================
// Install Options Schema
// =============================================================================

export const InstallOptionsSchema = z.object({
  shell: ShellTypeSchema.optional(),
  force: z.boolean().optional(),
});
export type InstallOptions = z.infer<typeof InstallOptionsSchema>;
export type InstallOptionsInput = z.input<typeof InstallOptionsSchema>;

// =============================================================================
// Status Schema
// =============================================================================

export const ShellIntegrationStatusSchema = z.object({
  installed: z.boolean(),
  shell: ShellTypeSchema.optional(),
  version: z.string().optional(),
});
export type ShellIntegrationStatus = z.infer<typeof ShellIntegrationStatusSchema>;
export type ShellIntegrationStatusInput = z.input<typeof ShellIntegrationStatusSchema>;

// =============================================================================
// Environment Config Schema
// =============================================================================

export const EnvironmentConfigSchema = z.object({
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
});
export type EnvironmentConfig = z.infer<typeof EnvironmentConfigSchema>;
export type EnvironmentConfigInput = z.input<typeof EnvironmentConfigSchema>;

// =============================================================================
// Shell Installer
// =============================================================================

export interface InstallResult {
  success: boolean;
  message?: string;
}

export class ShellInstaller {
  async install(_options?: InstallOptions): Promise<InstallResult> {
    return { success: true, message: "Shell integration installed" };
  }

  async uninstall(_shell?: ShellType): Promise<InstallResult> {
    return { success: true, message: "Shell integration uninstalled" };
  }

  async status(): Promise<ShellIntegrationStatus> {
    return { installed: false };
  }
}

export const shellInstaller = new ShellInstaller();

// =============================================================================
// Completion Providers
// =============================================================================

export class AgentCompletionProvider implements CompletionProvider {
  readonly name = "agent";

  async complete(_input: CompletionInput): Promise<CompletionResult> {
    return { type: "values", values: [] };
  }
}

export class ModelCompletionProvider implements CompletionProvider {
  readonly name = "models";

  async getCompletions(_prefix: string): Promise<string[]> {
    return [];
  }

  async complete(input: CompletionInput): Promise<CompletionResult> {
    const prefix = input.currentWord ?? input.input;
    const values = await this.getCompletions(prefix);
    return { type: "values", values };
  }
}

export class ProviderCompletionProvider implements CompletionProvider {
  readonly name = "providers";

  async getCompletions(_prefix: string): Promise<string[]> {
    return [];
  }

  async complete(input: CompletionInput): Promise<CompletionResult> {
    const prefix = input.currentWord ?? input.input;
    const values = await this.getCompletions(prefix);
    return { type: "values", values };
  }
}

export function createDynamicProviders(_config?: EnvironmentConfig): CompletionProvider[] {
  return [
    new ModelCompletionProvider(),
    new ProviderCompletionProvider(),
    new AgentCompletionProvider(),
  ];
}

// =============================================================================
// Environment
// =============================================================================

export const VELLUM_ENV_VARS = ["VELLUM_API_KEY", "VELLUM_DEBUG", "VELLUM_LOG_LEVEL"] as const;

export class VellumEnvironment {
  get(key: string): string | undefined {
    return process.env[key];
  }

  set(key: string, value: string): void {
    process.env[key] = value;
  }
}

export const vellumEnv = new VellumEnvironment();
