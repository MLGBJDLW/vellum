/**
 * Resilience Context
 *
 * React context for subscribing to resilience events (rate limiting, retry)
 * and displaying feedback in the TUI.
 *
 * @module tui/context/ResilienceContext
 */

import {
  getResilienceEventBus,
  type RateLimitThrottleEvent,
  type ResilienceEventBus,
  type RetryAttemptEvent,
} from "@vellum/core";
import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Active resilience status to display in UI
 */
export interface ResilienceStatus {
  /** Type of resilience event */
  readonly type: "rate-limit" | "retry" | "idle";
  /** Status message to display */
  readonly message: string;
  /** Wait time in seconds (if applicable) */
  readonly waitSeconds?: number;
  /** Current attempt (for retry) */
  readonly attempt?: number;
  /** Max attempts (for retry) */
  readonly maxAttempts?: number;
  /** Timestamp when status was set */
  readonly timestamp: number;
}

/**
 * Resilience context state
 */
export interface ResilienceContextState {
  /** Current resilience status */
  readonly status: ResilienceStatus;
  /** Whether feedback is enabled */
  readonly feedbackEnabled: boolean;
  /** Enable/disable feedback */
  readonly setFeedbackEnabled: (enabled: boolean) => void;
  /** Clear current status */
  readonly clearStatus: () => void;
  /** Event bus instance (for advanced usage) */
  readonly eventBus: ResilienceEventBus;
}

/**
 * Props for ResilienceProvider
 */
export interface ResilienceProviderProps {
  /** Child components */
  readonly children: ReactNode;
  /** Whether feedback is initially enabled (default: true) */
  readonly initialEnabled?: boolean;
  /** Custom event bus instance (optional, uses global by default) */
  readonly eventBus?: ResilienceEventBus;
  /** Auto-clear timeout in milliseconds (default: 5000) */
  readonly autoClearMs?: number;
}

// =============================================================================
// Context
// =============================================================================

const ResilienceContext = createContext<ResilienceContextState | null>(null);

// =============================================================================
// Constants
// =============================================================================

/** Default idle status */
const IDLE_STATUS: ResilienceStatus = {
  type: "idle",
  message: "",
  timestamp: 0,
};

/** Default auto-clear timeout */
const DEFAULT_AUTO_CLEAR_MS = 5000;

// =============================================================================
// Provider Component
// =============================================================================

/**
 * Resilience provider component.
 *
 * Subscribes to resilience events and provides status to child components.
 *
 * @example
 * ```tsx
 * <ResilienceProvider>
 *   <App />
 * </ResilienceProvider>
 * ```
 */
export function ResilienceProvider({
  children,
  initialEnabled = true,
  eventBus: customEventBus,
  autoClearMs = DEFAULT_AUTO_CLEAR_MS,
}: ResilienceProviderProps): React.JSX.Element {
  const [status, setStatus] = useState<ResilienceStatus>(IDLE_STATUS);
  const [feedbackEnabled, setFeedbackEnabled] = useState(initialEnabled);

  // Get event bus (custom or global)
  const eventBus = useMemo(() => customEventBus ?? getResilienceEventBus(), [customEventBus]);

  // Clear status function
  const clearStatus = useCallback(() => {
    setStatus(IDLE_STATUS);
  }, []);

  // Auto-clear timer
  useEffect(() => {
    if (status.type === "idle" || !feedbackEnabled) {
      return;
    }

    const timer = setTimeout(() => {
      setStatus(IDLE_STATUS);
    }, autoClearMs);

    return () => clearTimeout(timer);
  }, [status, feedbackEnabled, autoClearMs]);

  // Subscribe to rate limit events
  useEffect(() => {
    if (!feedbackEnabled) {
      return;
    }

    const unsubThrottle = eventBus.on("rateLimitThrottle", (event: RateLimitThrottleEvent) => {
      const waitSeconds = Math.ceil(event.waitTimeMs / 1000);
      setStatus({
        type: "rate-limit",
        message: `Rate limited, waiting ${waitSeconds}s...`,
        waitSeconds,
        timestamp: event.timestamp,
      });
    });

    const unsubExceeded = eventBus.on("rateLimitExceeded", (event) => {
      const waitSeconds = Math.ceil(event.waitTimeMs / 1000);
      const reason = event.reason === "max_wait" ? "max wait exceeded" : "limit exceeded";
      setStatus({
        type: "rate-limit",
        message: `Rate limit ${reason} (${waitSeconds}s)`,
        waitSeconds,
        timestamp: event.timestamp,
      });
    });

    return () => {
      unsubThrottle();
      unsubExceeded();
    };
  }, [eventBus, feedbackEnabled]);

  // Subscribe to retry events
  useEffect(() => {
    if (!feedbackEnabled) {
      return;
    }

    const unsubAttempt = eventBus.on("retryAttempt", (event: RetryAttemptEvent) => {
      const waitSeconds = Math.ceil(event.delayMs / 1000);
      setStatus({
        type: "retry",
        message: `Retry ${event.attempt}/${event.maxAttempts}, waiting ${waitSeconds}s...`,
        waitSeconds,
        attempt: event.attempt,
        maxAttempts: event.maxAttempts,
        timestamp: event.timestamp,
      });
    });

    const unsubCompleted = eventBus.on("retryCompleted", (event) => {
      if (event.success) {
        // Clear on success
        setStatus(IDLE_STATUS);
      } else {
        // Show failure briefly
        setStatus({
          type: "retry",
          message: `Retry failed after ${event.totalAttempts} attempts`,
          timestamp: event.timestamp,
        });
      }
    });

    return () => {
      unsubAttempt();
      unsubCompleted();
    };
  }, [eventBus, feedbackEnabled]);

  // Build context value
  const value = useMemo<ResilienceContextState>(
    () => ({
      status,
      feedbackEnabled,
      setFeedbackEnabled,
      clearStatus,
      eventBus,
    }),
    [status, feedbackEnabled, clearStatus, eventBus]
  );

  return <ResilienceContext.Provider value={value}>{children}</ResilienceContext.Provider>;
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook to access resilience context.
 *
 * @throws Error if used outside ResilienceProvider
 * @returns ResilienceContextState
 */
export function useResilience(): ResilienceContextState {
  const context = useContext(ResilienceContext);
  if (!context) {
    throw new Error("useResilience must be used within a ResilienceProvider");
  }
  return context;
}

/**
 * Hook to access resilience context optionally.
 *
 * @returns ResilienceContextState or null if outside provider
 */
export function useResilienceOptional(): ResilienceContextState | null {
  return useContext(ResilienceContext);
}

/**
 * Hook to get current resilience status.
 *
 * @returns Current ResilienceStatus
 */
export function useResilienceStatus(): ResilienceStatus {
  const context = useResilience();
  return context.status;
}

/**
 * Hook to check if any resilience event is active.
 *
 * @returns true if rate limiting or retry is in progress
 */
export function useIsResilienceActive(): boolean {
  const context = useResilienceOptional();
  return context?.status.type !== "idle" && context?.status.type !== undefined;
}
