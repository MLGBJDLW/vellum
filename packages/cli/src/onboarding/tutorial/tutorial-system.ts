/**
 * Tutorial System
 *
 * Main controller for the interactive tutorial experience.
 * Manages lesson progression, step completion, and user guidance.
 *
 * @module cli/onboarding/tutorial/tutorial-system
 */

import {
  ALL_LESSONS,
  checkPrerequisites,
  getLessonById,
  getNextLesson,
  getRecommendedOrder,
} from "./lessons/index.js";
import {
  createProgressTracker,
  type ProgressStats,
  type ProgressTracker,
} from "./progress-tracker.js";
import type {
  Lesson,
  LessonProgress,
  TutorialEvents,
  TutorialProgress,
  TutorialStep,
  TutorialStorage,
} from "./types.js";

// =============================================================================
// Tutorial State
// =============================================================================

/**
 * Current tutorial state
 */
export interface TutorialState {
  /** Currently active lesson */
  currentLesson: Lesson | null;
  /** Current step in the lesson */
  currentStep: TutorialStep | null;
  /** Current step index (0-based) */
  currentStepIndex: number;
  /** Whether tutorial is in progress */
  isActive: boolean;
  /** Overall progress */
  progress: TutorialProgress;
}

// =============================================================================
// Tutorial System Class
// =============================================================================

/**
 * Main tutorial system controller
 */
export class TutorialSystem {
  public readonly storage: TutorialStorage;
  private progressTracker: ProgressTracker;
  private events: TutorialEvents;
  private lessons: readonly Lesson[];

  // Current state
  private currentLesson: Lesson | null = null;
  private currentStepIndex: number = 0;
  private isActive: boolean = false;
  private stepStartTime: number = 0;

