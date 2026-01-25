/**
 * Scroll Anchor API
 *
 * Provides a Textual-style anchor() method for programmatic scroll control.
 * Allows external components to lock scroll position to a specific target
 * and returns an unlock function for cleanup.
 *
 * Features:
 * - Lock scroll to specific message ID or position ('top' | 'bottom')
 * - Configurable alignment within viewport (0-1)
 * - Optional animation support
 * - Automatic cleanup via returned unlock function
 * - Priority-based multi-anchor support (LIFO)
 *
 * @module tui/components/common/VirtualizedList/scrollAnchorAPI
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for anchoring scroll position.
 */
export interface AnchorOptions {
  /** Anchor target - message ID or special position */
  readonly target: string | "top" | "bottom";
  /** Alignment within viewport (0 = top, 0.5 = center, 1 = bottom). Default: 0 */
  readonly align?: number;
  /** Whether to animate the scroll transition. Default: false */
  readonly animate?: boolean;
}

/**
 * Handle returned by anchor() for managing the anchor lifecycle.
 */
export interface AnchorHandle {
  /** Release this anchor lock */
  readonly unlock: () => void;
  /** Update anchor options without releasing */
  readonly update: (options: Partial<AnchorOptions>) => void;
  /** Check if this anchor is still active */
  readonly isLocked: () => boolean;
}

/**
 * Manager interface for scroll anchor operations.
 */
export interface AnchorManager {
  /** Lock scroll to an anchor position */
  readonly anchor: (options: AnchorOptions) => AnchorHandle;
  /** Get the currently active anchor options */
  readonly currentAnchor: () => AnchorOptions | null;
  /** Check if any anchor is active */
  readonly hasAnchor: () => boolean;
  /** Force release all active anchors */
  readonly releaseAll: () => void;
  /** Subscribe to anchor changes */
  readonly subscribe: (listener: AnchorChangeListener) => () => void;
}

/** Listener for anchor state changes */
export type AnchorChangeListener = (anchor: AnchorOptions | null) => void;

// ============================================================================
// Internal Types
// ============================================================================

interface InternalAnchor {
  readonly id: number;
  options: AnchorOptions;
  active: boolean;
}

// ============================================================================
// Factory: createAnchorManager
// ============================================================================

/**
 * Creates an anchor manager instance for programmatic scroll control.
 *
 * The manager uses a LIFO (Last In, First Out) priority system where
 * the most recently created anchor takes precedence. When an anchor
 * is unlocked, the next most recent active anchor becomes current.
 *
 * @returns AnchorManager instance
 *
 * @example
 * ```typescript
 * const manager = createAnchorManager();
 *
 * // Lock to a specific message
 * const handle = manager.anchor({
 *   target: 'msg-123',
 *   align: 0.5, // center
 *   animate: true,
 * });
 *
 * // Later: release the lock
 * handle.unlock();
 *
 * // Or update without releasing
 * handle.update({ align: 0 });
 * ```
 */
export function createAnchorManager(): AnchorManager {
  let nextId = 0;
  const anchors: InternalAnchor[] = [];
  const listeners = new Set<AnchorChangeListener>();

  /**
   * Notify all listeners of anchor change.
   */
  const notifyListeners = (): void => {
    const current = getCurrentAnchor();
    for (const listener of listeners) {
      try {
        listener(current);
      } catch {
        // Ignore listener errors
      }
    }
  };

  /**
   * Get the current active anchor (most recent active one).
   */
  const getCurrentAnchor = (): AnchorOptions | null => {
    // Find most recent active anchor (LIFO)
    for (let i = anchors.length - 1; i >= 0; i--) {
      const anchor = anchors[i];
      if (anchor?.active) {
        return anchor.options;
      }
    }
    return null;
  };

  /**
   * Remove inactive anchors from the stack.
   */
  const cleanup = (): void => {
    // Remove all trailing inactive anchors
    while (anchors.length > 0 && !anchors[anchors.length - 1]?.active) {
      anchors.pop();
    }
  };

  /**
   * Create a new anchor lock.
   */
  const anchor = (options: AnchorOptions): AnchorHandle => {
    const id = nextId++;
    const internalAnchor: InternalAnchor = {
      id,
      options: { ...options },
      active: true,
    };

    anchors.push(internalAnchor);
    notifyListeners();

    return {
      unlock: () => {
        if (internalAnchor.active) {
          internalAnchor.active = false;
          cleanup();
          notifyListeners();
        }
      },

      update: (newOptions: Partial<AnchorOptions>) => {
        if (internalAnchor.active) {
          internalAnchor.options = {
            ...internalAnchor.options,
            ...newOptions,
          };
          // Only notify if this is the current anchor
          if (getCurrentAnchor() === internalAnchor.options) {
            notifyListeners();
          }
        }
      },

      isLocked: () => internalAnchor.active,
    };
  };

  /**
   * Check if any anchor is active.
   */
  const hasAnchor = (): boolean => {
    return anchors.some((a) => a.active);
  };

  /**
   * Release all active anchors.
   */
  const releaseAll = (): void => {
    let changed = false;
    for (const a of anchors) {
      if (a.active) {
        a.active = false;
        changed = true;
      }
    }
    anchors.length = 0;
    if (changed) {
      notifyListeners();
    }
  };

  /**
   * Subscribe to anchor changes.
   */
  const subscribe = (listener: AnchorChangeListener): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return {
    anchor,
    currentAnchor: getCurrentAnchor,
    hasAnchor,
    releaseAll,
    subscribe,
  };
}

