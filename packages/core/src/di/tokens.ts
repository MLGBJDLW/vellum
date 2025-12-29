/**
 * Core DI Tokens
 *
 * Type-safe tokens for all core dependencies.
 * Used to register and resolve dependencies from the container.
 */

import type { Config, ConfigManager } from "../config/index.js";
import type { CredentialManager } from "../credentials/index.js";
import type { GlobalErrorHandler } from "../errors/index.js";
import type { EventBus } from "../events/index.js";
import type { IGitSnapshotService } from "../git/types.js";
import type { Logger } from "../logger/index.js";
import { Token } from "./container.js";

/**
 * Core dependency injection tokens.
 * Each token uniquely identifies a dependency type.
 */
export const Tokens = {
  /** Application configuration */
  Config: new Token<Config>("Config"),

  /** Configuration manager for loading/watching config */
  ConfigManager: new Token<ConfigManager>("ConfigManager"),

  /** Structured logger */
  Logger: new Token<Logger>("Logger"),

  /** Event bus for pub/sub messaging */
  EventBus: new Token<EventBus>("EventBus"),

  /** Global error handler */
  ErrorHandler: new Token<GlobalErrorHandler>("ErrorHandler"),

  /** Credential manager for secure credential storage */
  CredentialManager: new Token<CredentialManager>("CredentialManager"),

  /** T028: Git snapshot service for session state preservation */
  GitSnapshotService: new Token<IGitSnapshotService>("GitSnapshotService"),
} as const;
