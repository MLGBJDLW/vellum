/**
 * Context Management System - Profile-Based Thresholds Module
 *
 * Provides named threshold profiles for different use cases. Each profile
 * defines when context management actions should be triggered based on
 * the specific needs of the use case.
 *
 * Features:
 * - Predefined profiles for common use cases
 * - Profile validation
 * - Easy profile listing and retrieval
 *
 * @module @vellum/core/context/profile-thresholds
 */

import type { ThresholdConfig } from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Named threshold profile for a specific use case.
 *
 * Profiles encapsulate threshold configurations with descriptive metadata
 * to help users choose the right settings for their application.
 */
export interface ProfileThresholds {
  /** Display name for the profile */
  readonly name: string;
  /** Description of when to use this profile */
  readonly description: string;
  /** Threshold configuration values */
  readonly thresholds: ThresholdConfig;
}

// ============================================================================
// Default Profiles
// ============================================================================

/**
 * Default threshold profiles for different use cases.
 *
 * Each profile is optimized for specific scenarios:
 *
 * - **default**: Balanced settings suitable for most applications.
 *   Good balance between context preservation and memory management.
 *
 * - **code-review**: Conservative settings for detailed code analysis.
 *   Triggers actions earlier to preserve room for detailed responses.
 *
 * - **creative**: Aggressive settings for creative tasks.
 *   Maximizes available context for creative writing and brainstorming.
 *
 * - **minimal**: Very aggressive settings for short conversations.
 *   Best for quick Q&A or single-turn interactions.
 *
 * @example
 * ```typescript
 * const profile = DEFAULT_PROFILE_THRESHOLDS['code-review'];
 * console.log(profile.name);        // 'Code Review'
 * console.log(profile.thresholds);  // { warning: 0.65, critical: 0.75, overflow: 0.85 }
 * ```
 */
export const DEFAULT_PROFILE_THRESHOLDS: Record<string, ProfileThresholds> = {
  default: {
    name: "Default",
    description: "Balanced for general use",
    thresholds: {
      warning: 0.75,
      critical: 0.85,
      overflow: 0.95,
    },
  },
  "code-review": {
    name: "Code Review",
    description: "Conservative for detailed analysis",
    thresholds: {
      warning: 0.65,
      critical: 0.75,
      overflow: 0.85,
    },
  },
  creative: {
    name: "Creative",
    description: "Aggressive for creative tasks",
    thresholds: {
      warning: 0.85,
      critical: 0.92,
      overflow: 0.97,
    },
  },
  minimal: {
    name: "Minimal",
    description: "Very aggressive, short conversations",
    thresholds: {
      warning: 0.9,
      critical: 0.95,
      overflow: 0.98,
    },
  },
};

// ============================================================================
// Profile Retrieval
// ============================================================================

/**
 * Get threshold configuration for a named profile.
 *
 * Returns the threshold configuration for the specified profile name.
 * If the profile is not found, returns the 'default' profile thresholds.
 *
 * @param profileName - Name of the profile (case-sensitive)
 * @returns Threshold configuration for the profile
 *
 * @example
 * ```typescript
 * const thresholds = getProfileThreshold('code-review');
 * // { warning: 0.65, critical: 0.75, overflow: 0.85 }
 *
 * const unknown = getProfileThreshold('nonexistent');
 * // Returns default: { warning: 0.75, critical: 0.85, overflow: 0.95 }
 * ```
 */
