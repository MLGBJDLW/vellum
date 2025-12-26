import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import { Err, Ok, type Result } from "../types/result.js";
import {
  type ConfigError,
  findProjectConfig,
  type LoadConfigOptions,
  loadConfig,
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
 *
 * @example
 * ```typescript
 * const result = await ConfigManager.create({ cwd: '/my/project' });
 * if (result.ok) {
 *   const manager = result.value;
 *   manager.on('change', (newConfig) => {
 *     console.log('Config changed:', newConfig);
 *   });
 *   manager.watch();
 *
 *   // Access config
 *   const llm = manager.get('llm');
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

  /**
   * Private constructor - use ConfigManager.create() instead
   */
  private constructor(config: Config, options: LoadConfigOptions = {}) {
    this.config = config;
    this.options = options;
  }

  /**
   * Create a new ConfigManager instance
   *
   * @param options - Configuration loading options
   * @returns Result with ConfigManager on success, ConfigError on failure
   *
   * @example
   * ```typescript
   * const result = await ConfigManager.create({
   *   cwd: '/my/project',
   *   overrides: { debug: true }
   * });
   * if (result.ok) {
   *   const manager = result.value;
   *   console.log(manager.get('llm').provider);
   * }
   * ```
   */
  static async create(
    options: LoadConfigOptions = {}
  ): Promise<Result<ConfigManager, ConfigError>> {
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
