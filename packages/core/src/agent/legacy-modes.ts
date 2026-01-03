// ============================================
// Legacy Mode Mapping - Backward Compatibility
// ============================================

import type { CodingMode } from "./coding-modes.js";

/**
 * Result of normalizing a mode name.
 *
 * Contains the normalized mode along with metadata about whether
 * the input was a legacy name and any temperature overrides.
 *
 * @example
 * ```typescript
 * const result = normalizeMode('code');
 * // { mode: 'vibe', wasLegacy: true, originalName: 'code' }
 *
 * const result2 = normalizeMode('draft');
 * // { mode: 'vibe', wasLegacy: true, originalName: 'draft', temperatureOverride: 0.8 }
 * ```
 */
export interface NormalizationResult {
  /** The normalized CodingMode */
  mode: CodingMode;
  /** Whether the input was a legacy mode name */
  wasLegacy: boolean;
  /** The original input name */
  originalName: string;
  /** Optional temperature override for legacy modes that had different temps */
  temperatureOverride?: number;
}

/**
 * Entry in the legacy mode map.
 *
 * @internal
 */
interface LegacyMapEntry {
  /** The target CodingMode */
  mode: CodingMode;
  /** Optional temperature override */
  temperature?: number;
}

/**
 * Mapping of legacy mode names to new CodingModes.
 *
 * The legacy five-mode system is mapped to the new three-mode system:
 * - `code` → `vibe` (fast autonomous coding)
 * - `draft` → `vibe` with temperature 0.8 (creative)
 * - `debug` → `vibe` with temperature 0.1 (precise)
 * - `ask` → `plan` (conversational planning)
 * - `plan` → `plan` (identity mapping)
 *
 * @example
 * ```typescript
 * import { LEGACY_MODE_MAP } from './legacy-modes';
 *
 * const entry = LEGACY_MODE_MAP['code'];
 * // { mode: 'vibe' }
 *
 * const draftEntry = LEGACY_MODE_MAP['draft'];
 * // { mode: 'vibe', temperature: 0.8 }
 * ```
 */
export const LEGACY_MODE_MAP: Readonly<Record<string, LegacyMapEntry>> = {
  code: { mode: "vibe" },
  draft: { mode: "vibe", temperature: 0.8 },
  debug: { mode: "vibe", temperature: 0.1 },
  ask: { mode: "plan" },
  plan: { mode: "plan" },
} as const;

/**
 * All legacy mode names as a readonly array.
 *
 * Useful for validation and iteration.
 *
 * @example
 * ```typescript
 * LEGACY_MODES.includes('code'); // true
 * LEGACY_MODES.includes('vibe'); // false
 * ```
 */
export const LEGACY_MODES = Object.keys(LEGACY_MODE_MAP) as readonly string[];

/**
 * Valid CodingMode values for validation.
 */
const VALID_CODING_MODES: readonly CodingMode[] = ["vibe", "plan", "spec"];

/**
 * Checks if a string is a valid CodingMode.
 *
 * @param mode - The mode string to check
 * @returns True if the mode is a valid CodingMode
 *
 * @example
 * ```typescript
 * isValidCodingMode('vibe'); // true
 * isValidCodingMode('code'); // false (legacy name)
 * ```
 */
export function isValidCodingMode(mode: string): mode is CodingMode {
  return VALID_CODING_MODES.includes(mode as CodingMode);
}

/**
 * Checks if a string is a legacy mode name.
 *
 * @param mode - The mode string to check
 * @returns True if the mode is a legacy name
 *
 * @example
 * ```typescript
 * isLegacyMode('code'); // true
 * isLegacyMode('vibe'); // false
 * ```
 */
export function isLegacyMode(mode: string): boolean {
  return mode in LEGACY_MODE_MAP && !isValidCodingMode(mode);
}

/**
 * Converts a legacy mode name to a new CodingMode.
 *
 * Returns the new CodingMode for the legacy name, or undefined
 * if the input is not a recognized legacy mode.
 *
 * @param legacy - The legacy mode name to convert
 * @returns The corresponding CodingMode, or undefined if not found
 *
 * @example
 * ```typescript
 * legacyToNewMode('code');   // 'vibe'
 * legacyToNewMode('draft');  // 'vibe'
 * legacyToNewMode('debug');  // 'vibe'
 * legacyToNewMode('ask');    // 'plan'
 * legacyToNewMode('plan');   // 'plan'
 * legacyToNewMode('vibe');   // undefined (not a legacy name)
 * legacyToNewMode('foo');    // undefined (unknown)
 * ```
 */
export function legacyToNewMode(legacy: string): CodingMode | undefined {
  const entry = LEGACY_MODE_MAP[legacy];
  return entry?.mode;
}

