import type { Plugin } from "./types.js";

export class PluginLoader {
  async loadFromPath(path: string): Promise<Plugin> {
    const module = await import(path);
    return module.default as Plugin;
  }

  async loadFromNpm(packageName: string): Promise<Plugin> {
    const module = await import(packageName);
    return module.default as Plugin;
  }
}
