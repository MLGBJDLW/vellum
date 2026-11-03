import { describe, expect, it } from "vitest";
import { getSupportedProviders } from "../models/index.js";
import { getUsageInputTokens, getUsageOutputTokens } from "../usage.js";

describe("provider token accounting", () => {
  it.each(getSupportedProviders())("counts cache and reasoning exactly once for %s", (provider) => {
    const usage = {
      inputTokens: 1000,
      outputTokens: 100,
      cacheReadTokens: 500,
      cacheWriteTokens: 200,
      thinkingTokens: 40,
    };
    expect(getUsageInputTokens(provider, usage)).toBe(provider === "anthropic" ? 1700 : 1000);
    expect(getUsageOutputTokens(provider, usage)).toBe(provider === "google" ? 140 : 100);
  });
});
