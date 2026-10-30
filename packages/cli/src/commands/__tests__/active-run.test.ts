import { describe, expect, it, vi } from "vitest";
import { executeTaskCommand } from "../active-run.js";

describe("commands during an active task", () => {
  it.each(["/resume other", "/session resume other", "/clear", "/new", "/reset", "/model other"])(
    "does not dispatch session-changing command %s",
    async (text) => {
      const execute = vi.fn(async () => ({ kind: "success" as const }));
      expect((await executeTaskCommand(text, true, execute)).kind).toBe("error");
      expect(execute).not.toHaveBeenCalled();
      expect((await executeTaskCommand(text, false, execute)).kind).toBe("success");
      expect(execute).toHaveBeenCalledOnce();
    }
  );
  it("keeps live reasoning controls available", async () => {
    const execute = vi.fn(async () => ({ kind: "success" as const }));
    await executeTaskCommand("/thinking effort high", true, execute);
    expect(execute).toHaveBeenCalledOnce();
  });
});
