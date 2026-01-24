/**
 * Terminal Scroll Standardization Module
 *
 * Normalizes mouse wheel events across different terminal emulators to ensure
 * consistent scrolling behavior. Different terminals emit varying numbers of
 * scroll events per physical wheel tick:
 * - VS Code: 9 events per tick
 * - iTerm2/Windows Terminal/Alacritty: 3 events per tick
 *
 * @module terminal-scroll
 */

import { useEffect, useMemo, useRef } from "react";

/**
 * Terminal scroll configuration
 */
export interface TerminalScrollConfig {
  /** Number of events generated per physical wheel tick */
  eventsPerTick: number;
  /** Number of lines to scroll per event */
  linesPerEvent: number;
  /** Terminal display name */
  name: string;
}

/**
 * Known terminal scroll configurations
 */
export const TERMINAL_SCROLL_CONFIGS: Record<string, TerminalScrollConfig> = {
  vscode: { eventsPerTick: 9, linesPerEvent: 1, name: "VS Code" },
  iterm2: { eventsPerTick: 3, linesPerEvent: 1, name: "iTerm2" },
  "iterm.app": { eventsPerTick: 3, linesPerEvent: 1, name: "iTerm2" },
  apple_terminal: { eventsPerTick: 3, linesPerEvent: 1, name: "Apple Terminal" },
  windows_terminal: { eventsPerTick: 3, linesPerEvent: 1, name: "Windows Terminal" },
  wt: { eventsPerTick: 3, linesPerEvent: 1, name: "Windows Terminal" },
  alacritty: { eventsPerTick: 3, linesPerEvent: 1, name: "Alacritty" },
  hyper: { eventsPerTick: 3, linesPerEvent: 1, name: "Hyper" },
  xterm: { eventsPerTick: 3, linesPerEvent: 1, name: "XTerm" },
  default: { eventsPerTick: 3, linesPerEvent: 1, name: "Unknown" },
};

/**
 * Detect the current terminal emulator type
 *
 * @returns Terminal identifier key for TERMINAL_SCROLL_CONFIGS
 */
export function detectTerminal(): string {
  const termProgram = process.env.TERM_PROGRAM?.toLowerCase() ?? "";
  const terminal = process.env.TERMINAL_EMULATOR?.toLowerCase() ?? "";
  const wtSession = process.env.WT_SESSION; // Windows Terminal specific
  const vscodeInjection = process.env.VSCODE_INJECTION; // VS Code specific

  if (vscodeInjection || termProgram.includes("vscode")) {
    return "vscode";
  }
  if (wtSession) {
    return "wt";
  }
  if (termProgram.includes("iterm")) {
    return "iterm2";
  }
  if (termProgram.includes("apple_terminal") || termProgram === "apple_terminal") {
    return "apple_terminal";
  }
  if (termProgram.includes("alacritty") || terminal.includes("alacritty")) {
    return "alacritty";
  }
  if (termProgram.includes("hyper")) {
    return "hyper";
  }

  return "default";
}

/**
 * Get scroll configuration for the current terminal
 *
 * @returns Terminal scroll configuration
 */
export function getScrollConfig(): TerminalScrollConfig {
  const terminal = detectTerminal();
  const config = TERMINAL_SCROLL_CONFIGS[terminal];
  const defaultConfig = TERMINAL_SCROLL_CONFIGS.default;
  return config ?? defaultConfig ?? { name: "Default", eventsPerTick: 3, linesPerEvent: 1 };
}

/**
 * Create a scroll normalizer function
 *
 * Uses accumulator pattern to prevent fractional scroll values from being lost.
 * This ensures smooth scrolling even when the raw delta doesn't align with
 * the terminal's events-per-tick value.
 *
 * @param eventsPerTick - Number of events the terminal emits per physical wheel tick
 * @param linesPerEvent - Number of lines to scroll per normalized event
 * @returns Normalizer function that converts raw delta to scroll lines
 *
 * @example
 * ```typescript
 * const config = getScrollConfig();
 * const normalizer = createScrollNormalizer(config.eventsPerTick, config.linesPerEvent);
 *
 * // In scroll handler:
 * const scrollLines = normalizer(rawDelta);
 * if (scrollLines !== 0) {
 *   scrollBy(scrollLines);
 * }
 * ```
 */
export function createScrollNormalizer(
  eventsPerTick: number,
  linesPerEvent: number
): (rawDelta: number) => number {
  let accumulator = 0;

  return (rawDelta: number): number => {
    // Accumulate raw delta
    accumulator += rawDelta;

    // Calculate target scroll lines
    const targetLines = (accumulator / eventsPerTick) * linesPerEvent;

    // Truncate to integer and preserve remainder
    const linesToScroll = Math.trunc(targetLines);

    if (linesToScroll !== 0) {
      // Consume the used accumulator value
      const consumed = (linesToScroll * eventsPerTick) / linesPerEvent;
      accumulator -= consumed;
    }

    return linesToScroll;
  };
}

/**
 * Scroll normalizer with auto-reset capability
 */
export interface ScrollNormalizerWithReset {
  /** Normalize raw delta to scroll lines */
  normalize: (rawDelta: number) => number;
  /** Manually reset the accumulator */
  reset: () => void;
}

