/**
 * PhaseProgressIndicator Component (T047)
 *
 * TUI component for displaying visual progress through spec mode phases.
 * Shows a segmented progress bar with 6 phases and current phase highlight.
 *
 * @module tui/components/PhaseProgressIndicator
 */

import type { SpecPhase } from "@vellum/core";
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
 * Props for the PhaseProgressIndicator component.
 */
export interface PhaseProgressIndicatorProps {
  /** Current phase number (1-6) */
  readonly currentPhase: number;
  /** Total number of phases (default: 6) */
  readonly totalPhases?: number;
  /** Whether to show phase names */
  readonly showLabels?: boolean;
  /** Whether to show percentage */
  readonly showPercentage?: boolean;
  /** Width of the progress bar in characters (default: 24, 4 per phase) */
  readonly width?: number;
  /** Display orientation */
  readonly orientation?: "horizontal" | "vertical";
}

// =============================================================================
// Constants
// =============================================================================

/** Default progress bar width (4 chars per 6 phases) */
const DEFAULT_WIDTH = 24;

/** Default total phases */
const DEFAULT_TOTAL_PHASES = 6;

/** Progress bar characters */
const PROGRESS_CHARS = {
  filled: "█",
  current: "▓",
  empty: "░",
  separatorFilled: "│",
  separatorEmpty: "┊",
} as const;

/**
 * Get phase status icons using the icon system for proper Unicode/ASCII support.
 */
function getPhaseStatusIcons() {
  const icons = getIcons();
  return {
    completed: icons.check,
    current: icons.bullet,
    pending: icons.pending,
  } as const;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the display name for a phase number.
 */
function getPhaseName(phaseNumber: number): string {
  const phase = SPEC_PHASES[phaseNumber - 1] as SpecPhase | undefined;
  if (!phase) {
    return `Phase ${phaseNumber}`;
  }
  return SPEC_PHASE_CONFIG[phase].name;
}

/**
 * Calculate completion percentage.
 */
function calculatePercentage(current: number, total: number): number {
  if (total <= 0) return 0;
  // Phase N is complete when we're at phase N+1
  // So current phase means we've completed (current - 1) phases
  const completed = Math.max(0, current - 1);
  return Math.round((completed / total) * 100);
}

// =============================================================================
// PhaseProgressIndicator Component
// =============================================================================

/**
 * PhaseProgressIndicator - Visual progress display for spec mode phases.
 *
 * Features:
 * - 6-segment progress bar
 * - Color-coded segments (completed, current, pending)
 * - Optional phase labels
 * - Optional percentage display
 * - Horizontal or vertical orientation
 *
 * @example
 * ```tsx
 * // Basic usage
 * <PhaseProgressIndicator currentPhase={3} />
 *
 * // With labels and percentage
 * <PhaseProgressIndicator
 *   currentPhase={4}
 *   showLabels
 *   showPercentage
 * />
 *
 * // Vertical orientation
 * <PhaseProgressIndicator
 *   currentPhase={2}
 *   orientation="vertical"
 * />
 * ```
 */
export function PhaseProgressIndicator({
  currentPhase,
  totalPhases = DEFAULT_TOTAL_PHASES,
  showLabels = false,
  showPercentage = false,
  width = DEFAULT_WIDTH,
  orientation = "horizontal",
}: PhaseProgressIndicatorProps): React.ReactElement {
  const { theme } = useTheme();

  // Validate and clamp current phase
  const validPhase = Math.max(1, Math.min(currentPhase, totalPhases));

  // Calculate segment width
  const segmentWidth = Math.max(1, Math.floor(width / totalPhases));

  // Calculate completion percentage
  const percentage = useMemo(
    () => calculatePercentage(validPhase, totalPhases),
    [validPhase, totalPhases]
  );

  // Build progress segments
  const segments = useMemo(() => {
    return Array.from({ length: totalPhases }, (_, index) => {
      const phaseNumber = index + 1;
      const isCompleted = phaseNumber < validPhase;
      const isCurrent = phaseNumber === validPhase;
      const phaseName = getPhaseName(phaseNumber);

      return {
        phaseNumber,
        phaseName,
        isCompleted,
        isCurrent,
        isPending: !isCompleted && !isCurrent,
      };
    });
  }, [totalPhases, validPhase]);

  // Render horizontal progress bar
  if (orientation === "horizontal") {
    return (
      <Box flexDirection="column">
        {/* Progress bar */}
        <Box>
          {segments.map((segment, index) => {
            const char = segment.isCompleted
              ? PROGRESS_CHARS.filled
              : segment.isCurrent
                ? PROGRESS_CHARS.current
                : PROGRESS_CHARS.empty;

            const color = segment.isCompleted
              ? theme.colors.success
              : segment.isCurrent
                ? theme.colors.primary
                : theme.semantic.text.muted;

            const barSegment = char.repeat(segmentWidth);

            return (
              <Box key={segment.phaseNumber}>
                <Text color={color}>{barSegment}</Text>
                {/* Separator between segments (except last) */}
                {index < segments.length - 1 && (
                  <Text color={theme.semantic.text.muted}>
                    {segment.isCompleted
                      ? PROGRESS_CHARS.separatorFilled
                      : PROGRESS_CHARS.separatorEmpty}
                  </Text>
                )}
              </Box>
            );
          })}

          {/* Percentage display */}
          {showPercentage && <Text color={theme.semantic.text.secondary}> {percentage}%</Text>}
        </Box>

        {/* Phase labels */}
        {showLabels && (
          <Box marginTop={1}>
            <Text color={theme.colors.primary} bold>
              {getPhaseStatusIcons().current} {getPhaseName(validPhase)}
            </Text>
            <Text color={theme.semantic.text.muted}>
              {" "}
              ({validPhase}/{totalPhases})
            </Text>
          </Box>
        )}
      </Box>
    );
  }

  // Get icons for vertical list
  const phaseIcons = getPhaseStatusIcons();

  // Render vertical progress list
  return (
    <Box flexDirection="column">
      {segments.map((segment) => {
        const icon = segment.isCompleted
          ? phaseIcons.completed
          : segment.isCurrent
            ? phaseIcons.current
            : phaseIcons.pending;

        const color = segment.isCompleted
          ? theme.colors.success
          : segment.isCurrent
            ? theme.colors.primary
            : theme.semantic.text.muted;

        return (
          <Box key={segment.phaseNumber}>
            <Text color={color}>
              {icon} {segment.phaseNumber}. {segment.phaseName}
            </Text>
          </Box>
        );
      })}

      {/* Progress summary */}
      {showPercentage && (
        <Box marginTop={1}>
          <Text color={theme.semantic.text.secondary}>
            Progress: {percentage}% ({validPhase - 1}/{totalPhases} completed)
          </Text>
        </Box>
      )}
    </Box>
  );
}

// =============================================================================
// Exports
// =============================================================================

export type { SpecPhase };
