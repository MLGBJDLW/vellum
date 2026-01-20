/**
 * Trust Manager for Vellum
 *
 * Manages trust presets and effective permission configuration.
 * Handles override priority: CLI > environment > config > default.
 * Implements REQ-016: Workspace allowlist security.
 *
 * @module @vellum/core/permission
 */

import { TrustedFoldersManager } from "./trusted-folders.js";
import { type PermissionConfig, resolvePermissionConfig, type TrustPreset } from "./types.js";

// ============================================
// Types
// ============================================

/**
 * Source of a trust configuration.
 */
export type TrustSource = "cli" | "env" | "config" | "default";

/**
 * Options for TrustPresetManager initialization.
 */
export interface TrustPresetManagerOptions {
  /** CLI-provided preset (highest priority) */
  cliPreset?: TrustPreset;
  /** Environment variable preset */
  envPreset?: TrustPreset;
  /** Config file preset */
  configPreset?: TrustPreset;
  /** Full config from config file */
  config?: PermissionConfig;
  /** Trusted folders manager instance */
  trustedFolders?: TrustedFoldersManager;
  /** Current workspace path (for trust verification) */
  workspacePath?: string;
  /** Callback for yolo mode confirmation (REQ-016) */
  confirmYoloMode?: () => Promise<boolean>;
}

/**
 * Result of trust level determination.
 */
export interface TrustResult {
  /** The effective trust preset */
  preset: TrustPreset;
  /** Source of the preset (for debugging/display) */
  source: TrustSource;
  /** Whether the preset was capped for security */
  wasCapped: boolean;
  /** Original preset before capping (if capped) */
  originalPreset?: TrustPreset;
  /** Reason for capping (if capped) */
  capReason?: string;
}

/**
 * Result of yolo mode confirmation.
 */
export interface YoloConfirmResult {
  /** Whether yolo mode was confirmed */
  confirmed: boolean;
  /** Final preset to use */
  effectivePreset: TrustPreset;
  /** Reason for the result */
  reason: string;
}

// ============================================
// Constants
// ============================================

/**
 * Environment variable for trust preset.
 */
export const TRUST_ENV_VAR = "VELLUM_TRUST_PRESET";

/**
 * Trust levels ordered from most to least restrictive.
 */
const TRUST_ORDER: readonly TrustPreset[] = [
  "paranoid",
  "cautious",
  "default",
  "relaxed",
  "yolo",
] as const;

// ============================================
// TrustManager
// ============================================

/**
 * Manages trust presets and effective configuration.
 *
 * Features:
 * - Override priority: CLI > environment > config > default
 * - Workspace trust capping for security
 * - Yolo mode explicit confirmation (REQ-016)
 * - Trusted folders integration
 *
 * @example
 * ```typescript
 * const manager = new TrustPresetManager({
 *   cliPreset: 'cautious',  // Highest priority
 *   envPreset: 'default',   // From VELLUM_TRUST_PRESET
 *   configPreset: 'relaxed' // From config file
 * });
 *
 * const result = manager.getEffectivePreset();
 * // { preset: 'cautious', source: 'cli', wasCapped: false }
 *
 * const config = manager.getEffectiveConfig();
 * // Full permission config based on preset
 * ```
 */
export class TrustPresetManager {
  readonly #cliPreset?: TrustPreset;
  readonly #envPreset?: TrustPreset;
  readonly #configPreset?: TrustPreset;
  readonly #config?: PermissionConfig;
  readonly #trustedFolders: TrustedFoldersManager;
  readonly #workspacePath?: string;
  readonly #confirmYoloCallback?: () => Promise<boolean>;

  #yoloConfirmed: boolean = false;
  #wasWorkspaceTrustCapped: boolean = false;
  #capReason?: string;

  /**
   * Creates a new TrustPresetManager.
   *
   * @param options - Configuration options
   */
  constructor(options: TrustPresetManagerOptions = {}) {
    this.#cliPreset = options.cliPreset;
    this.#envPreset = options.envPreset ?? this.#getEnvPreset();
    this.#configPreset = options.configPreset ?? options.config?.preset;
    this.#config = options.config;
    this.#trustedFolders = options.trustedFolders ?? new TrustedFoldersManager();
    this.#workspacePath = options.workspacePath;
    this.#confirmYoloCallback = options.confirmYoloMode;
  }

