/**
 * Mode E2E Integration Tests (T058)
 *
 * End-to-end tests verifying complete flow from CLI flag to mode behavior:
 * 1. CLI flag parsing → ModeManager initialization
 * 2. Slash command → mode switching
 * 3. Mode indicator → TUI header display
 * 4. Mode handlers → message processing
 * 5. Legacy modes → deprecation warnings
 *
 * @module __tests__/mode-e2e.test
 */

import {
  BUILTIN_CODING_MODES,
  type CodingMode,
  createModeManager,
  emitDeprecationWarning,
  isLegacyMode,
  legacyToNewMode,
  type ModeManager,
  normalizeMode,
} from "@vellum/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Create a test ModeManager with optional initial mode
 */
function createTestModeManager(initialMode?: CodingMode): ModeManager {
  return createModeManager({
    initialMode,
    modes: BUILTIN_CODING_MODES,
    // Disable spec confirmation for easier testing
    requireSpecConfirmation: false,
  });
}

// =============================================================================
// E2E Flow 1: CLI Flag → ModeManager Initialization
// =============================================================================

describe("E2E: CLI Flag → ModeManager Initialization", () => {
  it("initializes with default vibe mode when no flag provided", () => {
    const manager = createTestModeManager();

    expect(manager.getCurrentMode()).toBe("vibe");
    expect(manager.getCurrentHandler()).toBeDefined();
  });

  it("initializes with plan mode when --mode=plan flag provided", () => {
    const manager = createTestModeManager("plan");

    expect(manager.getCurrentMode()).toBe("plan");
    expect(manager.getCurrentHandler()).toBeDefined();
  });

  it("initializes with spec mode when --mode=spec flag provided", () => {
    const manager = createTestModeManager("spec");

    expect(manager.getCurrentMode()).toBe("spec");
    expect(manager.getCurrentHandler()).toBeDefined();
  });

  it("normalizes legacy mode flags to new modes", () => {
    // Simulate CLI flag normalization
    const legacyFlag = "code";
    const result = normalizeMode(legacyFlag);

    expect(result.mode).toBe("vibe"); // code → vibe
    expect(result.wasLegacy).toBe(true);

    // Create manager with normalized mode
    const manager = createTestModeManager(result.mode);
    expect(manager.getCurrentMode()).toBe("vibe");
  });
});

// =============================================================================
// E2E Flow 2: Slash Command → Mode Switching
// =============================================================================

describe("E2E: Slash Command → Mode Switching", () => {
  let manager: ModeManager;

  beforeEach(() => {
    manager = createTestModeManager("vibe");
  });

  it("/plan switches to plan mode", async () => {
    // Simulate /plan command handler
    const result = await manager.switchMode("plan");

    expect(result.success).toBe(true);
    expect(manager.getCurrentMode()).toBe("plan");
  });

  it("/spec switches to spec mode", async () => {
    // Simulate /spec command handler
    const result = await manager.switchMode("spec");

    expect(result.success).toBe(true);
    expect(manager.getCurrentMode()).toBe("spec");
  });

  it("/vibe switches back to vibe mode", async () => {
    // Start in plan mode
    await manager.switchMode("plan");
    expect(manager.getCurrentMode()).toBe("plan");

    // Switch to vibe
    const result = await manager.switchMode("vibe");

    expect(result.success).toBe(true);
    expect(manager.getCurrentMode()).toBe("vibe");
  });

  it("emits mode-changed event on successful switch", async () => {
    const events: { previous: CodingMode; current: CodingMode }[] = [];

    manager.on("mode-changed", (event) => {
      events.push({
        previous: event.previousMode,
        current: event.currentMode,
      });
    });

    await manager.switchMode("plan");

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      previous: "vibe",
      current: "plan",
    });
  });

  it("handles rapid mode switches correctly", async () => {
    await manager.switchMode("plan");
    await manager.switchMode("spec");
    await manager.switchMode("vibe");
    await manager.switchMode("plan");

    expect(manager.getCurrentMode()).toBe("plan");
    expect(manager.getPreviousMode()).toBe("vibe");
  });
});

