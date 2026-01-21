/**
 * Tutorial Module (Phase 38)
 *
 * Provides interactive tutorial system for new Vellum users.
 * Guides through modes, tools, and skills concepts.
 *
 * @module tutorial
 *
 * @example
 * ```typescript
 * import {
 *   TutorialEngine,
 *   runTutorialIfNeeded,
 *   shouldShowTutorial,
 * } from '@vellum/core/tutorial';
 *
 * // Check if tutorial needed
 * if (await shouldShowTutorial()) {
 *   const engine = await runTutorialIfNeeded({
 *     onStepChange: (step) => console.log(`Step: ${step.title}`),
 *     onComplete: () => console.log('Tutorial complete!'),
 *   });
 * }
 * ```
 */

// =============================================================================
// Types
// =============================================================================

export {
  INITIAL_TUTORIAL_PROGRESS,
  type InteractiveType,
  // Interactive types
  InteractiveTypeSchema,
  // Quick reference
  QUICK_REFERENCE_CARD,
  type QuickReferenceCard,
  type QuickReferenceSection,
  // Constants
  TUTORIAL_STEPS,
  // Error types
  type TutorialEngineEvents,
  type TutorialError,
  type TutorialErrorCode,
  // Interactive
  type TutorialInteractive,
  // Progress types
  type TutorialProgress,
  TutorialProgressSchema,
  // Step types
  type TutorialStep,
  type TutorialStepId,
  TutorialStepIdSchema,
  type TutorialStepResult,
} from "./types.js";

// =============================================================================
// Steps
// =============================================================================

export {
  // Individual steps
  completionStep,
  firstTaskStep,
  // Step utilities
  getAllTutorialSteps,
  getTutorialStep,
  modesIntroStep,
  skillsIntroStep,
  // Step map
  TUTORIAL_STEP_MAP,
  welcomeStep,
} from "./steps/index.js";

// =============================================================================
// Engine
// =============================================================================

export {
  // Helper functions
  runTutorialIfNeeded,
  shouldShowTutorial,
  // Main engine
  TutorialEngine,
  type TutorialEngineOptions,
} from "./tutorial-engine.js";
