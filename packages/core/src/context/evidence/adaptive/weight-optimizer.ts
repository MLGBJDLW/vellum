/**
 * Weight Optimizer - Adaptive Reranker Weight Tuning
 *
 * Automatically optimizes `RerankerWeights` based on telemetry feedback.
 * Uses a simple gradient-based approach without ML framework dependencies.
 *
 * Algorithm:
 * 1. Collect success/failure outcomes from telemetry
 * 2. Analyze provider contributions in each outcome
 * 3. Adjust weights via gradient: newWeight = oldWeight + learningRate * gradient
 * 4. Enforce bounds: weights ∈ [1, 200]
 *
 * @packageDocumentation
 * @module context/evidence/adaptive
 */

import type { RerankerWeights } from "../reranker.js";
import type { TelemetryRecord } from "../telemetry.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration options for the WeightOptimizer.
 */
export interface WeightOptimizerConfig {
  /** Minimum samples before optimization (default: 10) */
  readonly minSamples?: number;
  /** Learning rate for weight adjustment (default: 0.1) */
  readonly learningRate?: number;
  /** Maximum weight delta per iteration (default: 20) */
  readonly maxDelta?: number;
  /** Enable automatic optimization (default: true) */
  readonly autoOptimize?: boolean;
}

/**
 * Result of an optimization run.
 */
export interface OptimizationResult {
  /** New optimized weights */
  readonly weights: RerankerWeights;
  /** Improvement score (positive = better) */
  readonly improvement: number;
  /** Sample count used for optimization */
  readonly sampleCount: number;
  /** Whether optimization has converged */
  readonly converged: boolean;
}

/**
 * Statistics about optimizer performance.
 */
export interface OptimizerStats {
  /** Total optimization runs performed */
  readonly totalOptimizations: number;
  /** Average improvement per optimization */
  readonly avgImprovement: number;
  /** Recommended weights by task type */
  readonly taskTypeWeights: Record<string, Partial<RerankerWeights>>;
}

/**
 * Internal structure for tracking task outcomes.
 */
interface TaskOutcome {
  readonly taskType: string;
  readonly weights: RerankerWeights;
  readonly success: boolean;
  readonly timestamp: number;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_MIN_SAMPLES = 10;
const DEFAULT_LEARNING_RATE = 0.1;
const DEFAULT_MAX_DELTA = 20;
const MIN_WEIGHT = 1;
const MAX_WEIGHT = 200;
const CONVERGENCE_THRESHOLD = 0.01;

/**
 * Provider keys that map to RerankerWeights properties.
 * Used for gradient calculation across provider types.
 */
const PROVIDER_WEIGHT_KEYS: readonly (keyof RerankerWeights)[] = [
  "diff",
  "definition",
  "reference",
  "keyword",
  "stackFrame",
  "workingSet",
] as const;

// =============================================================================
// Implementation
// =============================================================================

/**
 * Optimizes reranker weights based on telemetry feedback.
 *
 * Features:
 * - Gradient-based weight adjustment
 * - Task-type specific weight recommendations
 * - Bounded optimization to prevent pathological configurations
 * - Convergence detection
 *
 * @example
 * ```typescript
 * const optimizer = new WeightOptimizer({ learningRate: 0.15 });
 *
 * // Record outcomes
 * optimizer.recordOutcome('refactor', weights, true);
 * optimizer.recordOutcome('debug', weights, false);
 *
 * // Optimize based on telemetry
 * const result = optimizer.optimize(currentWeights, telemetryRecords);
 * if (result.improvement > 0) {
 *   reranker.updateWeights(result.weights);
 * }
 * ```
 */
export class WeightOptimizer {
  readonly #config: Required<WeightOptimizerConfig>;
  readonly #outcomes: TaskOutcome[] = [];
  #totalOptimizations = 0;
  #totalImprovement = 0;

