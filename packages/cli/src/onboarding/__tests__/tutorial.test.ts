/**
 * Tutorial System Tests
 *
 * Unit tests for the tutorial system including:
 * - TutorialSystem lifecycle and navigation
 * - ProgressTracker step/lesson tracking
 * - TipEngine contextual tip matching
 * - Lesson content validation
 * - Storage operations
 *
 * @module cli/onboarding/__tests__/tutorial
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  ALL_LESSONS,
  BUILTIN_TIPS,
  basicsLesson,
  createProgressTracker,
  createTipEngine,
  createTutorialSystem,
  getLessonById,
  getLessonsByCategory,
  getNextLesson,
  getRecommendedOrder,
  getTotalDuration,
  getTotalStepCount,
  INITIAL_TUTORIAL_PROGRESS,
  LESSONS_BY_CATEGORY,
  LESSONS_BY_ID,
  MemoryTutorialStorage,
  modesLesson,
  type TipContext,
  TipEngine,
  type TutorialProgress,
  type TutorialSystem,
  toolsLesson,
} from "../index.js";

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a fresh memory storage for testing
 */
function createTestStorage(): MemoryTutorialStorage {
  return new MemoryTutorialStorage();
}

/**
 * Create a tutorial system with memory storage
 */
function createTestTutorialSystem(): { system: TutorialSystem; storage: MemoryTutorialStorage } {
  const storage = createTestStorage();
  const system = createTutorialSystem(storage);
  return { system, storage };
}

// =============================================================================
// T001: Lesson Registry Tests
// =============================================================================

