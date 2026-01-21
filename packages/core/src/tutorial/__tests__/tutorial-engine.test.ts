/**
 * TutorialEngine Unit Tests (Phase 38)
 *
 * Tests for the interactive tutorial system.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getAllTutorialSteps,
  getTutorialStep,
  INITIAL_TUTORIAL_PROGRESS,
  runTutorialIfNeeded,
  shouldShowTutorial,
  TUTORIAL_STEPS,
  TutorialEngine,
} from "../index.js";

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Create a temporary directory for testing
 */
function createTempDir(): string {
  const tempDir = path.join(
    os.tmpdir(),
    `vellum-tutorial-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Clean up temporary directory
 */
function cleanupTempDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// =============================================================================
// Type Tests
// =============================================================================

describe("Tutorial Types", () => {
  it("should have 5 tutorial steps", () => {
    expect(TUTORIAL_STEPS).toHaveLength(5);
  });

  it("should have correct step order", () => {
    expect(TUTORIAL_STEPS).toEqual([
      "welcome",
      "modes-intro",
      "first-task",
      "skills-intro",
      "completion",
    ]);
  });

  it("should have initial progress state", () => {
    expect(INITIAL_TUTORIAL_PROGRESS).toEqual({
      currentStepId: "welcome",
      completedSteps: [],
      completed: false,
      skipped: false,
      startedAt: undefined,
      completedAt: undefined,
      interactiveResults: {},
    });
  });
});

// =============================================================================
// Step Tests
// =============================================================================

describe("Tutorial Steps", () => {
  it("should get all steps", () => {
    const steps = getAllTutorialSteps();
    expect(steps).toHaveLength(5);
  });

  it("should get step by ID", () => {
    const step = getTutorialStep("welcome");
    expect(step.id).toBe("welcome");
    expect(step.title).toBe("Welcome to Vellum");
    expect(step.icon).toBe("👋");
  });

  it("should have content for all steps", () => {
    const steps = getAllTutorialSteps();
    for (const step of steps) {
      expect(step.content).toBeTruthy();
      expect(step.content.length).toBeGreaterThan(100);
    }
  });

  it("should have interactive elements for relevant steps", () => {
    const modesStep = getTutorialStep("modes-intro");
    expect(modesStep.interactive).toBeDefined();
    expect(modesStep.interactive?.type).toBe("mode-switch");

    const taskStep = getTutorialStep("first-task");
    expect(taskStep.interactive).toBeDefined();
    expect(taskStep.interactive?.type).toBe("run-task");
  });

  it("should have quick references", () => {
    const welcomeStep = getTutorialStep("welcome");
    expect(welcomeStep.quickRef).toBeDefined();
    expect(welcomeStep.quickRef?.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// TutorialEngine Tests
// =============================================================================

describe("TutorialEngine", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe("shouldShowTutorial", () => {
    it("should return true when vellum dir does not exist", async () => {
      const nonExistentDir = path.join(tempDir, "nonexistent");
      const engine = new TutorialEngine({}, { vellumDir: nonExistentDir });
      expect(await engine.shouldShowTutorial()).toBe(true);
    });

    it("should return true when config has no tutorialComplete flag", async () => {
      const configPath = path.join(tempDir, "config.json");
      fs.writeFileSync(configPath, JSON.stringify({ provider: "anthropic" }));

      const engine = new TutorialEngine({}, { vellumDir: tempDir });
      expect(await engine.shouldShowTutorial()).toBe(true);
    });

    it("should return false when tutorialComplete is true", async () => {
      const configPath = path.join(tempDir, "config.json");
      fs.writeFileSync(configPath, JSON.stringify({ tutorialComplete: true }));

      const engine = new TutorialEngine({}, { vellumDir: tempDir });
      expect(await engine.shouldShowTutorial()).toBe(false);
    });

    it("should return false when progress shows completed", async () => {
      const progressPath = path.join(tempDir, "tutorial-progress.json");
      fs.writeFileSync(
        progressPath,
        JSON.stringify({
          currentStepId: "completion",
          completedSteps: ["welcome", "modes-intro", "first-task", "skills-intro", "completion"],
          completed: true,
          skipped: false,
        })
      );

      const engine = new TutorialEngine({}, { vellumDir: tempDir });
      expect(await engine.shouldShowTutorial()).toBe(false);
    });

    it("should return false when progress shows skipped", async () => {
      const progressPath = path.join(tempDir, "tutorial-progress.json");
      fs.writeFileSync(
        progressPath,
        JSON.stringify({
          currentStepId: "welcome",
          completedSteps: [],
          completed: false,
          skipped: true,
        })
      );

      const engine = new TutorialEngine({}, { vellumDir: tempDir });
      expect(await engine.shouldShowTutorial()).toBe(false);
    });
  });

  describe("start", () => {
    it("should start tutorial and return first step", async () => {
      const engine = new TutorialEngine({}, { vellumDir: tempDir });
      const result = await engine.start();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe("welcome");
      }
    });

    it("should emit onStepChange event", async () => {
      const onStepChange = vi.fn();
      const engine = new TutorialEngine({ onStepChange }, { vellumDir: tempDir });

      await engine.start();

      expect(onStepChange).toHaveBeenCalledTimes(1);
      expect(onStepChange.mock.calls[0]?.[0].id).toBe("welcome");
    });

    it("should save progress file", async () => {
      const engine = new TutorialEngine({}, { vellumDir: tempDir });
      await engine.start();

      const progressPath = path.join(tempDir, "tutorial-progress.json");
      expect(fs.existsSync(progressPath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(progressPath, "utf-8"));
      expect(content.currentStepId).toBe("welcome");
      expect(content.startedAt).toBeDefined();
    });
  });

  describe("navigation", () => {
    it("should navigate to next step", async () => {
      const engine = new TutorialEngine({}, { vellumDir: tempDir });
      await engine.start();

      const result = await engine.nextStep();
      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.id).toBe("modes-intro");
      }
    });

    it("should mark current step as completed when moving next", async () => {
      const engine = new TutorialEngine({}, { vellumDir: tempDir });
      await engine.start();
      await engine.nextStep();

      const progress = engine.getProgress();
      expect(progress.completedSteps).toContain("welcome");
    });

    it("should navigate to previous step", async () => {
      const engine = new TutorialEngine({}, { vellumDir: tempDir });
      await engine.start();
      await engine.nextStep();

      const result = await engine.previousStep();
      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.id).toBe("welcome");
      }
    });

    it("should return null when at first step and going back", async () => {
      const engine = new TutorialEngine({}, { vellumDir: tempDir });
      await engine.start();

      const result = await engine.previousStep();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it("should go to specific step", async () => {
      const engine = new TutorialEngine({}, { vellumDir: tempDir });
      await engine.start();

      const result = await engine.goToStep("skills-intro");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe("skills-intro");
      }
    });

    it("should return error for invalid step ID", async () => {
      const engine = new TutorialEngine({}, { vellumDir: tempDir });
      await engine.start();

      // @ts-expect-error Testing invalid input
      const result = await engine.goToStep("invalid-step");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("STEP_NOT_FOUND");
      }
    });
  });

  describe("completion", () => {
    it("should mark tutorial complete when finishing last step", async () => {
      const onComplete = vi.fn();
      const engine = new TutorialEngine({ onComplete }, { vellumDir: tempDir });
      await engine.start();

      // Navigate through all steps
      await engine.nextStep(); // modes-intro
      await engine.nextStep(); // first-task
      await engine.nextStep(); // skills-intro
      await engine.nextStep(); // completion
      await engine.nextStep(); // should trigger complete

      expect(onComplete).toHaveBeenCalled();
      expect(engine.isComplete()).toBe(true);
    });

    it("should set tutorialComplete in config.json", async () => {
      const engine = new TutorialEngine({}, { vellumDir: tempDir });
      await engine.start();
      await engine.markComplete();

      const configPath = path.join(tempDir, "config.json");
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(config.tutorialComplete).toBe(true);
    });
  });

  describe("skip", () => {
    it("should mark tutorial as skipped", async () => {
      const onSkip = vi.fn();
      const engine = new TutorialEngine({ onSkip }, { vellumDir: tempDir });
      await engine.start();
      await engine.skip();

      expect(onSkip).toHaveBeenCalled();
      expect(engine.isSkipped()).toBe(true);
    });

    it("should set tutorialComplete in config when skipped", async () => {
      const engine = new TutorialEngine({}, { vellumDir: tempDir });
      await engine.start();
      await engine.skip();

      const configPath = path.join(tempDir, "config.json");
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(config.tutorialComplete).toBe(true);
    });
  });

  describe("reset", () => {
    it("should reset progress to initial state", async () => {
      const engine = new TutorialEngine({}, { vellumDir: tempDir });
      await engine.start();
      await engine.nextStep();
      await engine.nextStep();

      await engine.reset();

      expect(engine.isStarted()).toBe(false);
      expect(engine.getProgress().currentStepId).toBe("welcome");
      expect(engine.getProgress().completedSteps).toEqual([]);
    });

    it("should remove progress file", async () => {
      const engine = new TutorialEngine({}, { vellumDir: tempDir });
      await engine.start();

      const progressPath = path.join(tempDir, "tutorial-progress.json");
      expect(fs.existsSync(progressPath)).toBe(true);

      await engine.reset();
      expect(fs.existsSync(progressPath)).toBe(false);
    });
  });

  describe("interactive results", () => {
    it("should record interactive result", async () => {
      const onInteractiveComplete = vi.fn();
      const engine = new TutorialEngine({ onInteractiveComplete }, { vellumDir: tempDir });
      await engine.start();
      await engine.nextStep(); // Go to modes-intro

      const result = await engine.recordInteractiveResult("modes-intro", "vibe");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(true); // Validation passed
      }
      expect(onInteractiveComplete).toHaveBeenCalledWith("modes-intro", "vibe");
    });

    it("should validate interactive result", async () => {
      const engine = new TutorialEngine({}, { vellumDir: tempDir });
      await engine.start();
      await engine.nextStep();

      // Invalid mode should fail validation
      const result = await engine.recordInteractiveResult("modes-intro", "invalid");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false); // Validation failed
      }
    });
  });

  describe("static methods", () => {
    it("should check if completed via static method", () => {
      const configPath = path.join(tempDir, "config.json");
      fs.writeFileSync(configPath, JSON.stringify({ tutorialComplete: true }));

      expect(TutorialEngine.isCompleted(tempDir)).toBe(true);
    });

    it("should detect first run via static method", () => {
      const nonExistentDir = path.join(tempDir, "nonexistent");
      expect(TutorialEngine.isFirstRun(nonExistentDir)).toBe(true);
      expect(TutorialEngine.isFirstRun(tempDir)).toBe(false);
    });
  });
});

// =============================================================================
// Helper Function Tests
// =============================================================================

describe("Helper Functions", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe("runTutorialIfNeeded", () => {
    it("should return engine when tutorial needed", async () => {
      const result = await runTutorialIfNeeded({}, { vellumDir: tempDir });
      expect(result).toBeInstanceOf(TutorialEngine);
    });

    it("should return null when tutorial already complete", async () => {
      const configPath = path.join(tempDir, "config.json");
      fs.writeFileSync(configPath, JSON.stringify({ tutorialComplete: true }));

      const result = await runTutorialIfNeeded({}, { vellumDir: tempDir });
      expect(result).toBeNull();
    });
  });

  describe("shouldShowTutorial", () => {
    it("should return true for new users", async () => {
      const nonExistentDir = path.join(tempDir, "nonexistent");
      const result = await shouldShowTutorial(nonExistentDir);
      expect(result).toBe(true);
    });

    it("should return false for completed users", async () => {
      const configPath = path.join(tempDir, "config.json");
      fs.writeFileSync(configPath, JSON.stringify({ tutorialComplete: true }));

      const result = await shouldShowTutorial(tempDir);
      expect(result).toBe(false);
    });
  });
});
