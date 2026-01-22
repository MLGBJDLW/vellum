/**
 * Rate Limit Indicator Component
 *
 * Displays rate limit status and warnings in the TUI.
 * Placeholder implementation - to be expanded.
 *
 * @module tui/components/RateLimitIndicator
 */

import { Text } from "ink";
import type React from "react";

// =============================================================================
// Types
// =============================================================================

export interface RateLimitIndicatorProps {
  /** Whether rate limiting is active */
  isLimited?: boolean;
  /** Remaining requests */
  remaining?: number;
  /** Total limit */
  limit?: number;
  /** Time until reset (seconds) */
  resetIn?: number;
  /** Whether to show compact view */
  compact?: boolean;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Displays rate limit status
 */
export function RateLimitIndicator({
  isLimited = false,
  remaining,
  limit,
  resetIn,
  compact = false,
}: RateLimitIndicatorProps): React.ReactElement | null {
  // Don't render if not limited and no info to show
  if (!isLimited && remaining === undefined) {
    return null;
  }

  if (compact) {
    if (isLimited) {
      return <Text color="yellow">⚠ Rate limited</Text>;
    }
    if (remaining !== undefined && limit !== undefined) {
      const percentage = (remaining / limit) * 100;
      const color = percentage < 20 ? "yellow" : "green";
      return (
        <Text color={color}>
          {remaining}/{limit}
        </Text>
      );
    }
    return null;
  }

  // Full view
  if (isLimited) {
    const resetText = resetIn !== undefined ? ` (resets in ${resetIn}s)` : "";
    return <Text color="yellow">⚠ Rate limited{resetText}</Text>;
  }

  if (remaining !== undefined && limit !== undefined) {
    return (
      <Text dimColor>
        Requests: {remaining}/{limit}
      </Text>
    );
  }

  return null;
}

export default RateLimitIndicator;