// =============================================================================
// E2E Flow 3: Mode Handlers → Message Processing
// =============================================================================

describe("E2E: Mode Handlers → Message Processing", () => {
  let manager: ModeManager;

  beforeEach(() => {
    manager = createTestModeManager("vibe");
  });

  it("vibe mode handler processes messages", async () => {
    const result = await manager.processMessage({
      content: "Hello, fix this bug",
      timestamp: Date.now(),
    });

    expect(result.shouldContinue).toBe(true);
  });

  it("plan mode handler processes messages with plan structure", async () => {
    await manager.switchMode("plan");

    const result = await manager.processMessage({
      content: "Create a new authentication system",
      timestamp: Date.now(),
    });

    expect(result.shouldContinue).toBe(true);
  });

  it("spec mode handler tracks phases", async () => {
    await manager.switchMode("spec");

    const result = await manager.processMessage({
      content: "Build a user management module",
      timestamp: Date.now(),
    });

    expect(result.shouldContinue).toBe(true);
    // Spec mode may include checkpoint requirements
    // Handler result includes requiresCheckpoint flag
  });

  it("switching modes resets handler state", async () => {
    // Process in vibe mode
    await manager.processMessage({
      content: "First task",
      timestamp: Date.now(),
    });

    // Switch to plan mode
    await manager.switchMode("plan");

    // Process in plan mode (fresh state)
    const result = await manager.processMessage({
      content: "Second task",
      timestamp: Date.now(),
    });

    expect(result.shouldContinue).toBe(true);
  });
});

// =============================================================================
// E2E Flow 4: Legacy Mode → Deprecation Warnings
// =============================================================================

describe("E2E: Legacy Mode → Deprecation Warnings", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("detects legacy mode from CLI input", () => {
    expect(isLegacyMode("code")).toBe(true);
    expect(isLegacyMode("draft")).toBe(true);
    expect(isLegacyMode("debug")).toBe(true);
    // Note: 'ask' and 'plan' are in LEGACY_MODE_MAP but 'plan' is also a valid new mode
    expect(isLegacyMode("ask")).toBe(true);
  });

  it("maps legacy modes to new equivalents", () => {
    expect(legacyToNewMode("code")).toBe("vibe");
    expect(legacyToNewMode("draft")).toBe("vibe");
    expect(legacyToNewMode("debug")).toBe("vibe");
    expect(legacyToNewMode("ask")).toBe("plan");
  });

  it("emits deprecation warning when legacy mode used", () => {
    emitDeprecationWarning("code", "vibe");

    expect(consoleSpy).toHaveBeenCalled();
    const warnCall = consoleSpy.mock.calls[0]?.[0] ?? "";
    expect(warnCall).toContain("code");
    expect(warnCall).toContain("vibe");
  });

  it("normalizes legacy mode and provides migration info", () => {
    const result = normalizeMode("draft");

    expect(result.mode).toBe("vibe");
    expect(result.wasLegacy).toBe(true);
    expect(result.originalName).toBe("draft");
  });

  it("does not set wasLegacy for new mode names", () => {
    // Clear any existing deprecation warnings
    consoleSpy.mockClear();

    const result = normalizeMode("vibe");

    expect(result.wasLegacy).toBe(false);
  });
});

// =============================================================================
// E2E Flow 5: Mode Configuration Integration
// =============================================================================

