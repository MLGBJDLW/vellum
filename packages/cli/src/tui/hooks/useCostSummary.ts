/**
 * Cost Summary Hook
 *
 * Provides aggregated cost information for the current session.
 * Placeholder implementation - to be expanded.
 *
 * @module tui/hooks/useCostSummary
 */

import { useEffect, useState } from "react";

// =============================================================================
// Types
// =============================================================================

export interface CostSummary {
  /** Total cost in USD */
  totalCost: number;
  /** Total input tokens */
  inputTokens: number;
  /** Total output tokens */
  outputTokens: number;
  /** Number of API calls */
  apiCalls: number;
}

export interface UseCostSummaryResult {
  /** Current cost summary */
  summary: CostSummary;
  /** Whether data is loading */
  isLoading: boolean;
  /** Any error that occurred */
  error: Error | null;
  /** Reset the cost summary */
  reset: () => void;
}

// =============================================================================
// Hook
// =============================================================================

const defaultSummary: CostSummary = {
  totalCost: 0,
  inputTokens: 0,
  outputTokens: 0,
  apiCalls: 0,
};

/**
 * Hook to track and display cost summary
 */
export function useCostSummary(): UseCostSummaryResult {
  const [summary, setSummary] = useState<CostSummary>(defaultSummary);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const reset = () => {
    setSummary(defaultSummary);
    setError(null);
  };

  useEffect(() => {
    // Placeholder: In real implementation, subscribe to cost events
    setIsLoading(false);
  }, []);

  return {
    summary,
    isLoading,
    error,
    reset,
  };
}

export default useCostSummary;
