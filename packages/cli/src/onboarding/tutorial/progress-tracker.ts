/**
 * Progress Tracker
 *
 * Tracks and manages tutorial progress across lessons and steps.
 *
 * @module cli/onboarding/tutorial/progress-tracker
 */

import {
  INITIAL_LESSON_PROGRESS,
  type Lesson,
  type LessonProgress,
  type TutorialProgress,
  type TutorialStorage,
} from "./types.js";

// =============================================================================
// Progress Statistics
// =============================================================================

/**
 * Detailed progress statistics
 */
export interface ProgressStats {
  /** Total lessons in tutorial */
  totalLessons: number;
  /** Completed lessons count */
  completedLessons: number;
  /** Started but incomplete lessons */
  inProgressLessons: number;
  /** Not started lessons */
  notStartedLessons: number;
  /** Total steps across all lessons */
  totalSteps: number;
  /** Completed steps count */
  completedSteps: number;
  /** Completion percentage (0-100) */
  completionPercent: number;
  /** Total time spent in minutes */
  totalTimeMinutes: number;
  /** Estimated remaining time in minutes */
  estimatedRemainingMinutes: number;
}

// =============================================================================
// Progress Tracker Class
// =============================================================================

/**
 * Tracks and manages tutorial progress
 */
export class ProgressTracker {
  private storage: TutorialStorage;
  private lessons: readonly Lesson[];
  private cachedProgress: TutorialProgress | null = null;

  constructor(storage: TutorialStorage, lessons: readonly Lesson[]) {
    this.storage = storage;
    this.lessons = lessons;
  }

  // ===========================================================================
  // Progress Loading
  // ===========================================================================

  /**
   * Load progress from storage
   */
  async loadProgress(): Promise<TutorialProgress> {
    this.cachedProgress = await this.storage.loadProgress();
    return this.cachedProgress;
  }

  /**
   * Get cached progress or load if not cached
   */
  async getProgress(): Promise<TutorialProgress> {
    if (!this.cachedProgress) {
      return this.loadProgress();
    }
    return this.cachedProgress;
  }

  // ===========================================================================
  // Lesson Progress
  // ===========================================================================

  /**
   * Start a lesson
   */
  async startLesson(lessonId: string): Promise<LessonProgress> {
    const progress = await this.getProgress();
    const existing = progress.lessons[lessonId];

    // Already started
    if (existing?.started) {
      return existing;
    }

    const now = new Date().toISOString();
    const lessonProgress: LessonProgress = {
      ...INITIAL_LESSON_PROGRESS,
      lessonId,
      started: true,
      startedAt: now,
      currentStepIndex: 0,
      completedSteps: [],
      totalTimeSpent: 0,
    };

    await this.storage.updateLessonProgress(lessonId, lessonProgress);

    // Update cache
    progress.lessons[lessonId] = lessonProgress;
    progress.lastActiveLessonId = lessonId;
    progress.lastActivityAt = now;

    if (!progress.startedAt) {
      progress.startedAt = now;
      await this.storage.saveProgress(progress);
    }

    this.cachedProgress = progress;
    return lessonProgress;
  }

  /**
   * Complete a step in a lesson
   */
  async completeStep(lessonId: string, stepId: string, timeSpent?: number): Promise<void> {
    const progress = await this.getProgress();
    const lessonProgress = progress.lessons[lessonId];

    if (!lessonProgress) {
      throw new Error(`Lesson ${lessonId} not started`);
    }

    // Already completed
    if (lessonProgress.completedSteps.includes(stepId)) {
      return;
    }

    // Update lesson progress
    const updatedSteps = [...lessonProgress.completedSteps, stepId];
    const updatedTime = lessonProgress.totalTimeSpent + (timeSpent ?? 0);

    await this.storage.updateLessonProgress(lessonId, {
      completedSteps: updatedSteps,
      currentStepIndex: updatedSteps.length,
      totalTimeSpent: updatedTime,
    });

    // Update cache
    lessonProgress.completedSteps = updatedSteps;
    lessonProgress.currentStepIndex = updatedSteps.length;
    lessonProgress.totalTimeSpent = updatedTime;
    progress.stepsCompleted++;
    progress.lastActivityAt = new Date().toISOString();

    this.cachedProgress = progress;
  }

