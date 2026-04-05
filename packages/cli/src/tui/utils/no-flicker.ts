/**
 * No-Flicker Configuration
 *
 * Controls anti-flicker optimizations including DEC 2026 synchronized output,
 * alternate buffer usage, and cursor management.
 *
 * Environment variables:
 * - VELLUM_NO_FLICKER=1 — Forces all anti-flicker optimizations on
 * - VELLUM_NO_FLICKER=0 — Forces all anti-flicker optimizations off
 * - (unset) — Auto-detect based on terminal capabilities
 *
 * Mouse control:
 * - VELLUM_DISABLE_MOUSE=1 — Disables mouse capture entirely
 * - VELLUM_DISABLE_MOUSE_CLICKS=1 — Disables clicks/drags but keeps wheel scroll
 *
 * @module tui/utils/no-flicker
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { supportsSynchronizedOutput } from "./detectTerminal.js";

// =============================================================================
// Settings Integration
// =============================================================================

/**
 * Load noFlicker-related settings from ~/.vellum/settings.json.
 * Returns undefined fields for any missing/invalid values.
 */
function loadNoFlickerSettings(): {
  mouseEnabled?: boolean;
  mouseClicksEnabled?: boolean;
} {
  try {
    const settingsPath = path.join(os.homedir(), ".vellum", "settings.json");
    if (!fs.existsSync(settingsPath)) return {};
    const content = fs.readFileSync(settingsPath, "utf-8");
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const nf = parsed.noFlicker as Record<string, unknown> | undefined;
    if (!nf || typeof nf !== "object") return {};
    return {
      mouseEnabled: typeof nf.mouseEnabled === "boolean" ? nf.mouseEnabled : undefined,
      mouseClicksEnabled:
        typeof nf.mouseClicksEnabled === "boolean" ? nf.mouseClicksEnabled : undefined,
    };
  } catch {
    return {};
  }
}

// =============================================================================
// Types
// =============================================================================

/**
 * Resolved mouse mode for the TUI.
 * - 'full': Click + wheel (default when NO_FLICKER enabled)
 * - 'wheel-only': Wheel scroll only, no clicks (safe default)
 * - 'disabled': No mouse capture at all
 */
export type MouseMode = "full" | "wheel-only" | "disabled";

/**
 * Configuration for anti-flicker optimizations.
 */
export interface NoFlickerConfig {
  /** Whether to wrap frames in BSU/ESU (DEC 2026) */
  readonly synchronizedOutput: boolean;
  /** Whether to use alternate screen buffer by default */
  readonly alternateBuffer: boolean;
  /** Whether to lock cursor during frame renders */
  readonly cursorLock: boolean;
  /** Whether mouse capture is disabled entirely */
  readonly mouseDisabled: boolean;
  /** Whether mouse clicks/drags are disabled (wheel scroll still works) */
  readonly mouseClicksDisabled: boolean;
  /** Resolved mouse mode: 'full' | 'wheel-only' | 'disabled' */
  readonly mouseMode: MouseMode;
}

// =============================================================================
// Environment Variable Parsing
// =============================================================================

/**
 * Parse a boolean-like environment variable.
 * Returns true for "1", "true", "yes"; false for "0", "false", "no"; undefined otherwise.
 */
function parseBoolEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const lower = value.toLowerCase();
  if (lower === "1" || lower === "true" || lower === "yes") return true;
  if (lower === "0" || lower === "false" || lower === "no") return false;
  return undefined;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Check if the NO_FLICKER mode is enabled.
 *
 * Priority:
 * 1. VELLUM_NO_FLICKER=1 → forced on
 * 2. VELLUM_NO_FLICKER=0 → forced off
 * 3. Auto-detect from terminal capabilities
 */
export function isNoFlickerEnabled(): boolean {
  const forced = parseBoolEnv(process.env.VELLUM_NO_FLICKER);
  if (forced !== undefined) return forced;

  // Auto-detect: enable if terminal supports synchronized output
  return supportsSynchronizedOutput();
}

/**
 * Get the full anti-flicker configuration.
 *
 * When NO_FLICKER is enabled, all optimizations are turned on.
 * When disabled, all optimizations are turned off.
 * Mouse settings are independent and always respected.
 *
 * Priority: env vars > settings file > defaults.
 * - VELLUM_DISABLE_MOUSE=1 → disabled
 * - VELLUM_DISABLE_MOUSE_CLICKS=1 → wheel-only
 * - NO_FLICKER enabled → full (click + wheel)
 * - NO_FLICKER not enabled → wheel-only (safe default)
 */
export function getNoFlickerConfig(): NoFlickerConfig {
  const noFlicker = isNoFlickerEnabled();

  // Load settings file (low priority, env vars override)
  const settings = loadNoFlickerSettings();

  // Env vars take priority, then settings, then defaults
  const envMouseDisabled = parseBoolEnv(process.env.VELLUM_DISABLE_MOUSE);
  const envClicksDisabled = parseBoolEnv(process.env.VELLUM_DISABLE_MOUSE_CLICKS);

  // Resolve mouseDisabled: env > settings > false
  const mouseDisabled =
    envMouseDisabled ?? (settings.mouseEnabled !== undefined ? !settings.mouseEnabled : false);

  // Resolve mouseClicksDisabled: env > settings > (depends on noFlicker)
  const mouseClicksDisabled =
    mouseDisabled ||
    (envClicksDisabled ??
      (settings.mouseClicksEnabled !== undefined ? !settings.mouseClicksEnabled : !noFlicker)); // Default: clicks disabled unless NO_FLICKER is on

  // Resolve mouseMode
  let mouseMode: MouseMode;
  if (mouseDisabled) {
    mouseMode = "disabled";
  } else if (mouseClicksDisabled) {
    mouseMode = "wheel-only";
  } else {
    mouseMode = "full";
  }

  return {
    synchronizedOutput: noFlicker,
    alternateBuffer: noFlicker,
    cursorLock: noFlicker,
    mouseDisabled,
    mouseClicksDisabled,
    mouseMode,
  };
}
