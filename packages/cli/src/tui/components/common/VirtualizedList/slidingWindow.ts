/**
 * Streaming Sliding Window
 *
 * 用于处理超长流式输出，将稳定行 flush 到虚拟化历史。
 *
 * 架构:
 * - LIVE_LINES_LIMIT: 实时渲染的最大行数
 * - flushedLines: 已 flush 到历史的行
 * - liveLines: 等待渲染的行
 *
 * 工作流程:
 * 1. 新行通过 APPEND_LINES 追加到 liveLines
 * 2. 当 liveLines 超过 flushThreshold 时，触发 flush
 * 3. flush 将前 flushBatchSize 行移动到 flushedLines
 * 4. flushedLines 可被虚拟化渲染，减少实时渲染压力
 *
 * @module slidingWindow
 */

import React, { useCallback, useMemo, useReducer } from "react";

// ============================================================================
// Configuration
// ============================================================================

/**
 * Sliding window configuration options.
 */
export interface SlidingWindowConfig {
  /** 实时渲染的最大行数 */
  readonly liveLimit: number;
  /** 触发 flush 的阈值 (行数) */
  readonly flushThreshold: number;
  /** 单次 flush 的批量大小 */
  readonly flushBatchSize: number;
  /** Initial flush interval in ms (default: 50) */
  readonly initialFlushInterval?: number;
  /** Minimum flush interval in ms (default: 16) */
  readonly minFlushInterval?: number;
  /** Maximum flush interval in ms (default: 200) */
  readonly maxFlushInterval?: number;
}

/**
 * Render budget state for adaptive flush interval.
 * Adjusts flush frequency based on actual render performance.
 */
export interface RenderBudgetState {
  /** Time of last render in ms */
  lastRenderTime: number;
  /** Current adaptive flush interval in ms */
  adaptiveFlushInterval: number;
}

/**
 * Default sliding window configuration.
 *
 * - liveLimit: 500 行 - 实时渲染窗口大小
 * - flushThreshold: 400 行 (80%) - 触发 flush 的阈值
 * - flushBatchSize: 100 行 - 每次 flush 的行数
 * - initialFlushInterval: 50ms - Starting flush interval
 * - minFlushInterval: 16ms - Minimum (60fps budget)
 * - maxFlushInterval: 200ms - Maximum to prevent sluggishness
 */
export const DEFAULT_SLIDING_WINDOW_CONFIG: SlidingWindowConfig = {
  liveLimit: 500,
  flushThreshold: 400, // 80% of liveLimit
  flushBatchSize: 100,
  initialFlushInterval: 50,
  minFlushInterval: 16,
  maxFlushInterval: 200,
} as const;

/**
 * Create initial render budget state.
 *
 * @param initialInterval - Initial flush interval in ms
 * @returns Initial render budget state
 */
export function createRenderBudgetState(
  initialInterval: number = DEFAULT_SLIDING_WINDOW_CONFIG.initialFlushInterval ?? 50
): RenderBudgetState {
  return {
    lastRenderTime: 0,
    adaptiveFlushInterval: initialInterval,
  };
}

/**
 * Update render budget based on measured render time.
 * Implements adaptive flush interval:
 * - If render > 8ms: increase interval by 50% (slower flushes)
 * - If render < 4ms: decrease interval by 20% (faster flushes)
 *
 * @param budget - Current render budget state
 * @param renderTimeMs - Measured render time in milliseconds
 * @param config - Sliding window configuration
 * @returns Updated render budget state
 */
export function updateRenderBudget(
  budget: RenderBudgetState,
  renderTimeMs: number,
  config: SlidingWindowConfig = DEFAULT_SLIDING_WINDOW_CONFIG
): RenderBudgetState {
  const minInterval = config.minFlushInterval ?? 16;
  const maxInterval = config.maxFlushInterval ?? 200;

  let newInterval = budget.adaptiveFlushInterval;

  if (renderTimeMs > 8) {
    // Render taking too long, slow down flushes
    newInterval = Math.min(maxInterval, budget.adaptiveFlushInterval * 1.5);
  } else if (renderTimeMs < 4) {
    // Render has headroom, speed up flushes
    newInterval = Math.max(minInterval, budget.adaptiveFlushInterval * 0.8);
  }

  return {
    lastRenderTime: renderTimeMs,
    adaptiveFlushInterval: newInterval,
  };
}

// ============================================================================
// State
// ============================================================================

/**
 * Sliding window state.
 */
