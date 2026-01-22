/**
 * Rate Limit Context
 *
 * Provides rate limiting state and notifications for the TUI.
 *
 * @module tui/context/RateLimitContext
 */

import type { EventBus, RateLimiterConfig } from "@vellum/core";
import type { JSX } from "react";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
// =============================================================================
// Types
// =============================================================================

export interface RateLimitState {
  /** Whether rate limiting is currently active */
  isRateLimited: boolean;
  /** Current retry delay in milliseconds */
  retryAfterMs?: number;
  /** Number of retries performed */
  retryCount: number;
  /** Last rate limit error message */
  lastError?: string;
}

export interface RateLimitContextValue {
  /** Current rate limit state */
  state: RateLimitState;
  /** Set rate limited state */
  setRateLimited: (limited: boolean, retryAfterMs?: number) => void;
  /** Increment retry count */
  incrementRetry: () => void;
  /** Reset rate limit state */
  reset: () => void;
}

// =============================================================================
// Context
// =============================================================================

const defaultState: RateLimitState = {
  isRateLimited: false,
  retryCount: 0,
};

const RateLimitContext = createContext<RateLimitContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

export interface RateLimitProviderProps {
  children: ReactNode;
  config?: RateLimiterConfig;
  eventBus?: EventBus;
}

export function RateLimitProvider({
  children,
  config: _config,
  eventBus: _eventBus,
}: RateLimitProviderProps): JSX.Element {
  const [state, setState] = useState<RateLimitState>(defaultState);

  const setRateLimited = useCallback((limited: boolean, retryAfterMs?: number) => {
    setState((prev) => ({
      ...prev,
      isRateLimited: limited,
      retryAfterMs: limited ? retryAfterMs : undefined,
    }));
  }, []);

  const incrementRetry = useCallback(() => {
    setState((prev) => ({
      ...prev,
      retryCount: prev.retryCount + 1,
    }));
  }, []);

  const reset = useCallback(() => {
    setState(defaultState);
  }, []);

  const value = useMemo<RateLimitContextValue>(
    () => ({
      state,
      setRateLimited,
      incrementRetry,
      reset,
    }),
    [state, setRateLimited, incrementRetry, reset]
  );

  return <RateLimitContext.Provider value={value}>{children}</RateLimitContext.Provider>;
}

// =============================================================================
// Hook
// =============================================================================

export function useRateLimit(): RateLimitContextValue {
  const context = useContext(RateLimitContext);
  if (!context) {
    throw new Error("useRateLimit must be used within a RateLimitProvider");
  }
  return context;
}
