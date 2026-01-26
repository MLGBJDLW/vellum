import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";

import {
  type AutoModeConfig,
  AutoModeConfigSchema,
  DEFAULT_AUTO_MODE_CONFIG,
  type LanguageOverride,
} from "./auto-mode/config.js";
import { getDefaultServers } from "./defaults/index.js";
import type { LspTransportType } from "./types.js";

const ServerInstallSchema = z.object({
  method: z.enum(["npm", "pip", "cargo", "system"]),
  package: z.string(),
  args: z.array(z.string()).optional(),
});

const ServerConfigSchema = z.object({
  enabled: z.boolean().default(true),
  name: z.string().optional(),
  command: z.string(),
  args: z.array(z.string()).default([]),
  transport: z.enum(["stdio", "socket", "ipc"]).default("stdio"),
  rootPatterns: z.array(z.string()).default([]),
  fileExtensions: z.array(z.string()).default([]),
  filePatterns: z.array(z.string()).default([]),
  languageId: z.string().optional(),
  initializationOptions: z.record(z.string(), z.unknown()).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  cwd: z.string().optional(),
  install: ServerInstallSchema.optional(),
});

const LspConfigSchema = z.object({
  $schema: z.string().optional(),
  version: z.string().default("1.0"),
  servers: z.record(z.string(), ServerConfigSchema).default({}),
  disabled: z.array(z.string()).default([]),
  cache: z
    .object({
      maxSize: z.number().default(100),
      ttlSeconds: z.number().default(300),
    })
    .default({ maxSize: 100, ttlSeconds: 300 }),
  autoInstall: z
    .union([z.boolean(), z.enum(["auto", "prompt", "never"])])
    .default("prompt")
    .transform((val) => {
      // Backward compatibility: true → "auto", false → "never"
      if (val === true) return "auto";
      if (val === false) return "never";
      return val;
    }),
  autoMode: AutoModeConfigSchema.default(DEFAULT_AUTO_MODE_CONFIG),
  maxConcurrentServers: z.number().default(5),
  requestTimeoutMs: z.number().default(30_000),
});

export type LspServerConfig = z.infer<typeof ServerConfigSchema> & {
  transport?: LspTransportType;
};
export type LspConfig = z.infer<typeof LspConfigSchema>;

// FIX: Improved error handling to distinguish between file-not-found and parse errors
async function loadConfigFile(path: string): Promise<Partial<LspConfig> | null> {
  try {
    const content = await readFile(path, "utf-8");
    if (!content.trim()) return null;
    try {
      return JSON.parse(content) as Partial<LspConfig>;
    } catch (parseError) {
      // FIX: Log JSON parse errors so users know their config is invalid
      console.warn(
        `[LSP] Failed to parse config file at ${path}: ${parseError instanceof Error ? parseError.message : String(parseError)}`
      );
      return null;
    }
  } catch (error) {
    // File not found or permission error - this is expected for optional config files
    // Only log if it's not ENOENT (file not found)
    if (error instanceof Error && "code" in error && error.code !== "ENOENT") {
      console.warn(`[LSP] Could not read config file at ${path}: ${error.message}`);
    }
    return null;
  }
}

function mergeObjects(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof target[key] === "object" &&
      target[key] !== null &&
      !Array.isArray(target[key])
    ) {
      mergeObjects(target[key] as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      target[key] = value;
    }
  }
}

export function mergeConfigs(
  ...configs: (Partial<LspConfig> | null | undefined)[]
): Partial<LspConfig> {
  const merged: Record<string, unknown> = {};
  for (const config of configs) {
    if (!config) continue;
    mergeObjects(merged, config as Record<string, unknown>);
  }
  return merged as Partial<LspConfig>;
}

export function buildDefaultConfig(): LspConfig {
  return LspConfigSchema.parse({
    version: "1.0",
    servers: getDefaultServers(),
    disabled: [],
    cache: { maxSize: 100, ttlSeconds: 300 },
    autoInstall: "prompt",
    autoMode: DEFAULT_AUTO_MODE_CONFIG,
    maxConcurrentServers: 5,
    requestTimeoutMs: 30_000,
  });
}

export async function loadLspConfig(workspaceRoot?: string): Promise<LspConfig> {
  const builtinDefaults = buildDefaultConfig();
  const globalPath = join(homedir(), ".vellum", "lsp.json");
  const globalConfig = await loadConfigFile(globalPath);

  let projectConfig: Partial<LspConfig> | null = null;
  if (workspaceRoot) {
    const projectPath = join(resolve(workspaceRoot), ".vellum", "lsp.json");
    projectConfig = await loadConfigFile(projectPath);
  }

  const merged = mergeConfigs(builtinDefaults, globalConfig, projectConfig);
  return LspConfigSchema.parse(merged);
}

export function getServerConfig(config: LspConfig, language: string): LspServerConfig | null {
  if (config.disabled.includes(language)) {
    return null;
  }
  return (config.servers[language] as LspServerConfig | undefined) ?? null;
}

/**
 * Get the path to the project-level LSP config file.
 */
export function getProjectConfigPath(workspaceRoot: string): string {
  return join(resolve(workspaceRoot), ".vellum", "lsp.json");
}

/**
 * Get the path to the global LSP config file.
 */
export function getGlobalConfigPath(): string {
  return join(homedir(), ".vellum", "lsp.json");
}

/**
 * Save LSP config to a file.
 * Creates the directory if it doesn't exist.
 */
export async function saveLspConfig(config: Partial<LspConfig>, configPath: string): Promise<void> {
  // Ensure directory exists
  const dir = dirname(configPath);
  await mkdir(dir, { recursive: true });

  // Write config with pretty formatting
  const content = JSON.stringify(config, null, 2);
  await writeFile(configPath, content, "utf-8");
}

/**
 * Update the disabled array in a config file.
 * If the file doesn't exist, creates a minimal config with just the disabled array.
 */
export async function updateDisabledServers(
  workspaceRoot: string,
  disabled: string[],
  useProjectConfig = true
): Promise<void> {
  const configPath = useProjectConfig ? getProjectConfigPath(workspaceRoot) : getGlobalConfigPath();

  // Try to load existing config
  let existingConfig: Partial<LspConfig> = {};
  try {
    const content = await readFile(configPath, "utf-8");
    if (content.trim()) {
      existingConfig = JSON.parse(content) as Partial<LspConfig>;
    }
  } catch {
    // File doesn't exist, start with empty config
  }

  // Update disabled array
  existingConfig.disabled = disabled;

  await saveLspConfig(existingConfig, configPath);
}

/**
 * Update or insert a language override in auto-mode config.
 */
export async function updateAutoModeLanguageOverride(
  workspaceRoot: string,
  languageId: string,
  override: LanguageOverride,
  useProjectConfig = true
): Promise<void> {
  const configPath = useProjectConfig ? getProjectConfigPath(workspaceRoot) : getGlobalConfigPath();

  let existingConfig: Partial<LspConfig> = {};
  try {
    const content = await readFile(configPath, "utf-8");
    if (content.trim()) {
      existingConfig = JSON.parse(content) as Partial<LspConfig>;
    }
  } catch {
    // File doesn't exist, start with empty config
  }

  const languageOverrides = {
    ...((existingConfig.autoMode?.languageOverrides ?? {}) as Record<string, LanguageOverride>),
    [languageId]: override,
  };

  const updatedAutoMode: AutoModeConfig = AutoModeConfigSchema.parse({
    ...(existingConfig.autoMode ?? {}),
    languageOverrides,
  });

  existingConfig.autoMode = updatedAutoMode;

  await saveLspConfig(existingConfig, configPath);
}
