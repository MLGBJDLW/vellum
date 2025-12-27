import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import type { CredentialManager } from "../credentials/manager.js";
import type { Credential } from "../credentials/types.js";
import { Err, Ok, type Result } from "../types/result.js";
import {
  type ConfigError,
  findProjectConfig,
  type LoadConfigOptions,
  loadConfig,
  loadConfigWithCredentials,
} from "./loader.js";
import type { Config } from "./schema.js";

// ============================================
// T040-T042: ConfigManager Implementation
// ============================================

/**
 * Event types emitted by ConfigManager
 */
export interface ConfigManagerEvents {
  /** Emitted when config file changes */
  change: [config: Config];
  /** Emitted when watch encounters an error */
  error: [error: Error];
  /** Emitted when credential is resolved (T025) */
  credentialResolved: [provider: string, credential: Credential];
  /** Emitted when deprecated apiKey is used (T024) */
  deprecatedApiKeyUsed: [provider: string];
}

/**
 * Typed EventEmitter for ConfigManager
 */
export interface ConfigManagerEmitter {
  on<K extends keyof ConfigManagerEvents>(
    event: K,
    listener: (...args: ConfigManagerEvents[K]) => void
  ): this;
  off<K extends keyof ConfigManagerEvents>(
    event: K,
    listener: (...args: ConfigManagerEvents[K]) => void
  ): this;
  emit<K extends keyof ConfigManagerEvents>(event: K, ...args: ConfigManagerEvents[K]): boolean;
  removeAllListeners(event?: keyof ConfigManagerEvents): this;
}

/**
 * ConfigManager - Manages application configuration with file watching
 *
 * Provides:
 * - Type-safe access to configuration values
 * - File watching for hot-reload support
 * - Event-based change notifications
 * - Credential resolution via CredentialManager (T025)
 * - Interactive credential wizard support (T023)
 * - Deprecation warnings for legacy apiKey usage (T024)
 *
 * @example
 * ```typescript
 * const result = await ConfigManager.create({
 *   cwd: '/my/project',
 *   credentialManager: myCredentialManager,
 *   interactive: true
 * });
 * if (result.ok) {
 *   const manager = result.value;
 *   manager.on('change', (newConfig) => {
 *     console.log('Config changed:', newConfig);
 *   });
 *   manager.on('credentialResolved', (provider, cred) => {
 *     console.log(`Credential resolved for ${provider}`);
 *   });
 *   manager.watch();
 *
 *   // Access config
 *   const llm = manager.get('llm');
 *
 *   // Access resolved credential
 *   const credential = manager.getCredential();
 *
 *   // Cleanup when done
 *   manager.dispose();
 * }
 * ```
 */
export class ConfigManager implements ConfigManagerEmitter {
  private readonly emitter = new EventEmitter();
  private config: Config;
  private watcher: fs.FSWatcher | null = null;
  private watchedPath: string | null = null;
  private readonly options: LoadConfigOptions;
  private disposed = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // T025: Credential management
  private credentialManager: CredentialManager | null = null;
  private resolvedCredential: Credential | null = null;
  private usedDeprecatedApiKey = false;

  /**
   * Private constructor - use ConfigManager.create() instead
   */
  private constructor(
    config: Config,
    options: LoadConfigOptions = {},
    credentialManager: CredentialManager | null = null,
    resolvedCredential: Credential | null = null,
    usedDeprecatedApiKey = false
  ) {
    this.config = config;
    this.options = options;
    this.credentialManager = credentialManager;
    this.resolvedCredential = resolvedCredential;
    this.usedDeprecatedApiKey = usedDeprecatedApiKey;
  }