export function getProfileThreshold(profileName: string): ThresholdConfig {
  const profile = DEFAULT_PROFILE_THRESHOLDS[profileName];

  if (profile) {
    return profile.thresholds;
  }

  // Fall back to default profile
  return (
    DEFAULT_PROFILE_THRESHOLDS.default?.thresholds ?? {
      warning: 0.75,
      critical: 0.85,
      overflow: 0.95,
    }
  );
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate a threshold configuration.
 *
 * Checks that:
 * - All three threshold values are present
 * - All values are numbers between 0 and 1
 * - Values are in order: warning < critical < overflow
 *
 * @param thresholds - Threshold configuration to validate
 * @returns True if the configuration is valid
 *
 * @example
 * ```typescript
 * // Valid configuration
 * validateProfileThreshold({ warning: 0.7, critical: 0.8, overflow: 0.9 });
 * // true
 *
 * // Invalid: warning > critical
 * validateProfileThreshold({ warning: 0.9, critical: 0.8, overflow: 0.95 });
 * // false
 *
 * // Invalid: value out of range
 * validateProfileThreshold({ warning: 1.5, critical: 0.85, overflow: 0.95 });
 * // false
 * ```
 */
export function validateProfileThreshold(thresholds: ThresholdConfig): boolean {
  // Check that all required fields exist and are numbers
  if (
    typeof thresholds.warning !== "number" ||
    typeof thresholds.critical !== "number" ||
    typeof thresholds.overflow !== "number"
  ) {
    return false;
  }

  const { warning, critical, overflow } = thresholds;

  // Check that values are in valid range (0 to 1)
  if (warning < 0 || warning > 1 || critical < 0 || critical > 1 || overflow < 0 || overflow > 1) {
    return false;
  }

  // Check that values are in correct order
  if (warning >= critical || critical >= overflow) {
    return false;
  }

  // Check for NaN
  if (Number.isNaN(warning) || Number.isNaN(critical) || Number.isNaN(overflow)) {
    return false;
  }

  return true;
}

// ============================================================================
// Profile Listing
// ============================================================================

/**
 * List all available profile names.
 *
 * Returns an array of profile name strings that can be passed to
 * `getProfileThreshold()`.
 *
 * @returns Array of available profile names
 *
 * @example
 * ```typescript
 * const profiles = listProfiles();
 * // ['default', 'code-review', 'creative', 'minimal']
 *
 * for (const name of profiles) {
 *   console.log(`${name}: ${getProfileThreshold(name).warning * 100}% warning`);
 * }
 * ```
 */
export function listProfiles(): string[] {
  return Object.keys(DEFAULT_PROFILE_THRESHOLDS);
}

// ============================================================================
// Additional Utilities
// ============================================================================

/**
 * Check if a profile name exists.
 *
 * @param profileName - Name to check
 * @returns True if the profile exists
 *
 * @example
 * ```typescript
 * profileExists('code-review');  // true
 * profileExists('unknown');       // false
 * ```
 */
export function profileExists(profileName: string): boolean {
  return profileName in DEFAULT_PROFILE_THRESHOLDS;
}

/**
 * Get full profile information including name and description.
 *
 * @param profileName - Name of the profile
 * @returns Full profile information, or undefined if not found
 *
 * @example
 * ```typescript
 * const profile = getProfileInfo('creative');
 * if (profile) {
 *   console.log(`${profile.name}: ${profile.description}`);
 * }
 * ```
 */
export function getProfileInfo(profileName: string): ProfileThresholds | undefined {
  return DEFAULT_PROFILE_THRESHOLDS[profileName];
}

/**
 * Get all profiles with their full information.
 *
 * @returns Array of all profile objects
 *
 * @example
 * ```typescript
 * const allProfiles = getAllProfiles();
 * for (const profile of allProfiles) {
 *   console.log(`${profile.name}: ${profile.description}`);
 * }
 * ```
 */
export function getAllProfiles(): ProfileThresholds[] {
  return Object.values(DEFAULT_PROFILE_THRESHOLDS);
}

/**
 * Create a custom profile from a threshold configuration.
 *
 * @param name - Display name for the profile
 * @param description - Description of the profile
 * @param thresholds - Threshold configuration
 * @returns ProfileThresholds object, or null if thresholds are invalid
 *
 * @example
 * ```typescript
 * const custom = createProfile(
 *   'Custom',
 *   'My custom thresholds',
 *   { warning: 0.6, critical: 0.7, overflow: 0.8 }
 * );
 * ```
 */
export function createProfile(
  name: string,
  description: string,
  thresholds: ThresholdConfig
): ProfileThresholds | null {
  if (!validateProfileThreshold(thresholds)) {
    return null;
  }

  return {
    name,
    description,
    thresholds,
  };
}
