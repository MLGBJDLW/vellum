/**
 * Tutorial System Type Definitions
 *
 * Core types for the interactive tutorial system that guides
 * users through learning Vellum features.
 *
 * @module cli/onboarding/tutorial/types
 */

import { z } from "zod";

// =============================================================================
// Step Types
// =============================================================================

/**
 * Action types for tutorial steps
 */
export type TutorialAction =
  | "read" // User reads content
  | "command" // User executes a command
  | "navigate" // User navigates (e.g., change mode)
  | "interact" // User interacts with UI
  | "complete"; // Completion marker

/**
 * Tutorial step schema
 */
export const TutorialStepSchema = z.object({
  /** Unique step identifier */
  id: z.string(),
  /** Step title */
  title: z.string(),
  /** Step content/instructions */
  content: z.string(),
  /** Required action type */
  action: z.enum(["read", "command", "navigate", "interact", "complete"]),
  /** Command to execute (for action: 'command') */
  command: z.string().optional(),
  /** Expected outcome description */
  expectedOutcome: z.string().optional(),
  /** Hint for user if stuck */
  hint: z.string().optional(),
  /** Duration estimate in seconds */
  estimatedDuration: z.number().optional(),
});

export type TutorialStep = z.infer<typeof TutorialStepSchema>;

// =============================================================================
// Lesson Types
// =============================================================================

/**
 * Lesson difficulty levels
 */
export type LessonDifficulty = "beginner" | "intermediate" | "advanced";

/**
 * Lesson categories
 */
export type LessonCategory = "basics" | "tools" | "modes" | "advanced" | "workflow";

/**
 * Lesson schema
 */
export const LessonSchema = z.object({
  /** Unique lesson identifier */
  id: z.string(),
  /** Lesson title */
  title: z.string(),
  /** Brief description */
  description: z.string(),
  /** Lesson category */
  category: z.enum(["basics", "tools", "modes", "advanced", "workflow"]),
  /** Difficulty level */
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  /** Prerequisites (other lesson IDs) */
  prerequisites: z.array(z.string()).default([]),
  /** Steps in this lesson */
  steps: z.array(TutorialStepSchema),
  /** Tags for filtering */
  tags: z.array(z.string()).default([]),
  /** Estimated total duration in minutes */
  estimatedMinutes: z.number(),
  /** Icon for display */
  icon: z.string().optional(),
});

export type Lesson = z.infer<typeof LessonSchema>;

// =============================================================================
// Progress Types
// =============================================================================

/**
 * Step completion status
 */
export interface StepProgress {
  /** Step ID */
  stepId: string;
  /** Whether step is completed */
  completed: boolean;
  /** When step was completed */
  completedAt?: string;
  /** Time spent on step in seconds */
  timeSpent?: number;
}

/**
 * Lesson progress schema
 */
export const LessonProgressSchema = z.object({
  /** Lesson ID */
  lessonId: z.string(),
  /** Whether lesson is started */
  started: z.boolean().default(false),
  /** Whether lesson is completed */
  completed: z.boolean().default(false),
  /** When lesson was started */
  startedAt: z.string().datetime().optional(),
  /** When lesson was completed */
  completedAt: z.string().datetime().optional(),
  /** Current step index (0-based) */
  currentStepIndex: z.number().default(0),
  /** Completed step IDs */
  completedSteps: z.array(z.string()).default([]),
  /** Total time spent in seconds */
  totalTimeSpent: z.number().default(0),
});

export type LessonProgress = z.infer<typeof LessonProgressSchema>;

/**
 * Overall tutorial progress schema
 */
export const TutorialProgressSchema = z.object({
  /** User ID or anonymous identifier */
  userId: z.string().optional(),
  /** When tutorial was started */
  startedAt: z.string().datetime().optional(),
  /** Total lessons completed */
  lessonsCompleted: z.number().default(0),
  /** Total steps completed */
  stepsCompleted: z.number().default(0),
  /** Progress by lesson */
  lessons: z.record(z.string(), LessonProgressSchema).default({}),
  /** Last active lesson */
  lastActiveLessonId: z.string().optional(),
  /** Last activity timestamp */
  lastActivityAt: z.string().datetime().optional(),
});

