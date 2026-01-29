/**
 * Adaptive Evidence System - High-Level Facade
 *
 * Integrates all adaptive components (TaskIntentClassifier, IntentAwareProviderStrategy,
 * WeightOptimizer) with the EvidencePackSystem for intent-aware evidence gathering.
 *
 * Build Flow:
 * 1. Classify task intent from user input
 * 2. Get strategy for detected intent
 * 3. Apply weight modifiers and budget ratios
 * 4. Build evidence pack via EvidencePackSystem
 * 5. Record telemetry for feedback loop
 *
 * @packageDocumentation
 * @module context/evidence/adaptive
 */

import { EvidencePackSystem, type EvidencePackSystemConfig } from "../system.js";
import { EvidenceTelemetryService, type TelemetryServiceConfig } from "../telemetry.js";
import type { EvidencePack, Signal } from "../types.js";
import {
  IntentAwareProviderStrategy,
  type IntentStrategyProviderConfig,
} from "./intent-strategy.js";
import {
  type ClassificationContext,
  type ClassificationResult,
  type TaskIntent,
  TaskIntentClassifier,
  type TaskIntentClassifierConfig,
} from "./task-intent-classifier.js";
import {
  type OptimizationResult,
  WeightOptimizer,
  type WeightOptimizerConfig,
} from "./weight-optimizer.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for the AdaptiveEvidenceSystem.
 */
export interface AdaptiveEvidenceSystemConfig extends EvidencePackSystemConfig {
  /** Enable intent-aware adaptation (default: true) */
  readonly enableIntentAdaptation?: boolean;
  /** Enable weight optimization (default: true) */
  readonly enableWeightOptimization?: boolean;
  /** Auto-optimize after N sessions (default: 50) */
  readonly autoOptimizeThreshold?: number;
  /** Classifier configuration */
  readonly classifierConfig?: TaskIntentClassifierConfig;
  /** Strategy provider configuration */
  readonly strategyConfig?: IntentStrategyProviderConfig;
  /** Weight optimizer configuration */
  readonly optimizerConfig?: WeightOptimizerConfig;
  /** Telemetry service configuration */
  readonly telemetryConfig?: TelemetryServiceConfig;
}

/**
 * Build options for adaptive evidence pack generation.
 */
export interface AdaptiveBuildOptions {
  /** Additional signals to include */
  readonly signals?: Signal[];
  /** Force a specific intent instead of auto-detection */
  readonly forceIntent?: TaskIntent;
  /** Token budget override */
  readonly tokenBudget?: number;
  /** Classification context for better intent detection */
  readonly classificationContext?: ClassificationContext;
}

/**
 * Result from building an adaptive evidence pack.
 */
export interface AdaptiveBuildResult {
  /** The built evidence pack */
  readonly pack: EvidencePack;
  /** Detected intent classification */
  readonly intent: ClassificationResult;
  /** Strategy name applied */
  readonly strategyApplied: string;
  /** Session ID for feedback tracking */
  readonly sessionId: string;
}

/**
 * Aggregate statistics from the adaptive system.
 */
export interface AdaptiveSystemStats {
  /** Telemetry statistics */
  readonly telemetryStats: unknown;
  /** Optimizer statistics */
  readonly optimizerStats: unknown;
  /** Cache statistics (reserved for future use) */
  readonly cacheStats: unknown;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_AUTO_OPTIMIZE_THRESHOLD = 50;

// =============================================================================
// Implementation
// =============================================================================

/**
 * Adaptive Evidence System - Intent-aware evidence gathering facade.
 *
 * Provides intelligent, adaptive evidence pack building by:
 * - Classifying user intent to determine optimal gathering strategy
 * - Applying intent-specific weight modifiers and budget ratios
 * - Learning from feedback to improve over time
 * - Tracking telemetry for analysis and optimization
 *
 * @example
 * ```typescript
 * const system = new AdaptiveEvidenceSystem({
 *   workspaceRoot: '/path/to/project',
 *   contextWindow: 100000,
 *   enableIntentAdaptation: true,
 *   autoOptimizeThreshold: 30,
 * });
 *
 * // Build with automatic intent detection
 * const result = await system.build("Why is validateUser throwing TypeError?");
 * console.log(`Intent: ${result.intent.intent} (${result.intent.confidence})`);
 * console.log(`Strategy: ${result.strategyApplied}`);
 *
 * // Provide feedback for learning
 * system.feedback(result.sessionId, true);
 *
 * // After many sessions, manually trigger optimization
 * const optimization = system.optimize();
 * if (optimization?.improvement > 0) {
 *   console.log(`Improved weights by ${optimization.improvement}`);
 * }
 * ```
 */
export class AdaptiveEvidenceSystem {
  readonly #system: EvidencePackSystem;
  readonly #classifier: TaskIntentClassifier;
  readonly #strategyProvider: IntentAwareProviderStrategy;
  readonly #optimizer: WeightOptimizer;
  readonly #telemetry: EvidenceTelemetryService;

  readonly #enableIntentAdaptation: boolean;
  readonly #enableWeightOptimization: boolean;
  readonly #autoOptimizeThreshold: number;

  #sessionCounter = 0;
  #sessionsSinceLastOptimize = 0;

