// ============================================
// Quota Error Tests
// ============================================

import { describe, expect, it } from "vitest";
import { classifyQuotaError, RetryableQuotaError, TerminalQuotaError } from "../quota/index.js";
import { ErrorCode } from "../types.js";

describe("QuotaErrors", () => {
  describe("TerminalQuotaError", () => {
    it("should create error with correct code and name", () => {
      const error = new TerminalQuotaError("Billing limit exceeded");

      expect(error.name).toBe("TerminalQuotaError");
      expect(error.code).toBe(ErrorCode.QUOTA_TERMINAL);
      expect(error.message).toBe("Billing limit exceeded");
    });

    it("should be non-retryable", () => {
      const error = new TerminalQuotaError("Payment required");

      expect(error.isRetryable).toBe(false);
      expect(error.retryDelay).toBeUndefined();
    });

    it("should accept context", () => {
      const context = { provider: "openai", model: "gpt-4" };
      const error = new TerminalQuotaError("Quota exceeded", context);

      expect(error.context).toEqual(context);
    });

    it("should serialize to JSON correctly", () => {
      const error = new TerminalQuotaError("Billing issue", { userId: "123" });
      const json = error.toJSON();

      expect(json.name).toBe("TerminalQuotaError");
      expect(json.code).toBe(ErrorCode.QUOTA_TERMINAL);
      expect(json.isRetryable).toBe(false);
      expect(json.context).toEqual({ userId: "123" });
    });
  });

  describe("RetryableQuotaError", () => {
    it("should create error with correct code and name", () => {
      const error = new RetryableQuotaError("Rate limited", 30000);

      expect(error.name).toBe("RetryableQuotaError");
      expect(error.code).toBe(ErrorCode.QUOTA_RETRYABLE);
      expect(error.message).toBe("Rate limited");
    });

    it("should store retryAfterMs", () => {
      const error = new RetryableQuotaError("Too many requests", 45000);

      expect(error.retryAfterMs).toBe(45000);
      expect(error.isRetryable).toBe(true);
      expect(error.retryDelay).toBe(45000);
    });

    it("should accept context", () => {
      const context = { endpoint: "/chat/completions" };
      const error = new RetryableQuotaError("Throttled", 60000, context);

      expect(error.context).toEqual(context);
    });

    it("should serialize to JSON correctly", () => {
      const error = new RetryableQuotaError("Rate limit hit", 30000, {
        remaining: 0,
      });
      const json = error.toJSON();

      expect(json.name).toBe("RetryableQuotaError");
      expect(json.code).toBe(ErrorCode.QUOTA_RETRYABLE);
      expect(json.isRetryable).toBe(true);
      expect(json.retryDelay).toBe(30000);
      expect(json.context).toEqual({ remaining: 0 });
    });
  });
});

describe("classifyQuotaError", () => {
  describe("AC-002-1: Terminal patterns", () => {
    it.each([
      ["billing", "Your billing account is suspended"],
      ["payment", "Payment method declined"],
      ["exceeded", "Monthly limit exceeded"],
      ["limit exceeded", "API limit exceeded for this month"],
      ["quota exceeded", "Quota exceeded for organization"],
    ])("should classify '%s' pattern as terminal", (_pattern, message) => {
      const result = classifyQuotaError(message);

      expect(result.isTerminal).toBe(true);
      expect(result.retryAfterMs).toBeUndefined();
      expect(result.reason).toContain("terminal pattern");
    });

    it("should be case-insensitive for terminal patterns", () => {
      const result = classifyQuotaError("BILLING account suspended");

      expect(result.isTerminal).toBe(true);
    });
  });

  describe("AC-002-2: Retryable patterns", () => {
    it.each([
      ["rate limit", "Rate limit reached, please retry later"],
      ["rate-limit", "Rate-limit applied, please wait"],
      ["throttled", "Request throttled, slow down"],
      ["too many requests", "Too many requests, please wait"],
      ["ratelimit", "Ratelimit hit for API key"],
    ])("should classify '%s' pattern as retryable", (_pattern, message) => {
      const result = classifyQuotaError(message);

      expect(result.isTerminal).toBe(false);
      expect(result.retryAfterMs).toBeDefined();
      expect(result.reason).toContain("retryable pattern");
    });

    it("should use provided retryAfterMs for retryable errors", () => {
      const result = classifyQuotaError("Rate limit reached", 30000);

      expect(result.isTerminal).toBe(false);
      expect(result.retryAfterMs).toBe(30000);
    });

    it("should default to 60s when retryAfterMs not provided", () => {
      const result = classifyQuotaError("Rate limit reached");

      expect(result.isTerminal).toBe(false);
      expect(result.retryAfterMs).toBe(60000);
    });
  });

  describe("AC-002-3: Retry-after threshold", () => {
    it("should classify as terminal when retry-after > 2 minutes", () => {
      // 2.5 minutes = 150000ms
      const result = classifyQuotaError("Rate limit reached", 150000);

      expect(result.isTerminal).toBe(true);
      expect(result.reason).toContain("2 minute threshold");
    });

    it("should classify as terminal when retry-after exactly exceeds threshold", () => {
      // 2 minutes + 1ms = 120001ms
      const result = classifyQuotaError("Throttled", 120001);

      expect(result.isTerminal).toBe(true);
    });

    it("should classify as retryable when retry-after exactly at threshold", () => {
      // Exactly 2 minutes = 120000ms
      const result = classifyQuotaError("Throttled", 120000);

      expect(result.isTerminal).toBe(false);
      expect(result.retryAfterMs).toBe(120000);
    });

    it("should override retryable pattern when retry-after > 2 minutes", () => {
      // Even with retryable pattern, long wait time makes it terminal
      const result = classifyQuotaError("Rate limit reached", 180000);

      expect(result.isTerminal).toBe(true);
    });
  });

  describe("AC-002-4: Default behavior", () => {
    it("should default to retryable with 60s delay for unknown messages", () => {
      const result = classifyQuotaError("Unknown quota error occurred");

      expect(result.isTerminal).toBe(false);
      expect(result.retryAfterMs).toBe(60000);
      expect(result.reason).toContain("Default classification");
    });

    it("should use provided retryAfterMs for unknown messages", () => {
      const result = classifyQuotaError("Unknown error", 45000);

      expect(result.isTerminal).toBe(false);
      expect(result.retryAfterMs).toBe(45000);
    });

    it("should handle empty message", () => {
      const result = classifyQuotaError("");

      expect(result.isTerminal).toBe(false);
      expect(result.retryAfterMs).toBe(60000);
    });
  });

  describe("Pattern precedence", () => {
    it("should prioritize retry-after > 2min over terminal patterns", () => {
      // Even with "exceeded" pattern, long wait makes it terminal via threshold
      const result = classifyQuotaError("Quota exceeded", 180000);

      expect(result.isTerminal).toBe(true);
      expect(result.reason).toContain("2 minute threshold");
    });

    it("should prioritize terminal patterns over retryable patterns", () => {
      // "exceeded" should win over "rate limit"
      const result = classifyQuotaError("Rate limit exceeded for billing account");

      expect(result.isTerminal).toBe(true);
      expect(result.reason).toContain("billing");
    });
  });
});
