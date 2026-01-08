/**
 * Tutorial Module Index
 *
 * Exports all tutorial-related types, classes, and utilities.
 *
 * @module cli/onboarding/tutorial
 */

// =============================================================================
// Types
// =============================================================================

export {
  INITIAL_LESSON_PROGRESS,
  INITIAL_TUTORIAL_PROGRESS,
  type Lesson,
  type LessonCategory,
  type LessonDifficulty,
  type LessonProgress,
  LessonProgressSchema,
  LessonSchema,
  type Tip,
  type TipContext,
  TipSchema,
  type TipState,
  type TutorialAction,
  type TutorialEvents,
  type TutorialProgress,
  TutorialProgressSchema,
  type TutorialStep,
  TutorialStepSchema,
  type TutorialStorage,
} from "./types.js";

// =============================================================================
// Storage
// =============================================================================

export {
  createTutorialStorage,
  FileTutorialStorage,
  MemoryTutorialStorage,
} from "./storage.js";

// =============================================================================
// Lessons
// =============================================================================

export {
  ALL_LESSONS,
  basicsLesson,
  checkPrerequisites,
  getAllLessons,
  getBasicsLesson,
  getLessonById,
  getLessonCount,
  getLessonsByCategory,
  getModesLesson,
  getNextLesson,
  getRecommendedOrder,
  getToolsLesson,
  getTotalDuration,
  getTotalStepCount,
  LESSONS_BY_CATEGORY,
  LESSONS_BY_ID,
  modesLesson,
  toolsLesson,
} from "./lessons/index.js";

// =============================================================================
// Progress Tracker
// =============================================================================

export {
  createProgressTracker,
  type ProgressStats,
  ProgressTracker,
} from "./progress-tracker.js";

// =============================================================================
// Tutorial System
// =============================================================================

export {
  createTutorialSystem,
  type TutorialState,
  TutorialSystem,
} from "./tutorial-system.js";
