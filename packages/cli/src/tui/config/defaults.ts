/**
 * Sandbox Configuration Defaults
 *
 * Centralized configuration constants for sandbox execution.
 * All values can be overridden via function parameters or environment variables.
 *
 * @module cli/tui/config/defaults
 */

// =============================================================================
// Environment Variable Helpers
// =============================================================================

/**
 * Parse numeric environment variable with fallback.
 */
function parseEnvNumber(key: string, fallback: number): number {
  const value = process.env[key];
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Parse boolean environment variable with fallback.
 */
function parseEnvBoolean(key: string, fallback: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return fallback;
  return value === "true" || value === "1";
}

// =============================================================================
// Size Constants (in bytes)
// =============================================================================

/** 1 Megabyte in bytes */
const MB = 1024 * 1024;

// =============================================================================
// Sandbox Resource Defaults
// =============================================================================

/**
 * Default sandbox resource limits.
 */
export const SANDBOX_RESOURCES = {
  /** Default execution timeout in milliseconds (30s) */
  TIMEOUT_MS: parseEnvNumber("VELLUM_SANDBOX_TIMEOUT_MS", 30_000),

  /** Additional wall time buffer beyond CPU timeout (5s) */
  WALL_TIME_BUFFER_MS: parseEnvNumber("VELLUM_SANDBOX_WALL_TIME_BUFFER_MS", 5_000),

  /** Maximum memory limit in bytes (512MB) */
  MEMORY_BYTES: parseEnvNumber("VELLUM_SANDBOX_MEMORY_BYTES", 512 * MB),

  /** Maximum output size in bytes (1MB) */
  MAX_OUTPUT_BYTES: parseEnvNumber("VELLUM_SANDBOX_MAX_OUTPUT_BYTES", 1 * MB),

  /** Maximum single file size in bytes (50MB) */
  MAX_FILE_SIZE_BYTES: parseEnvNumber("VELLUM_SANDBOX_MAX_FILE_SIZE_BYTES", 50 * MB),

  /** Maximum disk usage in bytes (100MB) */
  MAX_DISK_USAGE_BYTES: parseEnvNumber("VELLUM_SANDBOX_MAX_DISK_USAGE_BYTES", 100 * MB),

  /** Maximum number of file descriptors */
  MAX_FILE_DESCRIPTORS: parseEnvNumber("VELLUM_SANDBOX_MAX_FILE_DESCRIPTORS", 100),

  /** Maximum number of spawned processes */
  MAX_PROCESSES: parseEnvNumber("VELLUM_SANDBOX_MAX_PROCESSES", 10),
} as const;

/**
 * Default sandbox permission settings.
 */
export const SANDBOX_PERMISSIONS = {
  /** Allow network access by default */
  ALLOW_NETWORK: parseEnvBoolean("VELLUM_SANDBOX_ALLOW_NETWORK", false),

  /** Allow file system access by default */
  ALLOW_FILE_SYSTEM: parseEnvBoolean("VELLUM_SANDBOX_ALLOW_FILE_SYSTEM", true),

  /** Use overlay filesystem */
  USE_OVERLAY: parseEnvBoolean("VELLUM_SANDBOX_USE_OVERLAY", false),

  /** Enable audit logging */
  ENABLE_AUDIT: parseEnvBoolean("VELLUM_SANDBOX_ENABLE_AUDIT", false),
} as const;

/**
 * Default security paths to deny access.
 * These paths are blocked for security reasons.
 */
export const SANDBOX_DENIED_PATHS = ["/etc/passwd", "/etc/shadow"] as const;

// =============================================================================
// Aggregated Defaults
// =============================================================================

/**
 * Complete sandbox defaults configuration.
 * Import and spread to apply all defaults with optional overrides.
 *
 * @example
 * ```typescript
 * import { SANDBOX_DEFAULTS } from './config/defaults';
 *
 * const config = {
 *   ...SANDBOX_DEFAULTS.resources,
 *   timeoutMs: 60_000, // Override timeout
 * };
 * ```
 */
export const SANDBOX_DEFAULTS = {
  /** Resource limits */
  resources: SANDBOX_RESOURCES,
  /** Permission settings */
  permissions: SANDBOX_PERMISSIONS,
  /** Denied filesystem paths */
  deniedPaths: SANDBOX_DENIED_PATHS,
} as const;

// =============================================================================
// Type Exports
// =============================================================================

/** Type for sandbox resource configuration */
export type SandboxResourceConfig = typeof SANDBOX_RESOURCES;

/** Type for sandbox permission configuration */
export type SandboxPermissionConfig = typeof SANDBOX_PERMISSIONS;

/** Type for complete sandbox defaults */
export type SandboxDefaultsConfig = typeof SANDBOX_DEFAULTS;