// ============================================================================
// Hook: useAnchorManager
// ============================================================================

/**
 * React hook for creating and managing an AnchorManager.
 *
 * Creates a stable AnchorManager instance that persists across re-renders.
 * Automatically cleans up all anchors on unmount.
 *
 * @returns AnchorManager instance
 *
 * @example
 * ```tsx
 * function ScrollContainer() {
 *   const anchorManager = useAnchorManager();
 *
 *   const handleMessageClick = (messageId: string) => {
 *     const handle = anchorManager.anchor({
 *       target: messageId,
 *       align: 0.5,
 *     });
 *
 *     // Auto-unlock after 5 seconds
 *     setTimeout(() => handle.unlock(), 5000);
 *   };
 *
 *   return <VirtualizedList anchorManager={anchorManager} />;
 * }
 * ```
 */
export function useAnchorManager(): AnchorManager {
  const managerRef = useRef<AnchorManager | null>(null);

  // Create manager lazily
  if (managerRef.current === null) {
    managerRef.current = createAnchorManager();
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      managerRef.current?.releaseAll();
    };
  }, []);

  return managerRef.current;
}

// ============================================================================
// Hook: useAnchoredScroll
// ============================================================================

/**
 * Options for useAnchoredScroll hook.
 */
export interface UseAnchoredScrollOptions {
  /** Function to resolve target ID to scroll position */
  readonly resolveTarget: (target: string) => number | null;
  /** Total content height for 'bottom' target */
  readonly contentHeight: number;
  /** Viewport height for alignment calculations */
  readonly viewportHeight: number;
}

/**
 * Return type for useAnchoredScroll hook.
 */
export interface UseAnchoredScrollReturn {
  /** Handle anchor changes - call this when anchor state updates */
  readonly handleAnchorChange: (anchor: AnchorOptions | null) => void;
  /** Whether scroll is currently anchored */
  readonly isAnchored: boolean;
  /** Current anchor options (if any) */
  readonly currentAnchor: AnchorOptions | null;
  /** Computed scroll position for current anchor */
  readonly anchoredScrollPosition: number | null;
}

/**
 * Hook for integrating anchor manager with scroll behavior.
 *
 * Computes the appropriate scroll position based on anchor options
 * and provides state for controlling scroll behavior.
 *
 * @param anchorManager - The anchor manager instance
 * @param options - Configuration for scroll resolution
 * @returns Anchored scroll state and handlers
 *
 * @example
 * ```tsx
 * function VirtualList({ items, anchorManager }) {
 *   const scrollTo = useCallback((pos) => setScrollTop(pos), []);
 *
 *   const { handleAnchorChange, isAnchored, anchoredScrollPosition } =
 *     useAnchoredScroll(anchorManager, {
 *       resolveTarget: (id) => items.findIndex(i => i.id === id) * ITEM_HEIGHT,
 *       contentHeight: items.length * ITEM_HEIGHT,
 *       viewportHeight: 500,
 *     });
 *
 *   // Subscribe to anchor changes
 *   useEffect(() => {
 *     return anchorManager.subscribe(handleAnchorChange);
 *   }, [anchorManager, handleAnchorChange]);
 *
 *   // Apply anchored position
 *   useEffect(() => {
 *     if (anchoredScrollPosition !== null) {
 *       scrollTo(anchoredScrollPosition);
 *     }
 *   }, [anchoredScrollPosition, scrollTo]);
 * }
 * ```
 */
