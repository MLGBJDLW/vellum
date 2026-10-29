/**
 * Cost Service Tests (Phase 35)
 *
 * @module @vellum/core/cost/__tests__
 */

import { MODEL_CATALOG, type ModelInfo } from "@vellum/provider";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateCost,
  calculateCostBreakdown,
  formatCost,
  formatTokenCount,
} from "../calculator.js";
import { getPricing, hasPricing, MODEL_PRICING } from "../pricing.js";
import { CostService, createCostService } from "../service.js";
import type { TokenUsage } from "../types.js";

// =============================================================================
// Calculator Tests
// =============================================================================

describe("calculateCostBreakdown", () => {
  it("calculates basic input/output cost for Claude 3.5 Sonnet", () => {
    const breakdown = calculateCostBreakdown({
      model: "claude-3-5-sonnet-20241022",
      provider: "anthropic",
      usage: {
        inputTokens: 1000,
        outputTokens: 500,
      },
    });

    // Input: 1000 tokens * $3.0/million = $0.003
    // Output: 500 tokens * $15.0/million = $0.0075
    expect(breakdown.input).toBeCloseTo(0.003, 6);
    expect(breakdown.output).toBeCloseTo(0.0075, 6);
    expect(breakdown.total).toBeCloseTo(0.0105, 6);
  });

  it("calculates cost with cache read tokens", () => {
    const breakdown = calculateCostBreakdown({
      model: "claude-3-5-sonnet-20241022",
      provider: "anthropic",
      usage: {
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 500,
      },
    });

    // Cache read: 500 tokens * $0.3/million = $0.00015
    expect(breakdown.cacheRead).toBeCloseTo(0.00015, 6);
    expect(breakdown.total).toBeGreaterThan(breakdown.input + breakdown.output);
  });

  it("calculates cost with thinking tokens", () => {
    const breakdown = calculateCostBreakdown({
      model: "o1",
      provider: "openai",
      usage: {
        inputTokens: 1000,
        outputTokens: 2500,
        thinkingTokens: 2000,
      },
    });

    // Reasoning: 2000 tokens * $60/million = $0.12
    expect(breakdown.reasoning).toBeCloseTo(0.12, 6);
  });

  it("bills reasoning once for Responses and separately for Google candidate tokens", () => {
    const usage = { inputTokens: 1000, outputTokens: 500, thinkingTokens: 200 };
    const responses = calculateCostBreakdown({ model: "gpt-6.1-sol", provider: "openai", usage });
    const google = calculateCostBreakdown({ model: "gemini-4-argon", provider: "google", usage });
    // Both model rates are $2 input/$10 output per million; only Google's thoughts are extra.
    expect(responses.output).toBeCloseTo(0.003);
    expect(responses.reasoning).toBeCloseTo(0.002);
    expect(responses.total).toBeCloseTo(0.007);
    expect(google.output).toBeCloseTo(0.005);
    expect(google.reasoning).toBeCloseTo(0.002);
    expect(google.total).toBeCloseTo(0.009);
  });

  it("does not invent cache rates when a catalog model leaves them unknown", () => {
    const breakdown = calculateCostBreakdown({
      model: "claude-sonnet-5-5",
      provider: "anthropic",
      usage: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 100 },
    });
    expect(breakdown.input).toBeGreaterThan(0);
    expect(breakdown.cacheRead).toBeNaN();
    expect(breakdown.total).toBeNaN();
  });

  it("preserves unknown pricing instead of reporting free usage", () => {
    const breakdown = calculateCostBreakdown({
      model: "unknown-model-xyz",
      provider: "unknown",
      usage: {
        inputTokens: 1000,
        outputTokens: 500,
      },
    });

    expect(breakdown.total).toBeNaN();
    expect(breakdown.input).toBeNaN();
    expect(breakdown.output).toBeNaN();
    expect(formatCost(breakdown.total)).toBe("Unknown");
  });

  it("adjusts OpenAI input tokens for cache", () => {
    // OpenAI includes cached tokens in prompt_tokens
    const breakdown = calculateCostBreakdown({
      model: "gpt-4o",
      provider: "openai",
      usage: {
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 300,
      },
    });

    // Adjusted input: 1000 - 300 = 700 tokens
    // Input: 700 * $2.5/million = $0.00175
    // Cache: 300 * $1.25/million = $0.000375
    expect(breakdown.input).toBeCloseTo(0.00175, 6);
    expect(breakdown.cacheRead).toBeCloseTo(0.000375, 6);
  });
});

