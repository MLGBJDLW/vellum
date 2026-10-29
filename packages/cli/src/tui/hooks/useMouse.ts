/** Shared terminal-input mouse subscription and terminal-mode lifecycle. */
import { useStdin } from "ink";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getEffectiveMouseMode, subscribeMouseModeChange } from "../../commands/mouse.js";
import {
  disableMouseTracking,
  enableMouseTracking,
  type MouseEvent,
} from "../utils/mouse-parser.js";
import { subscribeTerminalInput } from "../utils/terminal-input.js";

export interface UseMouseOptions {
  readonly mode?: "full" | "wheel-only";
  readonly enabled?: boolean;
  /** Raw pointer events, before gesture activation. Wheel-only filters other reports. */
  readonly onMouseEvent?: (event: MouseEvent) => void;
  readonly onWheel?: (event: MouseEvent) => void;
  /** A completed primary click, called once on release without intervening motion. */
  readonly onClick?: (event: MouseEvent) => void;
  readonly onMove?: (event: MouseEvent) => void;
  /** Cancels any captured gesture before modes change, tracking stops, or unmount. */
  readonly onTrackingEnd?: () => void;
}

export interface UseMouseReturn {
  readonly isActive: boolean;
  /** Read on demand; pointer motion does not rerender the provider tree. */
  readonly lastPosition: { col: number; row: number } | null;
  readonly setEnabled: (enabled: boolean) => void;
}

function isTTY(): boolean {
  return process.stdout.isTTY === true && process.env.TERM !== "dumb";
}

export function useMouse(options: UseMouseOptions = {}): UseMouseReturn {
  const { stdin } = useStdin();
  const mode = useSyncExternalStore(
    subscribeMouseModeChange,
    getEffectiveMouseMode,
    getEffectiveMouseMode
  );
  const [isActive, setIsActive] = useState(false);
  const [manualEnabled, setManualEnabled] = useState<boolean>();
  const lastPosition = useRef<{ col: number; row: number } | null>(null);
  const callbacks = useRef(options);
  callbacks.current = options;
  const isEnabled = manualEnabled ?? options.enabled ?? mode !== "disabled";
  const effectiveMode = options.mode ?? (mode === "disabled" ? "full" : mode);
  const setEnabled = useCallback((value: boolean) => setManualEnabled(value), []);

  useEffect(() => {
    if (!isEnabled || !isTTY()) {
      setIsActive(false);
      return;
    }
    enableMouseTracking(process.stdout, effectiveMode);
    setIsActive(true);
    let pressed: { col: number; row: number; moved: boolean } | null = null;
    let ended = false;
    const onMouse = (event: MouseEvent): void => {
      if (ended) return;
      const wheel = event.action === "wheelup" || event.action === "wheeldown";
      if (!wheel && effectiveMode === "wheel-only") return;
      lastPosition.current = { col: event.col, row: event.row };
      callbacks.current.onMouseEvent?.(event);
      if (wheel) {
        callbacks.current.onWheel?.(event);
      } else if (event.action === "press") {
        pressed = event.button === "left" ? { col: event.col, row: event.row, moved: false } : null;
      } else if (event.action === "move") {
        if (pressed && (event.col !== pressed.col || event.row !== pressed.row))
          pressed.moved = true;
        callbacks.current.onMove?.(event);
      } else if (event.action === "release") {
        const start = pressed;
        pressed = null;
        if (
          start &&
          !start.moved &&
          (event.button === "left" || event.button === "none") &&
          start.col === event.col &&
          start.row === event.row
        )
          callbacks.current.onClick?.(event);
      }
    };
    const unsubscribe = subscribeTerminalInput(stdin, { onMouse });
    const onExit = (): void => {
      if (ended) return;
      ended = true;
      pressed = null;
      callbacks.current.onTrackingEnd?.();
      if (isTTY()) disableMouseTracking(process.stdout);
    };
    process.on("exit", onExit);
    process.on("SIGINT", onExit);
    process.on("SIGTERM", onExit);
    return () => {
      unsubscribe();
      process.removeListener("exit", onExit);
      process.removeListener("SIGINT", onExit);
      process.removeListener("SIGTERM", onExit);
      onExit();
      setIsActive(false);
    };
  }, [isEnabled, effectiveMode, stdin]);

  return useMemo(
    () => ({
      isActive,
      get lastPosition() {
        return lastPosition.current;
      },
      setEnabled,
    }),
    [isActive, setEnabled]
  );
}
