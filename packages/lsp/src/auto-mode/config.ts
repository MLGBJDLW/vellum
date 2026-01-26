import { z } from "zod";

// Auto-mode levels
export const AutoModeLevel = z.enum(["auto", "semi-auto", "manual"]);
export type AutoModeLevel = z.infer<typeof AutoModeLevel>;

// Detection trigger configuration
export const AutoModeTriggers = z.object({
  onStartup: z.boolean().default(true),
  onFileOpen: z.boolean().default(true),
  onProjectChange: z.boolean().default(true),
});

// Keep-alive 配置
export const KeepAliveConfig = z.object({
  enabled: z.boolean().default(true),
  idleTimeoutMs: z.number().min(0).default(0), // 0 = never close
  heartbeatIntervalMs: z.number().min(1000).default(30000),
});

// Language-level overrides
export const LanguageOverride = z.object({
  serverId: z.string(),
  mode: AutoModeLevel.optional(),
  enabled: z.boolean().default(true),
  autoStart: z.boolean().default(true),
});

// Complete configuration schema
export const AutoModeConfigSchema = z.object({
  mode: AutoModeLevel.default("semi-auto"),
  triggers: AutoModeTriggers.default({
    onStartup: true,
    onFileOpen: true,
    onProjectChange: true,
  }),
  keepAlive: KeepAliveConfig.default({
    enabled: true,
    idleTimeoutMs: 0,
    heartbeatIntervalMs: 30000,
  }),
  languageOverrides: z.record(z.string(), LanguageOverride).default({}),
  maxConcurrentServers: z.number().min(1).max(10).default(5),
  installTimeout: z.number().min(5000).default(60000),
  startTimeout: z.number().min(1000).default(30000),
});

export type AutoModeConfig = z.infer<typeof AutoModeConfigSchema>;
export type AutoModeTriggers = z.infer<typeof AutoModeTriggers>;
export type KeepAliveConfig = z.infer<typeof KeepAliveConfig>;
export type LanguageOverride = z.infer<typeof LanguageOverride>;

// Default configuration
export const DEFAULT_AUTO_MODE_CONFIG: AutoModeConfig = AutoModeConfigSchema.parse({});
