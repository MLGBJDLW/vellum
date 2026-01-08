import { extname } from "node:path";

import { DEFAULT_LANGUAGE_CONFIGS, type LanguageServerConfig } from "./languages.js";

export class LanguageConfigQuery {
  private readonly configs: LanguageServerConfig[];
  private readonly extensionMap: Map<string, LanguageServerConfig[]>;

  constructor(configs: LanguageServerConfig[] = DEFAULT_LANGUAGE_CONFIGS) {
    this.configs = configs;
    this.extensionMap = this.buildExtensionMap();
  }

  private buildExtensionMap(): Map<string, LanguageServerConfig[]> {
    const map = new Map<string, LanguageServerConfig[]>();
    for (const config of this.configs) {
      for (const ext of config.extensions) {
        const existing = map.get(ext) ?? [];
        existing.push(config);
        existing.sort((a, b) => (b.config.enabled ? 1 : 0) - (a.config.enabled ? 1 : 0));
        map.set(ext, existing);
      }
    }
    return map;
  }

  getConfigsForFile(filePath: string): LanguageServerConfig[] {
    const ext = extname(filePath).toLowerCase();
    return this.extensionMap.get(ext) ?? [];
  }

  getConfigById(id: string): LanguageServerConfig | undefined {
    return this.configs.find((config) => config.id === id);
  }

  getSupportedExtensions(): string[] {
    return Array.from(this.extensionMap.keys());
  }
}
