/**
 * ModeIndicator Component (T043, T044)
 *
 * TUI component for displaying the current coding mode with visual styling.
 * Shows mode icon, name, and optional spec phase progress.
 *
 * @module tui/components/ModeIndicator
 */

import type { CodingMode, SpecPhase } from "@vellum/core";
import { SPEC_PHASE_CONFIG, SPEC_PHASES } from "@vellum/core";
import { getIcons } from "@vellum/shared";
import { Box, Text } from "ink";
import type React from "react";
import { useMemo } from "react";
import { useTheme } from "../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Props for the ModeIndicator component.
 */
export interface ModeIndicatorProps {
  /** The current coding mode */
  readonly mode: CodingMode;
  /** Current spec phase (only for spec mode, 1-6) */
  readonly specPhase?: number;
  /** Whether to show in compact mode (icon only) */
  readonly compact?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Get mode icons for each coding mode.
 * Uses centralized icon system with auto-detection.
 */
function getModeIcons(): Record<CodingMode, string> {
  const icons = getIcons();
  return {
    vibe: icons.vibe,
    plan: icons.plan,
    spec: icons.spec,
  };
}

/**
 * Mode display names.
 */
const MODE_NAMES: Record<CodingMode, string> = {
  vibe: "vibe",
  plan: "plan",
  spec: "spec",
} as const;

/**
 * Mode colors mapped to theme semantic colors.
 * - vibe: green (success) - fast, autonomous
 * - plan: blue (info) - structured planning
 * - spec: purple (primary) - detailed specification
 */
const MODE_COLOR_KEYS: Record<CodingMode, "success" | "info" | "primary"> = {
  vibe: "success",
  plan: "info",
  spec: "primary",
} as const;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the color for a coding mode from the theme.
 */
function getModeColor(mode: CodingMode, theme: ReturnType<typeof useTheme>["theme"]): string {
  const colorKey = MODE_COLOR_KEYS[mode];
  return theme.colors[colorKey];
}

/**
 * Get the phase name from phase number.
 */
function getPhaseName(phaseNumber: number): string {
  const phase = SPEC_PHASES[phaseNumber - 1] as SpecPhase | undefined;
  if (!phase) {
    return `Phase ${phaseNumber}`;
  }
  return SPEC_PHASE_CONFIG[phase].name;
}

// =============================================================================
// ModeIndicator Component
// =============================================================================

/**
 * ModeIndicator - Displays the current coding mode with visual styling.
 *
 * Features:
 * - Mode icon (using centralized icon system)
 * - Color-coded mode name (green, blue, purple)
 * - Spec phase progress indicator when in spec mode
 * - Compact mode for space-constrained layouts
 *
 * @example
 * ```tsx
 * // Basic usage
 * <ModeIndicator mode="vibe" />
 *
 * // With spec phase
 * <ModeIndicator mode="spec" specPhase={3} />
 *
 * // Compact mode
 * <ModeIndicator mode="plan" compact />
 * ```
 */
export function ModeIndicator({
  mode,
  specPhase,
  compact = false,
}: ModeIndicatorProps): React.ReactElement {
  const { theme } = useTheme();

  // Get mode display properties
  const modeIcons = getModeIcons();
  const icon = modeIcons[mode];
  const name = MODE_NAMES[mode];
  const color = getModeColor(mode, theme);

  // Build phase display for spec mode
  const phaseDisplay = useMemo(() => {
    if (mode !== "spec" || specPhase === undefined) {
      return null;
    }

    const totalPhases = SPEC_PHASES.length;
    const validPhase = Math.max(1, Math.min(specPhase, totalPhases));

    if (compact) {
      return ` (${validPhase}/${totalPhases})`;
    }

    const phaseName = getPhaseName(validPhase);
    return ` (${validPhase}/${totalPhases}: ${phaseName})`;
  }, [mode, specPhase, compact]);

  // Compact mode: icon only with optional phase
  if (compact) {
    return (
      <Box>
        <Text color={color}>
          {icon}
          {phaseDisplay}
        </Text>
      </Box>
    );
  }

  // Full mode: icon + name + phase
  return (
    <Box>
      <Text color={color}>
        {icon} {name}
        {phaseDisplay}
      </Text>
    </Box>
  );
}

// =============================================================================
// Exports
// =============================================================================

export type { CodingMode };