export interface SlidingWindowState {
  /** 已 flush 到历史的行 */
  readonly flushedLines: readonly string[];
  /** 实时渲染的行 */
  readonly liveLines: readonly string[];
  /** 总行数 (flushed + live) */
  readonly totalLines: number;
  /** flush 计数 */
  readonly flushCount: number;
  /** 是否正在流式输出 */
  readonly isStreaming: boolean;
}

/**
 * Creates the initial sliding window state.
 *
 * @returns Initial state with empty lines
 */
export function createInitialState(): SlidingWindowState {
  return {
    flushedLines: [],
    liveLines: [],
    totalLines: 0,
    flushCount: 0,
    isStreaming: false,
  };
}

// ============================================================================
// Actions
// ============================================================================

/**
 * Sliding window actions.
 */
export type SlidingWindowAction =
  | { readonly type: "APPEND_LINES"; readonly lines: readonly string[] }
  | { readonly type: "FLUSH_STABLE" }
  | { readonly type: "RESET" }
  | { readonly type: "SET_STREAMING"; readonly isStreaming: boolean };

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Checks if the sliding window should flush stable lines.
 *
 * @param state - Current sliding window state
 * @param config - Sliding window configuration
 * @returns True if flush should be triggered
 */
export function shouldFlush(
  state: SlidingWindowState,
  config: SlidingWindowConfig = DEFAULT_SLIDING_WINDOW_CONFIG
): boolean {
  return state.liveLines.length >= config.flushThreshold;
}

/**
 * Gets all visible lines (flushed + live).
 *
 * @param state - Current sliding window state
 * @returns Combined array of all lines
 */
export function getVisibleLines(state: SlidingWindowState): string[] {
  return [...state.flushedLines, ...state.liveLines];
}

/**
 * Gets the total line count.
 *
 * @param state - Current sliding window state
 * @returns Total number of lines
 */
export function getTotalLineCount(state: SlidingWindowState): number {
  return state.totalLines;
}

/**
 * Performs a flush operation on the state.
 *
 * @param state - Current state
 * @param config - Configuration
 * @returns New state after flush
 */
function performFlush(state: SlidingWindowState, config: SlidingWindowConfig): SlidingWindowState {
  const { liveLines, flushedLines, flushCount, isStreaming } = state;

  // Nothing to flush
  if (liveLines.length <= config.flushBatchSize) {
    return state;
  }

  // Split live lines: first batch goes to flushed, rest stays live
  const linesToFlush = liveLines.slice(0, config.flushBatchSize);
  const remainingLive = liveLines.slice(config.flushBatchSize);

  return {
    flushedLines: [...flushedLines, ...linesToFlush],
    liveLines: remainingLive,
    totalLines: state.totalLines,
    flushCount: flushCount + 1,
    isStreaming,
  };
}

/**
 * Ensures live lines stay within the limit by flushing if necessary.
 *
 * @param state - Current state
 * @param config - Configuration
 * @returns New state with enforced limit
 */
function enforceLiveLimit(
  state: SlidingWindowState,
  config: SlidingWindowConfig
): SlidingWindowState {
  let currentState = state;

  // Keep flushing until we're under the limit
  while (currentState.liveLines.length > config.liveLimit) {
    const nextState = performFlush(currentState, config);
    // Safety: prevent infinite loop if flush doesn't reduce lines
    if (nextState === currentState) {
      break;
    }
    currentState = nextState;
  }

  return currentState;
}

// ============================================================================
// Reducer
// ============================================================================

/**
 * Sliding window reducer (pure function).
 *
 * Handles state transitions for the sliding window:
 * - APPEND_LINES: Adds new lines, auto-flushes if over limit
 * - FLUSH_STABLE: Manually triggers a flush operation
 * - RESET: Clears all state
 * - SET_STREAMING: Updates streaming status
 *
 * @param state - Current state
 * @param action - Action to apply
 * @param config - Configuration (defaults to DEFAULT_SLIDING_WINDOW_CONFIG)
 * @returns New state
 *
 * @example
 * ```ts
 * const nextState = slidingWindowReducer(
 *   state,
 *   { type: 'APPEND_LINES', lines: ['line1', 'line2'] }
 * );
 * ```
 */
