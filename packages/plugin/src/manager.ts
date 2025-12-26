import type { Plugin } from "./types.js";

export class PluginManager {
  private plugins = new Map<string, Plugin>();

  async register(plugin: Plugin): Promise<void> {
    this.plugins.set(plugin.name, plugin);
    await plugin.onInit?.();
  }

  async unregister(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (plugin) {
      await plugin.onDestroy?.();
      this.plugins.delete(name);
    }
  }

  get(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  list(): Plugin[] {
    return Array.from(this.plugins.values());
  }
}
