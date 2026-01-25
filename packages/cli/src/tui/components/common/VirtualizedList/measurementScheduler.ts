/**
 * Measurement Scheduler with Adaptive Interval
 *
 * 用于调度高度测量任务，防止测量 spam
 *
 * 特性:
 * - 自适应间隔: 高负载时增加间隔，低负载时减少
 * - 批量处理: 合并多个测量请求
 * - 优先级队列: 可见区域优先测量
 *
 * @module measurementScheduler
 */

import { useCallback, useEffect, useReducer, useRef } from "react";

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for the measurement scheduler
 */
export interface MeasurementSchedulerConfig {
  /** 最小测量间隔 (ms) */
  minInterval: number;
  /** 最大测量间隔 (ms) */
  maxInterval: number;
  /** 初始间隔 (ms) */
  initialInterval: number;
  /** 目标帧时间 (ms), 用于计算负载 */
  targetFrameTime: number;
  /** 批量大小上限 */
  maxBatchSize: number;
  /** 负载调整因子 */
  loadFactor: number;
}

/**
 * Default scheduler configuration
 *
 * - minInterval: 16ms (~60fps)
 * - maxInterval: 100ms (~10fps)
 * - initialInterval: 32ms (~30fps)
 */
export const DEFAULT_SCHEDULER_CONFIG: MeasurementSchedulerConfig = {
  minInterval: 16, // ~60fps
  maxInterval: 100, // ~10fps
  initialInterval: 32, // ~30fps
  targetFrameTime: 16,
  maxBatchSize: 20,
  loadFactor: 1.5,
};

// ============================================================================
// Types
// ============================================================================

/**
 * Priority levels for measurement tasks
 *
 * - high: Visible items, should be measured first
 * - normal: Near-visible items
 * - low: Off-screen items, can wait
 */
export type MeasurementPriority = "high" | "normal" | "low";

/**
 * A measurement task to be scheduled
 */
export interface MeasurementTask {
  /** Unique identifier for deduplication */
  id: string;
  /** Task priority */
  priority: MeasurementPriority;
  /** Callback to execute */
  callback: () => void;
  /** Timestamp when scheduled */
  scheduledAt: number;
}

/**
 * Statistics about scheduler performance
 */
export interface SchedulerStats {
  /** Total tasks processed */
  totalProcessed: number;
  /** Total batches processed */
  totalBatches: number;
  /** Average batch size */
  averageBatchSize: number;
}

/**
 * Internal state of the scheduler
 */
export interface SchedulerState {
  /** 当前间隔 (ms) */
  currentInterval: number;
  /** 待处理任务队列 */
  pendingTasks: MeasurementTask[];
  /** 最近一次处理时间 */
  lastProcessTime: number;
  /** 当前负载 (0-1) */
  currentLoad: number;
  /** 统计 */
  stats: SchedulerStats;
}

// ============================================================================
// Actions
// ============================================================================

/**
 * Actions that can be dispatched to the scheduler
 */
export type SchedulerAction =
  | { type: "SCHEDULE"; task: MeasurementTask }
  | { type: "PROCESS_BATCH"; processTime: number }
  | { type: "ADJUST_INTERVAL"; measuredFrameTime: number }
  | { type: "CANCEL"; id: string }
  | { type: "CLEAR" };

// ============================================================================
// Pure Functions
// ============================================================================

/**
 * Priority weight mapping for sorting
 */
const PRIORITY_WEIGHTS: Record<MeasurementPriority, number> = {
  high: 0,
  normal: 1,
  low: 2,
};

/**
 * Sort tasks by priority (high first), then by scheduled time (FIFO within priority)
 *
 * @param tasks - Tasks to sort
 * @returns Sorted tasks array (new array, does not mutate input)
 */
export function sortByPriority(tasks: MeasurementTask[]): MeasurementTask[] {
  return [...tasks].sort((a, b) => {
    const priorityDiff = PRIORITY_WEIGHTS[a.priority] - PRIORITY_WEIGHTS[b.priority];
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    // FIFO within same priority
    return a.scheduledAt - b.scheduledAt;
  });
}

/**
 * Get the next batch of tasks to process
 *
 * @param tasks - All pending tasks
 * @param maxSize - Maximum batch size
 * @returns Tasks to process in this batch (sorted by priority)
 */
export function getNextBatch(tasks: MeasurementTask[], maxSize: number): MeasurementTask[] {
  const sorted = sortByPriority(tasks);
  return sorted.slice(0, maxSize);
}

