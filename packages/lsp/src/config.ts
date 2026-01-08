import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";

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
  autoInstall: z.boolean().default(true),
  maxConcurrentServers: z.number().default(5),
  requestTimeoutMs: z.number().default(30_000),
});

export type LspServerConfig = z.infer<typeof ServerConfigSchema> & {
  transport?: LspTransportType;
};
export type LspConfig = z.infer<typeof LspConfigSchema>;

async function loadConfigFile(path: string): Promise<Partial<LspConfig> | null> {
  try {
    const content = await readFile(path, "utf-8");
    if (!content.trim()) return null;
    return JSON.parse(content) as Partial<LspConfig>;
  } catch {
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
    autoInstall: true,
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
