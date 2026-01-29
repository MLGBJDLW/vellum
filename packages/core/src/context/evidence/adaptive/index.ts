/**
 * Adaptive Evidence Pack Components
 *
 * Provides adaptive optimization for the evidence pack system:
 * - AdaptiveEvidenceSystem: High-level facade integrating all adaptive components
 * - WeightOptimizer: Automatic reranker weight tuning based on feedback
 * - TaskIntentClassifier: Rule-based task intent detection
 * - IntentAwareProviderStrategy: Dynamic strategy selection based on intent
 *
 * @packageDocumentation
 * @module context/evidence/adaptive
 */

export {
  type AdaptiveBuildOptions,
  type AdaptiveBuildResult,
  AdaptiveEvidenceSystem,
  type AdaptiveEvidenceSystemConfig,
  type AdaptiveSystemStats,
} from "./adaptive-system.js";

export {
  type BudgetRatios,
  IntentAwareProviderStrategy,
  type IntentStrategy,
  type IntentStrategyProviderConfig,
} from "./intent-strategy.js";

export {
  type ClassificationResult,
  type TaskIntent,
  TaskIntentClassifier,
  type TaskIntentClassifierConfig,
} from "./task-intent-classifier.js";

export {
  type OptimizationResult,
  type OptimizerStats,
  WeightOptimizer,
  type WeightOptimizerConfig,
} from "./weight-optimizer.js";
