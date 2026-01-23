/**
 * Tutorial Command
 *
 * CLI command for the interactive tutorial system.
 *
 * @module cli/commands/tutorial
 */

import chalk from "chalk";
import {
  ALL_LESSONS,
  createTutorialStorage,
  createTutorialSystem,
  getLessonById,
  type Lesson,
  type ProgressStats,
  type TutorialStep,
  type TutorialSystem,
} from "../onboarding/index.js";
import { ICONS } from "../utils/icons.js";
import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { error, success } from "./types.js";

// =============================================================================
// Module State
// =============================================================================

let tutorialSystem: TutorialSystem | null = null;

/**
 * Initialize tutorial system lazily
 */
async function getTutorialSystem(): Promise<TutorialSystem> {
  if (!tutorialSystem) {
    const storage = createTutorialStorage();
    tutorialSystem = createTutorialSystem(storage);
    await tutorialSystem.initialize();
  }
  return tutorialSystem;
}

/**
 * Set a custom tutorial system (for testing)
 */
export function setTutorialSystem(system: TutorialSystem | null): void {
  tutorialSystem = system;
}

// =============================================================================
// Formatters
// =============================================================================

/**
 * Format lesson info for display
 */
function formatLesson(lesson: Lesson, completed: boolean, inProgress: boolean): string {
  const icon = lesson.icon ?? "📖";
  const status = completed ? chalk.green("✓") : inProgress ? chalk.yellow("▶") : chalk.dim("○");
  const difficulty = formatDifficulty(lesson.difficulty);
  const duration = chalk.dim(`${lesson.estimatedMinutes} min`);

  return `${status} ${icon} ${chalk.bold(lesson.title)} ${difficulty} ${duration}
     ${chalk.dim(lesson.description)}`;
}

/**
 * Format difficulty level
 */
function formatDifficulty(difficulty: string): string {
  switch (difficulty) {
    case "beginner":
      return chalk.green("●○○");
    case "intermediate":
      return chalk.yellow("●●○");
    case "advanced":
      return chalk.red("●●●");
    default:
      return chalk.dim("○○○");
  }
}

/**
 * Format tutorial step
 */
function formatStep(step: TutorialStep, stepIndex: number, totalSteps: number): string {
  const progress = chalk.dim(`[${stepIndex + 1}/${totalSteps}]`);
  const lines: string[] = [];

  lines.push("");
  lines.push(`${progress} ${chalk.bold.cyan(step.title)}`);
  lines.push("");
  lines.push(step.content);

  if (step.command) {
    lines.push("");
    lines.push(chalk.dim("Try: ") + chalk.cyan(step.command));
  }

  if (step.hint) {
    lines.push("");
    lines.push(chalk.dim(`${ICONS.hint} ${step.hint}`));
  }

  if (step.action === "complete") {
    lines.push("");
    lines.push(chalk.dim("Press Enter to continue..."));
  }

  return lines.join("\n");
}

/**
 * Format progress stats
 */
function formatStats(stats: ProgressStats): string {
  const percent = stats.completionPercent;
  const barLength = 20;
  const filled = Math.round((percent / 100) * barLength);
  const bar = chalk.green("█".repeat(filled)) + chalk.dim("░".repeat(barLength - filled));

  const lines: string[] = [
    chalk.bold.blue("📊 Tutorial Progress"),
    "",
    `${bar} ${percent}%`,
    "",
    `  Lessons:  ${chalk.green(stats.completedLessons)}/${stats.totalLessons}`,
    `  Steps:    ${chalk.green(stats.completedSteps)}/${stats.totalSteps}`,
  ];

  if (stats.totalTimeMinutes > 0) {
    lines.push(`  Time:     ${stats.totalTimeMinutes} min spent`);
  }

  if (stats.estimatedRemainingMinutes > 0 && stats.completionPercent < 100) {
    lines.push(`  Remaining: ~${stats.estimatedRemainingMinutes} min`);
  }

  return lines.join("\n");
}