/**
 * Create a scroll normalizer with automatic reset after idle period
 *
 * Resets the accumulator after a configurable timeout of no scroll activity.
 * This prevents stale accumulator values from affecting future scroll operations.
 *
 * @param eventsPerTick - Number of events the terminal emits per physical wheel tick
 * @param linesPerEvent - Number of lines to scroll per normalized event
 * @param resetTimeoutMs - Milliseconds of inactivity before resetting accumulator (default: 100)
 * @returns Object with normalize and reset functions
 *
 * @example
 * ```typescript
 * const config = getScrollConfig();
 * const { normalize, reset } = createScrollNormalizerWithReset(
 *   config.eventsPerTick,
 *   config.linesPerEvent,
 *   100
 * );
 *
 * // In scroll handler:
 * const scrollLines = normalize(rawDelta);
 *
 * // On component unmount:
 * reset();
 * ```
 */
export function createScrollNormalizerWithReset(
  eventsPerTick: number,
  linesPerEvent: number,
  resetTimeoutMs: number = 100
): ScrollNormalizerWithReset {
  let accumulator = 0;
  let resetTimer: ReturnType<typeof setTimeout> | null = null;

  const normalize = (rawDelta: number): number => {
    // Clear previous reset timer
    if (resetTimer) {
      clearTimeout(resetTimer);
    }

    // Schedule new reset timer
    resetTimer = setTimeout(() => {
      accumulator = 0;
      resetTimer = null;
    }, resetTimeoutMs);

    // Accumulate raw delta
    accumulator += rawDelta;

    // Calculate target scroll lines
    const targetLines = (accumulator / eventsPerTick) * linesPerEvent;

    // Truncate to integer and preserve remainder
    const linesToScroll = Math.trunc(targetLines);

    if (linesToScroll !== 0) {
      // Consume the used accumulator value
      const consumed = (linesToScroll * eventsPerTick) / linesPerEvent;
      accumulator -= consumed;
    }

    return linesToScroll;
  };

  const reset = (): void => {
    accumulator = 0;
    if (resetTimer) {
      clearTimeout(resetTimer);
      resetTimer = null;
    }
  };

  return { normalize, reset };
}

/**
 * React hook for scroll normalization
 *
 * Automatically detects terminal type and creates appropriate normalizer.
 * Handles cleanup on unmount.
 *
 * @returns Normalizer function that converts raw delta to scroll lines
 *
 * @example
 * ```tsx
 * function ScrollableList() {
 *   const normalizeScroll = useScrollNormalizer();
 *   const [offset, setOffset] = useState(0);
 *
 *   const handleWheel = useCallback((event: WheelEvent) => {
 *     const delta = Math.sign(event.deltaY);
 *     const lines = normalizeScroll(delta);
 *     if (lines !== 0) {
 *       setOffset(prev => prev + lines);
 *     }
 *   }, [normalizeScroll]);
 *
 *   return <div onWheel={handleWheel}>...</div>;
 * }
 * ```
 */
export function useScrollNormalizer(): (rawDelta: number) => number {
  const config = useMemo(() => getScrollConfig(), []);
  const normalizerRef = useRef<ScrollNormalizerWithReset | null>(null);

  if (!normalizerRef.current) {
    normalizerRef.current = createScrollNormalizerWithReset(
      config.eventsPerTick,
      config.linesPerEvent
    );
  }

  useEffect(() => {
    return () => {
      normalizerRef.current?.reset();
    };
  }, []);

  return normalizerRef.current.normalize;
}

/**
 * Get user-configured scroll sensitivity multiplier
 *
 * Reads from VELLUM_SCROLL_SENSITIVITY environment variable.
 * Falls back to 1.0 if not set or invalid.
 *
 * @returns Scroll sensitivity multiplier (0.1 - 10.0)
 */
export function getScrollSensitivity(): number {
  const envValue = process.env.VELLUM_SCROLL_SENSITIVITY;
  if (!envValue) {
    return 1.0;
  }

  const sensitivity = parseFloat(envValue);
  if (Number.isNaN(sensitivity)) {
    return 1.0;
  }

  // Clamp to reasonable range
  return Math.max(0.1, Math.min(10.0, sensitivity));
}

/**
 * Create a scroll normalizer with user sensitivity applied
 *
 * @param eventsPerTick - Number of events the terminal emits per physical wheel tick
 * @param linesPerEvent - Number of lines to scroll per normalized event
 * @param resetTimeoutMs - Milliseconds of inactivity before resetting accumulator
 * @returns Object with normalize and reset functions
 */
export function createSensitiveScrollNormalizer(
  eventsPerTick: number,
  linesPerEvent: number,
  resetTimeoutMs: number = 100
): ScrollNormalizerWithReset {
  const sensitivity = getScrollSensitivity();
  const adjustedLinesPerEvent = linesPerEvent * sensitivity;

  return createScrollNormalizerWithReset(eventsPerTick, adjustedLinesPerEvent, resetTimeoutMs);
}

/**
 * React hook for scroll normalization with user sensitivity
 *
 * @returns Normalizer function that converts raw delta to scroll lines
 */
export function useSensitiveScrollNormalizer(): (rawDelta: number) => number {
  const config = useMemo(() => getScrollConfig(), []);
  const sensitivity = useMemo(() => getScrollSensitivity(), []);
  const normalizerRef = useRef<ScrollNormalizerWithReset | null>(null);

  if (!normalizerRef.current) {
    normalizerRef.current = createScrollNormalizerWithReset(
      config.eventsPerTick,
      config.linesPerEvent * sensitivity
    );
  }

  useEffect(() => {
    return () => {
      normalizerRef.current?.reset();
    };
  }, []);

  return normalizerRef.current.normalize;
}
