/**
 * Integration Tests for Onboarding Wizard
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { shouldRunOnboarding } from "../../onboarding/wizard.js";

function getVellumDir(baseDir: string): string {
  return path.join(baseDir, ".vellum");
}

function writeOnboardingState(baseDir: string, completed: boolean): void {
  const vellumDir = getVellumDir(baseDir);
  fs.mkdirSync(vellumDir, { recursive: true });
  fs.writeFileSync(
    path.join(vellumDir, "onboarding.json"),
    JSON.stringify({ currentStep: "welcome", completed }, null, 2)
  );
}

function writeConfig(baseDir: string): void {
  const vellumDir = getVellumDir(baseDir);
  fs.mkdirSync(vellumDir, { recursive: true });
  fs.writeFileSync(path.join(vellumDir, "config.toml"), "# test config\n");
}

describe("Onboarding Wizard integration", () => {
  let tempDir: string;
  let homedirSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vellum-onboarding-"));
    homedirSpy = vi.spyOn(os, "homedir").mockReturnValue(tempDir);
  });

  afterEach(() => {
    homedirSpy.mockRestore();
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("returns true when no Vellum directory exists", async () => {
    const result = await shouldRunOnboarding();
    expect(result).toBe(true);
  });

  it("returns true when completed but config is missing", async () => {
    writeOnboardingState(tempDir, true);

    const result = await shouldRunOnboarding();
    expect(result).toBe(true);
  });

  it("returns false when completed and config exists", async () => {
    writeOnboardingState(tempDir, true);
    writeConfig(tempDir);

    const result = await shouldRunOnboarding();
    expect(result).toBe(false);
  });

  it("returns true when onboarding is incomplete even with config", async () => {
    writeOnboardingState(tempDir, false);
    writeConfig(tempDir);

    const result = await shouldRunOnboarding();
    expect(result).toBe(true);
  });
});
