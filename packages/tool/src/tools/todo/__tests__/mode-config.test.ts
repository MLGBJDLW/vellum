import { describe, expect, it } from "vitest";
import { getTodoConfig, MODE_TODO_CONFIGS } from "../mode-config.js";

describe("getTodoConfig", () => {
  it("returns vibe config for 'vibe' mode", () => {
    const config = getTodoConfig("vibe");
    expect(config.autoCreate).toBe(false);
    expect(config.checkpointOnComplete).toBe(false);
    expect(config.requireValidation).toBe(false);
    expect(config.confirmDestructive).toBe(false);
  });

  it("returns plan config for 'plan' mode", () => {
    const config = getTodoConfig("plan");
    expect(config.autoCreate).toBe(true);
    expect(config.checkpointOnComplete).toBe(true);
    expect(config.requireValidation).toBe(false);
    expect(config.confirmDestructive).toBe(true);
  });

  it("returns spec config for 'spec' mode", () => {
    const config = getTodoConfig("spec");
    expect(config.autoCreate).toBe(true);
    expect(config.checkpointOnComplete).toBe(true);
    expect(config.requireValidation).toBe(true);
    expect(config.confirmDestructive).toBe(true);
  });

  it("falls back to vibe for unknown mode", () => {
    const config = getTodoConfig("unknown");
    expect(config).toEqual(MODE_TODO_CONFIGS.vibe);
  });

  it("falls back to vibe for empty string", () => {
    const config = getTodoConfig("");
    expect(config).toEqual(MODE_TODO_CONFIGS.vibe);
  });
});

describe("MODE_TODO_CONFIGS", () => {
  it("contains exactly 3 mode configurations", () => {
    expect(Object.keys(MODE_TODO_CONFIGS)).toHaveLength(3);
    expect(Object.keys(MODE_TODO_CONFIGS)).toEqual(["vibe", "plan", "spec"]);
  });

  it("vibe mode has all confirmations disabled", () => {
    // biome-ignore lint/style/noNonNullAssertion: Test verifies existence in prior test
    const vibe = MODE_TODO_CONFIGS.vibe!;
    expect(vibe.autoCreate).toBe(false);
    expect(vibe.checkpointOnComplete).toBe(false);
    expect(vibe.requireValidation).toBe(false);
    expect(vibe.confirmDestructive).toBe(false);
  });

  it("plan mode enables autoCreate and checkpointOnComplete", () => {
    // biome-ignore lint/style/noNonNullAssertion: Test verifies existence in prior test
    const plan = MODE_TODO_CONFIGS.plan!;
    expect(plan.autoCreate).toBe(true);
    expect(plan.checkpointOnComplete).toBe(true);
    expect(plan.requireValidation).toBe(false);
    expect(plan.confirmDestructive).toBe(true);
  });

  it("spec mode enables all validations", () => {
    // biome-ignore lint/style/noNonNullAssertion: Test verifies existence in prior test
    const spec = MODE_TODO_CONFIGS.spec!;
    expect(spec.autoCreate).toBe(true);
    expect(spec.checkpointOnComplete).toBe(true);
    expect(spec.requireValidation).toBe(true);
    expect(spec.confirmDestructive).toBe(true);
  });
});
