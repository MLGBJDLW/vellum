// ============================================
// McpConfigManager - Configuration File Management
// ============================================

import fs from "node:fs/promises";
import { type FSWatcher, watch } from "chokidar";
import { CONFIG_WATCH_DEBOUNCE_MS } from "./constants.js";
import { expandEnvironmentVariables } from "./env-expansion.js";
import { type McpSettingsConfig, validateMcpSettings } from "./schemas.js";

// ============================================
// Types
// ============================================

/**
 * Configuration options for McpConfigManager.
 */
export interface McpConfigManagerOptions {
  /**
   * Function to get global config path asynchronously.
   */
  globalConfigPath: () => Promise<string>;

  /**
   * Function to get project-specific config path (optional).
   */
  projectConfigPath?: () => Promise<string | undefined>;

  /**
   * Debounce delay for config changes (ms).
   * Defaults to CONFIG_WATCH_DEBOUNCE_MS (500ms).
   */
  debounceMs?: number;
}

/**
 * Handler for configuration change events.
 */
export interface McpConfigChangeHandler {
  /**
   * Called when config changes and needs reload.
   * @param global - Validated global config or null on error
   * @param project - Validated project config or null on error/missing
   */
  onConfigReload(
    global: McpSettingsConfig | null,
    project: McpSettingsConfig | null
  ): Promise<void>;
}

/**
 * Result of reading and validating a config file.
 */
export interface ConfigReadResult {
  success: boolean;
  data?: McpSettingsConfig;
  error?: string;
}

// ============================================
// McpConfigManager Class
// ============================================

/**
 * Manages MCP configuration file reading, validation, and watching.
 *
 * Responsibilities:
 * - Read and validate MCP settings files (global and project)
 * - Watch for file changes with debouncing
 * - Notify handler when config changes
 *
 * @example
 * ```typescript
 * const configManager = new McpConfigManager({
 *   globalConfigPath: () => Promise.resolve('~/.vellum/mcp.json'),
 *   projectConfigPath: () => Promise.resolve('.vellum/mcp.json'),
 * });
 *
 * configManager.setChangeHandler({
 *   onConfigReload: async (global, project) => {
 *     // Handle reload
 *   }
 * });
 *
 * await configManager.startWatching();
 * // ... later
 * await configManager.stopWatching();
 * ```
 */
export class McpConfigManager {
  // Config path functions
  private readonly globalConfigPath: () => Promise<string>;
  private readonly projectConfigPath?: () => Promise<string | undefined>;

  // Watchers
  private globalConfigWatcher?: FSWatcher;
  private projectConfigWatcher?: FSWatcher;

  // Debounce state
  private reloadDebounceTimer?: ReturnType<typeof setTimeout>;
  private pendingReload = false;

  // Handler
  private changeHandler?: McpConfigChangeHandler;

  // Options
  private readonly debounceMs: number;

  // Disposed flag
  private isDisposed = false;

  constructor(options: McpConfigManagerOptions) {
    this.globalConfigPath = options.globalConfigPath;
    this.projectConfigPath = options.projectConfigPath;
    this.debounceMs = options.debounceMs ?? CONFIG_WATCH_DEBOUNCE_MS;
  }

  // ============================================
  // Public API
  // ============================================

  /**
   * Set the handler for config reload events.
   * @param handler - Handler to receive reload notifications
   */
  setChangeHandler(handler: McpConfigChangeHandler): void {
    this.changeHandler = handler;
  }

