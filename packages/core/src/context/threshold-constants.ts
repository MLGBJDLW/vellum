/**
 * Context Management System - Threshold Constants Module
 *
 * Provides constants and utilities for threshold validation and conversion.
 * These constants define the valid range for condense thresholds and
 * provide helper functions for working with percentage/decimal values.
 *
 * Features:
 * - Threshold range constants
 * - Value clamping and validation
 * - Percentage/decimal conversion
 *
 * @module @vellum/core/context/threshold-constants
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Minimum condense threshold (percentage).
 *
 * Setting threshold below this value would trigger compression too
 * aggressively, potentially losing important context.
 */
export const MIN_CONDENSE_THRESHOLD = 5;

/**
 * Maximum condense threshold (percentage).
 *
 * At 100%, compression would never trigger, which defeats
 * the purpose of context management.
 */
export const MAX_CONDENSE_THRESHOLD = 100;

/**
 * Default condense threshold if not specified (percentage).
 *
 * 75% provides a good balance between preserving context
 * and triggering compression before running out of space.
 */
export const DEFAULT_CONDENSE_THRESHOLD = 75;

// ============================================================================
// Validation
// ============================================================================

/**
 * Clamp threshold to valid range.
 *
 * Ensures the threshold value falls within the valid range
 * (MIN_CONDENSE_THRESHOLD to MAX_CONDENSE_THRESHOLD).
 *
 * @param value - The threshold value to clamp
 * @returns The clamped value within valid range
 *
 * @example
 * ```typescript
 * clampThreshold(50);   // 50 (within range)
 * clampThreshold(0);    // 5 (clamped to MIN)
 * clampThreshold(150);  // 100 (clamped to MAX)
 * clampThreshold(-10);  // 5 (clamped to MIN)
 * ```
 */
export function clampThreshold(value: number): number {
  // Handle NaN
  if (Number.isNaN(value)) {
    return DEFAULT_CONDENSE_THRESHOLD;
  }

  return Math.min(MAX_CONDENSE_THRESHOLD, Math.max(MIN_CONDENSE_THRESHOLD, value));
}

/**
 * Check if threshold is valid (within allowed range).
 *
 * A threshold is valid if it's a number between MIN_CONDENSE_THRESHOLD
 * and MAX_CONDENSE_THRESHOLD (inclusive).
 *
 * @param value - The threshold value to check
 * @returns True if the value is a valid threshold
 *
 * @example
 * ```typescript
 * isValidThreshold(50);   // true
 * isValidThreshold(5);    // true (MIN is valid)
 * isValidThreshold(100);  // true (MAX is valid)
 * isValidThreshold(0);    // false (below MIN)
 * isValidThreshold(101);  // false (above MAX)
 * isValidThreshold(NaN);  // false
 * ```
 */
export function isValidThreshold(value: number): boolean {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return false;
  }

  return value >= MIN_CONDENSE_THRESHOLD && value <= MAX_CONDENSE_THRESHOLD;
}

// ============================================================================
// Conversion
// ============================================================================

/**
 * Convert percentage (0-100) to decimal (0-1).
 *
 * Useful when converting user-facing percentage values to the
 * decimal ratios used internally by the threshold system.
 *
 * @param percent - Value as percentage (0-100)
 * @returns Value as decimal (0-1)
 *
 * @example
 * ```typescript
 * percentToDecimal(75);   // 0.75
 * percentToDecimal(100);  // 1.0
 * percentToDecimal(0);    // 0.0
 * percentToDecimal(33.3); // 0.333
 * ```
 */
export function percentToDecimal(percent: number): number {
  return percent / 100;
}

/**
 * Convert decimal (0-1) to percentage (0-100).
 *
 * Useful when converting internal decimal ratios to
 * user-facing percentage values for display.
 *
 * @param decimal - Value as decimal (0-1)
 * @returns Value as percentage (0-100)
 *
 * @example
 * ```typescript
 * decimalToPercent(0.75);  // 75
 * decimalToPercent(1.0);   // 100
 * decimalToPercent(0.0);   // 0
 * decimalToPercent(0.333); // 33.3
 * ```
 */
export function decimalToPercent(decimal: number): number {
  return decimal * 100;
}

// ============================================================================
// Additional Utilities
// ============================================================================

/**
 * Normalize a threshold value to valid range and convert to decimal.
 *
 * Combines clamping and conversion into a single operation.
 *
 * @param percentValue - Threshold as percentage (may be out of range)
 * @returns Clamped and converted decimal value
 *
 * @example
 * ```typescript
 * normalizeThreshold(75);   // 0.75
 * normalizeThreshold(0);    // 0.05 (clamped to MIN)
 * normalizeThreshold(150);  // 1.0 (clamped to MAX)
 * ```
 */
export function normalizeThreshold(percentValue: number): number {
  const clamped = clampThreshold(percentValue);
  return percentToDecimal(clamped);
}

/**
 * Get the default threshold as a decimal value.
 *
 * @returns Default threshold in decimal form (0-1)
 *
 * @example
 * ```typescript
 * getDefaultThresholdDecimal();  // 0.75
 * ```
 */
export function getDefaultThresholdDecimal(): number {
  return percentToDecimal(DEFAULT_CONDENSE_THRESHOLD);
}

/**
 * Create a percentage string from a threshold value.
 *
 * @param value - Threshold value (percentage)
 * @param decimals - Number of decimal places (default: 0)
 * @returns Formatted percentage string
 *
 * @example
 * ```typescript
 * formatThresholdPercent(75);      // '75%'
 * formatThresholdPercent(33.333);  // '33%'
 * formatThresholdPercent(33.333, 1); // '33.3%'
 * ```
 */
export function formatThresholdPercent(value: number, decimals: number = 0): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Parse a threshold from a string value.
 *
 * Accepts both percentage strings ('75%', '75') and decimal strings ('0.75').
 * Returns null if parsing fails.
 *
 * @param value - String value to parse
 * @returns Parsed percentage value (0-100), or null if invalid
 *
 * @example
 * ```typescript
 * parseThreshold('75');    // 75
 * parseThreshold('75%');   // 75
 * parseThreshold('0.75');  // 75 (interpreted as decimal)
 * parseThreshold('abc');   // null
 * ```
 */
export function parseThreshold(value: string): number | null {
  const trimmed = value.trim();

  // Remove % suffix if present
  const cleanValue = trimmed.endsWith("%") ? trimmed.slice(0, -1).trim() : trimmed;

  const num = parseFloat(cleanValue);

  if (Number.isNaN(num)) {
    return null;
  }

  // If value is between 0 and 1 (exclusive of edges for ambiguity),
  // treat as decimal and convert to percentage
  if (num > 0 && num < 1) {
    return decimalToPercent(num);
  }

  return num;
}

/**
 * Compare two threshold values for equality within epsilon.
 *
 * @param a - First threshold value
 * @param b - Second threshold value
 * @param epsilon - Tolerance for comparison (default: 0.001)
 * @returns True if values are equal within epsilon
 *
 * @example
 * ```typescript
 * thresholdEquals(75, 75);           // true
 * thresholdEquals(75, 75.0001);      // true (within epsilon)
 * thresholdEquals(75, 76);           // false
 * ```
 */
export function thresholdEquals(a: number, b: number, epsilon: number = 0.001): boolean {
  return Math.abs(a - b) < epsilon;
}