// =============================================================================
// Subcommand Handlers
// =============================================================================

/**
 * List all available tutorials
 */
async function handleList(): Promise<CommandResult> {
  const system = await getTutorialSystem();
  const stats = await system.getStats();
  const completedIds = (await system.getCompletedLessons()).map((l) => l.id);
  const progress = await system.getProgress();

  const lines: string[] = [
    chalk.bold.blue("📚 Tutorial Lessons"),
    "",
    formatStats(stats),
    "",
    chalk.bold("Available Lessons:"),
    "",
  ];

  for (const lesson of ALL_LESSONS) {
    const completed = completedIds.includes(lesson.id);
    const inProgress = Boolean(progress.lessons[lesson.id]?.started && !completed);
    lines.push(formatLesson(lesson, completed, inProgress));
    lines.push("");
  }

  lines.push(chalk.dim("Use /tutorial start <lesson-id> to begin a lesson"));
  lines.push(chalk.dim("Use /tutorial next to start the next recommended lesson"));

  return success(lines.join("\n"));
}

/**
 * Start a specific lesson
 */
async function handleStart(lessonId: string): Promise<CommandResult> {
  const system = await getTutorialSystem();

  // Check if lesson exists
  const lesson = getLessonById(lessonId);
  if (!lesson) {
    const available = ALL_LESSONS.map((l) => l.id).join(", ");
    return error("RESOURCE_NOT_FOUND", `Lesson "${lessonId}" not found. Available: ${available}`);
  }

  try {
    await system.start(lessonId);
    const step = system.currentStep();

    if (!step) {
      return error("INTERNAL_ERROR", "Failed to start lesson");
    }

    const output = [
      chalk.bold.green(`🎓 Starting: ${lesson.title}`),
      formatStep(step, 0, lesson.steps.length),
    ].join("\n");

    return success(output);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return error("OPERATION_NOT_ALLOWED", message);
  }
}

/**
 * Start the next recommended lesson
 */
async function handleNext(): Promise<CommandResult> {
  const system = await getTutorialSystem();

  const started = await system.startNext();
  if (!started) {
    // All complete or no available
    const stats = await system.getStats();
    if (stats.completionPercent === 100) {
      return success(
        chalk.green(`${ICONS.celebration} Congratulations! You've completed all tutorials!\n\n`) +
          formatStats(stats)
      );
    }

    return error("OPERATION_NOT_ALLOWED", "No available lessons. Check prerequisites.");
  }

  const lesson = system.getCurrentLesson();
  const step = system.currentStep();

  if (!lesson || !step) {
    return error("INTERNAL_ERROR", "Failed to start next lesson");
  }

  const output = [
    chalk.bold.green(`[Tutorial] Starting: ${lesson.title}`),
    formatStep(step, 0, lesson.steps.length),
  ].join("\n");

  return success(output);
}

/**
 * Continue to next step
 */
async function handleContinue(): Promise<CommandResult> {
  const system = await getTutorialSystem();

  if (!system.isLessonActive()) {
    return error(
      "OPERATION_NOT_ALLOWED",
      "No lesson in progress. Use /tutorial start <lesson-id> or /tutorial next"
    );
  }

  const currentStep = system.currentStep();
  if (!currentStep) {
    return error("INTERNAL_ERROR", "No current step");
  }

  try {
    const nextStep = await system.completeStep(currentStep.id);

    if (!nextStep) {
      // Lesson completed
      const lesson = system.getCurrentLesson();
      const stats = await system.getStats();

      return success(
        [
          chalk.bold.green(`${ICONS.success} Lesson Complete: ${lesson?.title ?? "Unknown"}`),
          "",
          formatStats(stats),
          "",
          chalk.dim("Use /tutorial next for the next lesson"),
        ].join("\n")
      );
    }

    // Show next step
    const lesson = system.getCurrentLesson();
    if (!lesson) {
      return error("INTERNAL_ERROR", "No active lesson found");
    }
    const stepIndex = (await system.getCurrentLessonProgress())?.currentStepIndex ?? 0;

    return success(formatStep(nextStep, stepIndex, lesson.steps.length));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return error("INTERNAL_ERROR", message);
  }
}