  /**
   * Read and validate MCP settings from a file.
   * Handles missing files gracefully by returning empty configuration.
   *
   * @param filePath - Absolute path to the configuration file
   * @returns Validation result with parsed data or error
   */
  async readAndValidate(filePath: string): Promise<ConfigReadResult> {
    try {
      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        // File doesn't exist - return empty config (not an error)
        return {
          success: true,
          data: { mcpServers: {} },
        };
      }

      // Read file contents
      const content = await fs.readFile(filePath, "utf-8");

      // Handle empty file
      if (!content.trim()) {
        return {
          success: true,
          data: { mcpServers: {} },
        };
      }

      // Parse JSON
      let rawConfig: unknown;
      try {
        rawConfig = JSON.parse(content);
      } catch (parseError) {
        return {
          success: false,
          error: `Invalid JSON in ${filePath}: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
        };
      }

      // Validate with Zod schema
      const validationResult = validateMcpSettings(rawConfig);

      if (!validationResult.success || !validationResult.data) {
        return {
          success: false,
          error: `Configuration validation failed for ${filePath}:\n${validationResult.errors?.join("\n")}`,
        };
      }

      // Expand environment variables in the config
      const expandedData = expandEnvironmentVariables(validationResult.data);

      return {
        success: true,
        data: expandedData as McpSettingsConfig,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to read ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Start watching config files for changes.
   * Sets up file watchers with debounced change handling.
   */
  async startWatching(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    const globalPath = await this.globalConfigPath();

    // Watch global config file
    this.globalConfigWatcher = watch(globalPath, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 50,
        pollInterval: 10,
      },
    });

    this.globalConfigWatcher.on("change", () => {
      this.handleConfigChange();
    });

    this.globalConfigWatcher.on("add", () => {
      this.handleConfigChange();
    });

    this.globalConfigWatcher.on("unlink", () => {
      this.handleConfigChange();
    });

    // Watch project config if available
    if (this.projectConfigPath) {
      const projectPath = await this.projectConfigPath();
      if (projectPath) {
        this.projectConfigWatcher = watch(projectPath, {
          ignoreInitial: true,
          awaitWriteFinish: {
            stabilityThreshold: 50,
            pollInterval: 10,
          },
        });

        this.projectConfigWatcher.on("change", () => {
          this.handleConfigChange();
        });

        this.projectConfigWatcher.on("add", () => {
          this.handleConfigChange();
        });

        this.projectConfigWatcher.on("unlink", () => {
          this.handleConfigChange();
        });
      }
    }
  }

  /**
   * Stop watching and cleanup all resources.
   */
  async stopWatching(): Promise<void> {
    this.isDisposed = true;

    // Clear pending reload timer
    if (this.reloadDebounceTimer) {
      clearTimeout(this.reloadDebounceTimer);
      this.reloadDebounceTimer = undefined;
    }

    // Close watchers
    await this.globalConfigWatcher?.close();
    await this.projectConfigWatcher?.close();
    this.globalConfigWatcher = undefined;
    this.projectConfigWatcher = undefined;
  }

  /**
   * Force a config reload.
   * Bypasses debouncing and immediately triggers reload.
   */
  async forceReload(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    // Clear any pending debounced reload
    if (this.reloadDebounceTimer) {
      clearTimeout(this.reloadDebounceTimer);
      this.reloadDebounceTimer = undefined;
    }
    this.pendingReload = false;

    await this.performReload();
  }

  /**
   * Get current config paths.
   * @returns Object with global and optional project paths
   */
  async getConfigPaths(): Promise<{ global: string; project?: string }> {
    const globalPath = await this.globalConfigPath();
    const projectPath = this.projectConfigPath ? await this.projectConfigPath() : undefined;
    return {
      global: globalPath,
      project: projectPath,
    };
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Handle config file change with debouncing.
   */
  private handleConfigChange(): void {
    if (this.isDisposed) {
      return;
    }

    // Clear any pending reload
    if (this.reloadDebounceTimer) {
      clearTimeout(this.reloadDebounceTimer);
    }

    // Set pending flag
    this.pendingReload = true;

    // Debounce the reload
    this.reloadDebounceTimer = setTimeout(async () => {
      if (!this.pendingReload || this.isDisposed) {
        return;
      }

      this.pendingReload = false;

      try {
        await this.performReload();
      } catch (error) {
        console.error("Failed to reload MCP configuration:", error);
      }
    }, this.debounceMs);
  }

  /**
   * Perform the actual config reload and notify handler.
   */
  private async performReload(): Promise<void> {
    if (!this.changeHandler) {
      return;
    }

    // Read global config
    const globalPath = await this.globalConfigPath();
    const globalConfig = await this.readAndValidate(globalPath);

    if (!globalConfig.success) {
      console.error("Failed to read global config:", globalConfig.error);
    }

    // Read project config if available
    let projectConfig: ConfigReadResult = { success: true, data: { mcpServers: {} } };
    if (this.projectConfigPath) {
      const projectPath = await this.projectConfigPath();
      if (projectPath) {
        projectConfig = await this.readAndValidate(projectPath);
        if (!projectConfig.success) {
          console.error("Failed to read project config:", projectConfig.error);
        }
      }
    }

    // Notify handler
    await this.changeHandler.onConfigReload(
      globalConfig.success ? (globalConfig.data ?? null) : null,
      projectConfig.success ? (projectConfig.data ?? null) : null
    );
  }
}