  /**
   * Create a new ConfigManager instance
   *
   * If a CredentialManager is provided, this will also resolve credentials
   * for the configured provider (T025). In interactive mode with a prompt
   * callback, missing credentials can be collected from the user (T023).
   *
   * @param options - Configuration loading options
   * @returns Result with ConfigManager on success, ConfigError on failure
   *
   * @example
   * ```typescript
   * // Basic usage
   * const result = await ConfigManager.create({
   *   cwd: '/my/project',
   *   overrides: { debug: true }
   * });
   *
   * // With credential resolution
   * const result = await ConfigManager.create({
   *   cwd: '/my/project',
   *   credentialManager: myCredentialManager,
   *   interactive: true,
   *   promptCredential: async (provider, opts) => {
   *     const key = await askUser(`Enter API key for ${opts.displayName}:`);
   *     return { provider, type: 'api_key', value: key };
   *   }
   * });
   *
   * if (result.ok) {
   *   const manager = result.value;
   *   console.log(manager.get('llm').provider);
   *   console.log(manager.getCredential()?.value); // Resolved API key
   * }
   * ```
   */
  static async create(
    options: LoadConfigOptions = {}
  ): Promise<Result<ConfigManager, ConfigError>> {
    // T025: Use credential-aware loading if CredentialManager is provided
    if (options.credentialManager) {
      const result = await loadConfigWithCredentials(options);

      if (!result.ok) {
        return Err(result.error);
      }

      const { config, credentialResolved, usedDeprecatedApiKey, credential } = result.value;

      const manager = new ConfigManager(
        config,
        options,
        options.credentialManager,
        credential,
        usedDeprecatedApiKey
      );

      // Emit events for credential resolution state
      if (credentialResolved && credential) {
        manager.emit("credentialResolved", config.llm.provider, credential);
      }

      if (usedDeprecatedApiKey) {
        manager.emit("deprecatedApiKeyUsed", config.llm.provider);
      }

      return Ok(manager);
    }

    // Standard loading without credential resolution
    const result = loadConfig(options);

    if (!result.ok) {
      return Err(result.error);
    }

    return Ok(new ConfigManager(result.value, options));
  }

  /**
   * Get a specific configuration section
   *
   * @param key - Configuration key to retrieve
   * @returns The configuration value for the given key
   *
   * @example
   * ```typescript
   * const llm = manager.get('llm');
   * console.log(llm.provider); // 'anthropic'
   * ```
   */
  get<K extends keyof Config>(key: K): Config[K] {
    return this.config[key];
  }

  /**
   * Get the complete configuration object (readonly)
   *
   * @returns Readonly copy of the entire configuration
   *
   * @example
   * ```typescript
   * const config = manager.getAll();
   * console.log(config.llm.provider);
   * ```
   */
  getAll(): Readonly<Config> {
    return Object.freeze({ ...this.config });
  }

  // ============================================
  // T025: Credential Access Methods
  // ============================================

  /**
   * Get the resolved credential for the current provider
   *
   * Returns the credential resolved via CredentialManager during initialization.
   * May be null if no credential was found or CredentialManager wasn't provided.
   *
   * @returns The resolved Credential or null
   *
   * @example
   * ```typescript
   * const credential = manager.getCredential();
   * if (credential) {
   *   console.log(`Using ${credential.type} from ${credential.source}`);
   *   // credential.value contains the actual secret
   * }
   * ```
   */
  getCredential(): Credential | null {
    return this.resolvedCredential;
  }

  /**
   * Check if deprecated apiKey field is being used
   *
   * Returns true if the config uses the deprecated apiKey field instead of
   * credential resolution. Use this to show migration prompts.
   *
   * @returns Whether deprecated apiKey is in use
   *
   * @example
   * ```typescript
   * if (manager.isUsingDeprecatedApiKey()) {
   *   console.log('Consider migrating to credential field');
   * }
   * ```
   */
  isUsingDeprecatedApiKey(): boolean {
    return this.usedDeprecatedApiKey;
  }

  /**
   * Get the CredentialManager instance (if configured)
   *
   * @returns The CredentialManager or null
   */
  getCredentialManager(): CredentialManager | null {
    return this.credentialManager;
  }

