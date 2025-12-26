export interface PluginConfig {
  name: string;
  version: string;
  description?: string;
}

export interface PluginHooks {
  onInit?: () => Promise<void>;
  onDestroy?: () => Promise<void>;
  onMessage?: (message: unknown) => Promise<void>;
  onToolCall?: (tool: string, params: unknown) => Promise<unknown>;
}

export interface Plugin extends PluginConfig, PluginHooks {}