describe("calculateCost", () => {
  it("calculates simple cost", () => {
    const cost = calculateCost(1000, 500, "gpt-4o-mini", "openai");
    // Input: 1000 * $0.15/million = $0.00015
    // Output: 500 * $0.6/million = $0.0003
    expect(cost).toBeCloseTo(0.00045, 6);
  });
});

// =============================================================================
// Formatting Tests
// =============================================================================

describe("formatCost", () => {
  it("formats zero cost", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  it("formats small costs with precision", () => {
    // Formatting may include trailing zeros for consistency
    expect(formatCost(0.0001)).toMatch(/\$0\.0001/);
    expect(formatCost(0.000012)).toMatch(/\$0\.000012/);
  });

  it("formats larger costs with 2 decimals", () => {
    expect(formatCost(1.23)).toBe("$1.23");
    expect(formatCost(10.5)).toBe("$10.50");
  });

  it("formats with thousand separators", () => {
    expect(formatCost(1234.56)).toBe("$1,234.56");
  });

  it("respects showCurrency option", () => {
    expect(formatCost(1.23, { showCurrency: false })).toBe("1.23");
  });
});

describe("formatTokenCount", () => {
  it("formats small counts as-is", () => {
    expect(formatTokenCount(500)).toBe("500");
    expect(formatTokenCount(999)).toBe("999");
  });

  it("formats thousands with K suffix", () => {
    expect(formatTokenCount(1000)).toBe("1K");
    expect(formatTokenCount(1500)).toBe("1.5K");
    expect(formatTokenCount(15000)).toBe("15K");
  });

  it("formats millions with M suffix", () => {
    expect(formatTokenCount(1000000)).toBe("1M");
    expect(formatTokenCount(2500000)).toBe("2.5M");
  });
});

// =============================================================================
// Pricing Tests
// =============================================================================

describe("getPricing", () => {
  it("returns pricing for known model", () => {
    const pricing = getPricing("gpt-4o");
    expect(pricing).toBeDefined();
    expect(pricing?.inputPricePerMillion).toBe(2.5);
    expect(pricing?.outputPricePerMillion).toBe(10.0);
  });

  it("returns undefined for unknown model", () => {
    expect(getPricing("nonexistent-model")).toBeUndefined();
  });

  it("does not borrow rates from a partial or unrelated provider ID", () => {
    expect(getPricing("claude-3-5-sonnet")).toBeUndefined();
    expect(getPricing("gpt-4o-custom")).toBeUndefined();
    expect(getPricing("gpt-6.1-sol", "anthropic")).toBeUndefined();
    expect(getPricing("claude-3-5-sonnet-20241022", "openai")).toBeUndefined();
  });

  it("reads current prices and explicit aliases from the canonical provider catalog", () => {
    expect(getPricing("gpt-6.1-sol", "openai")).toMatchObject({
      inputPricePerMillion: 2,
      outputPricePerMillion: 10,
    });
    expect(getPricing("deepseek-v4-flash", "deepseek")).toEqual(
      getPricing("deepseek-flash", "deepseek")
    );
    expect(calculateCost(1_000_000, 1_000_000, "gpt-6.1-sol", "openai")).toBe(12);
    // o3 has explicit flex/priority alternatives, neither is the default rate.
    expect(calculateCost(1_000, 1_000, "o3", "openai")).toBeCloseTo(0.01);
  });

  it("uses refreshed provider-scoped rates and preserves known free versus unknown models", () => {
    const original = MODEL_CATALOG.get("openai");
    const originalRouter = MODEL_CATALOG.get("openrouter");
    const base = original?.[0] as ModelInfo;
    try {
      MODEL_CATALOG.set("openai", [
        { ...base, id: "shared-fixture", inputPrice: 2, outputPrice: 4 },
        { ...base, id: "free-fixture", inputPrice: 0, outputPrice: 0 },
        { ...base, id: "gpt-4o", inputPrice: undefined, outputPrice: undefined },
      ]);
      MODEL_CATALOG.set("openrouter", [
        { ...base, provider: "openrouter", id: "shared-fixture", inputPrice: 6, outputPrice: 8 },
      ]);
      expect(calculateCost(1_000_000, 1_000_000, "shared-fixture", "openai")).toBe(6);
      expect(calculateCost(1_000_000, 1_000_000, "shared-fixture", "openrouter")).toBe(14);
      expect(getPricing("shared-fixture")).toBeUndefined();
      expect(formatCost(calculateCost(100, 100, "free-fixture", "openai"))).toBe("$0.00");
      expect(getPricing("gpt-4o", "openai")).toBeUndefined();
      expect(calculateCost(100, 100, "gpt-4o", "openai")).toBeNaN();
    } finally {
      if (original) MODEL_CATALOG.set("openai", original);
      if (originalRouter) MODEL_CATALOG.set("openrouter", originalRouter);
    }
  });
});

describe("hasPricing", () => {
  it("returns true for known models", () => {
    expect(hasPricing("gpt-4o")).toBe(true);
    expect(hasPricing("claude-3-5-sonnet-20241022")).toBe(true);
  });

  it("returns false for unknown models", () => {
    expect(hasPricing("unknown-model")).toBe(false);
  });
});

// =============================================================================
// CostService Tests
// =============================================================================

describe("CostService", () => {
  let service: CostService;

  beforeEach(() => {
    service = createCostService({ sessionId: "test-session" });
  });

  it("creates service with session ID", () => {
    expect(service).toBeInstanceOf(CostService);
  });

  it("tracks usage and calculates cost", () => {
    const usage: TokenUsage = {
      inputTokens: 1000,
      outputTokens: 500,
    };

    const record = service.trackUsage(usage, "claude-3-5-sonnet-20241022", "anthropic");

    expect(record.inputTokens).toBe(1000);
    expect(record.outputTokens).toBe(500);
    expect(record.cost).toBeGreaterThan(0);
    expect(record.sessionId).toBe("test-session");
  });

  it("keeps unknown usage visible in aggregates and cost events", () => {
    const events = vi.fn();
    service.on("costUpdate", events);
    service.trackUsage({ inputTokens: 1000, outputTokens: 500 }, "gpt-6.1-sol", "openai");
    service.trackUsage({ inputTokens: 1000, outputTokens: 500 }, "unpriced-fixture", "openai");
    const summary = service.getSessionSummary();
    expect(service.getSessionCost().total).toBeNaN();
    expect(service.getTotalCost().total).toBeNaN();
    expect(summary.totalCost).toBeNaN();
    expect(summary.byProvider.openai?.cost).toBeNaN();
    expect(summary.byModel["unpriced-fixture"]?.cost).toBeNaN();
    expect(summary.byModel["gpt-6.1-sol"]?.cost).toBeGreaterThan(0);
    expect(events.mock.calls.at(-1)?.[0].totalSessionCost).toBeNaN();
  });

  it("accumulates session cost", () => {
    service.trackUsage({ inputTokens: 1000, outputTokens: 500 }, "gpt-4o-mini", "openai");
    service.trackUsage({ inputTokens: 2000, outputTokens: 1000 }, "gpt-4o-mini", "openai");

    const sessionCost = service.getSessionCost();
    expect(sessionCost.total).toBeGreaterThan(0);
    expect(service.requestCount).toBe(2);
    expect(service.totalInputTokens).toBe(3000);
    expect(service.totalOutputTokens).toBe(1500);
  });

  it("emits costUpdate event", () => {
    const handler = vi.fn();
    service.on("costUpdate", handler);

    service.trackUsage({ inputTokens: 1000, outputTokens: 500 }, "gpt-4o", "openai");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "test-session",
        cost: expect.any(Number),
        breakdown: expect.any(Object),
        totalSessionCost: expect.any(Number),
      })
    );
  });

  it("resets session cost", () => {
    service.trackUsage({ inputTokens: 1000, outputTokens: 500 }, "gpt-4o", "openai");
    expect(service.getSessionCost().total).toBeGreaterThan(0);

    service.reset();

    expect(service.getSessionCost().total).toBe(0);
    expect(service.requestCount).toBe(0);
  });

  it("provides session summary", () => {
    service.trackUsage({ inputTokens: 1000, outputTokens: 500 }, "gpt-4o", "openai");
    service.trackUsage(
      { inputTokens: 2000, outputTokens: 1000 },
      "claude-3-5-sonnet-20241022",
      "anthropic"
    );

    const summary = service.getSessionSummary();

    expect(summary.totalRequests).toBe(2);
    expect(summary.totalInputTokens).toBe(3000);
    expect(summary.totalOutputTokens).toBe(1500);
    expect(summary.byProvider).toHaveProperty("openai");
    expect(summary.byProvider).toHaveProperty("anthropic");
    expect(summary.byModel).toHaveProperty("gpt-4o");
    expect(summary.byModel).toHaveProperty("claude-3-5-sonnet-20241022");
  });

  it("handles cache tokens in summary", () => {
    service.trackUsage(
      {
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 300,
        cacheWriteTokens: 200,
      },
      "claude-3-5-sonnet-20241022",
      "anthropic"
    );

    const summary = service.getSessionSummary();
    expect(summary.totalCacheReadTokens).toBe(300);
    expect(summary.totalCacheWriteTokens).toBe(200);
  });

  it("handles thinking tokens in summary", () => {
    service.trackUsage(
      {
        inputTokens: 1000,
        outputTokens: 500,
        thinkingTokens: 2000,
      },
      "o1",
      "openai"
    );

    const summary = service.getSessionSummary();
    expect(summary.totalReasoningTokens).toBe(2000);
  });
});

