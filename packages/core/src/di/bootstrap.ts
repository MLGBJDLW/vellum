/**
 * Bootstrap and Shutdown Functions
 *
 * Application lifecycle management for initializing and cleaning up
 * the dependency injection container with all core services.
 */

import { ConfigManager, type LoadConfigOptions, loadConfig } from "../config/index.js";
import { GlobalErrorHandler } from "../errors/index.js";
import { EventBus } from "../events/index.js";
import {
  GitOperations,
  type GitSnapshotConfig,
  GitSnapshotLock,
  GitSnapshotService,
} from "../git/index.js";
import { ConsoleTransport, FileTransport, Logger } from "../logger/index.js";
import { Container } from "./container.js";
import { Tokens } from "./tokens.js";

// ============================================
// T103, T105 - Bootstrap Options
// ============================================

/**
 * Options for bootstrapping the application container.
 */
export interface BootstrapOptions {
  /** Override the config file path */
  configPath?: string;
  /** Enable file logging to the specified path */
  logFile?: string;
  /** Enable debug mode (verbose logging, event validation) */
  debug?: boolean;
  /** Skip installing global exception handlers */
  skipGlobalHandlers?: boolean;
  /** T028: Working directory for git snapshot service (defaults to cwd) */
  workDir?: string;
  /** T028: Disable git snapshot service */
  disableGitSnapshots?: boolean;
}

// ============================================
// T104 - Global Exception Handler References
// ============================================

/** Stored reference to uncaughtException handler for cleanup */
let uncaughtExceptionHandler: ((error: Error) => void) | null = null;

/** Stored reference to unhandledRejection handler for cleanup */
let unhandledRejectionHandler: ((reason: unknown) => void) | null = null;

// ============================================
// T103, T104, T105 - Bootstrap Function
// ============================================

/**
 * Bootstrap the application by creating and populating the DI container.
 *
 * Creates and registers:
 * - Config and ConfigManager
 * - Logger with ConsoleTransport (and optionally FileTransport)
 * - EventBus
 * - GlobalErrorHandler
 *
 * Installs global exception handlers unless skipGlobalHandlers is true.
 *
 * @param options - Bootstrap configuration options
 * @returns Populated Container with all core services
 * @throws Error if config loading fails
 *
 * @example
 * ```typescript
 * const container = await bootstrap({
 *   debug: true,
 *   logFile: './logs/app.log',
 * });
 *
 * const logger = container.resolve(Tokens.Logger);
 * logger.info('Application started');
 *
 * // On shutdown
 * await shutdown(container);
 * ```
 */
