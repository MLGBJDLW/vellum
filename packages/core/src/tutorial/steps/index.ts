/**
 * Tutorial Steps Index (Phase 38)
 *
 * Exports all tutorial step definitions.
 *
 * @module tutorial/steps
 */

export { completionStep } from "./completion.js";
export { firstTaskStep } from "./first-task.js";
export { modesIntroStep } from "./modes-intro.js";
export { skillsIntroStep } from "./skills-intro.js";
export { welcomeStep } from "./welcome.js";

import type { TutorialStep, TutorialStepId } from "../types.js";
import { completionStep } from "./completion.js";
import { firstTaskStep } from "./first-task.js";
import { modesIntroStep } from "./modes-intro.js";
import { skillsIntroStep } from "./skills-intro.js";
import { welcomeStep } from "./welcome.js";

/**
 * All tutorial steps indexed by ID
 */
export const TUTORIAL_STEP_MAP: Record<TutorialStepId, TutorialStep> = {
  welcome: welcomeStep,
  "modes-intro": modesIntroStep,
  "first-task": firstTaskStep,
  "skills-intro": skillsIntroStep,
  completion: completionStep,
};

/**
 * Get a tutorial step by ID
 */
export function getTutorialStep(id: TutorialStepId): TutorialStep {
  return TUTORIAL_STEP_MAP[id];
}

/**
 * Get all tutorial steps in order
 */
export function getAllTutorialSteps(): readonly TutorialStep[] {
  return [welcomeStep, modesIntroStep, firstTaskStep, skillsIntroStep, completionStep];
}