  constructor(storage: TutorialStorage, events: TutorialEvents = {}) {
    this.storage = storage;
    this.events = events;
    this.lessons = ALL_LESSONS;
    this.progressTracker = createProgressTracker(storage, this.lessons);
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize the tutorial system
   */
  async initialize(): Promise<void> {
    await this.progressTracker.loadProgress();
  }

  // ===========================================================================
  // Lesson Management
  // ===========================================================================

  /**
   * Start a specific lesson
   */
  async start(lessonId: string): Promise<void> {
    const lesson = getLessonById(lessonId);
    if (!lesson) {
      throw new Error(`Lesson not found: ${lessonId}`);
    }

    // Check prerequisites
    const completedLessons = await this.progressTracker.getCompletedLessonIds();
    if (!checkPrerequisites(lessonId, completedLessons)) {
      const unmet = lesson.prerequisites.filter((p) => !completedLessons.includes(p));
      throw new Error(`Prerequisites not met: ${unmet.join(", ")}`);
    }

    // Start the lesson
    await this.progressTracker.startLesson(lessonId);

    this.currentLesson = lesson;
    this.currentStepIndex = 0;
    this.isActive = true;
    this.stepStartTime = Date.now();

    // Fire event
    this.events.onLessonStart?.(lesson);
  }

  /**
   * Resume an in-progress lesson
   */
  async resume(lessonId: string): Promise<void> {
    const lesson = getLessonById(lessonId);
    if (!lesson) {
      throw new Error(`Lesson not found: ${lessonId}`);
    }

    const lessonProgress = await this.progressTracker.getLessonProgress(lessonId);
    if (!lessonProgress?.started) {
      // Not started yet, just start it
      return this.start(lessonId);
    }

    this.currentLesson = lesson;
    this.currentStepIndex = lessonProgress.currentStepIndex;
    this.isActive = true;
    this.stepStartTime = Date.now();
  }

  /**
   * Stop the current lesson
   */
  stop(): void {
    this.currentLesson = null;
    this.currentStepIndex = 0;
    this.isActive = false;
  }

  /**
   * Start the next recommended lesson
   */
  async startNext(): Promise<boolean> {
    const completedLessons = await this.progressTracker.getCompletedLessonIds();
    const nextLesson = getNextLesson(completedLessons);

    if (nextLesson) {
      await this.start(nextLesson.id);
      return true;
    }

    return false;
  }

  // ===========================================================================
  // Step Management
  // ===========================================================================

  /**
   * Get the current step
   */
  currentStep(): TutorialStep | null {
    if (!this.currentLesson || !this.isActive) {
      return null;
    }

    return this.currentLesson.steps[this.currentStepIndex] ?? null;
  }

  /**
   * Get the next step (without advancing)
   */
  nextStep(): TutorialStep | null {
    if (!this.currentLesson || !this.isActive) {
      return null;
    }

    const nextIndex = this.currentStepIndex + 1;
    return this.currentLesson.steps[nextIndex] ?? null;
  }

  /**
   * Get the previous step (without going back)
   */
  previousStep(): TutorialStep | null {
    if (!this.currentLesson || !this.isActive || this.currentStepIndex === 0) {
      return null;
    }

    return this.currentLesson.steps[this.currentStepIndex - 1] ?? null;
  }

  /**
   * Complete the current step and advance
   */
  async completeStep(stepId: string): Promise<TutorialStep | null> {
    if (!this.currentLesson || !this.isActive) {
      return null;
    }

    const step = this.currentStep();
    if (!step || step.id !== stepId) {
      throw new Error(`Step mismatch: expected ${step?.id}, got ${stepId}`);
    }

    // Calculate time spent
    const timeSpent = Math.round((Date.now() - this.stepStartTime) / 1000);

    // Mark step complete
    await this.progressTracker.completeStep(this.currentLesson.id, stepId, timeSpent);

    // Fire event
    this.events.onStepComplete?.(step, this.currentLesson);

    // Advance to next step
    this.currentStepIndex++;
    this.stepStartTime = Date.now();

    // Check if lesson is complete
    if (this.currentStepIndex >= this.currentLesson.steps.length) {
      await this.completeLessonInternal();
      return null;
    }

    return this.currentStep();
  }

  /**
   * Skip the current step
   */
  async skipStep(): Promise<TutorialStep | null> {
    if (!this.currentLesson || !this.isActive) {
      return null;
    }

    // Advance without marking complete
    this.currentStepIndex++;
    this.stepStartTime = Date.now();

    // Check if lesson is complete
    if (this.currentStepIndex >= this.currentLesson.steps.length) {
      await this.completeLessonInternal();
      return null;
    }

    return this.currentStep();
  }

  /**
   * Go back to previous step
   */
  goBack(): TutorialStep | null {
    if (!this.currentLesson || !this.isActive || this.currentStepIndex === 0) {
      return null;
    }

    this.currentStepIndex--;
    this.stepStartTime = Date.now();

    return this.currentStep();
  }

  /**
   * Jump to a specific step
   */
  jumpToStep(stepIndex: number): TutorialStep | null {
    if (!this.currentLesson || !this.isActive) {
      return null;
    }

    if (stepIndex < 0 || stepIndex >= this.currentLesson.steps.length) {
      throw new Error(`Invalid step index: ${stepIndex}`);
    }

    this.currentStepIndex = stepIndex;
    this.stepStartTime = Date.now();

    return this.currentStep();
  }

  // ===========================================================================
  // Progress
  // ===========================================================================

  /**
   * Get overall progress
   */
  async getProgress(): Promise<TutorialProgress> {
    return this.progressTracker.getProgress();
  }

  /**
   * Get progress statistics
   */
  async getStats(): Promise<ProgressStats> {
    return this.progressTracker.getStats();
  }

  /**
   * Get current lesson progress
   */
  async getCurrentLessonProgress(): Promise<LessonProgress | undefined> {
    if (!this.currentLesson) {
      return undefined;
    }
    return this.progressTracker.getLessonProgress(this.currentLesson.id);
  }

  /**
   * Check if all tutorials are complete
   */
  async isComplete(): Promise<boolean> {
    return this.progressTracker.isAllComplete();
  }

  // ===========================================================================
  // Lesson Listing
  // ===========================================================================

  /**
   * List all available lessons
   */
  listLessons(): Lesson[] {
    return [...this.lessons];
  }

  /**
   * Get lessons in recommended order
   */
  getRecommendedLessons(): Lesson[] {
    return getRecommendedOrder();
  }

  /**
   * Get available lessons (prerequisites met)
   */
  async getAvailableLessons(): Promise<Lesson[]> {
    const completedLessons = await this.progressTracker.getCompletedLessonIds();
    return this.lessons.filter(
      (lesson) =>
        !completedLessons.includes(lesson.id) && checkPrerequisites(lesson.id, completedLessons)
    );
  }

  /**
   * Get completed lessons
   */
  async getCompletedLessons(): Promise<Lesson[]> {
    const completedIds = await this.progressTracker.getCompletedLessonIds();
    return this.lessons.filter((lesson) => completedIds.includes(lesson.id));
  }

  // ===========================================================================
  // State
  // ===========================================================================

  /**
   * Get current tutorial state
   */
  async getState(): Promise<TutorialState> {
    const progress = await this.progressTracker.getProgress();

    return {
      currentLesson: this.currentLesson,
      currentStep: this.currentStep(),
      currentStepIndex: this.currentStepIndex,
      isActive: this.isActive,
      progress,
    };
  }

  /**
   * Check if a lesson is in progress
   */
  isLessonActive(): boolean {
    return this.isActive && this.currentLesson !== null;
  }

  /**
   * Get current lesson
   */
  getCurrentLesson(): Lesson | null {
    return this.currentLesson;
  }

  // ===========================================================================
  // Reset
  // ===========================================================================

  /**
   * Reset all progress
   */
  async resetAll(): Promise<void> {
    await this.progressTracker.resetAll();
    this.stop();
  }

  /**
   * Reset a single lesson
   */
  async resetLesson(lessonId: string): Promise<void> {
    await this.progressTracker.resetLesson(lessonId);

    if (this.currentLesson?.id === lessonId) {
      this.stop();
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Internal method to complete current lesson
   */
  private async completeLessonInternal(): Promise<void> {
    if (!this.currentLesson) return;

    const lesson = this.currentLesson;
    await this.progressTracker.completeLesson(lesson.id);

    // Get updated progress
    const lessonProgress = await this.progressTracker.getLessonProgress(lesson.id);

    // Fire events
    this.events.onLessonComplete?.(lesson, lessonProgress!);

    // Check if all tutorials complete
    if (await this.isComplete()) {
      const progress = await this.getProgress();
      this.events.onTutorialComplete?.(progress);
    }

    this.stop();
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a tutorial system instance
 */
export function createTutorialSystem(
  storage: TutorialStorage,
  events: TutorialEvents = {}
): TutorialSystem {
  return new TutorialSystem(storage, events);
}
