/**
 * Shell Integration Module
 *
 * Provides shell detection, environment management, and configuration
 * patching for seamless CLI integration across different shells.
 *
 * @module shell
 */

// =============================================================================
// Config Patching
// =============================================================================
export {
  isShellConfigured,
  patchShellConfig,
  removeShellConfig,
  ShellConfigPatcher,
} from "./config-patcher.js";

// =============================================================================
// Shell Detection
// =============================================================================
export {
  detectInstalledShells,
  detectShell,
  findExistingRcFile,
  getPrimaryRcFile,
  getShellConfig,
  getSupportedShells,
  isShellSupported,
} from "./detector.js";

// =============================================================================
// Environment Management
// =============================================================================
export {
  createEnvironmentManager,
  EnvironmentManager,
  generateEnvScript,
} from "./env-manager.js";
// =============================================================================
// Types
// =============================================================================
export {
  // Markers
  CONFIG_MARKERS,
  type ConfigPatchOperation,
  ConfigPatchOperationSchema,
  type EnvironmentPatch,
  EnvironmentPatchSchema,
  type EnvOperation,
  EnvOperationSchema,
  type EnvPatchEntry,
  EnvPatchEntrySchema,
  type PatchResult,
  PatchResultSchema,
  POWERSHELL_MARKERS,
  type ShellConfig,
  type ShellConfigPatch,
  ShellConfigPatchSchema,
  ShellConfigSchema,
  type ShellDetectionResult,
  ShellDetectionResultSchema,
  type ShellSetupOptions,
  ShellSetupOptionsSchema,
  type ShellSetupResult,
  ShellSetupResultSchema,
  type ShellType,
  ShellTypeSchema,
} from "./types.js";