export type TutorialProgress = z.infer<typeof TutorialProgressSchema>;

// =============================================================================
// Storage Types
// =============================================================================

/**
 * Tutorial storage interface
 */
export interface TutorialStorage {
  /** Load tutorial progress */
  loadProgress(): Promise<TutorialProgress>;

  /** Save tutorial progress */
  saveProgress(progress: TutorialProgress): Promise<void>;

  /** Reset all progress */
  resetProgress(): Promise<void>;

  /** Get lesson progress */
  getLessonProgress(lessonId: string): Promise<LessonProgress | undefined>;

  /** Update lesson progress */
  updateLessonProgress(lessonId: string, progress: Partial<LessonProgress>): Promise<void>;
}

// =============================================================================
// Tip Types
// =============================================================================

/**
 * Context for tip display
 */
export interface TipContext {
  /** Current command being executed */
  command?: string;
  /** Current mode */
  mode?: string;
  /** Current screen/panel */
  screen?: string;
  /** User experience level */
  experienceLevel?: "new" | "beginner" | "intermediate" | "advanced";
  /** Features used count */
  featuresUsedCount?: number;
  /** Session duration in seconds */
  sessionDuration?: number;
  /** Error just occurred */
  hasError?: boolean;
  /** Custom context data */
  custom?: Record<string, unknown>;
}

/**
 * Tip schema
 */
export const TipSchema = z.object({
  /** Unique tip identifier */
  id: z.string(),
  /** Tip title (short) */
  title: z.string(),
  /** Tip content */
  content: z.string(),
  /** Category */
  category: z.enum(["shortcuts", "features", "best-practices", "errors", "performance"]),
  /** When to show this tip */
  trigger: z.object({
    /** Commands that trigger this tip */
    commands: z.array(z.string()).optional(),
    /** Modes that trigger this tip */
    modes: z.array(z.string()).optional(),
    /** Screens that trigger this tip */
    screens: z.array(z.string()).optional(),
    /** Show on errors */
    onError: z.boolean().optional(),
    /** Required feature usage count */
    minFeatureUsage: z.number().optional(),
    /** Maximum times to show (0 = always) */
    maxShows: z.number().optional(),
  }),
  /** Priority (higher = more important) */
  priority: z.number().default(0),
  /** Whether tip is dismissable */
  dismissable: z.boolean().default(true),
  /** Related lesson ID */
  relatedLessonId: z.string().optional(),
  /** Icon */
  icon: z.string().optional(),
});

export type Tip = z.infer<typeof TipSchema>;

/**
 * Tip display state
 */
export interface TipState {
  /** Tip ID */
  tipId: string;
  /** Times shown */
  showCount: number;
  /** Whether dismissed */
  dismissed: boolean;
  /** Last shown timestamp */
  lastShownAt?: string;
  /** First shown timestamp */
  firstShownAt?: string;
}

// =============================================================================
// Event Types
// =============================================================================

/**
 * Tutorial system events
 */
export interface TutorialEvents {
  /** Lesson started */
  onLessonStart?: (lesson: Lesson) => void;
  /** Step completed */
  onStepComplete?: (step: TutorialStep, lesson: Lesson) => void;
  /** Lesson completed */
  onLessonComplete?: (lesson: Lesson, progress: LessonProgress) => void;
  /** Tutorial completed (all lessons) */
  onTutorialComplete?: (progress: TutorialProgress) => void;
  /** Error occurred */
  onError?: (error: Error) => void;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Initial tutorial progress
 */
export const INITIAL_TUTORIAL_PROGRESS: TutorialProgress = {
  userId: undefined,
  startedAt: undefined,
  lessonsCompleted: 0,
  stepsCompleted: 0,
  lessons: {},
  lastActiveLessonId: undefined,
  lastActivityAt: undefined,
};

/**
 * Initial lesson progress
 */
export const INITIAL_LESSON_PROGRESS: LessonProgress = {
  lessonId: "",
  started: false,
  completed: false,
  startedAt: undefined,
  completedAt: undefined,
  currentStepIndex: 0,
  completedSteps: [],
  totalTimeSpent: 0,
};
