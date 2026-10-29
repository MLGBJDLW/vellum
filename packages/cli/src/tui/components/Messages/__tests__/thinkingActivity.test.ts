import stringWidth from "string-width";
import { describe, expect, it } from "vitest";
import { getThinkingActivity } from "../thinkingActivity.js";

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

  it("derives a conservative label from complete activity phrases and avoids raw partial tokens", () => {
    expect(getThinkingActivity("I am checking the parser output.\npartialvariable_xyz", true)).toBe(
      "Checking the approach"
    );
    expect(getThinkingActivity("I need to test this assumption.\n", true)).toBe(
      "Planning next steps"
    );
    expect(getThinkingActivity("正在分析请求。\n", true)).toBe("分析问题");
    expect(getThinkingActivity("arbitrary_partial_reasoning_token", true)).toBe(
      "Working through the request"
    );
    expect(getThinkingActivity("Unstructured completed prose.", false)).toBe("Reasoning complete");
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
