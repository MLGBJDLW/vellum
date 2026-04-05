/**
 * Mouse Context
 *
 * Provides mouse event state and subscription APIs to child components
 * via React context. Wraps the useMouse hook and exposes a subscribe/unsubscribe
 * pattern for wheel and click events.
 *
 * @module tui/context/MouseContext
 */

import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
} from "react";

import type { MouseEvent } from "../utils/mouse-parser.js";
import { globalClickRegistry } from "../utils/click-region.js";
import { type UseMouseOptions, useMouse } from "../hooks/useMouse.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Value provided by MouseContext.
 */
export interface MouseContextValue {
  /** Whether mouse tracking is currently active */
  readonly isMouseActive: boolean;
  /** Last known mouse position */
  readonly lastPosition: { col: number; row: number } | null;
  /**
   * Subscribe to wheel events.
   * @returns Cleanup function to unsubscribe.
   */
  readonly onWheel: (handler: (event: MouseEvent) => void) => () => void;
  /**
   * Subscribe to click events.
   * @returns Cleanup function to unsubscribe.
   */
  readonly onClick: (handler: (event: MouseEvent) => void) => () => void;
}

/**
 * Props for MouseProvider.
 */
export interface MouseProviderProps {
  /** Children to render within the mouse context */
  readonly children: ReactNode;
  /** Mouse mode: 'full' or 'wheel-only' */
  readonly mode?: UseMouseOptions["mode"];
  /** Override enable/disable */
  readonly enabled?: boolean;
}

// =============================================================================
// Context
// =============================================================================

const MouseContext = createContext<MouseContextValue | null>(null);
MouseContext.displayName = "MouseContext";

// =============================================================================
// Provider
// =============================================================================

/**
 * MouseProvider wraps useMouse and distributes mouse events to subscribers.
 *
 * @example
 * ```tsx
 * <MouseProvider mode="full">
 *   <App />
 * </MouseProvider>
 *
 * // In a child:
 * const { onWheel } = useMouseContext();
 * useEffect(() => onWheel((e) => scrollBy(e.action === 'wheeldown' ? 3 : -3)), [onWheel]);
 * ```
 */
export function MouseProvider({
  children,
  mode,
  enabled,
}: MouseProviderProps): React.JSX.Element {
  // ── Subscriber registries ──────────────────────────────────────────────
  const wheelHandlers = useRef<Set<(event: MouseEvent) => void>>(new Set());
  const clickHandlers = useRef<Set<(event: MouseEvent) => void>>(new Set());

  // ── Subscribe helpers (stable references) ──────────────────────────────
  const subscribeWheel = useCallback(
    (handler: (event: MouseEvent) => void): (() => void) => {
      wheelHandlers.current.add(handler);
      return () => {
        wheelHandlers.current.delete(handler);
      };
    },
    [],
  );

  const subscribeClick = useCallback(
    (handler: (event: MouseEvent) => void): (() => void) => {
      clickHandlers.current.add(handler);
      return () => {
        clickHandlers.current.delete(handler);
      };
    },
    [],
  );

  // ── Dispatch callbacks for useMouse ────────────────────────────────────
  const handleWheel = useCallback((event: MouseEvent) => {
    for (const handler of wheelHandlers.current) {
      handler(event);
    }
  }, []);

  const handleClick = useCallback((event: MouseEvent) => {
    // First try click region registry (positional hit-testing)
    const handled = globalClickRegistry.dispatch(event.col, event.row, event);

    // If no region handled it, fan out to generic click subscribers
    if (!handled) {
      for (const handler of clickHandlers.current) {
        handler(event);
      }
    }
  }, []);

  // ── Hook ───────────────────────────────────────────────────────────────
  const { isActive, lastPosition } = useMouse({
    mode,
    enabled,
    onWheel: handleWheel,
    onClick: handleClick,
  });

  // ── Context value (stable shape via useCallback refs) ──────────────────
  const value: MouseContextValue = {
    isMouseActive: isActive,
    lastPosition,
    onWheel: subscribeWheel,
    onClick: subscribeClick,
  };

  return (
    <MouseContext.Provider value={value}>
      {children}
    </MouseContext.Provider>
  );
}

// =============================================================================
// Consumer Hooks
// =============================================================================

/**
 * Access mouse context. Throws if used outside MouseProvider.
 */
export function useMouseContext(): MouseContextValue {
  const ctx = useContext(MouseContext);
  if (!ctx) {
    throw new Error("useMouseContext must be used within a MouseProvider");
  }
  return ctx;
}

/**
 * Access mouse context, returning null if outside provider.
 */
export function useMouseContextOptional(): MouseContextValue | null {
  return useContext(MouseContext);
}

export { MouseContext };
