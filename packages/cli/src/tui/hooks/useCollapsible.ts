/**
 * useCollapsible Hook
 *
 * Generic collapsible state management for TUI components.
 * Supports keyboard toggles, animation timing, and state persistence.
 *
 * @module tui/hooks/useCollapsible
 */

import { useInput } from "ink";
import { useCallback, useEffect, useState } from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for the useCollapsible hook.
 */
export interface UseCollapsibleOptions {
  /** Initial collapsed state (default: true) */
  readonly initialCollapsed?: boolean;
  /** Key to toggle collapse state (default: none - manual toggle only) */
  readonly toggleKey?: string;
  /** Whether keyboard toggle is enabled (default: true if toggleKey provided) */
  readonly keyboardEnabled?: boolean;
  /** Unique ID for persistence (if provided, state persists across renders) */
  readonly persistenceId?: string;
  /** Animation duration in ms for expand/collapse (default: 0 - instant) */
  readonly animationDuration?: number;
  /** Callback when state changes */
  readonly onToggle?: (collapsed: boolean) => void;
}

/**
 * Return value of useCollapsible hook.
 */
export interface UseCollapsibleReturn {
  /** Whether the content is currently collapsed */
  readonly isCollapsed: boolean;
  /** Toggle the collapsed state */
  readonly toggle: () => void;
  /** Expand the content */
  readonly expand: () => void;
  /** Collapse the content */
  readonly collapse: () => void;
  /** Set collapsed state directly */
  readonly setCollapsed: (collapsed: boolean) => void;
  /** Whether an animation is in progress */
  readonly isAnimating: boolean;
  /** Animation progress (0-1) for custom animations */
  readonly animationProgress: number;
}

// =============================================================================
// Storage for Persistence
// =============================================================================

/** In-memory storage for collapsible states */
const collapsibleStateStorage = new Map<string, boolean>();

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook for managing collapsible state with optional keyboard toggle and persistence.
 *
 * @param options - Configuration options
 * @returns Collapsible state and controls
 *
 * @example
 * ```tsx
 * // Basic usage with keyboard toggle
 * const { isCollapsed, toggle } = useCollapsible({
 *   initialCollapsed: true,
 *   toggleKey: 't',
 * });
 *
 * // With persistence
 * const { isCollapsed, toggle } = useCollapsible({
 *   initialCollapsed: true,
 *   toggleKey: 't',
 *   persistenceId: 'thinking-block-1',
 * });
 *
 * // With callback
 * const { isCollapsed } = useCollapsible({
 *   toggleKey: 't',
 *   onToggle: (collapsed) => console.log('Collapsed:', collapsed),
 * });
 * ```
 */
export function useCollapsible(options: UseCollapsibleOptions = {}): UseCollapsibleReturn {
  const {
    initialCollapsed = true,
    toggleKey,
    keyboardEnabled = Boolean(toggleKey),
    persistenceId,
    animationDuration = 0,
    onToggle,
  } = options;

  // Initialize from persistence if available
  const getInitialState = (): boolean => {
    if (persistenceId && collapsibleStateStorage.has(persistenceId)) {
      return collapsibleStateStorage.get(persistenceId) ?? initialCollapsed;
    }
    return initialCollapsed;
  };

  const [isCollapsed, setIsCollapsed] = useState(getInitialState);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationProgress, setAnimationProgress] = useState(isCollapsed ? 0 : 1);

  // Update persistence when state changes
  useEffect(() => {
    if (persistenceId) {
      collapsibleStateStorage.set(persistenceId, isCollapsed);
    }
  }, [isCollapsed, persistenceId]);

  // Animation effect
  useEffect(() => {
    if (animationDuration <= 0) {
      setAnimationProgress(isCollapsed ? 0 : 1);
      return;
    }

    setIsAnimating(true);
    // Capture current progress at effect start (before animation begins)
    const startProgress = isCollapsed ? 1 : 0; // Start from opposite of target
    const targetProgress = isCollapsed ? 0 : 1;
    const startTime = Date.now();

    // Store timer ref for cleanup
    const animationTimerRef = { current: null as ReturnType<typeof setTimeout> | null };

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / animationDuration, 1);

      // Ease-out cubic for smooth deceleration
      const eased = 1 - (1 - progress) ** 3;
      const currentProgress = startProgress + (targetProgress - startProgress) * eased;

      setAnimationProgress(currentProgress);

      if (progress < 1) {
        animationTimerRef.current = setTimeout(animate, 16); // ~60fps
      } else {
        setIsAnimating(false);
      }
    };

    animationTimerRef.current = setTimeout(animate, 0);

    return () => {
      if (animationTimerRef.current) {
        clearTimeout(animationTimerRef.current);
      }
    };
  }, [isCollapsed, animationDuration]);

  // Toggle function
  const toggle = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      onToggle?.(next);
      return next;
    });
  }, [onToggle]);

  // Expand function
  const expand = useCallback(() => {
    if (isCollapsed) {
      setIsCollapsed(false);
      onToggle?.(false);
    }
  }, [isCollapsed, onToggle]);

  // Collapse function
  const collapse = useCallback(() => {
    if (!isCollapsed) {
      setIsCollapsed(true);
      onToggle?.(true);
    }
  }, [isCollapsed, onToggle]);

  // Direct setter
  const setCollapsed = useCallback(
    (collapsed: boolean) => {
      if (collapsed !== isCollapsed) {
        setIsCollapsed(collapsed);
        onToggle?.(collapsed);
      }
    },
    [isCollapsed, onToggle]
  );

  // Keyboard toggle handler
  useInput(
    (input, _key) => {
      if (keyboardEnabled && toggleKey && input.toLowerCase() === toggleKey.toLowerCase()) {
        toggle();
      }
    },
    { isActive: keyboardEnabled }
  );

  return {
    isCollapsed,
    toggle,
    expand,
    collapse,
    setCollapsed,
    isAnimating,
    animationProgress,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Clear persisted collapsible state for a given ID.
 */
export function clearCollapsibleState(persistenceId: string): void {
  collapsibleStateStorage.delete(persistenceId);
}

/**
 * Clear all persisted collapsible states.
 */
export function clearAllCollapsibleStates(): void {
  collapsibleStateStorage.clear();
}

export default useCollapsible;
