/** Vellum's ink mark: a quiet pulse inside a folded-page V. */
import { getIconSupport } from "@vellum/shared";
import { Text } from "ink";
import type React from "react";
import { useMemo } from "react";
import stringWidth from "string-width";
import { useAnimationControls, useAnimationFrame } from "../../context/AnimationContext.js";
import { useTheme } from "../../theme/index.js";

export type SpinnerScene =
  | "default"
  | "thinking"
  | "writing"
  | "searching"
  | "loading"
  | "streaming";

export interface SpinnerProps {
  readonly color?: string;
  /** All activities share the ink mark; the label communicates the operation. */
  readonly scene?: SpinnerScene;
  readonly label?: string;
  /** Optional custom frames are padded to a stable terminal-cell width. */
  readonly frames?: readonly string[];
}

export interface LoadingIndicatorProps {
  readonly message?: string;
  readonly showSpinner?: boolean;
  readonly spinnerColor?: string;
  readonly frames?: readonly string[];
  readonly dimmed?: boolean;
}

// Eight shared-clock ticks form one quiet breath (960 ms by default). The fixed
// page edges anchor the mark while its ink drop grows, settles, and recedes.
export const SPINNER_FRAMES = ["╲·╱", "╲·╱", "╲•╱", "╲◆╱", "╲◆╱", "╲•╱", "╲·╱", "╲·╱"] as const;
export const ASCII_SPINNER_FRAMES = [
  "\\./",
  "\\./",
  "\\o/",
  "\\O/",
  "\\O/",
  "\\o/",
  "\\./",
  "\\./",
] as const;

/** Uses the existing shared clock; mounting more indicators creates no timers. */
export function Spinner({ color, label, frames }: SpinnerProps): React.JSX.Element {
  const { theme } = useTheme();
  const ascii = getIconSupport() === "ascii";
  const effectiveFrames = useMemo(() => {
    const requested = frames?.length ? frames : ascii ? ASCII_SPINNER_FRAMES : SPINNER_FRAMES;
    // The configured ASCII fallback also applies to custom Unicode sequences.
    const supported =
      ascii && requested.some((frame) => /[^\x20-\x7e]/u.test(frame))
        ? ASCII_SPINNER_FRAMES
        : requested;
    const width = Math.max(...supported.map((frame) => stringWidth(frame)));
    return supported.map((frame) => frame + " ".repeat(width - stringWidth(frame)));
  }, [ascii, frames]);
  const frameIndex = useAnimationFrame(effectiveFrames);
  const { isPaused } = useAnimationControls();
  const spinnerColor =
    process.env.NO_COLOR === undefined ? (color ?? theme.semantic.text.primary) : undefined;

  return (
    <Text>
      <Text color={spinnerColor} aria-hidden>
        {effectiveFrames[isPaused ? 0 : frameIndex]}
      </Text>
      {label ? <Text> {label}</Text> : null}
    </Text>
  );
}

export function LoadingIndicator({
  message = "Loading...",
  showSpinner = true,
  spinnerColor,
  frames,
  dimmed = false,
}: LoadingIndicatorProps): React.JSX.Element {
  return (
    <Text dimColor={dimmed}>
      {showSpinner && (
        <>
          <Spinner color={spinnerColor} frames={frames} />{" "}
        </>
      )}
      {message}
    </Text>
  );
}

export default Spinner;