  /**
   * Get the effective trust preset with priority resolution.
   *
   * Priority: CLI > environment > config > default
   *
   * @returns Trust result with preset and source information
   */
  getEffectivePreset(): TrustResult {
    let preset: TrustPreset;
    let source: TrustSource;

    // Apply priority: CLI > env > config > default
    if (this.#cliPreset) {
      preset = this.#cliPreset;
      source = "cli";
    } else if (this.#envPreset) {
      preset = this.#envPreset;
      source = "env";
    } else if (this.#configPreset) {
      preset = this.#configPreset;
      source = "config";
    } else {
      preset = "default";
      source = "default";
    }

    // Check if workspace trust should cap the preset
    const cappedResult = this.#applyWorkspaceTrustCap(preset, source);

    return cappedResult;
  }

  /**
   * Get the full effective permission configuration.
   *
   * Combines the preset with any explicit config overrides.
   *
   * @returns Resolved permission configuration
   */
  getEffectiveConfig(): Omit<PermissionConfig, "preset"> {
    const { preset } = this.getEffectivePreset();

    // Start with base config from preset
    const baseConfig: PermissionConfig = {
      preset,
      ...this.#config,
    };

    // Resolve to full config
    return resolvePermissionConfig(baseConfig);
  }

  /**
   * Check if the workspace trust was capped.
   *
   * This happens when:
   * - The workspace is not in a trusted folder
   * - A high-trust preset was requested
   *
   * @returns Whether trust was capped for security
   */
  wasWorkspaceTrustCapped(): boolean {
    // Ensure we've computed the effective preset
    this.getEffectivePreset();
    return this.#wasWorkspaceTrustCapped;
  }

  /**
   * Get the reason for trust capping.
   *
   * @returns Reason string or undefined if not capped
   */
  getCapReason(): string | undefined {
    this.getEffectivePreset();
    return this.#capReason;
  }

  /**
   * Confirm yolo mode (REQ-016).
   *
   * Yolo mode requires explicit confirmation because it bypasses
   * all safety checks. This method should be called when the user
   * requests yolo mode to ensure they understand the risks.
   *
   * @returns Confirmation result
   */
  async confirmYoloMode(): Promise<YoloConfirmResult> {
    const { preset } = this.getEffectivePreset();

    // Only confirm if yolo mode is requested
    if (preset !== "yolo") {
      return {
        confirmed: true,
        effectivePreset: preset,
        reason: "Yolo mode not requested",
      };
    }

    // If already confirmed, skip
    if (this.#yoloConfirmed) {
      return {
        confirmed: true,
        effectivePreset: "yolo",
        reason: "Yolo mode already confirmed",
      };
    }

    // If no callback provided, require explicit confirmation
    if (!this.#confirmYoloCallback) {
      return {
        confirmed: false,
        effectivePreset: "relaxed", // Fall back to relaxed
        reason: "Yolo mode requires explicit confirmation (no callback provided)",
      };
    }

    // Call confirmation callback
    try {
      const confirmed = await this.#confirmYoloCallback();

      if (confirmed) {
        this.#yoloConfirmed = true;
        return {
          confirmed: true,
          effectivePreset: "yolo",
          reason: "Yolo mode confirmed by user",
        };
      } else {
        return {
          confirmed: false,
          effectivePreset: "relaxed", // Fall back to relaxed
          reason: "Yolo mode rejected by user",
        };
      }
    } catch {
      return {
        confirmed: false,
        effectivePreset: "relaxed",
        reason: "Yolo mode confirmation failed",
      };
    }
  }

  /**
   * Check if the current workspace is trusted.
   *
   * @returns Whether the workspace is in a trusted folder
   */
  isWorkspaceTrusted(): boolean {
    if (!this.#workspacePath) {
      return false;
    }
    return this.#trustedFolders.isTrusted(this.#workspacePath);
  }

  /**
   * Get the trusted folders manager.
   */
  get trustedFolders(): TrustedFoldersManager {
    return this.#trustedFolders;
  }

