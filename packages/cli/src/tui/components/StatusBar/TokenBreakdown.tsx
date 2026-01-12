/**
 * TokenBreakdown Component (Token Counting Fix)
 *
 * Displays granular token breakdown with cumulative vs per-turn stats.
 * Shows: input | output | cache | thinking tokens with turn/total distinction.
 *
 * @module tui/components/StatusBar/TokenBreakdown
 */

import { Box, Text } from "ink";
import { useMemo } from "react";
import { useTheme } from "../../theme/index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Detailed token usage statistics
 */
export interface TokenStats {
  /** Number of input tokens */
  readonly inputTokens: number;
  /** Number of output tokens */
  readonly outputTokens: number;
  /** Number of tokens used for thinking/reasoning (if applicable) */
  readonly thinkingTokens?: number;
  /** Number of tokens read from cache (if applicable) */
  readonly cacheReadTokens?: number;
  /** Number of tokens written to cache (if applicable) */
  readonly cacheWriteTokens?: number;
}

/**
 * Props for the TokenBreakdown component.
 */
export interface TokenBreakdownProps {
  /** Current turn token usage */
  readonly turn?: TokenStats;
  /** Cumulative session token usage */
  readonly total: TokenStats;
  /** Whether to show compact format (default: false) */
  readonly compact?: boolean;
  /** Whether to show turn stats (default: true if turn provided) */
  readonly showTurn?: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Formats a number with K/M suffix for compact display.
 */
function formatTokenCount(count: number): string {
  if (count < 1000) {
    return count.toString();
  }
  if (count < 1000000) {
    const k = count / 1000;
    return k >= 10 ? `${Math.round(k)}K` : `${k.toFixed(1)}K`;
  }
  const m = count / 1000000;
  return m >= 10 ? `${Math.round(m)}M` : `${m.toFixed(1)}M`;
}

/**
 * Formats a signed number (with + prefix for positive) for turn display.
 */
function formatTurnCount(count: number): string {
  const formatted = formatTokenCount(count);
  return count > 0 ? `+${formatted}` : formatted;
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * TokenBreakdown displays granular token usage with turn vs cumulative distinction.
 *
 * Compact format: `in: X | out: Y | cache: Z | think: W`
 * Full format with turn: `Turn: +X in +Y out | Total: A in B out`
 *
 * @example
 * ```tsx
 * // Compact cumulative only
 * <TokenBreakdown
 *   total={{ inputTokens: 5000, outputTokens: 2000, cacheReadTokens: 500 }}
 *   compact
 * />
 * // Output: in: 5K | out: 2K | cache: 500
 *
 * // With turn breakdown
 * <TokenBreakdown
 *   turn={{ inputTokens: 500, outputTokens: 200 }}
 *   total={{ inputTokens: 5000, outputTokens: 2000 }}
 * />
 * // Output: Turn: +500 in +200 out | Total: 5K in 2K out
 * ```
 */
export function TokenBreakdown({
  turn,
  total,
  compact = false,
  showTurn = true,
}: TokenBreakdownProps): React.JSX.Element {
  const { theme } = useTheme();

  // Memoized formatted values for total
  const formattedTotal = useMemo(
    () => ({
      input: formatTokenCount(total.inputTokens),
      output: formatTokenCount(total.outputTokens),
      thinking: total.thinkingTokens ? formatTokenCount(total.thinkingTokens) : null,
      cache:
        total.cacheReadTokens || total.cacheWriteTokens
          ? formatTokenCount((total.cacheReadTokens ?? 0) + (total.cacheWriteTokens ?? 0))
          : null,
    }),
    [total]
  );

  // Memoized formatted values for turn (if provided)
  const formattedTurn = useMemo(() => {
    if (!turn) return null;
    return {
      input: formatTurnCount(turn.inputTokens),
      output: formatTurnCount(turn.outputTokens),
      thinking: turn.thinkingTokens ? formatTurnCount(turn.thinkingTokens) : null,
      cache:
        turn.cacheReadTokens || turn.cacheWriteTokens
          ? formatTurnCount((turn.cacheReadTokens ?? 0) + (turn.cacheWriteTokens ?? 0))
          : null,
    };
  }, [turn]);

  const hasTurn = showTurn && turn && formattedTurn;

  // Compact format: `in: X | out: Y | cache: Z | think: W`
  if (compact) {
    const parts: React.ReactNode[] = [];

    parts.push(
      <Text key="in" color={theme.semantic.text.secondary}>
        in: <Text color={theme.colors.info}>{formattedTotal.input}</Text>
      </Text>
    );

    parts.push(
      <Text key="out" color={theme.semantic.text.secondary}>
        out: <Text color={theme.colors.success}>{formattedTotal.output}</Text>
      </Text>
    );

    if (formattedTotal.cache) {
      parts.push(
        <Text key="cache" color={theme.semantic.text.secondary}>
          cache: <Text color={theme.semantic.text.muted}>{formattedTotal.cache}</Text>
        </Text>
      );
    }

    if (formattedTotal.thinking) {
      parts.push(
        <Text key="think" color={theme.semantic.text.secondary}>
          think: <Text color={theme.colors.warning}>{formattedTotal.thinking}</Text>
        </Text>
      );
    }

    return (
      <Box>
        {parts.map((part, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Parts array is built locally with stable order, not reordered or filtered
          <Text key={`wrapper-${index}`}>
            {index > 0 && <Text color={theme.semantic.border.muted}> │ </Text>}
            {part}
          </Text>
        ))}
      </Box>
    );
  }

  // Full format with turn distinction
  if (hasTurn) {
    return (
      <Box>
        {/* Turn stats */}
        <Text color={theme.semantic.text.muted}>Turn: </Text>
        <Text color={theme.colors.info}>{formattedTurn.input}</Text>
        <Text color={theme.semantic.text.muted}> in </Text>
        <Text color={theme.colors.success}>{formattedTurn.output}</Text>
        <Text color={theme.semantic.text.muted}> out</Text>
        {formattedTurn.thinking && (
          <>
            <Text color={theme.semantic.text.muted}> </Text>
            <Text color={theme.colors.warning}>{formattedTurn.thinking}</Text>
            <Text color={theme.semantic.text.muted}> think</Text>
          </>
        )}

        {/* Separator */}
        <Text color={theme.semantic.border.muted}> │ </Text>

        {/* Total stats */}
        <Text color={theme.semantic.text.muted}>Total: </Text>
        <Text color={theme.semantic.text.secondary}>{formattedTotal.input}</Text>
        <Text color={theme.semantic.text.muted}> in </Text>
        <Text color={theme.semantic.text.secondary}>{formattedTotal.output}</Text>
        <Text color={theme.semantic.text.muted}> out</Text>
        {formattedTotal.thinking && (
          <>
            <Text color={theme.semantic.text.muted}> </Text>
            <Text color={theme.semantic.text.secondary}>{formattedTotal.thinking}</Text>
            <Text color={theme.semantic.text.muted}> think</Text>
          </>
        )}
      </Box>
    );
  }

  // Full format without turn (total only)
  return (
    <Box>
      <Text color={theme.semantic.text.secondary}>{formattedTotal.input}</Text>
      <Text color={theme.semantic.text.muted}> in </Text>
      <Text color={theme.semantic.text.secondary}>{formattedTotal.output}</Text>
      <Text color={theme.semantic.text.muted}> out</Text>
      {formattedTotal.cache && (
        <>
          <Text color={theme.semantic.text.muted}> </Text>
          <Text color={theme.semantic.text.muted}>{formattedTotal.cache}</Text>
          <Text color={theme.semantic.text.muted}> cache</Text>
        </>
      )}
      {formattedTotal.thinking && (
        <>
          <Text color={theme.semantic.text.muted}> </Text>
          <Text color={theme.colors.warning}>{formattedTotal.thinking}</Text>
          <Text color={theme.semantic.text.muted}> think</Text>
        </>
      )}
    </Box>
  );
}