  /**
   * Complete a lesson
   */
  async completeLesson(lessonId: string): Promise<void> {
    const progress = await this.getProgress();
    const lessonProgress = progress.lessons[lessonId];

    if (!lessonProgress) {
      throw new Error(`Lesson ${lessonId} not started`);
    }

    // Already completed
    if (lessonProgress.completed) {
      return;
    }

    const now = new Date().toISOString();

    await this.storage.updateLessonProgress(lessonId, {
      completed: true,
      completedAt: now,
    });

    // Update cache
    lessonProgress.completed = true;
    lessonProgress.completedAt = now;
    progress.lessonsCompleted++;
    progress.lastActivityAt = now;

    await this.storage.saveProgress(progress);
    this.cachedProgress = progress;
  }

  /**
   * Get progress for a specific lesson
   */
  async getLessonProgress(lessonId: string): Promise<LessonProgress | undefined> {
    const progress = await this.getProgress();
    return progress.lessons[lessonId];
  }

  /**
   * Check if lesson is completed
   */
  async isLessonCompleted(lessonId: string): Promise<boolean> {
    const lessonProgress = await this.getLessonProgress(lessonId);
    return lessonProgress?.completed ?? false;
  }

  /**
   * Get current step in a lesson
   */
  async getCurrentStep(lessonId: string): Promise<number> {
    const lessonProgress = await this.getLessonProgress(lessonId);
    return lessonProgress?.currentStepIndex ?? 0;
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  /**
   * Get detailed progress statistics
   */
  async getStats(): Promise<ProgressStats> {
    const progress = await this.getProgress();

    let completedLessons = 0;
    let inProgressLessons = 0;
    let notStartedLessons = 0;
    let totalSteps = 0;
    let completedSteps = 0;
    let totalTimeSeconds = 0;
    let estimatedRemainingSeconds = 0;

    for (const lesson of this.lessons) {
      const lessonProgress = progress.lessons[lesson.id];
      totalSteps += lesson.steps.length;

      if (lessonProgress?.completed) {
        completedLessons++;
        completedSteps += lesson.steps.length;
        totalTimeSeconds += lessonProgress.totalTimeSpent;
      } else if (lessonProgress?.started) {
        inProgressLessons++;
        completedSteps += lessonProgress.completedSteps.length;
        totalTimeSeconds += lessonProgress.totalTimeSpent;

        // Estimate remaining for in-progress lesson
        const remainingSteps = lesson.steps.length - lessonProgress.completedSteps.length;
        const avgStepTime = (lesson.estimatedMinutes * 60) / lesson.steps.length;
        estimatedRemainingSeconds += remainingSteps * avgStepTime;
      } else {
        notStartedLessons++;
        estimatedRemainingSeconds += lesson.estimatedMinutes * 60;
      }
    }

    const totalLessons = this.lessons.length;
    const completionPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

    return {
      totalLessons,
      completedLessons,
      inProgressLessons,
      notStartedLessons,
      totalSteps,
      completedSteps,
      completionPercent,
      totalTimeMinutes: Math.round(totalTimeSeconds / 60),
      estimatedRemainingMinutes: Math.round(estimatedRemainingSeconds / 60),
    };
  }

  /**
   * Get completion percentage for a lesson
   */
  async getLessonCompletionPercent(lessonId: string): Promise<number> {
    const lesson = this.lessons.find((l) => l.id === lessonId);
    if (!lesson) return 0;

    const lessonProgress = await this.getLessonProgress(lessonId);
    if (!lessonProgress) return 0;

    const totalSteps = lesson.steps.length;
    const completedSteps = lessonProgress.completedSteps.length;

    return totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
  }

  /**
   * Check if all tutorials are complete
   */
  async isAllComplete(): Promise<boolean> {
    const progress = await this.getProgress();
    return this.lessons.every((lesson) => progress.lessons[lesson.id]?.completed);
  }

  /**
   * Get completed lesson IDs
   */
  async getCompletedLessonIds(): Promise<string[]> {
    const progress = await this.getProgress();
    return Object.entries(progress.lessons)
      .filter(([_, p]) => p.completed)
      .map(([id]) => id);
  }

  // ===========================================================================
  // Reset
  // ===========================================================================

  /**
   * Reset all progress
   */
  async resetAll(): Promise<void> {
    await this.storage.resetProgress();
    this.cachedProgress = null;
  }

  /**
   * Reset a single lesson
   */
  async resetLesson(lessonId: string): Promise<void> {
    await this.storage.updateLessonProgress(lessonId, {
      ...INITIAL_LESSON_PROGRESS,
      lessonId,
    });

    if (this.cachedProgress) {
      delete this.cachedProgress.lessons[lessonId];
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a progress tracker
 */
export function createProgressTracker(
  storage: TutorialStorage,
  lessons: readonly Lesson[]
): ProgressTracker {
  return new ProgressTracker(storage, lessons);
}