  /**
   * Check if yolo mode has been confirmed.
   */
  get isYoloConfirmed(): boolean {
    return this.#yoloConfirmed;
  }

  /**
   * Reset yolo confirmation (for testing or session reset).
   */
  resetYoloConfirmation(): void {
    this.#yoloConfirmed = false;
  }

  /**
   * Compare trust levels.
   *
   * @param a - First preset
   * @param b - Second preset
   * @returns Negative if a is more restrictive, positive if less restrictive, 0 if equal
   */
  static compareTrustLevels(a: TrustPreset, b: TrustPreset): number {
    const indexA = TRUST_ORDER.indexOf(a);
    const indexB = TRUST_ORDER.indexOf(b);
    return indexA - indexB;
  }

  /**
   * Get a more restrictive preset.
   *
   * @param preset - Current preset
   * @returns The next more restrictive preset, or the same if already most restrictive
   */
  static getMoreRestrictive(preset: TrustPreset): TrustPreset {
    const index = TRUST_ORDER.indexOf(preset);
    if (index <= 0) return TRUST_ORDER[0] as TrustPreset;
    return TRUST_ORDER[index - 1] as TrustPreset;
  }

  /**
   * Get a less restrictive preset.
   *
   * @param preset - Current preset
   * @returns The next less restrictive preset, or the same if already least restrictive
   */
  static getLessRestrictive(preset: TrustPreset): TrustPreset {
    const index = TRUST_ORDER.indexOf(preset);
    if (index >= TRUST_ORDER.length - 1) return TRUST_ORDER[TRUST_ORDER.length - 1] as TrustPreset;
    return TRUST_ORDER[index + 1] as TrustPreset;
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Get preset from environment variable.
   */
  #getEnvPreset(): TrustPreset | undefined {
    const envValue = process.env[TRUST_ENV_VAR];
    if (!envValue) return undefined;

    const normalized = envValue.toLowerCase().trim() as TrustPreset;
    if (TRUST_ORDER.includes(normalized)) {
      return normalized;
    }

    return undefined;
  }

  /**
   * Apply workspace trust capping.
   *
   * If the workspace is not trusted, cap the preset to 'default'.
   */
  #applyWorkspaceTrustCap(preset: TrustPreset, source: TrustSource): TrustResult {
    // Reset cap tracking
    this.#wasWorkspaceTrustCapped = false;
    this.#capReason = undefined;

    // If no workspace path, can't apply capping
    if (!this.#workspacePath) {
      return { preset, source, wasCapped: false };
    }

    // Check if workspace is trusted
    const isWorkspaceTrusted = this.#trustedFolders.isTrusted(this.#workspacePath);

    // If workspace is trusted, allow any preset
    if (isWorkspaceTrusted) {
      return { preset, source, wasCapped: false };
    }

    // For untrusted workspaces, cap to 'default' if more permissive
    const presetIndex = TRUST_ORDER.indexOf(preset);
    const defaultIndex = TRUST_ORDER.indexOf("default");

    if (presetIndex > defaultIndex) {
      this.#wasWorkspaceTrustCapped = true;
      this.#capReason = `Workspace "${this.#workspacePath}" is not in a trusted folder. Trust level capped from "${preset}" to "default".`;

      return {
        preset: "default",
        source,
        wasCapped: true,
        originalPreset: preset,
        capReason: this.#capReason,
      };
    }

    return { preset, source, wasCapped: false };
  }
}

/**
 * Create a TrustPresetManager from environment and config.
 *
 * Convenience factory function.
 *
 * @param options - Options for the manager
 * @returns Configured TrustPresetManager
 */
export function createTrustPresetManager(
  options: TrustPresetManagerOptions = {}
): TrustPresetManager {
  return new TrustPresetManager(options);
}

// ============================================
// Backward Compatibility Aliases (deprecated)
// ============================================

/** @deprecated Use TrustPresetManagerOptions instead */
export type TrustManagerOptions = TrustPresetManagerOptions;

/** @deprecated Use createTrustPresetManager instead */
export const createTrustManager = createTrustPresetManager;

/** @deprecated Use TrustPresetManager instead */
export { TrustPresetManager as TrustManager };
