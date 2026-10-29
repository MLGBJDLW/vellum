/** Mouse dispatch and primary-pointer capture over the shared terminal-input owner. */
import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from "react";
import { type UseMouseOptions, useMouse } from "../hooks/useMouse.js";
import { globalClickRegistry } from "../utils/click-region.js";
import type { MouseEvent } from "../utils/mouse-parser.js";

type PointerHandler = (event: MouseEvent) => boolean;
// biome-ignore lint/suspicious/noConfusingVoidType: Existing observer callbacks return void; new bounded handlers can consume an event with true.
type WheelHandler = (event: MouseEvent) => boolean | void;
export interface MouseContextValue {
  readonly isMouseActive: boolean;
  /** Latest position, read on demand without rerendering on mouse movement. */
  readonly lastPosition: { col: number; row: number } | null;
  /** Higher-priority bounded menus run first; true consumes the wheel event. */
  readonly onWheel: (handler: WheelHandler, priority?: number) => () => void;
  /** Completed primary clicks not handled by a registered region. */
  readonly onClick: (handler: (event: MouseEvent) => void) => () => void;
  /**
   * Raw press/move/release before click hit-testing. A true primary press captures
   * subsequent move/release exclusively until primary release. onCancel runs for
   * unsubscribe, disabled tracking, mode changes, unmount, or explicit cancellation.
   */
  readonly onPointer: (handler: PointerHandler, onCancel?: () => void) => () => void;
  readonly cancelPointerCapture: () => void;
}
export interface MouseProviderProps {
  readonly children: ReactNode;
  readonly mode?: UseMouseOptions["mode"];
  readonly enabled?: boolean;
}
const MouseContext = createContext<MouseContextValue | null>(null);
MouseContext.displayName = "MouseContext";
const MouseInteractionContext = createContext<{ enabled: boolean; onActivate?: () => void }>({
  enabled: true,
});

/** Disable a background subtree while an overlay owns interaction. */
export function MouseInteractionScope({
  enabled,
  onActivate,
  children,
}: {
  readonly enabled: boolean;
  /** Focus the existing application area when an enabled pointer control is used. */
  readonly onActivate?: () => void;
  readonly children: ReactNode;
}): React.JSX.Element {
  const inherited = useContext(MouseInteractionContext);
  const value = useMemo(
    () => ({
      enabled: inherited.enabled && enabled,
      onActivate: onActivate ?? inherited.onActivate,
    }),
    [inherited, enabled, onActivate]
  );
  return (
    <MouseInteractionContext.Provider value={value}>{children}</MouseInteractionContext.Provider>
  );
}

export function useMouseInteractionEnabled(): boolean {
  return useContext(MouseInteractionContext).enabled;
}

export function useMouseInteractionActivate(): (() => void) | undefined {
  return useContext(MouseInteractionContext).onActivate;
}

export function MouseProvider({ children, mode, enabled }: MouseProviderProps): React.JSX.Element {
  const wheelHandlers = useRef(new Map<WheelHandler, number>());
  const clickHandlers = useRef(new Set<(event: MouseEvent) => void>());
  const pointerHandlers = useRef(new Map<PointerHandler, (() => void) | undefined>());
  const captured = useRef<PointerHandler | null>(null);
  const genericPress = useRef<{ col: number; row: number } | null>(null);

  const cancelPointerCapture = useCallback(() => {
    const handler = captured.current;
    captured.current = null;
    genericPress.current = null;
    globalClickRegistry.cancelGesture();
    if (handler) pointerHandlers.current.get(handler)?.();
  }, []);
  const subscribePointer = useCallback(
    (handler: PointerHandler, onCancel?: () => void) => {
      pointerHandlers.current.set(handler, onCancel);
      return () => {
        if (captured.current === handler) cancelPointerCapture();
        pointerHandlers.current.delete(handler);
      };
    },
    [cancelPointerCapture]
  );
  const subscribeWheel = useCallback((handler: WheelHandler, priority = 0) => {
    wheelHandlers.current.set(handler, priority);
    return () => {
      wheelHandlers.current.delete(handler);
    };
  }, []);
  const subscribeClick = useCallback((handler: (event: MouseEvent) => void) => {
    clickHandlers.current.add(handler);
    return () => {
      clickHandlers.current.delete(handler);
    };
  }, []);
  const handleWheel = useCallback((event: MouseEvent) => {
    for (const [handler] of [...wheelHandlers.current].sort((left, right) => right[1] - left[1])) {
      if (handler(event) === true) break;
    }
  }, []);
  const handlePointer = useCallback(
    (event: MouseEvent) => {
      if (event.action === "wheelup" || event.action === "wheeldown") return;
      // A new press or unpressed hover recovers from a release lost outside the terminal.
      if (
        captured.current &&
        (event.action === "press" || (event.action === "move" && event.button === "none"))
      ) {
        cancelPointerCapture();
      }
      if (captured.current) {
        const handler = captured.current;
        if (event.action === "release" && (event.button === "left" || event.button === "none")) {
          captured.current = null;
        }
        handler(event);
        return;
      }
      for (const handler of pointerHandlers.current.keys()) {
        if (handler(event)) {
          genericPress.current = null;
          globalClickRegistry.cancelGesture();
          if (
            event.action === "press" &&
            event.button === "left" &&
            pointerHandlers.current.has(handler)
          ) {
            captured.current = handler;
          }
          return;
        }
      }
      if (event.action === "press") {
        genericPress.current =
          event.button === "left" && !globalClickRegistry.hitTest(event.col, event.row)
            ? { col: event.col, row: event.row }
            : null;
      }
      if (
        event.action === "move" &&
        genericPress.current &&
        (genericPress.current.col !== event.col || genericPress.current.row !== event.row)
      ) {
        genericPress.current = null;
      }
      const start = genericPress.current;
      const handled = globalClickRegistry.dispatch(event.col, event.row, event);
      if (event.action !== "release") return;
      genericPress.current = null;
      if (
        !handled &&
        start &&
        start.col === event.col &&
        start.row === event.row &&
        (event.button === "left" || event.button === "none") &&
        !globalClickRegistry.hitTest(event.col, event.row)
      ) {
        for (const handler of clickHandlers.current) handler(event);
      }
    },
    [cancelPointerCapture]
  );
  const mouse = useMouse({
    mode,
    enabled,
    onWheel: handleWheel,
    onMouseEvent: handlePointer,
    onTrackingEnd: cancelPointerCapture,
  });
  const value = useMemo<MouseContextValue>(
    () => ({
      isMouseActive: mouse.isActive,
      get lastPosition() {
        return mouse.lastPosition;
      },
      onWheel: subscribeWheel,
      onClick: subscribeClick,
      onPointer: subscribePointer,
      cancelPointerCapture,
    }),
    [mouse, subscribeWheel, subscribeClick, subscribePointer, cancelPointerCapture]
  );
  return <MouseContext.Provider value={value}>{children}</MouseContext.Provider>;
}

export function useMouseContext(): MouseContextValue {
  const context = useContext(MouseContext);
  if (!context) throw new Error("useMouseContext must be used within a MouseProvider");
  return context;
}
export function useMouseContextOptional(): MouseContextValue | null {
  return useContext(MouseContext);
}
export { MouseContext };