export function slidingWindowReducer(
  state: SlidingWindowState,
  action: SlidingWindowAction,
  config: SlidingWindowConfig = DEFAULT_SLIDING_WINDOW_CONFIG
): SlidingWindowState {
  switch (action.type) {
    case "APPEND_LINES": {
      const { lines } = action;

      // No-op for empty input
      if (lines.length === 0) {
        return state;
      }

      // Append new lines
      const newLiveLines = [...state.liveLines, ...lines];
      const newTotalLines = state.totalLines + lines.length;

      let newState: SlidingWindowState = {
        ...state,
        liveLines: newLiveLines,
        totalLines: newTotalLines,
      };

      // Auto-flush if we exceed the threshold
      if (shouldFlush(newState, config)) {
        newState = enforceLiveLimit(newState, config);
      }

      return newState;
    }

    case "FLUSH_STABLE": {
      // Only flush if we have enough lines
      if (!shouldFlush(state, config)) {
        return state;
      }

      return performFlush(state, config);
    }

    case "RESET": {
      return createInitialState();
    }

    case "SET_STREAMING": {
      if (state.isStreaming === action.isStreaming) {
        return state;
      }

      return {
        ...state,
        isStreaming: action.isStreaming,
      };
    }

    default: {
      // Type-safe exhaustive check
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

// ============================================================================
// React Hook
// ============================================================================

/**
 * React hook for managing sliding window state.
 *
 * Provides a convenient API for streaming content management with
 * automatic flush handling.
 *
 * @param config - Partial configuration (merged with defaults)
 * @returns Sliding window state and actions
 *
 * @example
 * ```tsx
 * function StreamingOutput() {
 *   const {
 *     visibleLines,
 *     totalLines,
 *     appendLines,
 *     reset,
 *   } = useSlidingWindow({ liveLimit: 300 });
 *
 *   useEffect(() => {
 *     // Append incoming streaming content
 *     appendLines(newLines);
 *   }, [newLines]);
 *
 *   return (
 *     <VirtualizedList
 *       items={visibleLines}
 *       totalCount={totalLines}
 *     />
 *   );
 * }
 * ```
 */
export function useSlidingWindow(config?: Partial<SlidingWindowConfig>): {
  /** Current sliding window state */
  state: SlidingWindowState;
  /** Append new lines to the live buffer */
  appendLines: (lines: string[]) => void;
  /** Manually trigger a flush of stable lines */
  flushStable: () => void;
  /** Reset all state */
  reset: () => void;
  /** Set streaming status */
  setStreaming: (isStreaming: boolean) => void;
  /** All visible lines (flushed + live) */
  visibleLines: string[];
  /** Total line count */
  totalLines: number;
  /** Whether flush should be triggered */
  shouldFlushNow: boolean;
  /** Current render budget state */
  renderBudget: RenderBudgetState;
  /** Report render time to update adaptive flush interval */
  reportRenderTime: (renderTimeMs: number) => void;
  /** Get current adaptive flush interval */
  getAdaptiveFlushInterval: () => number;
} {
  // Merge config with defaults
  const mergedConfig = useMemo<SlidingWindowConfig>(
    () => ({
      ...DEFAULT_SLIDING_WINDOW_CONFIG,
      ...config,
    }),
    [config]
  );

  // Create reducer with config bound
  const boundReducer = useCallback(
    (state: SlidingWindowState, action: SlidingWindowAction) =>
      slidingWindowReducer(state, action, mergedConfig),
    [mergedConfig]
  );

  const [state, dispatch] = useReducer(boundReducer, undefined, createInitialState);

  // Render budget state for adaptive flush interval
  const renderBudgetRef = React.useRef<RenderBudgetState>(
    createRenderBudgetState(mergedConfig.initialFlushInterval)
  );

  // Report render time to update adaptive flush interval
  const reportRenderTime = useCallback(
    (renderTimeMs: number) => {
      renderBudgetRef.current = updateRenderBudget(
        renderBudgetRef.current,
        renderTimeMs,
        mergedConfig
      );
    },
    [mergedConfig]
  );

  // Get current adaptive flush interval
  const getAdaptiveFlushInterval = useCallback(() => {
    return renderBudgetRef.current.adaptiveFlushInterval;
  }, []);

  // Memoized action dispatchers
  const appendLines = useCallback((lines: string[]) => {
    dispatch({ type: "APPEND_LINES", lines });
  }, []);

  const flushStable = useCallback(() => {
    dispatch({ type: "FLUSH_STABLE" });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  const setStreaming = useCallback((isStreaming: boolean) => {
    dispatch({ type: "SET_STREAMING", isStreaming });
  }, []);

  // Memoized derived values
  const visibleLines = useMemo(() => getVisibleLines(state), [state]);

  const shouldFlushNow = useMemo(() => shouldFlush(state, mergedConfig), [state, mergedConfig]);

  return {
    state,
    appendLines,
    flushStable,
    reset,
    setStreaming,
    visibleLines,
    totalLines: state.totalLines,
    shouldFlushNow,
    renderBudget: renderBudgetRef.current,
    reportRenderTime,
    getAdaptiveFlushInterval,
  };
}
