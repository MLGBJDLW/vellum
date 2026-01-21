/**
 * Tutorial Engine (Phase 38)
 *
 * Orchestrates the interactive tutorial flow for new Vellum users.
 * Manages step transitions, progress persistence, and interactive elements.
 *
 * @module tutorial/tutorial-engine
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { Err, Ok, type Result } from "../types/result.js";
import { getAllTutorialSteps, getTutorialStep, TUTORIAL_STEP_MAP } from "./steps/index.js";
import {
  INITIAL_TUTORIAL_PROGRESS,
  TUTORIAL_STEPS,
  type TutorialEngineEvents,
  type TutorialError,
  type TutorialProgress,
  TutorialProgressSchema,
  type TutorialStep,
  type TutorialStepId,
  type TutorialStepResult,
} from "./types.js";

// =============================================================================
// Paths
// =============================================================================

/**
 * Get Vellum config directory
 */
function getVellumDir(): string {
  const home = os.homedir();
  return path.join(home, ".vellum");
}

// =============================================================================
// Config Types (minimal, for tutorial tracking)
// =============================================================================

interface MinimalConfig {
  tutorialComplete?: boolean;
  [key: string]: unknown;
}

// =============================================================================
// TutorialEngine Class
// =============================================================================

/**
 * Options for TutorialEngine
 */
export interface TutorialEngineOptions {
  /** Skip first-run detection (for testing) */
  skipFirstRunCheck?: boolean;
  /** Custom vellum directory (for testing) */
  vellumDir?: string;
}

/**
 * Tutorial engine that guides users through Vellum's key concepts
 *
 * @example
 * ```typescript
 * const engine = new TutorialEngine({
 *   onStepChange: (step, progress) => {
 *     console.log(`Now on step: ${step.title}`);
 *   },
 *   onComplete: (progress) => {
 *     console.log('Tutorial complete!');
 *   }
 * });
 *
 * if (await engine.shouldShowTutorial()) {
 *   await engine.start();
 *   // Render current step...
 * }
 * ```
 */
export class TutorialEngine {
  private progress: TutorialProgress;
  private readonly events: TutorialEngineEvents;
  private readonly options: TutorialEngineOptions;
  private started = false;

  constructor(events: TutorialEngineEvents = {}, options: TutorialEngineOptions = {}) {
    // Deep copy to avoid mutating INITIAL_TUTORIAL_PROGRESS
    this.progress = {
      ...INITIAL_TUTORIAL_PROGRESS,
      completedSteps: [],
      interactiveResults: {},
    };
    this.events = events;
    this.options = options;
  }

  // ===========================================================================
  // Path Helpers (for testing support)
  // ===========================================================================

  private getVellumDir(): string {
    return this.options.vellumDir ?? getVellumDir();
  }

  private getTutorialProgressPath(): string {
    return path.join(this.getVellumDir(), "tutorial-progress.json");
  }

  private getConfigPath(): string {
    return path.join(this.getVellumDir(), "config.json");
  }

  // ===========================================================================
  // Lifecycle Methods
  // ===========================================================================

