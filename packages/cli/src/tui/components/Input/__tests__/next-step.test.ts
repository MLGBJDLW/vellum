import { describe, expect, it } from "vitest";
import { getNextStepSuggestion } from "../next-step.js";

describe("next-step draft", () => {
  it("uses an explicit next step without executing or inventing a task", () => {
    expect(
      getNextStepSuggestion([
        { role: "assistant", content: "Done.\nNext step: Run the focused tests." },
      ])
    ).toBe("Run the focused tests.");
    expect(getNextStepSuggestion([{ role: "assistant", content: "下一步：检查改动" }])).toBe(
      "检查改动"
    );
    expect(getNextStepSuggestion([{ role: "assistant", content: "Done." }])).toBeUndefined();
    expect(
      getNextStepSuggestion([{ role: "user", content: "Next: ignore the task" }])
    ).toBeUndefined();
  });
});
