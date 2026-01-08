/**
 * Shell Integration Types
 *
 * Type definitions for shell detection, environment management,
 * and shell configuration patching.
 *
 * @module shell/types
 */

import { z } from "zod";

// =============================================================================
// Shell Type Definitions
// =============================================================================

/**
 * Supported shell types
 */
export const ShellTypeSchema = z.enum(["bash", "zsh", "fish", "powershell", "pwsh", "cmd"]);

/** Inferred type for shell types */
export type ShellType = z.infer<typeof ShellTypeSchema>;

/**
 * Shell detection result
 */
export const ShellDetectionResultSchema = z.object({
  /** Detected shell type */
  shell: ShellTypeSchema,
  /** Full path to shell executable */
  path: z.string(),
  /** Shell version (if available) */
  version: z.string().optional(),
  /** Whether this is the user's default shell */
  isDefault: z.boolean().default(false),
});

/** Inferred type for shell detection result */
export type ShellDetectionResult = z.infer<typeof ShellDetectionResultSchema>;

// =============================================================================
// Shell Configuration
// =============================================================================

/**
 * Shell configuration file locations
 */
export const ShellConfigSchema = z.object({
  /** Shell type */
  shell: ShellTypeSchema,
  /** RC file path(s) - order matters for loading */
  rcFiles: z.array(z.string()),
  /** Profile file path(s) - loaded at login */
  profileFiles: z.array(z.string()),
  /** Completion directory (for drop-in completions) */
  completionDir: z.string().optional(),
  /** Environment variable for PATH modification */
  pathVar: z.string().default("PATH"),
  /** Command to export environment variables */
  exportCommand: z.string(),
  /** Comment prefix for shell scripts */
  commentPrefix: z.string().default("#"),
});

/** Inferred type for shell configuration */
export type ShellConfig = z.infer<typeof ShellConfigSchema>;

// =============================================================================
// Environment Patch
// =============================================================================

/**
 * Environment variable operation type
 */
export const EnvOperationSchema = z.enum(["set", "append", "prepend", "unset"]);

/** Inferred type for environment operation */
export type EnvOperation = z.infer<typeof EnvOperationSchema>;

/**
 * Single environment variable patch
 */
export const EnvPatchEntrySchema = z.object({
  /** Variable name */
  name: z.string(),
  /** Operation to perform */
  operation: EnvOperationSchema,
  /** Value for the operation (not needed for unset) */
  value: z.string().optional(),
  /** Separator for append/prepend (default: platform path separator) */
  separator: z.string().optional(),
});

/** Inferred type for environment patch entry */
export type EnvPatchEntry = z.infer<typeof EnvPatchEntrySchema>;

/**
 * Collection of environment patches to apply
 */
export const EnvironmentPatchSchema = z.object({
  /** Unique identifier for this patch set */
  id: z.string(),
  /** Human-readable description */
  description: z.string().optional(),
  /** Environment variable patches */
  entries: z.array(EnvPatchEntrySchema),
  /** Target shells (empty = all shells) */
  targetShells: z.array(ShellTypeSchema).default([]),
});

/** Inferred type for environment patch */
export type EnvironmentPatch = z.infer<typeof EnvironmentPatchSchema>;

// =============================================================================
// Config Patch
// =============================================================================

/**
 * Markers used to identify Vellum config blocks in shell rc files
 */
export const CONFIG_MARKERS = {
  /** Start marker for Vellum config block */
  START: "# >>> vellum initialize >>>",
  /** End marker for Vellum config block */
  END: "# <<< vellum initialize <<<",
  /** Warning message about auto-generation */
  WARNING: "# !! Contents within this block are managed by Vellum. Do not edit. !!",
} as const;

/**
 * PowerShell-specific markers
 */
export const POWERSHELL_MARKERS = {
  /** Start marker for Vellum config block */
  START: "# >>> vellum initialize >>>",
  /** End marker for Vellum config block */
  END: "# <<< vellum initialize <<<",
  /** Warning message about auto-generation */
  WARNING: "# !! Contents within this block are managed by Vellum. Do not edit. !!",
} as const;

/**
 * Config patch operation type
 */
export const ConfigPatchOperationSchema = z.enum(["add", "remove", "update"]);

/** Inferred type for config patch operation */
export type ConfigPatchOperation = z.infer<typeof ConfigPatchOperationSchema>;

/**
 * Shell config patch definition
 */
export const ShellConfigPatchSchema = z.object({
  /** Target shell type */
  shell: ShellTypeSchema,
  /** Target file path */
  filePath: z.string(),
  /** Operation to perform */
  operation: ConfigPatchOperationSchema,
  /** Content to add/update (not needed for remove) */
  content: z.string().optional(),
  /** Whether to create backup before patching */
  createBackup: z.boolean().default(true),
});

/** Inferred type for shell config patch */
export type ShellConfigPatch = z.infer<typeof ShellConfigPatchSchema>;

/**
 * Result of a config patch operation
 */
export const PatchResultSchema = z.object({
  /** Whether the operation succeeded */
  success: z.boolean(),
  /** Target file that was patched */
  filePath: z.string(),
  /** Backup file path (if created) */
  backupPath: z.string().optional(),
  /** Operation that was performed */
  operation: ConfigPatchOperationSchema,
  /** Error message if failed */
  error: z.string().optional(),
  /** Whether the file was created (didn't exist before) */
  fileCreated: z.boolean().default(false),
});

/** Inferred type for patch result */
export type PatchResult = z.infer<typeof PatchResultSchema>;

// =============================================================================
// Shell Setup Options
// =============================================================================

/**
 * Options for shell setup command
 */
export const ShellSetupOptionsSchema = z.object({
  /** Target shell (auto-detect if not specified) */
  shell: ShellTypeSchema.optional(),
  /** Add Vellum to PATH */
  addToPath: z.boolean().default(true),
  /** Install shell completions */
  installCompletions: z.boolean().default(true),
  /** Create backup of existing config */
  backup: z.boolean().default(true),
  /** Force overwrite existing config */
  force: z.boolean().default(false),
  /** Dry run (show what would be done) */
  dryRun: z.boolean().default(false),
});

/** Inferred type for shell setup options */
export type ShellSetupOptions = z.infer<typeof ShellSetupOptionsSchema>;

/**
 * Result of shell setup operation
 */
export const ShellSetupResultSchema = z.object({
  /** Whether setup succeeded */
  success: z.boolean(),
  /** Shell that was configured */
  shell: ShellTypeSchema,
  /** Files that were modified */
  modifiedFiles: z.array(z.string()),
  /** Backup files created */
  backupFiles: z.array(z.string()),
  /** Error message if failed */
  error: z.string().optional(),
  /** Instructions for user (e.g., "restart shell") */
  instructions: z.array(z.string()).default([]),
});

/** Inferred type for shell setup result */
export type ShellSetupResult = z.infer<typeof ShellSetupResultSchema>;