/**
 * Skip current step
 */
async function handleSkip(): Promise<CommandResult> {
  const system = await getTutorialSystem();

  if (!system.isLessonActive()) {
    return error("OPERATION_NOT_ALLOWED", "No lesson in progress.");
  }

  const nextStep = await system.skipStep();

  if (!nextStep) {
    const lesson = system.getCurrentLesson();
    const stats = await system.getStats();

    return success(
      [
        chalk.bold.yellow(`${ICONS.skip} Lesson Skipped: ${lesson?.title ?? "Unknown"}`),
        "",
        formatStats(stats),
        "",
        chalk.dim("Use /tutorial next for the next lesson"),
      ].join("\n")
    );
  }

  const lesson = system.getCurrentLesson();
  if (!lesson) {
    return error("INTERNAL_ERROR", "No active lesson found");
  }
  const stepIndex = (await system.getCurrentLessonProgress())?.currentStepIndex ?? 0;

  return success(formatStep(nextStep, stepIndex, lesson.steps.length));
}

/**
 * Show current status
 */
async function handleStatus(): Promise<CommandResult> {
  const system = await getTutorialSystem();
  const stats = await system.getStats();
  const state = await system.getState();

  const lines: string[] = [formatStats(stats), ""];

  if (state.isActive && state.currentLesson) {
    const stepIndex = state.currentStepIndex;
    const totalSteps = state.currentLesson.steps.length;
    const percent = Math.round((stepIndex / totalSteps) * 100);

    lines.push(chalk.bold("Current Lesson:"));
    lines.push(
      `  ${state.currentLesson.icon ?? "📖"} ${state.currentLesson.title} - Step ${stepIndex + 1}/${totalSteps} (${percent}%)`
    );
  } else {
    lines.push(chalk.dim("No lesson in progress."));
    lines.push(chalk.dim("Use /tutorial next to start learning!"));
  }

  return success(lines.join("\n"));
}

/**
 * Reset tutorial progress
 */
async function handleReset(lessonId?: string): Promise<CommandResult> {
  const system = await getTutorialSystem();

  if (lessonId) {
    const lesson = getLessonById(lessonId);
    if (!lesson) {
      return error("RESOURCE_NOT_FOUND", `Lesson "${lessonId}" not found.`);
    }

    await system.resetLesson(lessonId);
    return success(chalk.yellow(`${ICONS.reset} Reset progress for: ${lesson.title}`));
  }

  await system.resetAll();
  return success(chalk.yellow(`${ICONS.reset} All tutorial progress has been reset.`));
}

/**
 * Stop the current tutorial lesson
 */
async function handleStop(): Promise<CommandResult> {
  const system = await getTutorialSystem();

  if (!system.isLessonActive()) {
    return error("OPERATION_NOT_ALLOWED", "No tutorial lesson is currently active.", [
      "/tutorial list",
      "/tutorial start <lesson-id>",
    ]);
  }

  const currentLesson = system.getCurrentLesson();
  const lessonTitle = currentLesson?.title ?? "Unknown";

  // Reset the current lesson to stop it
  if (currentLesson) {
    await system.resetLesson(currentLesson.id);
  }

  return success(
    chalk.yellow(`[Stop] Stopped lesson: ${lessonTitle}\n\n`) +
      "Progress has been saved. Use /tutorial start to resume later."
  );
}

// =============================================================================
// Help
// =============================================================================

/**
 * Get help text
 */
