/**
 * Streaming Indicator Component
 *
 * Context-aware indicator that shows what's currently streaming:
 * - "Thinking..." during extended_thinking
 * - "Generating..." during text generation
 * - "Using tool..." during tool execution
 *
 * Shows duration for each phase.
 *
 * @module tui/components/common/StreamingIndicator
 */

import { Box, Text } from "ink";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "../../theme/index.js";
import { formatDuration, useElapsedTime } from "./EnhancedLoadingIndicator.js";
import { SPINNER_STYLES, Spinner } from "./Spinner.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Streaming phase types.
 */
export type StreamingPhase =
  | "idle"
  | "thinking"
  | "generating"
  | "tool_call"
  | "tool_executing"
  | "waiting_confirmation";

/**
 * Props for the StreamingIndicator component.
 */
export interface StreamingIndicatorProps {
  /** Current streaming phase */
  readonly phase: StreamingPhase;
  /** Optional custom label override */
  readonly label?: string;
  /** Name of the tool being executed (for tool phases) */
  readonly toolName?: string;
  /** Whether to show elapsed time for this phase */
  readonly showPhaseTime?: boolean;
  /** Whether to show cancel hint */
  readonly showCancelHint?: boolean;
  /** Custom cancel hint text */
  readonly cancelHint?: string;
  /** Spinner color */
  readonly spinnerColor?: string;
  /** Content to display on the right side */
  readonly rightContent?: React.ReactNode;
  /** Whether to use narrow layout */
  readonly narrow?: boolean;
}

// =============================================================================
// Phase Configuration
// =============================================================================

/**
 * Default labels for each streaming phase.
 */
export const PHASE_LABELS: Record<StreamingPhase, string> = {
  idle: "",
  thinking: "Thinking...",
  generating: "Generating...",
  tool_call: "Preparing tool...",
  tool_executing: "Using tool...",
  waiting_confirmation: "Waiting for confirmation...",
} as const;

/**
 * Icons for each streaming phase (used in narrow mode).
 */
export const PHASE_ICONS: Record<StreamingPhase, string> = {
  idle: "",
  thinking: "🧠",
  generating: "✍️",
  tool_call: "🔧",
  tool_executing: "⚙️",
  waiting_confirmation: "⏸️",
} as const;

/**
 * Spinner styles for each phase.
 */
export const PHASE_SPINNER_STYLES: Record<StreamingPhase, readonly string[]> = {
  idle: SPINNER_STYLES.braille,
  thinking: SPINNER_STYLES.dots,
  generating: SPINNER_STYLES.braille,
  tool_call: SPINNER_STYLES.arc,
  tool_executing: SPINNER_STYLES.arc,
  waiting_confirmation: SPINNER_STYLES.bounce,
} as const;

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to track phase transitions and manage per-phase timing.
 *
 * @param phase - Current streaming phase
 * @returns Object with phase info and timing
 */
export function useStreamingPhase(phase: StreamingPhase): {
  currentPhase: StreamingPhase;
  phaseStartTime: number;
  isActive: boolean;
  resetKey: number;
} {
  const [resetKey, setResetKey] = useState(0);
  const [phaseStartTime, setPhaseStartTime] = useState(Date.now());
  const prevPhaseRef = useRef<StreamingPhase>(phase);

  useEffect(() => {
    if (prevPhaseRef.current !== phase) {
      // Phase changed - reset timing
      setResetKey((prev) => prev + 1);
      setPhaseStartTime(Date.now());
      prevPhaseRef.current = phase;
    }
  }, [phase]);

  return {
    currentPhase: phase,
    phaseStartTime,
    isActive: phase !== "idle",
    resetKey,
  };
}

// =============================================================================
// Component
// =============================================================================

/**
 * StreamingIndicator - Context-aware streaming phase indicator.
 *
 * Shows different states with appropriate labels and spinners:
 * - Thinking phase: Brain-style spinner, "Thinking..."
 * - Generating phase: Braille spinner, "Generating..."
 * - Tool execution: Arc spinner, "Using [tool name]..."
 *
 * @example
 * ```tsx
 * // Basic usage
 * <StreamingIndicator phase="thinking" />
 *
 * // With tool name
 * <StreamingIndicator
 *   phase="tool_executing"
 *   toolName="read_file"
 *   showPhaseTime
 * />
 *
 * // With all features
 * <StreamingIndicator
 *   phase="generating"
 *   showPhaseTime
 *   showCancelHint
 *   cancelHint="Esc to stop"
 * />
 * ```
 */
export function StreamingIndicator({
  phase,
  label,
  toolName,
  showPhaseTime = true,
  showCancelHint = false,
  cancelHint = "Esc to cancel",
  spinnerColor,
  rightContent,
  narrow = false,
}: StreamingIndicatorProps): React.JSX.Element | null {
  const { theme } = useTheme();
  const { isActive, resetKey } = useStreamingPhase(phase);

  // Track elapsed time for current phase
  const elapsedTime = useElapsedTime(isActive, resetKey);

  // Don't render in idle state
  if (phase === "idle") {
    return null;
  }

  // Determine the display label
  const displayLabel = (() => {
    if (label) return label;

    if (phase === "tool_executing" && toolName) {
      return `Using ${toolName}...`;
    }

    if (phase === "tool_call" && toolName) {
      return `Preparing ${toolName}...`;
    }

    return PHASE_LABELS[phase];
  })();

  // Get phase-specific spinner frames
  const spinnerFrames = PHASE_SPINNER_STYLES[phase];

  // Build meta content
  const buildMetaContent = (): string | null => {
    const parts: string[] = [];

    if (showPhaseTime && elapsedTime > 0) {
      parts.push(`⏱ ${formatDuration(elapsedTime)}`);
    }

    if (showCancelHint && cancelHint) {
      parts.push(cancelHint);
    }

    return parts.length > 0 ? `(${parts.join(", ")})` : null;
  };

  const meta = buildMetaContent();

  // Determine colors based on phase
  const getPhaseColor = (): string => {
    if (spinnerColor) return spinnerColor;

    switch (phase) {
      case "thinking":
        return theme.colors.warning ?? "yellow";
      case "generating":
        return theme.colors.info ?? "cyan";
      case "tool_call":
      case "tool_executing":
        return theme.colors.success ?? "green";
      case "waiting_confirmation":
        return theme.colors.warning ?? "yellow";
      default:
        return theme.colors.info ?? "cyan";
    }
  };

  const phaseColor = getPhaseColor();

  if (narrow) {
    // Narrow layout: stack vertically with icon
    const icon = PHASE_ICONS[phase];

    return (
      <Box flexDirection="column">
        <Box>
          <Spinner color={phaseColor} frames={spinnerFrames} />
          {icon && <Text> {icon}</Text>}
          <Text color={phaseColor}> {displayLabel}</Text>
        </Box>
        {meta && (
          <Box>
            <Text dimColor>{meta}</Text>
          </Box>
        )}
        {rightContent && <Box>{rightContent}</Box>}
      </Box>
    );
  }

  // Normal layout: horizontal
  return (
    <Box flexDirection="row" alignItems="center">
      <Spinner color={phaseColor} frames={spinnerFrames} />
      <Text color={phaseColor}> {displayLabel}</Text>
      {meta && (
        <>
          <Text> </Text>
          <Text dimColor>{meta}</Text>
        </>
      )}
      {rightContent && (
        <>
          <Box flexGrow={1} />
          {rightContent}
        </>
      )}
    </Box>
  );
}

export default StreamingIndicator;