export async function bootstrap(options: BootstrapOptions = {}): Promise<Container> {
  const container = new Container();

  // ----------------------------------------
  // T105 - Load Config with optional path override
  // ----------------------------------------
  const loadOptions: LoadConfigOptions = {};
  if (options.configPath) {
    // Set cwd to parent of configPath so findProjectConfig finds it
    loadOptions.cwd = options.configPath;
  }

  const configResult = loadConfig(loadOptions);
  if (!configResult.ok) {
    throw new Error(`Failed to load config: ${configResult.error.message}`);
  }
  const config = configResult.value;

  // Create ConfigManager for watching
  const configManagerResult = await ConfigManager.create(loadOptions);
  if (!configManagerResult.ok) {
    throw new Error(`Failed to create ConfigManager: ${configManagerResult.error.message}`);
  }
  const configManager = configManagerResult.value;

  container.registerValue(Tokens.Config, config);
  container.registerValue(Tokens.ConfigManager, configManager);

  // ----------------------------------------
  // T105 - Create Logger with transports
  // ----------------------------------------
  const logLevel = options.debug ? "debug" : (config.logLevel ?? "info");
  const logger = new Logger({ level: logLevel });

  // Always add console transport
  logger.addTransport(new ConsoleTransport({ colors: true }));

  // T105 - Add file transport if logFile specified
  if (options.logFile) {
    logger.addTransport(new FileTransport({ path: options.logFile }));
  }

  container.registerValue(Tokens.Logger, logger);

  // ----------------------------------------
  // T105 - Create EventBus with debug mode
  // ----------------------------------------
  const eventBus = new EventBus({ debug: options.debug ?? false });
  container.registerValue(Tokens.EventBus, eventBus);

  // ----------------------------------------
  // Create GlobalErrorHandler
  // ----------------------------------------
  const errorHandler = new GlobalErrorHandler({
    logger,
    eventBus,
  });
  container.registerValue(Tokens.ErrorHandler, errorHandler);

  // ----------------------------------------
  // T028 - Register GitSnapshotService as singleton
  // ----------------------------------------
  if (!options.disableGitSnapshots) {
    container.registerSingleton(Tokens.GitSnapshotService, () => {
      const workDir = options.workDir ?? process.cwd();
      const gitConfig: GitSnapshotConfig = {
        enabled: true,
        workDir,
        autoSnapshotIntervalMs: 0,
        maxSnapshots: 100,
        customExclusions: [],
        includeUntracked: true,
        commitMessagePrefix: "[vellum-snapshot]",
        lockTimeoutMs: 30000,
      };

      const operations = new GitOperations(workDir);
      const lock = new GitSnapshotLock(gitConfig.lockTimeoutMs);

      // Note: Pass undefined for eventBus since GitSnapshotEventBus expects
      // string-based event names while core EventBus uses EventDefinition<T>.
      // Git snapshot events are optional - the service works without them.
      return new GitSnapshotService(gitConfig, logger, undefined, operations, lock);
    });
  }

  // ----------------------------------------
  // T104 - Install global exception handlers
  // ----------------------------------------
  if (!options.skipGlobalHandlers) {
    installGlobalHandlers(errorHandler, logger);
  }

  return container;
}

/**
 * Install global process exception handlers.
 * @internal
 */
function installGlobalHandlers(errorHandler: GlobalErrorHandler, logger: Logger): void {
  // Remove any existing handlers first
  removeGlobalHandlers();

  uncaughtExceptionHandler = (error: Error): void => {
    errorHandler.handle(error);
    logger.error("Uncaught exception", { error: error.message, stack: error.stack });
  };

  unhandledRejectionHandler = (reason: unknown): void => {
    errorHandler.handle(reason);
    const message = reason instanceof Error ? reason.message : String(reason);
    logger.error("Unhandled rejection", { reason: message });
  };

  process.on("uncaughtException", uncaughtExceptionHandler);
  process.on("unhandledRejection", unhandledRejectionHandler);
}

/**
 * Remove global process exception handlers.
 * @internal
 */
function removeGlobalHandlers(): void {
  if (uncaughtExceptionHandler) {
    process.off("uncaughtException", uncaughtExceptionHandler);
    uncaughtExceptionHandler = null;
  }

  if (unhandledRejectionHandler) {
    process.off("unhandledRejection", unhandledRejectionHandler);
    unhandledRejectionHandler = null;
  }
}

// ============================================
// T106 - Shutdown Function
// ============================================

/**
 * Gracefully shutdown the application and clean up resources.
 *
 * Performs:
 * - Flushes logger buffers
 * - Disposes ConfigManager (stops file watcher)
 * - Clears container registrations
 * - Removes global exception handlers
 *
 * Safe to call with undefined container or multiple times.
 *
 * @param container - The container to shutdown (optional)
 *
 * @example
 * ```typescript
 * const container = await bootstrap();
 * // ... application runs ...
 * await shutdown(container);
 * ```
 */
export async function shutdown(container?: Container): Promise<void> {
  if (container) {
    // Flush logger
    const logger = container.tryResolve(Tokens.Logger);
    if (logger) {
      await logger.flush();
    }

    // Dispose ConfigManager (stops file watcher)
    const configManager = container.tryResolve(Tokens.ConfigManager);
    if (configManager) {
      configManager.dispose();
    }

    // Clear container
    container.clear();
  }

  // Always remove global handlers
  removeGlobalHandlers();
}

/**
 * Check if global exception handlers are currently installed.
 * Useful for testing.
 * @internal
 */
export function hasGlobalHandlers(): boolean {
  return uncaughtExceptionHandler !== null || unhandledRejectionHandler !== null;
}
