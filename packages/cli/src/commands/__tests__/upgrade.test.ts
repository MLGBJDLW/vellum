import { performUpdate, VersionChecker } from "@vellum/core";
import { expect, it, vi } from "vitest";
import type { CommandContext } from "../types.js";
import { createUpgradeCommand } from "../update.js";

vi.mock("@vellum/core", async (load) => ({
  ...(await load<typeof import("@vellum/core")>()),
  performUpdate: vi.fn(),
}));

it("checks on demand, installs exactly the confirmed version once and requests a restart", async () => {
  const onStatus = vi.fn();
  const check = vi.spyOn(VersionChecker.prototype, "check").mockResolvedValue({
    success: true,
    checkedAt: new Date(),
    fromCache: false,
    updateInfo: {
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
      hasUpdate: true,
      channel: "stable",
    },
  });
  vi.mocked(performUpdate).mockResolvedValue({
    success: true,
    previousVersion: "1.0.0",
    requiresRestart: true,
  });
  try {
    const command = createUpgradeCommand("1.0.0", onStatus);
    const ctx = {} as CommandContext;
    const start = await command.execute(ctx);
    if (start.kind !== "pending") throw new Error("Expected update check");
    const prompt = await start.operation.promise;
    if (prompt.kind !== "interactive") throw new Error("Expected confirmation");
    await prompt.prompt.handler("Cancel");
    expect(performUpdate).not.toHaveBeenCalled();
    const update = await prompt.prompt.handler("Update");
    if (update.kind !== "pending") throw new Error("Expected installation");
    expect((await update.operation.promise).kind).toBe("success");
    await command.execute(ctx);
    expect(check).toHaveBeenCalledExactlyOnceWith("1.0.0", true);
    expect(performUpdate).toHaveBeenCalledExactlyOnceWith("1.0.0", {
      targetVersion: "1.1.0",
      global: true,
    });
    expect(onStatus).toHaveBeenLastCalledWith({ kind: "installed", version: "1.1.0" });
  } finally {
    check.mockRestore();
  }
});
