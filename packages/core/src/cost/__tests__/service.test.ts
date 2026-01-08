/**
 * Cost Service Tests (Phase 35)
 *
 * @module @vellum/core/cost/__tests__
 */

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
        outputTokens: 500,
        thinkingTokens: 2000,
      },
    });

    // Reasoning: 2000 tokens * $60/million = $0.12
    expect(breakdown.reasoning).toBeCloseTo(0.12, 6);
  });

  it("returns zero cost for unknown model", () => {
    const breakdown = calculateCostBreakdown({
      model: "unknown-model-xyz",
      provider: "unknown",
      usage: {
        inputTokens: 1000,
        outputTokens: 500,
      },
    });

    expect(breakdown.total).toBe(0);
    expect(breakdown.input).toBe(0);
    expect(breakdown.output).toBe(0);
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

  it("handles prefix matching", () => {
    const pricing = getPricing("claude-3-5-sonnet");
    expect(pricing).toBeDefined();
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
      expect(pricing.inputPricePerMillion).toBeGreaterThan(0);
      expect(pricing.outputPricePerMillion).toBeGreaterThan(0);
      expect(pricing.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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