function getHelp(): string {
  return [
    chalk.bold.blue("[Tutorial] Commands"),
    "",
    chalk.dim("Interactive tutorials to learn Vellum features."),
    "",
    chalk.bold("Commands:"),
    "",
    `  ${chalk.cyan("/tutorial")}              List all lessons`,
    `  ${chalk.cyan("/tutorial list")}         List all lessons with progress`,
    `  ${chalk.cyan("/tutorial start <id>")}   Start a specific lesson`,
    `  ${chalk.cyan("/tutorial next")}         Start next recommended lesson`,
    `  ${chalk.cyan("/tutorial continue")}     Continue to next step`,
    `  ${chalk.cyan("/tutorial skip")}         Skip current step`,
    `  ${chalk.cyan("/tutorial status")}       Show current progress`,
    `  ${chalk.cyan("/tutorial reset [id]")}   Reset progress (all or specific)`,
    "",
    chalk.bold("Available Lessons:"),
    "",
    `  ${chalk.cyan("basics")}    Getting Started with Vellum`,
    `  ${chalk.cyan("tools")}     Working with Tools`,
    `  ${chalk.cyan("modes")}     Mastering Coding Modes`,
    "",
    chalk.bold("Examples:"),
    "",
    chalk.dim("  /tutorial start basics"),
    chalk.dim("  /tutorial next"),
    chalk.dim("  /tutorial continue"),
    chalk.dim("  /tutorial reset basics"),
  ].join("\n");
}

// =============================================================================
// Command Definition
// =============================================================================

/**
 * Tutorial slash command
 */
export const tutorialCommand: SlashCommand = {
  name: "tutorial",
  aliases: ["learn", "lessons"],
  description: "Interactive tutorials to learn Vellum",
  category: "workflow",
  kind: "builtin",
  positionalArgs: [
    {
      name: "subcommand",
      type: "string",
      description: "Subcommand: list, start, next, continue, skip, status, reset",
      required: false,
    },
    {
      name: "argument",
      type: "string",
      description: "Lesson ID for start/reset commands",
      required: false,
    },
  ],
  examples: [
    "/tutorial                 - List all lessons",
    "/tutorial start basics    - Start basics lesson",
    "/tutorial next            - Start next lesson",
    "/tutorial continue        - Continue current lesson",
    "/tutorial skip            - Skip current step",
    "/tutorial status          - Show progress",
    "/tutorial reset           - Reset all progress",
    "/tutorial reset basics    - Reset specific lesson",
  ],
  subcommands: [
    { name: "list", description: "List all lessons" },
    { name: "start", description: "Start a lesson" },
    { name: "stop", description: "Stop current lesson" },
    { name: "next", description: "Next recommended lesson" },
    { name: "continue", description: "Continue current lesson" },
    { name: "skip", description: "Skip current step" },
    { name: "status", description: "Show progress" },
    { name: "reset", description: "Reset progress" },
    { name: "help", description: "Show help" },
  ],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const args = ctx.parsedArgs.positional as string[];
    const subcommand = args[0]?.toLowerCase() ?? "list";
    const argument = args[1];

    switch (subcommand) {
      case "list":
        return handleList();

      case "start":
        if (!argument) {
          return error(
            "INVALID_ARGUMENT",
            "Please specify a lesson ID. Use /tutorial list to see options."
          );
        }
        return handleStart(argument);

      case "next":
        return handleNext();

      case "continue":
      case "c":
        return handleContinue();

      case "skip":
      case "s":
        return handleSkip();

      case "status":
      case "progress":
        return handleStatus();

      case "reset":
        return handleReset(argument);

      case "stop":
        return handleStop();

      case "help":
      case "--help":
      case "-h":
        return success(getHelp());

      default:
        // Maybe they provided a lesson ID directly
        if (getLessonById(subcommand)) {
          return handleStart(subcommand);
        }
        return error(
          "INVALID_ARGUMENT",
          `Unknown subcommand: ${subcommand}. Use /tutorial --help for usage.`
        );
    }
  },
};

// =============================================================================
// Export
// =============================================================================

export { getTutorialSystem };