  /**
   * Create a new AdaptiveEvidenceSystem instance.
   *
   * @param config - System configuration
   */
  constructor(config: AdaptiveEvidenceSystemConfig) {
    // Initialize core system
    this.#system = new EvidencePackSystem(config);

    // Initialize adaptive components
    this.#classifier = new TaskIntentClassifier(config.classifierConfig);
    this.#strategyProvider = new IntentAwareProviderStrategy(config.strategyConfig);
    this.#optimizer = new WeightOptimizer(config.optimizerConfig);
    this.#telemetry = new EvidenceTelemetryService(config.telemetryConfig);

    // Store feature flags
    this.#enableIntentAdaptation = config.enableIntentAdaptation ?? true;
    this.#enableWeightOptimization = config.enableWeightOptimization ?? true;
    this.#autoOptimizeThreshold = config.autoOptimizeThreshold ?? DEFAULT_AUTO_OPTIMIZE_THRESHOLD;
  }

  /**
   * Build evidence pack with adaptive optimization.
   *
   * Flow:
   * 1. Classify intent from input text
   * 2. Get strategy for detected intent
   * 3. Apply strategy weight modifiers to system
   * 4. Build evidence pack via underlying system
   * 5. Record telemetry for feedback loop
   * 6. Return result with session ID for feedback
   *
   * @param input - User message or task description
   * @param options - Build options
   * @returns Adaptive build result with pack, intent, and session ID
   */
  async build(input: string, options?: AdaptiveBuildOptions): Promise<AdaptiveBuildResult> {
    // Generate session ID
    const sessionId = this.#generateSessionId();

    // Step 1: Classify intent
    const classification = this.#classifyIntent(input, options);
    const intent = options?.forceIntent ?? classification.intent;

    // Step 2: Get and apply strategy if adaptation enabled
    let strategyApplied = "default";

    if (this.#enableIntentAdaptation) {
      // Get strategy (for logging/debugging purposes)
      this.#strategyProvider.getStrategy(intent);
      strategyApplied = intent;

      // Apply weight modifiers
      const currentWeights = this.#system.getWeights();
      const adjustedWeights = this.#strategyProvider.applyWeightModifiers(currentWeights, intent);
      this.#system.updateWeights(adjustedWeights);
    }

    // Step 3: Build evidence pack
    const pack = await this.#system.build({
      userMessage: input,
      // Additional context could be passed via options in future
    });

    // Step 4: Record telemetry
    this.#telemetry.record(sessionId, pack.telemetry);

    // Step 5: Update counters
    this.#sessionsSinceLastOptimize++;

    return {
      pack,
      intent: options?.forceIntent
        ? { ...classification, intent: options.forceIntent }
        : classification,
      strategyApplied,
      sessionId,
    };
  }

  /**
   * Provide feedback for a completed session.
   *
   * Used for learning and optimization:
   * - Updates telemetry record with outcome
   * - Records outcome for weight optimization
   * - May trigger auto-optimization if threshold reached
   *
   * @param sessionId - Session ID from build result
   * @param success - Whether the task was successful
   */
  feedback(sessionId: string, success: boolean): void {
    // Update telemetry with outcome
    const outcome = success ? "success" : "failure";
    this.#telemetry.markOutcome(sessionId, outcome);

    // Record for weight optimizer
    if (this.#enableWeightOptimization) {
      const currentWeights = this.#system.getWeights();
      this.#optimizer.recordOutcome("task", currentWeights, success);
    }

    // Check auto-optimize threshold
    if (
      this.#enableWeightOptimization &&
      this.#sessionsSinceLastOptimize >= this.#autoOptimizeThreshold
    ) {
      this.optimize();
    }
  }

  /**
   * Trigger manual weight optimization.
   *
   * Analyzes telemetry records to compute optimal weights.
   * Applies new weights to the underlying system if improvement found.
   *
   * @returns Optimization result, or null if optimization disabled or insufficient data
   */
  optimize(): OptimizationResult | null {
    if (!this.#enableWeightOptimization) {
      return null;
    }

    const records = this.#telemetry.getRecords();
    const currentWeights = this.#system.getWeights();

    const result = this.#optimizer.optimize(currentWeights, records);

    // Apply new weights if there's improvement
    if (result.improvement > 0) {
      this.#system.updateWeights(result.weights);
    }

    // Reset counter
    this.#sessionsSinceLastOptimize = 0;

    return result;
  }

  /**
   * Get current statistics from all adaptive components.
   *
   * @returns Aggregate statistics
   */
  getStats(): AdaptiveSystemStats {
    return {
      telemetryStats: this.#telemetry.getStats(),
      optimizerStats: this.#optimizer.getStats(),
      cacheStats: null, // Reserved for future cache implementation
    };
  }

  /**
   * Get the underlying EvidencePackSystem.
   *
   * Useful for advanced configuration or direct system access.
   *
   * @returns The underlying EvidencePackSystem instance
   */
  getSystem(): EvidencePackSystem {
    return this.#system;
  }

  /**
   * Set LSP hub on underlying system.
   *
   * @param hub - LspHub instance
   */
  setLspHub(hub: unknown): void {
    this.#system.setLspHub(hub);
  }

  /**
   * Set Git service on underlying system.
   *
   * @param service - GitSnapshotService instance
   * @param snapshotHash - Optional snapshot hash to diff against
   */
  setGitService(service: unknown, snapshotHash?: string): void {
    this.#system.setGitService(service, snapshotHash);
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Classify intent from input text.
   */
  #classifyIntent(input: string, options?: AdaptiveBuildOptions): ClassificationResult {
    if (options?.classificationContext) {
      return this.#classifier.classifyWithContext(input, options.classificationContext);
    }
    return this.#classifier.classify(input);
  }

  /**
   * Generate unique session ID.
   */
  #generateSessionId(): string {
    this.#sessionCounter++;
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `adaptive-${timestamp}-${this.#sessionCounter}-${random}`;
  }
}