  /**
   * Check if tutorial should be shown (first-run detection)
   *
   * Returns true if:
   * - No ~/.vellum/config.json exists (first run)
   * - config.json exists but tutorialComplete is false
   * - tutorial-progress.json shows incomplete tutorial
   */
  async shouldShowTutorial(): Promise<boolean> {
    // Skip check if option set (for testing)
    if (this.options.skipFirstRunCheck) {
      return true;
    }

    const vellumDir = this.getVellumDir();
    const configPath = this.getConfigPath();
    const progressPath = this.getTutorialProgressPath();

    // First run: no .vellum directory
    if (!fs.existsSync(vellumDir)) {
      return true;
    }

    // Check config.json for tutorialComplete flag
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, "utf-8");
        const config = JSON.parse(content) as MinimalConfig;
        if (config.tutorialComplete === true) {
          return false;
        }
      } catch {
        // Config parse error, show tutorial
      }
    }

    // Check progress file
    if (fs.existsSync(progressPath)) {
      try {
        const content = fs.readFileSync(progressPath, "utf-8");
        const progress = JSON.parse(content) as TutorialProgress;
        if (progress.completed === true || progress.skipped === true) {
          return false;
        }
      } catch {
        // Progress parse error, show tutorial
      }
    }

    return true;
  }

  /**
   * Start the tutorial
   */
  async start(): Promise<Result<TutorialStep, TutorialError>> {
    // Load existing progress if any
    await this.loadProgress();

    // Mark as started
    this.started = true;
    if (!this.progress.startedAt) {
      this.progress.startedAt = new Date().toISOString();
    }

    // Save initial state
    const saveResult = await this.saveProgress();
    if (!saveResult.ok) {
      return Err(saveResult.error);
    }

    // Get current step
    const step = getTutorialStep(this.progress.currentStepId);
    this.events.onStepChange?.(step, this.progress);

    return Ok(step);
  }

  /**
   * Skip the tutorial entirely
   */
  async skip(): Promise<Result<void, TutorialError>> {
    this.progress.skipped = true;
    this.progress.completedAt = new Date().toISOString();

    const saveResult = await this.saveProgress();
    if (!saveResult.ok) {
      return saveResult;
    }

    const configResult = await this.markConfigComplete();
    if (!configResult.ok) {
      return configResult;
    }

    this.events.onSkip?.();
    return Ok(undefined);
  }

  /**
   * Mark tutorial as complete
   */
  async markComplete(): Promise<Result<void, TutorialError>> {
    this.progress.completed = true;
    this.progress.completedAt = new Date().toISOString();

    const saveResult = await this.saveProgress();
    if (!saveResult.ok) {
      return saveResult;
    }

    const configResult = await this.markConfigComplete();
    if (!configResult.ok) {
      return configResult;
    }

    this.events.onComplete?.(this.progress);
    return Ok(undefined);
  }

  // ===========================================================================
  // Navigation Methods
  // ===========================================================================

  /**
   * Get current step
   */
  currentStep(): TutorialStep {
    return getTutorialStep(this.progress.currentStepId);
  }

  /**
   * Move to next step
   */
  async nextStep(): Promise<Result<TutorialStep | null, TutorialError>> {
    const currentIndex = TUTORIAL_STEPS.indexOf(this.progress.currentStepId);
    const nextIndex = currentIndex + 1;

    // Already at last step?
    if (nextIndex >= TUTORIAL_STEPS.length) {
      // Mark current as completed
      if (!this.progress.completedSteps.includes(this.progress.currentStepId)) {
        this.progress.completedSteps.push(this.progress.currentStepId);
      }
      await this.markComplete();
      return Ok(null);
    }

    // Mark current as completed
    if (!this.progress.completedSteps.includes(this.progress.currentStepId)) {
      this.progress.completedSteps.push(this.progress.currentStepId);
    }

    // Emit step complete event
    const result: TutorialStepResult = {
      success: true,
      next: true,
      back: false,
      skip: false,
    };
    this.events.onStepComplete?.(this.progress.currentStepId, result);

    // Move to next (index already validated above)
    const nextStepId = TUTORIAL_STEPS[nextIndex] as TutorialStepId;
    this.progress.currentStepId = nextStepId;

    const saveResult = await this.saveProgress();
    if (!saveResult.ok) {
      return Err(saveResult.error);
    }

    const step = getTutorialStep(nextStepId);
    this.events.onStepChange?.(step, this.progress);

    return Ok(step);
  }

  /**
   * Move to previous step
   */
  async previousStep(): Promise<Result<TutorialStep | null, TutorialError>> {
    const currentIndex = TUTORIAL_STEPS.indexOf(this.progress.currentStepId);
    const prevIndex = currentIndex - 1;

    // Already at first step?
    if (prevIndex < 0) {
      return Ok(null);
    }

    // Emit step complete event
    const result: TutorialStepResult = {
      success: true,
      next: false,
      back: true,
      skip: false,
    };
    this.events.onStepComplete?.(this.progress.currentStepId, result);

    // Move to previous (index already validated above)
    const prevStepId = TUTORIAL_STEPS[prevIndex] as TutorialStepId;
    this.progress.currentStepId = prevStepId;

    const saveResult = await this.saveProgress();
    if (!saveResult.ok) {
      return Err(saveResult.error);
    }

    const step = getTutorialStep(prevStepId);
    this.events.onStepChange?.(step, this.progress);

    return Ok(step);
  }

  /**
   * Go to a specific step by ID
   */
  async goToStep(id: TutorialStepId): Promise<Result<TutorialStep, TutorialError>> {
    if (!TUTORIAL_STEP_MAP[id]) {
      const error: TutorialError = {
        code: "STEP_NOT_FOUND",
        message: `Tutorial step not found: ${id}`,
      };
      this.events.onError?.(error);
      return Err(error);
    }

    this.progress.currentStepId = id;

    const saveResult = await this.saveProgress();
    if (!saveResult.ok) {
      return Err(saveResult.error);
    }

    const step = getTutorialStep(id);
    this.events.onStepChange?.(step, this.progress);

    return Ok(step);
  }

  // ===========================================================================
  // Interactive Element Methods
  // ===========================================================================

  /**
   * Record result from interactive element
   */
  async recordInteractiveResult(
    stepId: TutorialStepId,
    data: unknown
  ): Promise<Result<boolean, TutorialError>> {
    const step = getTutorialStep(stepId);

    // Store result
    if (!this.progress.interactiveResults) {
      this.progress.interactiveResults = {};
    }
    this.progress.interactiveResults[stepId] = data;

    // Validate if validator exists
    let valid = true;
    if (step.interactive?.validate) {
      valid = step.interactive.validate(data);
    }

    const saveResult = await this.saveProgress();
    if (!saveResult.ok) {
      return Err(saveResult.error);
    }

    if (valid) {
      this.events.onInteractiveComplete?.(stepId, data);
    }

    return Ok(valid);
  }

  // ===========================================================================
  // State Methods
  // ===========================================================================

  /**
   * Get current progress
   */
  getProgress(): TutorialProgress {
    return { ...this.progress };
  }

  /**
   * Get all steps
   */
  getAllSteps(): readonly TutorialStep[] {
    return getAllTutorialSteps();
  }

  /**
   * Get step count
   */
  getStepCount(): number {
    return TUTORIAL_STEPS.length;
  }

  /**
   * Get current step index (0-based)
   */
  getCurrentStepIndex(): number {
    return TUTORIAL_STEPS.indexOf(this.progress.currentStepId);
  }

  /**
   * Check if tutorial has been started
   */
  isStarted(): boolean {
    return this.started;
  }

  /**
   * Check if tutorial is complete
   */
  isComplete(): boolean {
    return this.progress.completed;
  }

  /**
   * Check if tutorial was skipped
   */
  isSkipped(): boolean {
    return this.progress.skipped;
  }

  /**
   * Reset tutorial progress
   */
  async reset(): Promise<Result<void, TutorialError>> {
    // Deep copy to avoid mutating INITIAL_TUTORIAL_PROGRESS
    this.progress = {
      ...INITIAL_TUTORIAL_PROGRESS,
      completedSteps: [],
      interactiveResults: {},
    };
    this.started = false;

    const progressPath = this.getTutorialProgressPath();
    try {
      if (fs.existsSync(progressPath)) {
        fs.unlinkSync(progressPath);
      }

      // Also reset config flag
      const configPath = this.getConfigPath();
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, "utf-8");
        const config = JSON.parse(content) as MinimalConfig;
        config.tutorialComplete = false;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      }

      return Ok(undefined);
    } catch (err) {
      const error: TutorialError = {
        code: "PROGRESS_SAVE_FAILED",
        message: "Failed to reset tutorial progress",
        cause: err,
      };
      this.events.onError?.(error);
      return Err(error);
    }
  }

  // ===========================================================================
  // Static Methods
  // ===========================================================================

  /**
   * Check if tutorial has been completed (static check)
   */
  static isCompleted(vellumDir?: string): boolean {
    const dir = vellumDir ?? getVellumDir();
    const configPath = path.join(dir, "config.json");

    try {
      if (!fs.existsSync(configPath)) {
        return false;
      }
      const content = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(content) as MinimalConfig;
      return config.tutorialComplete === true;
    } catch {
      return false;
    }
  }

  /**
   * Check if this is a first run (no .vellum directory)
   */
  static isFirstRun(vellumDir?: string): boolean {
    const dir = vellumDir ?? getVellumDir();
    return !fs.existsSync(dir);
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Load progress from file
   */
  private async loadProgress(): Promise<Result<TutorialProgress, TutorialError>> {
    const progressPath = this.getTutorialProgressPath();

    try {
      if (!fs.existsSync(progressPath)) {
        return Ok(this.progress);
      }

      const content = fs.readFileSync(progressPath, "utf-8");
      const parsed = JSON.parse(content);
      const validated = TutorialProgressSchema.safeParse(parsed);

      if (validated.success) {
        this.progress = validated.data;
      } else {
        // Invalid schema, use default (deep copy)
        this.progress = {
          ...INITIAL_TUTORIAL_PROGRESS,
          completedSteps: [],
          interactiveResults: {},
        };
      }

      return Ok(this.progress);
    } catch (err) {
      const error: TutorialError = {
        code: "PROGRESS_LOAD_FAILED",
        message: "Failed to load tutorial progress",
        cause: err,
      };
      this.events.onError?.(error);
      return Err(error);
    }
  }

  /**
   * Save progress to file
   */
  private async saveProgress(): Promise<Result<void, TutorialError>> {
    const vellumDir = this.getVellumDir();
    const progressPath = this.getTutorialProgressPath();

    try {
      if (!fs.existsSync(vellumDir)) {
        fs.mkdirSync(vellumDir, { recursive: true });
      }

      fs.writeFileSync(progressPath, JSON.stringify(this.progress, null, 2));
      return Ok(undefined);
    } catch (err) {
      const error: TutorialError = {
        code: "PROGRESS_SAVE_FAILED",
        message: "Failed to save tutorial progress",
        cause: err,
      };
      this.events.onError?.(error);
      return Err(error);
    }
  }

  /**
   * Mark tutorial complete in config.json
   */
  private async markConfigComplete(): Promise<Result<void, TutorialError>> {
    const vellumDir = this.getVellumDir();
    const configPath = this.getConfigPath();

    try {
      if (!fs.existsSync(vellumDir)) {
        fs.mkdirSync(vellumDir, { recursive: true });
      }

      let config: MinimalConfig = {};
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, "utf-8");
        config = JSON.parse(content) as MinimalConfig;
      }

      config.tutorialComplete = true;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      return Ok(undefined);
    } catch (err) {
      const error: TutorialError = {
        code: "CONFIG_UPDATE_FAILED",
        message: "Failed to update config with tutorial completion",
        cause: err,
      };
      this.events.onError?.(error);
      return Err(error);
    }
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create and start tutorial if needed
 *
 * @example
 * ```typescript
 * const result = await runTutorialIfNeeded({
 *   onStepChange: (step) => renderStep(step),
 *   onComplete: () => console.log('Done!'),
 * });
 *
 * if (result) {
 *   // Tutorial was started, handle steps
 * } else {
 *   // Tutorial not needed or already complete
 * }
 * ```
 */
export async function runTutorialIfNeeded(
  events: TutorialEngineEvents = {},
  options: TutorialEngineOptions = {}
): Promise<TutorialEngine | null> {
  const engine = new TutorialEngine(events, options);

  if (await engine.shouldShowTutorial()) {
    const result = await engine.start();
    if (result.ok) {
      return engine;
    }
  }

  return null;
}

/**
 * Check if tutorial should be shown (convenience function)
 */
export async function shouldShowTutorial(vellumDir?: string): Promise<boolean> {
  const engine = new TutorialEngine({}, { vellumDir });
  return engine.shouldShowTutorial();
}