  /**
   * Get the effective API key for the provider
   *
   * Resolves the API key from credential or deprecated apiKey field.
   * This is a convenience method for providers that just need the key string.
   *
   * @returns The API key string or null if not available
   *
   * @example
   * ```typescript
   * const apiKey = manager.getEffectiveApiKey();
   * if (apiKey) {
   *   const client = new AnthropicClient({ apiKey });
   * }
   * ```
   */
  getEffectiveApiKey(): string | null {
    // Prefer resolved credential
    if (this.resolvedCredential && this.resolvedCredential.type === "api_key") {
      return this.resolvedCredential.value;
    }

    // Fall back to deprecated apiKey field
    if (this.config.llm.apiKey) {
      return this.config.llm.apiKey;
    }

    return null;
  }

  // ============================================
  // T041: Config File Watching
  // ============================================

  /**
   * Start watching config files for changes
   *
   * Watches the project config file (if found) and emits 'change' events
   * when the file is modified. Automatically reloads and validates
   * the configuration on changes.
   *
   * @example
   * ```typescript
   * manager.on('change', (newConfig) => {
   *   console.log('Config reloaded:', newConfig.llm.provider);
   * });
   * manager.on('error', (err) => {
   *   console.error('Watch error:', err);
   * });
   * manager.watch();
   * ```
   */
  watch(): void {
    // Don't start watching if already disposed or already watching
    if (this.disposed || this.watcher) {
      return;
    }

    // Find the config file to watch
    const configPath = findProjectConfig(this.options.cwd);
    if (!configPath) {
      // No config file to watch - emit error but don't crash
      this.emitter.emit("error", new Error("No config file found to watch"));
      return;
    }

    this.watchedPath = configPath;

    try {
      this.watcher = fs.watch(configPath, (eventType) => {
        // Handle both 'change' and 'rename' events
        // 'rename' can occur when editors save by writing to temp file then rename
        if (eventType === "change" || eventType === "rename") {
          this.handleFileChange();
        }
      });

      // Handle watcher errors
      this.watcher.on("error", (error) => {
        this.emitter.emit("error", error);
      });
    } catch (error) {
      this.emitter.emit("error", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Handle config file change with debouncing
   */
  private handleFileChange(): void {
    // Debounce rapid changes (e.g., from editor save operations)
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.reloadConfig();
    }, 100);
  }

  /**
   * Reload configuration from files
   */
  private reloadConfig(): void {
    // Check if file still exists (might have been deleted)
    if (this.watchedPath && !fs.existsSync(this.watchedPath)) {
      this.emitter.emit("error", new Error(`Config file deleted: ${this.watchedPath}`));
      return;
    }

    const result = loadConfig(this.options);

    if (!result.ok) {
      // Emit error but keep old config
      this.emitter.emit("error", new Error(`Config reload failed: ${result.error.message}`));
      return;
    }

    // Update config and emit change event
    this.config = result.value;
    this.emitter.emit("change", this.config);
  }

  // ============================================
  // T042: Dispose Method
  // ============================================

  /**
   * Stop watching and clean up resources
   *
   * Safe to call multiple times. After dispose(), the manager
   * can no longer watch for changes but get() still works.
   *
   * @example
   * ```typescript
   * manager.watch();
   * // ... later
   * manager.dispose(); // Stops watching
   * manager.dispose(); // Safe to call again
   * ```
   */
  dispose(): void {
    // Idempotent - safe to call multiple times
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    // Clear debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Stop file watcher
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    // Remove all event listeners
    this.emitter.removeAllListeners();

    this.watchedPath = null;
  }

  // ============================================
  // EventEmitter Interface
  // ============================================

  /**
   * Register an event listener
   */
  on<K extends keyof ConfigManagerEvents>(
    event: K,
    listener: (...args: ConfigManagerEvents[K]) => void
  ): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  /**
   * Remove an event listener
   */
  off<K extends keyof ConfigManagerEvents>(
    event: K,
    listener: (...args: ConfigManagerEvents[K]) => void
  ): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  /**
   * Emit an event
   */
  emit<K extends keyof ConfigManagerEvents>(event: K, ...args: ConfigManagerEvents[K]): boolean {
    return this.emitter.emit(event, ...args);
  }

  /**
   * Remove all listeners for an event
   */
  removeAllListeners(event?: keyof ConfigManagerEvents): this {
    this.emitter.removeAllListeners(event);
    return this;
  }
}