describe("Lesson Registry", () => {
  describe("ALL_LESSONS", () => {
    it("should contain at least 3 lessons", () => {
      expect(ALL_LESSONS.length).toBeGreaterThanOrEqual(3);
    });

    it("should include basics, tools, and modes lessons", () => {
      const ids = ALL_LESSONS.map((l) => l.id);
      expect(ids).toContain("basics");
      expect(ids).toContain("tools");
      expect(ids).toContain("modes");
    });

    it("should have unique lesson IDs", () => {
      const ids = ALL_LESSONS.map((l) => l.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe("getLessonById", () => {
    it("should return lesson for valid ID", () => {
      const lesson = getLessonById("basics");
      expect(lesson).toBeDefined();
      expect(lesson?.id).toBe("basics");
      expect(lesson?.title).toBe("Getting Started with Vellum");
    });

    it("should return undefined for invalid ID", () => {
      const lesson = getLessonById("nonexistent");
      expect(lesson).toBeUndefined();
    });
  });

  describe("getLessonsByCategory", () => {
    it("should return lessons filtered by category", () => {
      const basics = getLessonsByCategory("basics");
      expect(basics.length).toBeGreaterThan(0);
      expect(basics.every((l) => l.category === "basics")).toBe(true);
    });

    it("should return empty array for category with no lessons", () => {
      const workflow = getLessonsByCategory("workflow");
      expect(Array.isArray(workflow)).toBe(true);
    });
  });

  describe("LESSONS_BY_ID", () => {
    it("should index all lessons by ID", () => {
      expect(LESSONS_BY_ID.basics).toBe(basicsLesson);
      expect(LESSONS_BY_ID.tools).toBe(toolsLesson);
      expect(LESSONS_BY_ID.modes).toBe(modesLesson);
    });
  });

  describe("LESSONS_BY_CATEGORY", () => {
    it("should group lessons by category", () => {
      expect(LESSONS_BY_CATEGORY.basics).toContain(basicsLesson);
      expect(LESSONS_BY_CATEGORY.tools).toContain(toolsLesson);
      expect(LESSONS_BY_CATEGORY.modes).toContain(modesLesson);
    });
  });
});

// =============================================================================
// T002: Lesson Content Tests
// =============================================================================

describe("Lesson Content", () => {
  describe("basicsLesson", () => {
    it("should have valid structure", () => {
      expect(basicsLesson.id).toBe("basics");
      expect(basicsLesson.title).toBeDefined();
      expect(basicsLesson.description).toBeDefined();
      expect(basicsLesson.category).toBe("basics");
      expect(basicsLesson.difficulty).toBe("beginner");
    });

    it("should have at least 5 steps", () => {
      expect(basicsLesson.steps.length).toBeGreaterThanOrEqual(5);
    });

    it("should have unique step IDs", () => {
      const ids = basicsLesson.steps.map((s: { id: string }) => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("should have no prerequisites", () => {
      expect(basicsLesson.prerequisites).toEqual([]);
    });

    it("should have valid steps with required fields", () => {
      for (const step of basicsLesson.steps) {
        expect(step.id).toBeDefined();
        expect(step.title).toBeDefined();
        expect(step.content).toBeDefined();
        expect(step.action).toBeDefined();
        expect(["read", "command", "navigate", "interact", "complete"]).toContain(step.action);
      }
    });
  });

  describe("toolsLesson", () => {
    it("should require basics as prerequisite", () => {
      expect(toolsLesson.prerequisites).toContain("basics");
    });

    it("should be in tools category", () => {
      expect(toolsLesson.category).toBe("tools");
    });
  });

  describe("modesLesson", () => {
    it("should require basics as prerequisite", () => {
      expect(modesLesson.prerequisites).toContain("basics");
    });

    it("should be in modes category", () => {
      expect(modesLesson.category).toBe("modes");
    });
  });
});

// =============================================================================
// T003: Tutorial System Tests
// =============================================================================

describe("TutorialSystem", () => {
  let system: TutorialSystem;

  beforeEach(async () => {
    const result = createTestTutorialSystem();
    system = result.system;
    await system.initialize();
  });

  describe("initialization", () => {
    it("should initialize without errors", async () => {
      const newSystem = createTutorialSystem(createTestStorage());
      await expect(newSystem.initialize()).resolves.not.toThrow();
    });

    it("should have no active lesson after initialization", () => {
      expect(system.currentStep()).toBeNull();
    });
  });

  describe("start", () => {
    it("should start a lesson successfully", async () => {
      await system.start("basics");
      expect(system.currentStep()).not.toBeNull();
      expect(system.currentStep()?.id).toBe("basics-welcome");
    });

    it("should throw for non-existent lesson", async () => {
      await expect(system.start("nonexistent")).rejects.toThrow("Lesson not found");
    });

    it("should throw if prerequisites not met", async () => {
      // tools requires basics
      await expect(system.start("tools")).rejects.toThrow("Prerequisites not met");
    });

    it("should allow starting lesson after prerequisites completed", async () => {
      // Complete basics first
      await system.start("basics");
      let step = system.currentStep();
      while (step) {
        step = await system.completeStep(step.id);
      }

      // Now tools should work
      await expect(system.start("tools")).resolves.not.toThrow();
    });
  });

  describe("completeStep", () => {
    it("should advance to next step", async () => {
      await system.start("basics");
      const firstStep = system.currentStep();
      expect(firstStep?.id).toBe("basics-welcome");

      if (firstStep) {
        await system.completeStep(firstStep.id);
      }
      const secondStep = system.currentStep();
      expect(secondStep?.id).toBe("basics-chat");
    });

    it("should complete lesson when all steps done", async () => {
      await system.start("basics");
      const stepCount = basicsLesson.steps.length;

      let step = system.currentStep();
      for (let i = 0; i < stepCount && step; i++) {
        step = await system.completeStep(step.id);
      }

      expect(system.currentStep()).toBeNull();
    });

    it("should return null when no active lesson", async () => {
      const result = await system.completeStep("test");
      expect(result).toBeNull();
    });
  });

  describe("skipStep", () => {
    it("should skip current step without completing", async () => {
      await system.start("basics");
      await system.skipStep();
      expect(system.currentStep()?.id).toBe("basics-chat");
    });

    it("should return null when no active lesson", async () => {
      const result = await system.skipStep();
      expect(result).toBeNull();
    });
  });

  describe("stop", () => {
    it("should stop the current lesson", async () => {
      await system.start("basics");
      expect(system.currentStep()).not.toBeNull();

      system.stop();
      expect(system.currentStep()).toBeNull();
    });
  });

  describe("startNext", () => {
    it("should start the first lesson when none completed", async () => {
      const started = await system.startNext();
      expect(started).toBe(true);
      expect(system.currentStep()).not.toBeNull();
    });

    it("should start next recommended lesson", async () => {
      // Complete basics
      await system.start("basics");
      let step = system.currentStep();
      while (step) {
        step = await system.completeStep(step.id);
      }

      // Start next should get tools or modes
      const started = await system.startNext();
      expect(started).toBe(true);
    });
  });

  describe("resume", () => {
    it("should resume method should not throw for started lesson", async () => {
      // Create fresh system to avoid state pollution
      const freshStorage = new MemoryTutorialStorage();
      const freshSystem = createTutorialSystem(freshStorage);
      await freshSystem.initialize();

      // Start basics
      await freshSystem.start("basics");
      freshSystem.stop();

      // Resume should not throw
      await expect(freshSystem.resume("basics")).resolves.not.toThrow();
    });
  });
});

// =============================================================================
// T004: Progress Tracker Tests
// =============================================================================

describe("ProgressTracker", () => {
  let storage: MemoryTutorialStorage;
  let tracker: ReturnType<typeof createProgressTracker>;

  beforeEach(async () => {
    // Create fresh storage for each test
    storage = new MemoryTutorialStorage();
    tracker = createProgressTracker(storage, ALL_LESSONS);
    await tracker.loadProgress();
  });

  describe("startLesson", () => {
    it("should mark lesson as started", async () => {
      const progress = await tracker.startLesson("basics");
      expect(progress.started).toBe(true);
      expect(progress.startedAt).toBeDefined();
    });

    it("should not reset progress if already started", async () => {
      const first = await tracker.startLesson("basics");
      const second = await tracker.startLesson("basics");
      expect(first.startedAt).toBe(second.startedAt);
    });
  });

  describe("completeStep", () => {
    it("should add step to completed list", async () => {
      // Use fresh tracker
      const freshStorage = new MemoryTutorialStorage();
      const freshTracker = createProgressTracker(freshStorage, ALL_LESSONS);
      await freshTracker.loadProgress();

      await freshTracker.startLesson("basics");
      await freshTracker.completeStep("basics", "basics-welcome", 0);

      const progress = await freshTracker.getLessonProgress("basics");
      expect(progress?.completedSteps).toContain("basics-welcome");
    });

    it("should increment step index after completing step", async () => {
      // Use fresh tracker
      const freshStorage = new MemoryTutorialStorage();
      const freshTracker = createProgressTracker(freshStorage, ALL_LESSONS);
      await freshTracker.loadProgress();

      await freshTracker.startLesson("basics");
      await freshTracker.completeStep("basics", "basics-welcome", 0);

      const progress = await freshTracker.getLessonProgress("basics");
      // After completing one step, index should be > 0
      expect(progress?.currentStepIndex).toBeGreaterThan(0);
    });
  });

  describe("completeLesson", () => {
    it("should mark lesson as completed", async () => {
      await tracker.startLesson("basics");
      await tracker.completeLesson("basics");

      const progress = await tracker.getLessonProgress("basics");
      expect(progress?.completed).toBe(true);
      expect(progress?.completedAt).toBeDefined();
    });
  });

  describe("getStats", () => {
    it("should return correct stats structure", async () => {
      const stats = await tracker.getStats();
      expect(stats.totalLessons).toBe(ALL_LESSONS.length);
      expect(typeof stats.completedLessons).toBe("number");
      expect(typeof stats.completionPercent).toBe("number");
    });

    it("should update stats after completion", async () => {
      await tracker.startLesson("basics");
      await tracker.completeLesson("basics");

      const stats = await tracker.getStats();
      expect(stats.completedLessons).toBeGreaterThanOrEqual(1);
      expect(stats.completionPercent).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// T005: Tip Engine Tests
// =============================================================================

describe("TipEngine", () => {
  let engine: TipEngine;

  beforeEach(() => {
    engine = createTipEngine();
  });

  describe("constructor", () => {
    it("should register builtin tips", () => {
      const tips = engine.getAllTips();
      expect(tips.length).toBeGreaterThanOrEqual(BUILTIN_TIPS.length);
    });
  });

  describe("registerTip", () => {
    it("should add custom tip", () => {
      const customTip = {
        id: "custom-tip",
        title: "Custom",
        content: "Custom tip content",
        category: "shortcuts" as const,
        trigger: { maxShows: 1 },
        priority: 5,
        dismissable: true,
      };

      engine.registerTip(customTip);
      const tips = engine.getAllTips();
      expect(tips.find((t) => t.id === "custom-tip")).toBeDefined();
    });
  });

  describe("unregisterTip", () => {
    it("should remove tip", () => {
      engine.unregisterTip("tip-shortcuts-help");
      const tips = engine.getAllTips();
      expect(tips.find((t) => t.id === "tip-shortcuts-help")).toBeUndefined();
    });
  });

  describe("getTip", () => {
    it("should return null when no tips match context", () => {
      // Reset all tips first
      engine = new TipEngine();
      for (const tip of BUILTIN_TIPS) {
        engine.unregisterTip(tip.id);
      }

      const tip = engine.getTip({ screen: "nonexistent" });
      expect(tip).toBeNull();
    });

    it("should return highest priority matching tip", () => {
      const context: TipContext = { screen: "main" };
      const tip = engine.getTip(context);

      if (tip) {
        // Should be one of the tips triggered by main screen
        const matchingTips = BUILTIN_TIPS.filter((t) => t.trigger.screens?.includes("main"));
        expect(matchingTips.some((t) => t.id === tip.id)).toBe(true);
      }
    });

    it("should respect maxShows limit", () => {
      const context: TipContext = { screen: "main" };

      // Show tip max times
      const tip = engine.getTip(context);
      if (tip?.trigger.maxShows) {
        for (let i = 1; i < tip.trigger.maxShows; i++) {
          engine.getTip(context);
        }

        // Should not return same tip after max shows
        const allMatching = engine.getMatchingTips(context);
        expect(allMatching.find((t) => t.id === tip.id)).toBeUndefined();
      }
    });
  });

  describe("dismissTip", () => {
    it("should prevent tip from showing again", () => {
      const context: TipContext = { screen: "main" };
      const tip = engine.getTip(context);

      if (tip) {
        engine.dismissTip(tip.id);
        expect(engine.isTipDismissed(tip.id)).toBe(true);

        const matchingAfter = engine.getMatchingTips(context);
        expect(matchingAfter.find((t) => t.id === tip.id)).toBeUndefined();
      }
    });
  });

  describe("getTipsByCategory", () => {
    it("should return tips filtered by category", () => {
      const shortcuts = engine.getTipsByCategory("shortcuts");
      expect(shortcuts.length).toBeGreaterThan(0);
      expect(shortcuts.every((t) => t.category === "shortcuts")).toBe(true);
    });
  });

  describe("resetAllStates", () => {
    it("should clear all tip states", () => {
      const context: TipContext = { screen: "main" };
      const tip = engine.getTip(context);

      if (tip) {
        engine.dismissTip(tip.id);
        expect(engine.isTipDismissed(tip.id)).toBe(true);

        engine.resetAllStates();
        expect(engine.isTipDismissed(tip.id)).toBe(false);
      }
    });
  });

  describe("exportStates/importStates", () => {
    it("should serialize and restore states", () => {
      const context: TipContext = { screen: "main" };
      engine.getTip(context);

      const exported = engine.exportStates();
      expect(Object.keys(exported).length).toBeGreaterThan(0);

      // Create new engine and import
      const newEngine = new TipEngine();
      newEngine.importStates(exported);

      const importedStates = newEngine.exportStates();
      expect(importedStates).toEqual(exported);
    });
  });
});

// =============================================================================
// T006: Storage Tests
// =============================================================================

describe("MemoryTutorialStorage", () => {
  let storage: MemoryTutorialStorage;

  beforeEach(() => {
    storage = new MemoryTutorialStorage();
  });

  describe("loadProgress", () => {
    it("should return initial progress", async () => {
      const progress = await storage.loadProgress();
      expect(progress.lessonsCompleted).toBe(0);
      expect(progress.stepsCompleted).toBe(0);
    });
  });

  describe("saveProgress", () => {
    it("should persist progress", async () => {
      const newProgress: TutorialProgress = {
        ...INITIAL_TUTORIAL_PROGRESS,
        lessonsCompleted: 1,
        stepsCompleted: 5,
      };

      await storage.saveProgress(newProgress);
      const loaded = await storage.loadProgress();

      expect(loaded.lessonsCompleted).toBe(1);
      expect(loaded.stepsCompleted).toBe(5);
    });
  });

  describe("resetProgress", () => {
    it("should reset to initial state", async () => {
      await storage.saveProgress({
        ...INITIAL_TUTORIAL_PROGRESS,
        lessonsCompleted: 3,
      });

      await storage.resetProgress();
      const progress = await storage.loadProgress();

      expect(progress.lessonsCompleted).toBe(0);
    });
  });

  describe("getLessonProgress", () => {
    it("should return undefined for unknown lesson", async () => {
      const progress = await storage.getLessonProgress("unknown");
      expect(progress).toBeUndefined();
    });

    it("should return lesson progress after update", async () => {
      await storage.updateLessonProgress("basics", {
        started: true,
        currentStepIndex: 2,
      });

      const progress = await storage.getLessonProgress("basics");
      expect(progress?.started).toBe(true);
      expect(progress?.currentStepIndex).toBe(2);
    });
  });

  describe("updateLessonProgress", () => {
    it("should create new lesson progress", async () => {
      await storage.updateLessonProgress("basics", {
        started: true,
      });

      const progress = await storage.getLessonProgress("basics");
      expect(progress?.started).toBe(true);
      expect(progress?.lessonId).toBe("basics");
    });

    it("should update existing lesson progress", async () => {
      await storage.updateLessonProgress("basics", { started: true });
      await storage.updateLessonProgress("basics", { currentStepIndex: 3 });

      const progress = await storage.getLessonProgress("basics");
      expect(progress?.started).toBe(true);
      expect(progress?.currentStepIndex).toBe(3);
    });

    it("should update lastActivityAt and lastActiveLessonId", async () => {
      await storage.updateLessonProgress("basics", { started: true });

      const overall = await storage.loadProgress();
      expect(overall.lastActiveLessonId).toBe("basics");
      expect(overall.lastActivityAt).toBeDefined();
    });
  });
});

// =============================================================================
// T007: Helper Function Tests
// =============================================================================

describe("Helper Functions", () => {
  describe("getNextLesson", () => {
    it("should return basics when no lessons completed", () => {
      const next = getNextLesson([]);
      expect(next?.id).toBe("basics");
    });

    it("should return tools or modes after basics", () => {
      const next = getNextLesson(["basics"]);
      expect(["tools", "modes"]).toContain(next?.id);
    });

    it("should return undefined when all completed", () => {
      const allIds = ALL_LESSONS.map((l) => l.id);
      const next = getNextLesson(allIds);
      expect(next).toBeUndefined();
    });
  });

  describe("getRecommendedOrder", () => {
    it("should start with basics", () => {
      const order = getRecommendedOrder();
      expect(order[0]?.id).toBe("basics");
    });

    it("should include all lessons", () => {
      const order = getRecommendedOrder();
      expect(order.length).toBe(ALL_LESSONS.length);
    });
  });

  describe("getTotalDuration", () => {
    it("should sum all lesson durations", () => {
      const total = getTotalDuration();
      const expected = ALL_LESSONS.reduce((sum, l) => sum + l.estimatedMinutes, 0);
      expect(total).toBe(expected);
    });
  });

  describe("getTotalStepCount", () => {
    it("should sum all lesson steps", () => {
      const total = getTotalStepCount();
      const expected = ALL_LESSONS.reduce((sum, l) => sum + l.steps.length, 0);
      expect(total).toBe(expected);
    });
  });
});

// =============================================================================
// T008: Initial Constants Tests
// =============================================================================

describe("Initial Constants", () => {
  describe("default lesson progress", () => {
    it("should have correct default values for new lessons", async () => {
      const storage = new MemoryTutorialStorage();
      // New storage should return undefined for unknown lesson
      const progress = await storage.getLessonProgress("unknown");
      expect(progress).toBeUndefined();
    });
  });

  describe("storage initialization", () => {
    it("should return fresh progress with zero counts", async () => {
      const storage = new MemoryTutorialStorage();
      const progress = await storage.loadProgress();
      expect(progress.lessonsCompleted).toBe(0);
      expect(progress.stepsCompleted).toBe(0);
    });

    it("should have undefined timestamps on fresh storage", async () => {
      const storage = new MemoryTutorialStorage();
      const progress = await storage.loadProgress();
      expect(progress.startedAt).toBeUndefined();
      expect(progress.lastActivityAt).toBeUndefined();
    });
  });
});