  /**
   * Create a new WeightOptimizer instance.
   * @param config - Configuration options
   */
  constructor(config?: WeightOptimizerConfig) {
    this.#config = {
      minSamples: config?.minSamples ?? DEFAULT_MIN_SAMPLES,
      learningRate: config?.learningRate ?? DEFAULT_LEARNING_RATE,
      maxDelta: config?.maxDelta ?? DEFAULT_MAX_DELTA,
      autoOptimize: config?.autoOptimize ?? true,
    };
  }

  /**
   * Optimize weights based on telemetry feedback.
   *
   * Uses gradient-based optimization:
   * - Analyzes provider contributions in success vs failure cases
   * - Adjusts weights proportionally to contribution differences
   * - Enforces bounds [1, 200] on all weights
   *
   * @param currentWeights - Current reranker weights
   * @param records - Telemetry records with outcomes
   * @returns Optimization result with new weights
   */
  optimize(
    currentWeights: RerankerWeights,
    records: readonly TelemetryRecord[]
  ): OptimizationResult {
    // Filter records with known outcomes
    const recordsWithOutcome = records.filter(
      (r) => r.outcome === "success" || r.outcome === "failure"
    );

    // Check minimum sample requirement
    if (recordsWithOutcome.length < this.#config.minSamples) {
      return {
        weights: { ...currentWeights },
        improvement: 0,
        sampleCount: recordsWithOutcome.length,
        converged: false,
      };
    }

    // Split into success/failure groups
    const successRecords = recordsWithOutcome.filter((r) => r.outcome === "success");
    const failureRecords = recordsWithOutcome.filter((r) => r.outcome === "failure");

    // Calculate gradients based on provider performance
    const gradients = this.#calculateGradients(successRecords, failureRecords);

    // Apply gradients to weights
    const newWeights = this.#applyGradients(currentWeights, gradients);

    // Calculate improvement score
    const improvement = this.#calculateImprovement(gradients);

    // Check convergence
    const converged = Math.abs(improvement) < CONVERGENCE_THRESHOLD;

    // Update stats
    this.#totalOptimizations++;
    this.#totalImprovement += improvement;

    return {
      weights: newWeights,
      improvement,
      sampleCount: recordsWithOutcome.length,
      converged,
    };
  }

  /**
   * Get recommended weights for a specific task type.
   *
   * Based on historical outcomes for similar tasks.
   *
   * @param taskType - Type of task (e.g., 'refactor', 'debug', 'implement')
   * @returns Partial weights recommendation
   */
  getRecommendedWeights(taskType: string): Partial<RerankerWeights> {
    const typeOutcomes = this.#outcomes.filter((o) => o.taskType === taskType && o.success);

    if (typeOutcomes.length === 0) {
      return {};
    }

    // Average successful weights for this task type
    const avgWeights: Partial<Record<keyof RerankerWeights, number>> = {};

    for (const key of PROVIDER_WEIGHT_KEYS) {
      const values = typeOutcomes.map((o) => o.weights[key]);
      if (values.length > 0) {
        avgWeights[key] = values.reduce((a, b) => a + b, 0) / values.length;
      }
    }

    return avgWeights as Partial<RerankerWeights>;
  }