// =============================================================================
// Pricing Data Validation
// =============================================================================

describe("MODEL_PRICING", () => {
  it("has required providers", () => {
    // Anthropic
    expect(MODEL_PRICING["claude-3-5-sonnet-20241022"]).toBeDefined();
    expect(MODEL_PRICING["claude-3-opus-20240229"]).toBeDefined();

    // OpenAI
    expect(MODEL_PRICING["gpt-4o"]).toBeDefined();
    expect(MODEL_PRICING["gpt-4o-mini"]).toBeDefined();

    // Google
    expect(MODEL_PRICING["gemini-1.5-pro"]).toBeDefined();
    expect(MODEL_PRICING["gemini-1.5-flash"]).toBeDefined();

    // DeepSeek
    expect(MODEL_PRICING["deepseek-chat"]).toBeDefined();
  });

  it("has valid pricing structure", () => {
    for (const [_model, pricing] of Object.entries(MODEL_PRICING)) {
      expect(pricing.inputPricePerMillion).toBeGreaterThanOrEqual(0);
      expect(pricing.outputPricePerMillion).toBeGreaterThanOrEqual(0);
      if (pricing.effectiveDate) expect(pricing.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("output price >= input price (typical pattern)", () => {
    for (const [_model, pricing] of Object.entries(MODEL_PRICING)) {
      // Most models have output price >= input price
      // This is a sanity check, not a strict requirement
      expect(pricing.outputPricePerMillion).toBeGreaterThanOrEqual(
        pricing.inputPricePerMillion * 0.5 // Allow some flexibility
      );
    }
  });
});
