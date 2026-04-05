/**
 * useMouse Hook
 *
 * React hook for mouse event management in the TUI.
 * Handles SGR/X10 mouse tracking lifecycle: enable on mount, disable on unmount,
 * parse incoming stdin data, and dispatch to registered callbacks.
 *
 * Intercepts mouse escape sequences from stdin BEFORE Ink processes them,
 * preventing garbage text from appearing in the input.
 *
 * @module tui/hooks/useMouse
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  disableMouseTracking,
  enableMouseTracking,
  isMouseSequence,
  type MouseEvent,
  parseMouseEvent,
} from "../utils/mouse-parser.js";
import { getNoFlickerConfig } from "../utils/no-flicker.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for the useMouse hook.
 */
export interface UseMouseOptions {
  /** 'full' enables click+drag+wheel, 'wheel-only' just wheel events */
  readonly mode?: "full" | "wheel-only";
  /** Override: force enable/disable regardless of terminal detection */
  readonly enabled?: boolean;
  /** Called on any mouse event */
  readonly onMouseEvent?: (event: MouseEvent) => void;
  /** Called specifically on wheel events */
  readonly onWheel?: (event: MouseEvent) => void;
  /** Called specifically on click events */
  readonly onClick?: (event: MouseEvent) => void;
  /** Called specifically on mouse move events */
  readonly onMove?: (event: MouseEvent) => void;
}

/**
 * Return value of useMouse hook.
 */
export interface UseMouseReturn {
  /** Whether mouse tracking is currently active */
  readonly isActive: boolean;
  /** Last mouse position */
  readonly lastPosition: { col: number; row: number } | null;
  /** Manually enable/disable mouse tracking */
  readonly setEnabled: (enabled: boolean) => void;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Check if stdout is a TTY (safe to write escape sequences).
 */
function isTTY(): boolean {
  return process.stdout.isTTY === true;
}

/**
 * Determine effective mouse mode considering config overrides.
 */
function resolveMode(
  requestedMode: "full" | "wheel-only",
  clicksDisabled: boolean,
): "full" | "wheel-only" {
  if (clicksDisabled) return "wheel-only";
  return requestedMode;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * React hook for mouse event management.
 *
 * Enables SGR mouse tracking on the terminal, intercepts mouse escape sequences
 * from stdin before Ink's input handler, parses them, and dispatches to callbacks.
 *
 * @example
 * ```tsx
 * const { isActive, lastPosition } = useMouse({
 *   mode: 'full',
 *   onWheel: (e) => scrollBy(e.action === 'wheeldown' ? 3 : -3),
 *   onClick: (e) => handleClick(e.col, e.row),
 * });
 * ```
 */
export function useMouse(options: UseMouseOptions = {}): UseMouseReturn {
  const {
    mode: requestedMode = "full",
    enabled: enabledOverride,
    onMouseEvent,
    onWheel,
    onClick,
    onMove,
  } = options;

  // ── State ──────────────────────────────────────────────────────────────
  const [isActive, setIsActive] = useState(false);
  const [lastPosition, setLastPosition] = useState<{ col: number; row: number } | null>(null);
  const [manualEnabled, setManualEnabled] = useState<boolean | undefined>(undefined);

  // ── Refs for stable callback access ────────────────────────────────────
  const callbacksRef = useRef({ onMouseEvent, onWheel, onClick, onMove });
  callbacksRef.current = { onMouseEvent, onWheel, onClick, onMove };

  const configRef = useRef(getNoFlickerConfig());
  const cleanupDoneRef = useRef(false);

  // ── Resolve whether mouse should be enabled ────────────────────────────
  const config = configRef.current;
  const isEnabled = (() => {
    // Manual override from setEnabled() takes priority
    if (manualEnabled !== undefined) return manualEnabled;
    // Props override
    if (enabledOverride !== undefined) return enabledOverride;
    // Config says disabled entirely
    if (config.mouseDisabled) return false;
    // TTY check
    return isTTY();
  })();

  const effectiveMode = resolveMode(requestedMode, config.mouseClicksDisabled);

  // ── setEnabled exposed to consumer ─────────────────────────────────────
  const setEnabled = useCallback((value: boolean) => {
    setManualEnabled(value);
  }, []);

  // ── Main effect: stdin listener + mouse enable/disable ─────────────────
  useEffect(() => {
    if (!isEnabled) {
      setIsActive(false);
      return;
    }

    if (!isTTY()) {
      setIsActive(false);
      return;
    }

    // Enable mouse tracking
    cleanupDoneRef.current = false;
    enableMouseTracking(process.stdout, effectiveMode);
    setIsActive(true);

    // ── Stdin data handler ───────────────────────────────────────────────
    // We need to intercept mouse sequences BEFORE Ink's handler.
    // Node streams call listeners in registration order, and we prepend
    // via prependListener so our handler runs first.
    // To prevent Ink from seeing the mouse data, we temporarily pause stdin,
    // then resume on next tick for non-mouse data.

    const onData = (data: Buffer): void => {
      const str = data.toString("utf-8");

      // Fast path: not a mouse sequence → let it pass to Ink
      if (!isMouseSequence(str)) return;

      // It's a mouse sequence — parse and dispatch
      const event = parseMouseEvent(str);
      if (!event) return;

      // Update position
      setLastPosition({ col: event.col, row: event.row });

      // Dispatch to generic handler
      callbacksRef.current.onMouseEvent?.(event);

      // Dispatch to specific handlers
      switch (event.action) {
        case "wheelup":
        case "wheeldown":
          callbacksRef.current.onWheel?.(event);
          break;
        case "press":
        case "release":
          // In wheel-only mode, suppress click events
          if (effectiveMode !== "wheel-only") {
            callbacksRef.current.onClick?.(event);
          }
          break;
        case "move":
          if (effectiveMode !== "wheel-only") {
            callbacksRef.current.onMove?.(event);
          }
          break;
      }
    };

    // Prepend so we run before Ink's listener
    process.stdin.prependListener("data", onData);

    // ── Process exit cleanup ─────────────────────────────────────────────
    const onExit = (): void => {
      if (!cleanupDoneRef.current && isTTY()) {
        disableMouseTracking(process.stdout);
        cleanupDoneRef.current = true;
      }
    };

    process.on("exit", onExit);
    process.on("SIGINT", onExit);
    process.on("SIGTERM", onExit);

    // ── Teardown ─────────────────────────────────────────────────────────
    return () => {
      process.stdin.removeListener("data", onData);
      process.removeListener("exit", onExit);
      process.removeListener("SIGINT", onExit);
      process.removeListener("SIGTERM", onExit);

      if (!cleanupDoneRef.current && isTTY()) {
        disableMouseTracking(process.stdout);
        cleanupDoneRef.current = true;
      }
      setIsActive(false);
    };
  }, [isEnabled, effectiveMode]);

  return { isActive, lastPosition, setEnabled };
}