  /**
   * Record a task outcome for learning.
   *
   * Call this after task completion to improve future recommendations.
   *
   * @param taskType - Type of task
   * @param weights - Weights used for this task
   * @param success - Whether the task succeeded
   */
  recordOutcome(taskType: string, weights: RerankerWeights, success: boolean): void {
    this.#outcomes.push({
      taskType,
      weights: { ...weights },
      success,
      timestamp: Date.now(),
    });

    // Limit memory usage - keep last 1000 outcomes
    if (this.#outcomes.length > 1000) {
      this.#outcomes.shift();
    }
  }

  /**
   * Get optimization statistics.
   *
   * @returns Statistics about optimizer performance
   */
  getStats(): OptimizerStats {
    // Group outcomes by task type for recommendations
    const taskTypeWeights: Record<string, Partial<RerankerWeights>> = {};
    const taskTypes = new Set(this.#outcomes.map((o) => o.taskType));

    for (const taskType of taskTypes) {
      taskTypeWeights[taskType] = this.getRecommendedWeights(taskType);
    }

    return {
      totalOptimizations: this.#totalOptimizations,
      avgImprovement:
        this.#totalOptimizations > 0 ? this.#totalImprovement / this.#totalOptimizations : 0,
      taskTypeWeights,
    };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Calculate gradients for each weight based on success/failure analysis.
   *
   * Gradient formula (simplified):
   * gradient = avgContribution(success) - avgContribution(failure)
   *
   * Higher contribution in success → positive gradient → increase weight.
   */
  #calculateGradients(
    successRecords: readonly TelemetryRecord[],
    failureRecords: readonly TelemetryRecord[]
  ): Record<keyof RerankerWeights, number> {
    const gradients: Record<string, number> = {};

    for (const key of PROVIDER_WEIGHT_KEYS) {
      // Map weight keys to provider types for telemetry lookup
      const providerMapping: Record<string, string> = {
        diff: "diff",
        definition: "lsp",
        reference: "lsp",
        keyword: "search",
        stackFrame: "lsp",
        workingSet: "diff",
      };

      const providerType = providerMapping[key] ?? key;

      // Calculate average contribution in success cases
      const successContribution = this.#avgProviderContribution(successRecords, providerType);

      // Calculate average contribution in failure cases
      const failureContribution = this.#avgProviderContribution(failureRecords, providerType);

      // Gradient: positive if provider contributed more in success cases
      gradients[key] = successContribution - failureContribution;
    }

    // Handle stackDepthDecay separately (inverse logic - lower decay is better)
    gradients.stackDepthDecay = 0;

    return gradients as Record<keyof RerankerWeights, number>;
  }

  /**
   * Calculate average provider contribution from telemetry records.
   */
  #avgProviderContribution(records: readonly TelemetryRecord[], providerType: string): number {
    if (records.length === 0) return 0;

    let totalContribution = 0;

    for (const record of records) {
      const timing = record.data.providerTimings[
        providerType as keyof typeof record.data.providerTimings
      ] as number | undefined;

      // Use timing as a proxy for contribution
      // Higher timing usually means more evidence found
      if (timing !== undefined && timing > 0) {
        // Normalize timing contribution (1-100ms typical)
        totalContribution += Math.min(timing / 100, 1);
      }
    }

    return totalContribution / records.length;
  }

  /**
   * Apply gradients to weights with bounds enforcement.
   */
  #applyGradients(
    currentWeights: RerankerWeights,
    gradients: Record<keyof RerankerWeights, number>
  ): RerankerWeights {
    const newWeights = { ...currentWeights };

    for (const key of PROVIDER_WEIGHT_KEYS) {
      const gradient = gradients[key] ?? 0;

      // Scale gradient by learning rate and current weight
      let delta = gradient * this.#config.learningRate * currentWeights[key];

      // Clamp delta to maxDelta
      delta = Math.max(-this.#config.maxDelta, Math.min(this.#config.maxDelta, delta));

      // Apply delta with bounds
      const newValue = currentWeights[key] + delta;
      (newWeights as Record<string, number>)[key] = Math.max(
        MIN_WEIGHT,
        Math.min(MAX_WEIGHT, newValue)
      );
    }

    // stackDepthDecay stays in [0, 1] range
    newWeights.stackDepthDecay = Math.max(0, Math.min(1, newWeights.stackDepthDecay));

    return newWeights;
  }

  /**
   * Calculate overall improvement score from gradients.
   */
  #calculateImprovement(gradients: Record<keyof RerankerWeights, number>): number {
    // Sum of absolute gradients normalized
    let sum = 0;
    for (const key of PROVIDER_WEIGHT_KEYS) {
      sum += Math.abs(gradients[key] ?? 0);
    }
    return sum / PROVIDER_WEIGHT_KEYS.length;
  }
}
