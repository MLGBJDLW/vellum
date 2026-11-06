import stringWidth from "string-width";
import { describe, expect, it } from "vitest";
import { createThinkingActivityTracker, getThinkingActivity } from "../thinkingActivity.js";

describe("getThinkingActivity", () => {
  it("uses the latest complete heading, not a partial streaming title", () => {
    const content =
      "# Inspecting the parser\nBody text\n**Checking the fix**\nMore detail\n## New par";
    expect(getThinkingActivity(content, true)).toBe("Checking the fix");
    expect(getThinkingActivity(`${content}ser behavior\n`, true)).toBe("New parser behavior");
  });

  it("accepts a bold closing delimiter without waiting for the next token", () => {
    expect(getThinkingActivity("**Checking results**", true)).toBe("Checking results");
    expect(getThinkingActivity("__Checking results__", true)).toBe("Checking results");
    expect(getThinkingActivity("**Checking res", true)).toBe("Working through the request");
  });

  it("ignores headings and activities inside code fences", () => {
    expect(
      getThinkingActivity(
        "**Reviewing source**\n```md\n# Fake heading\nChecking fake code\n```\n",
        true
      )
    ).toBe("Reviewing source");
    expect(getThinkingActivity("```md\n# Fake heading\n```\n", true)).toBe(
      "Working through the request"
    );
  });

  it("preserves concrete actions from complete phrases and avoids raw partial tokens", () => {
    expect(getThinkingActivity("I am checking the parser output.\npartialvariable_xyz", true)).toBe(
      "Checking the parser output"
    );
    expect(getThinkingActivity("I need to test this assumption.\n", true)).toBe(
      "Test this assumption"
    );
    expect(getThinkingActivity("正在分析请求。\n", true)).toBe("正在分析请求");
    expect(getThinkingActivity("arbitrary_partial_reasoning_token", true)).toBe(
      "Working through the request"
    );
    expect(getThinkingActivity("Unstructured completed prose.", false)).toBe("Reasoning complete");
  });

  it("updates plain prose intents before a newline and keeps the last complete action", () => {
    const track = createThinkingActivityTracker();
    const first = "I will inspect the parser. ";
    expect(track(first, true)).toBe("Inspect the parser");
    expect(track(`${first}Next: Run the focused`, true)).toBe("Inspect the parser");
    expect(track(`${first}Next: Run the focused tests.`, true)).toBe("Run the focused tests");
    expect(track("接下来检查模型目录。然后继续。", true)).toBe("接下来检查模型目录");
  });

  it("keeps filenames and inline code intact in completed intents", () => {
    expect(getThinkingActivity("I will inspect package.json. Next: Test `parser.ts`. ", true)).toBe(
      "Test parser.ts"
    );
    expect(getThinkingActivity("I will inspect package.json.", true)).toBe("Inspect package.json");
  });

  it("tracks fences across chunks and resets when a block is replaced", () => {
    const track = createThinkingActivityTracker();
    let content = "**Inspecting code**\n```ts\n";
    expect(track(content, true)).toBe("Inspecting code");
    content += "I will fake a task.\n".repeat(1000);
    expect(track(content, true)).toBe("Inspecting code");
    content += "```\nI will verify the result. ";
    expect(track(content, true)).toBe("Verify the result");
    expect(track("**A new message**", false)).toBe("A new message");
  });

  it("keeps long streamed lines bounded without discarding their latest complete action", () => {
    const track = createThinkingActivityTracker();
    let content = "**Inspecting code**\n";
    track(content, true);
    content += "ordinary detail ".repeat(2000);
    expect(track(content, true)).toBe("Inspecting code");
    content += ". I will check the final output. ";
    expect(track(content, true)).toBe("Check the final output");
  });

  it("fits CJK and emoji in terminal cells without splitting a grapheme", () => {
    const title = "检查👩🏽‍💻代码与测试";
    for (let width = 0; width <= 20; width++) {
      const result = getThinkingActivity(`**${title}**`, true, width);
      expect(stringWidth(result)).toBeLessThanOrEqual(width);
      expect(result).not.toMatch(/[\uD800-\uDBFF]$/u);
      if (result.includes("👩")) expect(result).toContain("👩🏽‍💻");
    }
  });

  it("removes terminal escapes and inline formatting from titles", () => {
    expect(getThinkingActivity("**Checking `parser` \u001b[31mresults\u001b[0m**", true)).toBe(
      "Checking parser results"
    );
  });
});
