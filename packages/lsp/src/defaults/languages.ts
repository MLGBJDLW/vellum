import type { LspServerConfig } from "../config.js";
import { getDefaultServers } from "./index.js";

export interface LanguageServerConfig {
  id: string;
  name?: string;
  extensions: string[];
  config: LspServerConfig;
}

export const DEFAULT_LANGUAGE_CONFIGS: LanguageServerConfig[] = Object.entries(
  getDefaultServers()
).map(([id, config]) => ({
  id,
  name: config.name,
  extensions: config.fileExtensions ?? [],
  config,
}));
