/**
 * Onboarding Module Index
 *
 * Exports tutorial system, tip engine, and related utilities.
 *
 * @module cli/onboarding
 */

// =============================================================================
// Tutorial System
// =============================================================================

export {
  ALL_LESSONS,
  basicsLesson,
  checkPrerequisites,
  createProgressTracker,
  createTutorialStorage,
  createTutorialSystem,
  FileTutorialStorage,
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
  INITIAL_LESSON_PROGRESS,
  INITIAL_TUTORIAL_PROGRESS,
  LESSONS_BY_CATEGORY,
  LESSONS_BY_ID,
  type Lesson,
  type LessonCategory,
  type LessonDifficulty,
  type LessonProgress,
  LessonProgressSchema,
  LessonSchema,
  MemoryTutorialStorage,
  modesLesson,
  type ProgressStats,
  ProgressTracker,
  type TutorialAction,
  type TutorialEvents,
  type TutorialProgress,
  TutorialProgressSchema,
  type TutorialState,
  type TutorialStep,
  TutorialStepSchema,
  type TutorialStorage,
  TutorialSystem,
  toolsLesson,
} from "./tutorial/index.js";

// =============================================================================
// Tips System
// =============================================================================

export {
  BUILTIN_TIPS,
  createTipEngine,
  TipEngine,
} from "./tips/index.js";

// Re-export tip types from tutorial
export type { Tip, TipContext, TipState } from "./tutorial/types.js";
