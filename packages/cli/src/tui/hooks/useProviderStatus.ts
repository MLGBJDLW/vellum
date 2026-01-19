/**
 * useProviderStatus Hook
 *
 * Tracks provider status including circuit breaker states for the TUI.
 * Provides real-time status updates for model status bar display.
 *
 * @module tui/hooks/useProviderStatus
 */

import { useCallback, useEffect, useState } from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Circuit breaker state following standard pattern.
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failure threshold exceeded, requests rejected
 * - HALF_OPEN: Testing if service has recovered
 */
export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

/**
 * Individual provider status entry.
 */
export interface ProviderStatusEntry {
  /** Provider identifier (e.g., 'anthropic', 'openai', 'google') */
  readonly id: string;
  /** Display name for the provider */
  readonly name: string;
  /** Current circuit breaker state */
  readonly circuitState: CircuitState;
  /** Whether this is the currently active provider */
  readonly isActive: boolean;
  /** Number of failures in current window */
  readonly failureCount: number;
  /** Time until circuit may reset (ms), 0 if not in OPEN state */
  readonly timeUntilReset: number;
  /** Last error message if any */
  readonly lastError?: string;
}

/**
 * Return type for useProviderStatus hook.
 */
export interface UseProviderStatusReturn {
  /** Array of all tracked provider statuses */
  readonly providers: readonly ProviderStatusEntry[];
  /** Currently active provider ID */
  readonly activeProviderId: string | undefined;
  /** Set the active provider */
  readonly setActiveProvider: (providerId: string) => void;
  /** Update a provider's circuit state */
  readonly updateProviderState: (
    providerId: string,
    state: CircuitState,
    failureCount?: number,
    lastError?: string
  ) => void;
  /** Register a new provider */
  readonly registerProvider: (id: string, name: string) => void;
  /** Unregister a provider */
  readonly unregisterProvider: (id: string) => void;
  /** Get status for a specific provider */
  readonly getProviderStatus: (providerId: string) => ProviderStatusEntry | undefined;
  /** Count of healthy (CLOSED state) providers */
  readonly healthyCount: number;
  /** Count of unhealthy (OPEN state) providers */
  readonly unhealthyCount: number;
  /** Count of half-open providers */
  readonly halfOpenCount: number;
}

/**
 * Options for useProviderStatus hook.
 */
export interface UseProviderStatusOptions {
  /** Initial providers to track */
  readonly initialProviders?: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly isActive?: boolean;
  }>;
  /** Interval to update time-until-reset values (ms) */
  readonly updateInterval?: number;
}

// =============================================================================
// Constants
// =============================================================================

/** Default update interval for time-based state changes */
const DEFAULT_UPDATE_INTERVAL = 1000;

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook for tracking provider status including circuit breaker states.
 *
 * @param options - Configuration options
 * @returns Provider status state and actions
 *
 * @example
 * ```tsx
 * const { providers, activeProviderId, setActiveProvider } = useProviderStatus({
 *   initialProviders: [
 *     { id: 'anthropic', name: 'Claude', isActive: true },
 *     { id: 'openai', name: 'GPT-4' },
 *     { id: 'google', name: 'Gemini' },
 *   ],
 * });
 * ```
 */
export function useProviderStatus(options: UseProviderStatusOptions = {}): UseProviderStatusReturn {
  const { initialProviders = [], updateInterval = DEFAULT_UPDATE_INTERVAL } = options;

  // State: Map of provider ID to status entry
  const [providerMap, setProviderMap] = useState<Map<string, ProviderStatusEntry>>(() => {
    const map = new Map<string, ProviderStatusEntry>();
    for (const provider of initialProviders) {
      map.set(provider.id, {
        id: provider.id,
        name: provider.name,
        circuitState: "CLOSED",
        isActive: provider.isActive ?? false,
        failureCount: 0,
        timeUntilReset: 0,
      });
    }
    return map;
  });

  // Derived: Active provider ID
  const activeProviderId = Array.from(providerMap.values()).find((p) => p.isActive)?.id;

  // Set active provider
  const setActiveProvider = useCallback((providerId: string) => {
    setProviderMap((prev) => {
      const next = new Map(prev);
      for (const [id, entry] of next) {
        next.set(id, {
          ...entry,
          isActive: id === providerId,
        });
      }
      return next;
    });
  }, []);

  // Update provider circuit state
  const updateProviderState = useCallback(
    (providerId: string, state: CircuitState, failureCount?: number, lastError?: string) => {
      setProviderMap((prev) => {
        const entry = prev.get(providerId);
        if (!entry) return prev;

        const next = new Map(prev);
        next.set(providerId, {
          ...entry,
          circuitState: state,
          failureCount: failureCount ?? entry.failureCount,
          lastError: lastError ?? entry.lastError,
          // Reset timeUntilReset based on state
          timeUntilReset: state === "OPEN" ? 30000 : 0, // Default 30s reset timeout
        });
        return next;
      });
    },
    []
  );

  // Register new provider
  const registerProvider = useCallback((id: string, name: string) => {
    setProviderMap((prev) => {
      if (prev.has(id)) return prev;

      const next = new Map(prev);
      next.set(id, {
        id,
        name,
        circuitState: "CLOSED",
        isActive: next.size === 0, // First provider is active by default
        failureCount: 0,
        timeUntilReset: 0,
      });
      return next;
    });
  }, []);

  // Unregister provider
  const unregisterProvider = useCallback((id: string) => {
    setProviderMap((prev) => {
      if (!prev.has(id)) return prev;

      const next = new Map(prev);
      const wasActive = next.get(id)?.isActive;
      next.delete(id);

      // If removed provider was active, activate first remaining provider
      if (wasActive && next.size > 0) {
        const firstId = next.keys().next().value;
        if (firstId !== undefined) {
          const firstEntry = next.get(firstId);
          if (firstEntry) {
            next.set(firstId, { ...firstEntry, isActive: true });
          }
        }
      }

      return next;
    });
  }, []);

  // Get status for specific provider
  const getProviderStatus = useCallback(
    (providerId: string): ProviderStatusEntry | undefined => {
      return providerMap.get(providerId);
    },
    [providerMap]
  );

  // Timer to decrement timeUntilReset for OPEN circuits
  useEffect(() => {
    const timer = setInterval(() => {
      setProviderMap((prev) => {
        let hasChanges = false;
        const next = new Map(prev);

        for (const [id, entry] of next) {
          if (entry.circuitState === "OPEN" && entry.timeUntilReset > 0) {
            hasChanges = true;
            const newTime = Math.max(0, entry.timeUntilReset - updateInterval);
            next.set(id, {
              ...entry,
              timeUntilReset: newTime,
              // Auto-transition to HALF_OPEN when timer expires
              circuitState: newTime === 0 ? "HALF_OPEN" : "OPEN",
            });
          }
        }

        return hasChanges ? next : prev;
      });
    }, updateInterval);

    return () => clearInterval(timer);
  }, [updateInterval]);

  // Compute counts
  const providers = Array.from(providerMap.values());
  const healthyCount = providers.filter((p) => p.circuitState === "CLOSED").length;
  const unhealthyCount = providers.filter((p) => p.circuitState === "OPEN").length;
  const halfOpenCount = providers.filter((p) => p.circuitState === "HALF_OPEN").length;

  return {
    providers,
    activeProviderId,
    setActiveProvider,
    updateProviderState,
    registerProvider,
    unregisterProvider,
    getProviderStatus,
    healthyCount,
    unhealthyCount,
    halfOpenCount,
  };
}