/**
 * Calculate adaptive interval based on measured frame time
 *
 * - If measuredFrameTime > targetFrameTime: increase interval (reduce frequency)
 * - If measuredFrameTime < targetFrameTime: decrease interval (increase frequency)
 * - Clamp result to [minInterval, maxInterval]
 *
 * @param currentInterval - Current interval in ms
 * @param measuredFrameTime - Actual frame time measured
 * @param config - Scheduler configuration
 * @returns New interval clamped to valid range
 */
export function calculateAdaptiveInterval(
  currentInterval: number,
  measuredFrameTime: number,
  config: MeasurementSchedulerConfig
): number {
  const { minInterval, maxInterval, targetFrameTime, loadFactor } = config;

  // Calculate load ratio: how much over/under target we are
  const loadRatio = measuredFrameTime / targetFrameTime;

  let newInterval: number;

  if (loadRatio > 1) {
    // Over budget: increase interval (slow down)
    // More aggressive increase when load is high
    newInterval = currentInterval * loadFactor * loadRatio;
  } else {
    // Under budget: decrease interval (speed up)
    // Gradual decrease to avoid oscillation
    newInterval = currentInterval / (loadFactor * 0.5 + 0.5);
  }

  // Clamp to valid range
  return Math.max(minInterval, Math.min(maxInterval, Math.round(newInterval)));
}

/**
 * Calculate current load as a ratio (0-1)
 *
 * @param measuredFrameTime - Actual frame time
 * @param targetFrameTime - Target frame time
 * @returns Load ratio clamped to [0, 1]
 */
function calculateLoad(measuredFrameTime: number, targetFrameTime: number): number {
  const ratio = measuredFrameTime / targetFrameTime;
  return Math.min(1, Math.max(0, ratio - 0.5)); // 0.5x target = 0 load, 1.5x target = 1 load
}

// ============================================================================
// State Initialization
// ============================================================================

/**
 * Create initial scheduler state
 *
 * @param config - Optional partial configuration (merged with defaults)
 * @returns Initial scheduler state
 */
export function createInitialSchedulerState(
  config?: Partial<MeasurementSchedulerConfig>
): SchedulerState {
  const mergedConfig = { ...DEFAULT_SCHEDULER_CONFIG, ...config };

  return {
    currentInterval: mergedConfig.initialInterval,
    pendingTasks: [],
    lastProcessTime: 0,
    currentLoad: 0,
    stats: {
      totalProcessed: 0,
      totalBatches: 0,
      averageBatchSize: 0,
    },
  };
}

// ============================================================================
// Reducer
// ============================================================================

/**
 * Scheduler reducer - handles all state transitions
 *
 * @param state - Current state
 * @param action - Action to apply
 * @param config - Scheduler configuration
 * @returns New state (never throws)
 */
export function schedulerReducer(
  state: SchedulerState,
  action: SchedulerAction,
  config: MeasurementSchedulerConfig
): SchedulerState {
  switch (action.type) {
    case "SCHEDULE": {
      const { task } = action;
      // Deduplicate: remove existing task with same id
      const filteredTasks = state.pendingTasks.filter((t) => t.id !== task.id);
      return {
        ...state,
        pendingTasks: [...filteredTasks, task],
      };
    }

    case "PROCESS_BATCH": {
      const { processTime } = action;
      const batch = getNextBatch(state.pendingTasks, config.maxBatchSize);
      const batchSize = batch.length;

      if (batchSize === 0) {
        return {
          ...state,
          lastProcessTime: processTime,
        };
      }

      // Remove processed tasks from queue
      const processedIds = new Set(batch.map((t) => t.id));
      const remainingTasks = state.pendingTasks.filter((t) => !processedIds.has(t.id));

      // Update stats
      const newTotalProcessed = state.stats.totalProcessed + batchSize;
      const newTotalBatches = state.stats.totalBatches + 1;
      const newAverageBatchSize = newTotalProcessed / newTotalBatches;

      return {
        ...state,
        pendingTasks: remainingTasks,
        lastProcessTime: processTime,
        stats: {
          totalProcessed: newTotalProcessed,
          totalBatches: newTotalBatches,
          averageBatchSize: newAverageBatchSize,
        },
      };
    }

    case "ADJUST_INTERVAL": {
      const { measuredFrameTime } = action;
      const newInterval = calculateAdaptiveInterval(
        state.currentInterval,
        measuredFrameTime,
        config
      );
      const newLoad = calculateLoad(measuredFrameTime, config.targetFrameTime);

      return {
        ...state,
        currentInterval: newInterval,
        currentLoad: newLoad,
      };
    }

    case "CANCEL": {
      const { id } = action;
      return {
        ...state,
        pendingTasks: state.pendingTasks.filter((t) => t.id !== id),
      };
    }

    case "CLEAR": {
      return {
        ...state,
        pendingTasks: [],
      };
    }
  }
}