export function useAnchoredScroll(
  anchorManager: AnchorManager,
  options: UseAnchoredScrollOptions
): UseAnchoredScrollReturn {
  const { resolveTarget, contentHeight, viewportHeight } = options;

  const [currentAnchor, setCurrentAnchor] = useState<AnchorOptions | null>(() =>
    anchorManager.currentAnchor()
  );

  /**
   * Handle anchor state changes.
   */
  const handleAnchorChange = useCallback((anchor: AnchorOptions | null) => {
    setCurrentAnchor(anchor);
  }, []);

  /**
   * Subscribe to anchor manager.
   */
  useEffect(() => {
    return anchorManager.subscribe(handleAnchorChange);
  }, [anchorManager, handleAnchorChange]);

  /**
   * Compute scroll position for current anchor.
   */
  const anchoredScrollPosition = useMemo((): number | null => {
    if (!currentAnchor) {
      return null;
    }

    const { target, align = 0 } = currentAnchor;
    let targetPosition: number;

    // Resolve target to position
    if (target === "top") {
      targetPosition = 0;
    } else if (target === "bottom") {
      targetPosition = Math.max(0, contentHeight - viewportHeight);
    } else {
      const resolved = resolveTarget(target);
      if (resolved === null) {
        // Target not found - return null
        return null;
      }
      targetPosition = resolved;
    }

    // Apply alignment (0 = top of viewport, 1 = bottom of viewport)
    const alignmentOffset = align * viewportHeight;
    const scrollPosition = Math.max(0, targetPosition - alignmentOffset);

    // Clamp to valid range
    const maxScroll = Math.max(0, contentHeight - viewportHeight);
    return Math.min(scrollPosition, maxScroll);
  }, [currentAnchor, contentHeight, viewportHeight, resolveTarget]);

  const isAnchored = currentAnchor !== null;

  return {
    handleAnchorChange,
    isAnchored,
    currentAnchor,
    anchoredScrollPosition,
  };
}

// ============================================================================
// Hook: useAnchorWithEffect
// ============================================================================

/**
 * Options for useAnchorWithEffect hook.
 */
export interface UseAnchorWithEffectOptions {
  /** Anchor manager instance */
  readonly anchorManager: AnchorManager;
  /** Function to scroll to a position */
  readonly scrollTo: (position: number) => void;
  /** Function to resolve target ID to scroll position */
  readonly resolveTarget: (target: string) => number | null;
  /** Total content height */
  readonly contentHeight: number;
  /** Viewport height */
  readonly viewportHeight: number;
  /** Whether to apply scroll position changes immediately */
  readonly enabled?: boolean;
}

/**
 * Hook that combines anchor management with automatic scroll effect.
 *
 * This is a convenience hook that handles the full integration of
 * anchor-based scrolling, including subscribing to changes and
 * applying scroll positions.
 *
 * @param options - Configuration options
 * @returns Anchored scroll state
 *
 * @example
 * ```tsx
 * function ChatView({ messages }) {
 *   const anchorManager = useAnchorManager();
 *   const [scrollTop, setScrollTop] = useState(0);
 *
 *   const { isAnchored } = useAnchorWithEffect({
 *     anchorManager,
 *     scrollTo: setScrollTop,
 *     resolveTarget: (id) => {
 *       const idx = messages.findIndex(m => m.id === id);
 *       return idx >= 0 ? idx * 80 : null;
 *     },
 *     contentHeight: messages.length * 80,
 *     viewportHeight: 400,
 *   });
 *
 *   // Expose anchor method
 *   const jumpToMessage = (id: string) => {
 *     anchorManager.anchor({ target: id, align: 0.5, animate: true });
 *   };
 * }
 * ```
 */
export function useAnchorWithEffect(options: UseAnchorWithEffectOptions): UseAnchoredScrollReturn {
  const {
    anchorManager,
    scrollTo,
    resolveTarget,
    contentHeight,
    viewportHeight,
    enabled = true,
  } = options;

  const result = useAnchoredScroll(anchorManager, {
    resolveTarget,
    contentHeight,
    viewportHeight,
  });

  const { anchoredScrollPosition } = result;

  // Apply scroll position when anchor changes
  useEffect(() => {
    if (enabled && anchoredScrollPosition !== null) {
      // TODO: Support animate option via smooth scroll
      scrollTo(anchoredScrollPosition);
    }
  }, [enabled, anchoredScrollPosition, scrollTo]);

  return result;
}
