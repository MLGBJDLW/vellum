/**
 * Tutorial Lessons Index
 *
 * Exports all available tutorial lessons.
 *
 * @module cli/onboarding/tutorial/lessons
 */

import type { Lesson, LessonCategory } from "../types.js";
import { basicsLesson } from "./basics.js";
import { modesLesson } from "./modes.js";
import { toolsLesson } from "./tools.js";

// =============================================================================
// Lesson Exports
// =============================================================================

export { basicsLesson, getBasicsLesson } from "./basics.js";
export { getModesLesson, modesLesson } from "./modes.js";
export { getToolsLesson, toolsLesson } from "./tools.js";

// =============================================================================
// Lesson Registry
// =============================================================================

/**
 * All available lessons
 */
export const ALL_LESSONS: readonly Lesson[] = [basicsLesson, toolsLesson, modesLesson] as const;

/**
 * Lessons indexed by ID
 */
export const LESSONS_BY_ID: Readonly<Record<string, Lesson>> = Object.freeze(
  ALL_LESSONS.reduce(
    (acc, lesson) => {
      acc[lesson.id] = lesson;
      return acc;
    },
    {} as Record<string, Lesson>
  )
);

/**
 * Lessons grouped by category
 */
export const LESSONS_BY_CATEGORY: Readonly<Record<LessonCategory, Lesson[]>> = Object.freeze({
  basics: ALL_LESSONS.filter((l) => l.category === "basics"),
  tools: ALL_LESSONS.filter((l) => l.category === "tools"),
  modes: ALL_LESSONS.filter((l) => l.category === "modes"),
  advanced: ALL_LESSONS.filter((l) => l.category === "advanced"),
  workflow: ALL_LESSONS.filter((l) => l.category === "workflow"),
});

// =============================================================================
// Lesson Utilities
// =============================================================================

/**
 * Get a lesson by ID
 */
export function getLessonById(lessonId: string): Lesson | undefined {
  return LESSONS_BY_ID[lessonId];
}

/**
 * Get lessons by category
 */
export function getLessonsByCategory(category: LessonCategory): Lesson[] {
  return LESSONS_BY_CATEGORY[category] ?? [];
}

/**
 * Get all lessons
 */
export function getAllLessons(): Lesson[] {
  return [...ALL_LESSONS];
}

/**
 * Get recommended lesson order (respecting prerequisites)
 */
export function getRecommendedOrder(): Lesson[] {
  // Simple topological sort based on prerequisites
  const visited = new Set<string>();
  const result: Lesson[] = [];

  function visit(lesson: Lesson): void {
    if (visited.has(lesson.id)) return;

    // Visit prerequisites first
    for (const prereqId of lesson.prerequisites) {
      const prereq = LESSONS_BY_ID[prereqId];
      if (prereq) {
        visit(prereq);
      }
    }

    visited.add(lesson.id);
    result.push(lesson);
  }

  for (const lesson of ALL_LESSONS) {
    visit(lesson);
  }

  return result;
}

/**
 * Check if a lesson's prerequisites are met
 */
export function checkPrerequisites(lessonId: string, completedLessons: string[]): boolean {
  const lesson = LESSONS_BY_ID[lessonId];
  if (!lesson) return false;

  return lesson.prerequisites.every((prereqId: string) => completedLessons.includes(prereqId));
}

/**
 * Get next recommended lesson based on progress
 */
export function getNextLesson(completedLessons: string[]): Lesson | undefined {
  const ordered = getRecommendedOrder();

  return ordered.find(
    (lesson) =>
      !completedLessons.includes(lesson.id) && checkPrerequisites(lesson.id, completedLessons)
  );
}

/**
 * Calculate total tutorial duration in minutes
 */
export function getTotalDuration(): number {
  return ALL_LESSONS.reduce((sum, lesson) => sum + lesson.estimatedMinutes, 0);
}

/**
 * Get lesson count
 */
export function getLessonCount(): number {
  return ALL_LESSONS.length;
}

/**
 * Get total step count across all lessons
 */
export function getTotalStepCount(): number {
  return ALL_LESSONS.reduce((sum, lesson) => sum + lesson.steps.length, 0);
}