// ============================================================================
// React Hook
// ============================================================================

/**
 * Return type for useMeasurementScheduler hook
 */
export interface UseMeasurementSchedulerReturn {
  /** Schedule a measurement task */
  schedule: (id: string, callback: () => void, priority?: MeasurementPriority) => void;
  /** Cancel a scheduled task by id */
  cancel: (id: string) => void;
  /** Clear all pending tasks */
  clear: () => void;
  /** Current measurement interval (ms) */
  currentInterval: number;
  /** Number of pending tasks */
  pendingCount: number;
  /** Current load (0-1) */
  currentLoad: number;
  /** Performance statistics */
  stats: SchedulerStats;
}

/**
 * Hook for scheduling measurement tasks with adaptive interval
 *
 * Features:
 * - Automatic batching of measurement requests
 * - Adaptive interval based on frame budget
 * - Priority queue (high > normal > low)
 * - Deduplication by task id
 *
 * @example
 * ```tsx
 * const { schedule, cancel, currentInterval } = useMeasurementScheduler();
 *
 * // Schedule high priority measurement for visible item
 * schedule('item-5', () => measureHeight(5), 'high');
 *
 * // Schedule normal priority for nearby items
 * schedule('item-10', () => measureHeight(10), 'normal');
 *
 * // Cancel if item is removed
 * cancel('item-5');
 * ```
 *
 * @param config - Optional partial configuration
 * @returns Scheduler control object
 */
export function useMeasurementScheduler(
  config?: Partial<MeasurementSchedulerConfig>
): UseMeasurementSchedulerReturn {
  const mergedConfig = { ...DEFAULT_SCHEDULER_CONFIG, ...config };

  // Use a reducer with the config bound
  const [state, dispatch] = useReducer(
    (s: SchedulerState, a: SchedulerAction) => schedulerReducer(s, a, mergedConfig),
    mergedConfig,
    (cfg) => createInitialSchedulerState(cfg)
  );

  // Keep track of pending callbacks (not in state to avoid re-renders)
  const callbacksRef = useRef<Map<string, () => void>>(new Map());

  // Interval ref for cleanup
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Process a batch of pending tasks
   */
  const processBatch = useCallback(() => {
    const startTime = performance.now();

    // Get the batch to process
    const batch = getNextBatch(state.pendingTasks, mergedConfig.maxBatchSize);

    // Execute callbacks
    for (const task of batch) {
      const callback = callbacksRef.current.get(task.id);
      if (callback) {
        try {
          callback();
        } catch {
          // Silently ignore errors in callbacks to prevent scheduler crash
        }
        callbacksRef.current.delete(task.id);
      }
    }

    const endTime = performance.now();
    const processTime = endTime - startTime;

    // Update state
    dispatch({ type: "PROCESS_BATCH", processTime: endTime });

    // Adjust interval based on how long processing took
    if (batch.length > 0) {
      dispatch({ type: "ADJUST_INTERVAL", measuredFrameTime: processTime });
    }
  }, [state.pendingTasks, mergedConfig.maxBatchSize]);

  // Set up the processing interval
  useEffect(() => {
    // Clear existing interval
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
    }

    // Only set interval if there are pending tasks
    if (state.pendingTasks.length > 0) {
      intervalRef.current = setInterval(processBatch, state.currentInterval);
    }

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [state.currentInterval, state.pendingTasks.length, processBatch]);

  /**
   * Schedule a measurement task
   */
  const schedule = useCallback(
    (id: string, callback: () => void, priority: MeasurementPriority = "normal") => {
      // Store callback in ref (not in state)
      callbacksRef.current.set(id, callback);

      // Dispatch task to state
      dispatch({
        type: "SCHEDULE",
        task: {
          id,
          priority,
          callback, // Kept for interface compliance but executed from ref
          scheduledAt: performance.now(),
        },
      });
    },
    []
  );

  /**
   * Cancel a scheduled task
   */
  const cancel = useCallback((id: string) => {
    callbacksRef.current.delete(id);
    dispatch({ type: "CANCEL", id });
  }, []);

  /**
   * Clear all pending tasks
   */
  const clear = useCallback(() => {
    callbacksRef.current.clear();
    dispatch({ type: "CLEAR" });
  }, []);

  return {
    schedule,
    cancel,
    clear,
    currentInterval: state.currentInterval,
    pendingCount: state.pendingTasks.length,
    currentLoad: state.currentLoad,
    stats: state.stats,
  };
}
