/**
 * Tool Timeout Warning Context
 *
 * React context for subscribing to tool timeout warning events
 * and displaying feedback in the TUI.
 *
 * @module tui/context/ToolTimeoutContext
 */

import { type EventBus, getToolEventBus, toolTimeoutWarning } from "@vellum/core";
import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { z } from "zod";

// =============================================================================
// Types
// =============================================================================

/**
 * Tool timeout warning event payload type
 */
export type ToolTimeoutWarningPayload = z.infer<typeof toolTimeoutWarning.schema>;

/**
 * Active tool timeout warning status to display in UI
 */
export interface ToolTimeoutWarningStatus {
  /** Whether a warning is currently active */
  readonly active: boolean;
  /** Call ID of the warning (for deduplication) */
  readonly callId: string | null;
  /** Name of the tool approaching timeout */
  readonly toolName: string | null;
  /** Time remaining until timeout in milliseconds */
  readonly remainingMs: number | null;
  /** Time remaining until timeout in seconds (for display) */
  readonly remainingSeconds: number | null;
  /** Percentage of timeout elapsed (0-100) */
  readonly percentComplete: number | null;
  /** Timestamp when warning was received */
  readonly timestamp: number;
}

/**
 * Tool timeout context state
 */
export interface ToolTimeoutContextState {
  /** Current timeout warning status */
  readonly status: ToolTimeoutWarningStatus;
  /** Whether feedback is enabled */
  readonly feedbackEnabled: boolean;
  /** Enable/disable feedback */
  readonly setFeedbackEnabled: (enabled: boolean) => void;
  /** Clear current warning status */
  readonly clearStatus: () => void;
  /** Event bus instance (for advanced usage) */
  readonly eventBus: EventBus;
}

/**
 * Props for ToolTimeoutProvider
 */
export interface ToolTimeoutProviderProps {
  /** Child components */
  readonly children: ReactNode;
  /** Whether feedback is initially enabled (default: true) */
  readonly initialEnabled?: boolean;
  /** Custom event bus instance (optional, uses global by default) */
  readonly eventBus?: EventBus;
  /** Auto-clear timeout in milliseconds (default: 3000) */
  readonly autoClearMs?: number;
}

// =============================================================================
// Context
// =============================================================================

const ToolTimeoutContext = createContext<ToolTimeoutContextState | null>(null);

// =============================================================================
// Constants
// =============================================================================

/** Default idle status */
const IDLE_STATUS: ToolTimeoutWarningStatus = {
  active: false,
  callId: null,
  toolName: null,
  remainingMs: null,
  remainingSeconds: null,
  percentComplete: null,
  timestamp: 0,
};

/** Default auto-clear timeout */
const DEFAULT_AUTO_CLEAR_MS = 3000;

// =============================================================================
// Provider Component
// =============================================================================

/**
 * Tool timeout warning provider component.
 *
 * Subscribes to tool timeout warning events and provides status to child components.
 *
 * @example
 * ```tsx
 * <ToolTimeoutProvider>
 *   <App />
 * </ToolTimeoutProvider>
 * ```
 */
export function ToolTimeoutProvider({
  children,
  initialEnabled = true,
  eventBus: customEventBus,
  autoClearMs = DEFAULT_AUTO_CLEAR_MS,
}: ToolTimeoutProviderProps): React.JSX.Element {
  const [status, setStatus] = useState<ToolTimeoutWarningStatus>(IDLE_STATUS);
  const [feedbackEnabled, setFeedbackEnabled] = useState(initialEnabled);

  // Get event bus (custom or global)
  const eventBus = useMemo(() => customEventBus ?? getToolEventBus(), [customEventBus]);

  // Clear status function
  const clearStatus = useCallback(() => {
    setStatus(IDLE_STATUS);
  }, []);

  // Auto-clear timer
  useEffect(() => {
    if (!status.active || !feedbackEnabled) {
      return;
    }

    const timer = setTimeout(() => {
      setStatus(IDLE_STATUS);
    }, autoClearMs);

    return () => clearTimeout(timer);
  }, [status, feedbackEnabled, autoClearMs]);

  // Subscribe to tool timeout warning events
  useEffect(() => {
    if (!feedbackEnabled) {
      return;
    }

    const unsubscribe = eventBus.on(toolTimeoutWarning, (event: ToolTimeoutWarningPayload) => {
      const remainingSeconds = Math.ceil(event.remainingMs / 1000);
      setStatus({
        active: true,
        callId: event.callId,
        toolName: event.toolName,
        remainingMs: event.remainingMs,
        remainingSeconds,
        percentComplete: event.percentComplete,
        timestamp: Date.now(),
      });
    });

    return unsubscribe;
  }, [eventBus, feedbackEnabled]);

  // Build context value
  const value = useMemo<ToolTimeoutContextState>(
    () => ({
      status,
      feedbackEnabled,
      setFeedbackEnabled,
      clearStatus,
      eventBus,
    }),
    [status, feedbackEnabled, clearStatus, eventBus]
  );

  return <ToolTimeoutContext.Provider value={value}>{children}</ToolTimeoutContext.Provider>;
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook to access tool timeout context.
 *
 * @throws Error if used outside ToolTimeoutProvider
 * @returns ToolTimeoutContextState
 */
export function useToolTimeout(): ToolTimeoutContextState {
  const context = useContext(ToolTimeoutContext);
  if (!context) {
    throw new Error("useToolTimeout must be used within a ToolTimeoutProvider");
  }
  return context;
}

/**
 * Hook to access tool timeout context optionally.
 *
 * @returns ToolTimeoutContextState or null if outside provider
 */
export function useToolTimeoutOptional(): ToolTimeoutContextState | null {
  return useContext(ToolTimeoutContext);
}

/**
 * Hook to get current tool timeout warning status.
 *
 * @returns Current ToolTimeoutWarningStatus
 */
export function useToolTimeoutStatus(): ToolTimeoutWarningStatus {
  const context = useToolTimeout();
  return context.status;
}

/**
 * Hook to check if a tool timeout warning is active.
 *
 * @returns true if a timeout warning is currently displayed
 */
export function useIsToolTimeoutActive(): boolean {
  const context = useToolTimeoutOptional();
  return context?.status.active ?? false;
}