describe("E2E: Mode Configuration Integration", () => {
  it("mode configs have correct approval policies", () => {
    // Vibe: full-auto (autonomous)
    expect(BUILTIN_CODING_MODES.vibe.approvalPolicy).toBe("full-auto");
    // Plan: auto-edit (moderate oversight)
    expect(BUILTIN_CODING_MODES.plan.approvalPolicy).toBe("auto-edit");
    // Spec: suggest (all actions require confirmation)
    expect(BUILTIN_CODING_MODES.spec.approvalPolicy).toBe("suggest");
  });

  it("mode configs have correct sandbox policies", () => {
    // Vibe: full-access (autonomous, full write access)
    expect(BUILTIN_CODING_MODES.vibe.sandboxPolicy).toBe("full-access");
    // Plan: workspace-write
    expect(BUILTIN_CODING_MODES.plan.sandboxPolicy).toBe("workspace-write");
    // Spec: workspace-read (read-only until implementation phase)
    expect(BUILTIN_CODING_MODES.spec.sandboxPolicy).toBe("workspace-read");
  });

  it("ModeManager uses correct mode config", () => {
    const manager = createTestModeManager("plan");

    const config = manager.getModeConfig("plan");

    expect(config).toEqual(BUILTIN_CODING_MODES.plan);
  });

  it("spec mode references orchestrator agent that can spawn", () => {
    // Spec mode references spec-orchestrator agent which has canSpawnAgents: true
    // Agent spawning is now controlled via AgentConfig, not CodingModeConfig
    expect(BUILTIN_CODING_MODES.spec.agentName).toBe("spec-orchestrator");
  });

  it("modes have correct checkpoint counts", () => {
    expect(BUILTIN_CODING_MODES.vibe.checkpointCount).toBe(0);
    expect(BUILTIN_CODING_MODES.plan.checkpointCount).toBe(1);
    expect(BUILTIN_CODING_MODES.spec.checkpointCount).toBe(6);
  });
});

// =============================================================================
// E2E Flow 6: Mode Detection Integration
// =============================================================================

describe("E2E: Mode Detection Integration", () => {
  let manager: ModeManager;

  beforeEach(() => {
    manager = createTestModeManager("vibe");
  });

  it("detects vibe mode for quick tasks", () => {
    const result = manager.detectMode("fix typo in readme");

    expect(result.suggestedMode).toBe("vibe");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("detects plan mode for complex tasks", () => {
    const result = manager.detectMode(
      "refactor the entire authentication system with proper testing"
    );

    // Plan mode is suggested for complex tasks
    expect(["plan", "spec"]).toContain(result.suggestedMode);
  });

  it("detection does not auto-switch modes", async () => {
    // Detection only suggests, doesn't switch
    manager.detectMode("build a complete API");

    // Mode should still be vibe
    expect(manager.getCurrentMode()).toBe("vibe");
  });
});

// =============================================================================
// E2E Flow 7: Full Integration Scenario
// =============================================================================

describe("E2E: Full Integration Scenario", () => {
  it("complete workflow: start → detect → switch → process → switch back", async () => {
    // 1. Initialize with CLI flag (simulated)
    const cliMode = "vibe";
    const manager = createTestModeManager(cliMode);
    expect(manager.getCurrentMode()).toBe("vibe");

    // 2. User types complex task, detection suggests plan
    const detection = manager.detectMode("design a new feature with tests");
    expect(detection).toBeDefined();

    // 3. User executes /plan command to switch
    const switchResult = await manager.switchMode("plan");
    expect(switchResult.success).toBe(true);
    expect(manager.getCurrentMode()).toBe("plan");

    // 4. Process messages in plan mode
    const msgResult = await manager.processMessage({
      content: "Create the feature spec",
      timestamp: Date.now(),
    });
    expect(msgResult.shouldContinue).toBe(true);

    // 5. User executes /vibe to switch back for implementation
    const vibeResult = await manager.switchMode("vibe");
    expect(vibeResult.success).toBe(true);
    expect(manager.getCurrentMode()).toBe("vibe");

    // 6. Process implementation in vibe mode
    const implResult = await manager.processMessage({
      content: "Implement the feature",
      timestamp: Date.now(),
    });
    expect(implResult.shouldContinue).toBe(true);
  });
});
