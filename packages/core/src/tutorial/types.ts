/**
 * Tutorial Engine Type Definitions (Phase 38)
 *
 * Types for the interactive tutorial system that guides users
 * through Vellum's key concepts: modes, tools, and skills.
 *
 * @module tutorial/types
 */

import { z } from "zod";

// =============================================================================
// Step Types
// =============================================================================

/**
 * Tutorial step identifiers
 */
export const TutorialStepIdSchema = z.enum([
  "welcome",
  "modes-intro",
  "first-task",
  "skills-intro",
  "completion",
]);

export type TutorialStepId = z.infer<typeof TutorialStepIdSchema>;

/**
 * All tutorial steps in order
 */
export const TUTORIAL_STEPS: readonly TutorialStepId[] = [
  "welcome",
  "modes-intro",
  "first-task",
  "skills-intro",
  "completion",
] as const;

/**
 * Interactive element types
 */
export const InteractiveTypeSchema = z.enum(["mode-switch", "run-task", "add-skill", "none"]);

export type InteractiveType = z.infer<typeof InteractiveTypeSchema>;

/**
 * Interactive element configuration
 */
export interface TutorialInteractive {
  /** Type of interaction */
  readonly type: InteractiveType;
  /** Instruction text for the user */
  readonly instruction: string;
  /** Validation function (result: unknown) => boolean */
  readonly validate?: (result: unknown) => boolean;
  /** Hint shown if validation fails */
  readonly hint?: string;
}

/**
 * A single tutorial step
 */
export interface TutorialStep {
  /** Unique step identifier */
  readonly id: TutorialStepId;
  /** Display title */
  readonly title: string;
  /** Short description */
  readonly description: string;
  /** Full content (Markdown) */
  readonly content: string;
  /** Icon for visual identification */
  readonly icon: string;
  /** Whether step can be skipped */
  readonly skippable: boolean;
  /** Interactive element (optional) */
  readonly interactive?: TutorialInteractive;
  /** Quick reference bullets for this step */
  readonly quickRef?: readonly string[];
}

// =============================================================================
// Progress Types
// =============================================================================

/**
 * Progress state schema
 */
export const TutorialProgressSchema = z.object({
  /** Current step ID */
  currentStepId: TutorialStepIdSchema,
  /** Completed step IDs */
  completedSteps: z.array(TutorialStepIdSchema),
  /** Whether tutorial has been completed */
  completed: z.boolean(),
  /** Whether tutorial was skipped */
  skipped: z.boolean(),
  /** Timestamp when tutorial started */
  startedAt: z.string().datetime().optional(),
  /** Timestamp when tutorial completed */
  completedAt: z.string().datetime().optional(),
  /** Interactive results by step ID */
  interactiveResults: z.record(z.string(), z.unknown()).optional(),
});

export type TutorialProgress = z.infer<typeof TutorialProgressSchema>;

/**
 * Initial progress state
 */
export const INITIAL_TUTORIAL_PROGRESS: TutorialProgress = {
  currentStepId: "welcome",
  completedSteps: [],
  completed: false,
  skipped: false,
  startedAt: undefined,
  completedAt: undefined,
  interactiveResults: {},
};

// =============================================================================
// Event Types
// =============================================================================

/**
 * Result of executing a step
 */
export interface TutorialStepResult {
  /** Whether step completed successfully */
  success: boolean;
  /** Move to next step */
  next: boolean;
  /** Move to previous step */
  back: boolean;
  /** Skip entire tutorial */
  skip: boolean;
  /** Error message if failed */
  error?: string;
  /** Data from interactive element */
  interactiveData?: unknown;
}

/**
 * Events emitted by TutorialEngine
 */
export interface TutorialEngineEvents {
  /** Fired when step changes */
  onStepChange?: (step: TutorialStep, progress: TutorialProgress) => void;
  /** Fired when step completes */
  onStepComplete?: (stepId: TutorialStepId, result: TutorialStepResult) => void;
  /** Fired when interactive element completes */
  onInteractiveComplete?: (stepId: TutorialStepId, data: unknown) => void;
  /** Fired when tutorial completes */
  onComplete?: (progress: TutorialProgress) => void;
  /** Fired when tutorial is skipped */
  onSkip?: () => void;
  /** Fired on error */
  onError?: (error: TutorialError) => void;
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Tutorial error codes
 */
export type TutorialErrorCode =
  | "PROGRESS_LOAD_FAILED"
  | "PROGRESS_SAVE_FAILED"
  | "CONFIG_UPDATE_FAILED"
  | "STEP_NOT_FOUND"
  | "VALIDATION_FAILED"
  | "ALREADY_COMPLETE";

/**
 * Tutorial error
 */
export interface TutorialError {
  code: TutorialErrorCode;
  message: string;
  cause?: unknown;
}

// =============================================================================
// Quick Reference Card
// =============================================================================

/**
 * Quick reference content for completion
 */
export interface QuickReferenceCard {
  /** Title of the reference card */
  title: string;
  /** Sections with tips */
  sections: readonly QuickReferenceSection[];
}

/**
 * A section in the quick reference card
 */
export interface QuickReferenceSection {
  /** Section heading */
  heading: string;
  /** Items in this section */
  items: readonly string[];
}

/**
 * The quick reference card shown at tutorial completion
 */
export const QUICK_REFERENCE_CARD: QuickReferenceCard = {
  title: "📋 Vellum Quick Reference",
  sections: [
    {
      heading: "Modes",
      items: [
        "⚡ vibe - Fast autonomous coding (Ctrl+1)",
        "📋 plan - Plan-then-execute (Ctrl+2)",
        "📐 spec - Structured 6-phase workflow (Ctrl+3)",
      ],
    },
    {
      heading: "Commands",
      items: [
        "/mode <name> - Switch coding mode",
        "/tutorial - Restart this tutorial",
        "/help - Show all commands",
      ],
    },
    {
      heading: "Skills",
      items: [
        "~/.vellum/skills/ - Personal skills",
        ".vellum/skills/ - Project skills",
        "Matched automatically by task context",
      ],
    },
  ],
};