/**
 * Emits a deprecation warning for legacy mode usage.
 *
 * Logs a warning message when a legacy mode name is used.
 * Can be suppressed by setting `VELLUM_SUPPRESS_DEPRECATION=true`.
 *
 * @param legacyName - The legacy mode name that was used
 * @param newName - The new mode name that should be used instead
 *
 * @example
 * ```typescript
 * emitDeprecationWarning('code', 'vibe');
 * // Console: ⚠️ 'code' mode is deprecated. Use 'vibe' instead.
 *
 * // With VELLUM_SUPPRESS_DEPRECATION=true, no warning is emitted
 * ```
 */
export function emitDeprecationWarning(legacyName: string, newName: CodingMode): void {
  // Check if deprecation warnings should be suppressed
  if (process.env.VELLUM_SUPPRESS_DEPRECATION === "true") {
    return;
  }

  console.warn(`⚠️ '${legacyName}' mode is deprecated. Use '${newName}' instead.`);
}

/**
 * Error thrown when an invalid mode name is provided.
 *
 * @example
 * ```typescript
 * throw new InvalidModeError('foo', ['vibe', 'plan', 'spec', 'code', 'draft', 'debug', 'ask']);
 * // Error: Invalid mode 'foo'. Valid options: vibe, plan, spec, code, draft, debug, ask
 * ```
 */
export class InvalidModeError extends Error {
  /** The invalid mode name that was provided */
  readonly invalidMode: string;
  /** List of valid mode options */
  readonly validOptions: readonly string[];

  constructor(mode: string, validOptions: readonly string[]) {
    const optionsList = validOptions.join(", ");
    super(`Invalid mode '${mode}'. Valid options: ${optionsList}`);
    this.name = "InvalidModeError";
    this.invalidMode = mode;
    this.validOptions = validOptions;
  }
}

/**
 * Normalizes a mode name to a CodingMode.
 *
 * Accepts both legacy mode names and new CodingMode names.
 * Returns a NormalizationResult containing the normalized mode
 * and metadata about the conversion.
 *
 * When a legacy mode is used:
 * - Sets `wasLegacy: true`
 * - Emits a deprecation warning (unless suppressed)
 * - May include a `temperatureOverride` for modes like 'draft' or 'debug'
 *
 * @param input - The mode name to normalize (legacy or new)
 * @returns NormalizationResult with the normalized mode and metadata
 * @throws InvalidModeError if the input is not a valid mode name
 *
 * @example
 * ```typescript
 * // New mode names pass through
 * normalizeMode('vibe');
 * // { mode: 'vibe', wasLegacy: false, originalName: 'vibe' }
 *
 * // Legacy names are converted
 * normalizeMode('code');
 * // { mode: 'vibe', wasLegacy: true, originalName: 'code' }
 *
 * // Legacy modes with temperature overrides
 * normalizeMode('draft');
 * // { mode: 'vibe', wasLegacy: true, originalName: 'draft', temperatureOverride: 0.8 }
 *
 * normalizeMode('debug');
 * // { mode: 'vibe', wasLegacy: true, originalName: 'debug', temperatureOverride: 0.1 }
 *
 * // Invalid modes throw
 * normalizeMode('foo');
 * // throws InvalidModeError
 * ```
 */
export function normalizeMode(input: string): NormalizationResult {
  // Check if it's already a valid new mode
  if (isValidCodingMode(input)) {
    return {
      mode: input,
      wasLegacy: false,
      originalName: input,
    };
  }

  // Check if it's a legacy mode
  const legacyEntry = LEGACY_MODE_MAP[input];
  if (legacyEntry) {
    // Emit deprecation warning
    emitDeprecationWarning(input, legacyEntry.mode);

    const result: NormalizationResult = {
      mode: legacyEntry.mode,
      wasLegacy: true,
      originalName: input,
    };

    // Include temperature override if present
    if (legacyEntry.temperature !== undefined) {
      result.temperatureOverride = legacyEntry.temperature;
    }

    return result;
  }

  // Invalid mode - throw error with valid options
  const validOptions = [
    ...VALID_CODING_MODES,
    ...LEGACY_MODES.filter((m) => !isValidCodingMode(m)),
  ];
  throw new InvalidModeError(input, validOptions);
}

/**
 * Gets the temperature override for a legacy mode, if any.
 *
 * @param legacyMode - The legacy mode name
 * @returns The temperature override, or undefined if none
 *
 * @example
 * ```typescript
 * getLegacyTemperature('draft'); // 0.8
 * getLegacyTemperature('debug'); // 0.1
 * getLegacyTemperature('code');  // undefined
 * ```
 */
export function getLegacyTemperature(legacyMode: string): number | undefined {
  return LEGACY_MODE_MAP[legacyMode]?.temperature;
}
