import type { LogLevel } from "../logger/types.js";

/**
 * Configuration for logging and telemetry behavior.
 */
export interface LoggingConfig {
  /** Minimum log level to output */
  level: LogLevel;
  /** Enable ANSI color codes in console output */
  colors: boolean;
  /** Include timestamps in log output */
  timestamps: boolean;
  /** Output logs in JSON format */
  json: boolean;
  /** Telemetry configuration */
  telemetry: {
    /** Whether telemetry collection is enabled */
    enabled: boolean;
    /** Sampling ratio for telemetry (0.0 to 1.0) */
    samplingRatio: number;
  };
}

/**
 * Development environment logging configuration.
 * - Debug level logging
 * - Colored output enabled
 * - Human-readable format
 * - Telemetry disabled
 */
export const developmentConfig: LoggingConfig = {
  level: "debug",
  colors: true,
  timestamps: true,
  json: false,
  telemetry: {
    enabled: false,
    samplingRatio: 1.0,
  },
};

/**
 * Production environment logging configuration.
 * - Info level logging (less verbose)
 * - No colors (for log aggregation)
 * - JSON format for parsing
 * - Telemetry enabled with 10% sampling
 */
export const productionConfig: LoggingConfig = {
  level: "info",
  colors: false,
  timestamps: true,
  json: true,
  telemetry: {
    enabled: true,
    samplingRatio: 0.1, // 10% sampling in production
  },
};

/**
 * Test environment logging configuration.
 * - Warn level (minimal output during tests)
 * - No colors
 * - Telemetry disabled
 */
export const testConfig: LoggingConfig = {
  level: "warn",
  colors: false,
  timestamps: false,
  json: false,
  telemetry: {
    enabled: false,
    samplingRatio: 0,
  },
};

/**
 * Get the appropriate logging configuration for an environment.
 *
 * @param env - Environment name (defaults to NODE_ENV or 'development')
 * @returns LoggingConfig for the specified environment
 *
 * @example
 * ```typescript
 * // Uses NODE_ENV
 * const config = getLoggingConfig();
 *
 * // Explicit environment
 * const prodConfig = getLoggingConfig('production');
 * ```
 */
export function getLoggingConfig(env?: string): LoggingConfig {
  const environment = env ?? process.env.NODE_ENV ?? "development";

  switch (environment) {
    case "production":
      return productionConfig;
    case "test":
      return testConfig;
    default:
      return developmentConfig;
  }
}

/**
 * Create a custom logging configuration by merging with defaults.
 *
 * @param overrides - Partial configuration to merge with defaults
 * @param baseEnv - Base environment to use for defaults
 * @returns Merged LoggingConfig
 */
export function createLoggingConfig(
  overrides: Partial<LoggingConfig>,
  baseEnv?: string
): LoggingConfig {
  const base = getLoggingConfig(baseEnv);

  return {
    ...base,
    ...overrides,
    telemetry: {
      ...base.telemetry,
      ...overrides.telemetry,
    },
  };
}
