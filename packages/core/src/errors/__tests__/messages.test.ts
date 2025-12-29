import { describe, expect, it } from "vitest";
import { formatQuotaMessage } from "../messages.js";

describe("formatQuotaMessage", () => {
  describe("AC-011-1: Free plan messages", () => {
    it("suggests upgrading to Plus for free plan", () => {
      const message = formatQuotaMessage({ plan: "free" });
      expect(message).toContain("API quota exceeded.");
      expect(message).toContain("Consider upgrading to Plus for higher limits.");
    });

    it("handles case-insensitive plan names", () => {
      const message = formatQuotaMessage({ plan: "FREE" });
      expect(message).toContain("Consider upgrading to Plus for higher limits.");
    });

    it("includes upgrade URL for free plan", () => {
      const message = formatQuotaMessage({
        plan: "free",
        upgradeUrl: "https://example.com/upgrade",
      });
      expect(message).toContain("https://example.com/upgrade");
    });
  });

  describe("AC-011-2: Plus plan messages", () => {
    it("suggests upgrading to Pro for plus plan", () => {
      const message = formatQuotaMessage({ plan: "plus" });
      expect(message).toContain("API quota exceeded.");
      expect(message).toContain("Upgrade to Pro for even higher limits.");
    });

    it("handles case-insensitive plan names", () => {
      const message = formatQuotaMessage({ plan: "Plus" });
      expect(message).toContain("Upgrade to Pro for even higher limits.");
    });

    it("includes upgrade URL for plus plan", () => {
      const message = formatQuotaMessage({
        plan: "plus",
        upgradeUrl: "https://example.com/upgrade-to-pro",
      });
      expect(message).toContain("https://example.com/upgrade-to-pro");
    });
  });

  describe("AC-011-3: Pro and Enterprise plan messages", () => {
    it("suggests contacting support for pro plan", () => {
      const message = formatQuotaMessage({ plan: "pro" });
      expect(message).toContain("API quota exceeded.");
      expect(message).toContain("Contact support for limit increases.");
    });

    it("suggests contacting support for enterprise plan", () => {
      const message = formatQuotaMessage({ plan: "enterprise" });
      expect(message).toContain("API quota exceeded.");
      expect(message).toContain("Contact support for limit increases.");
    });

    it("does not include upgrade URL for pro plan", () => {
      const message = formatQuotaMessage({
        plan: "pro",
        upgradeUrl: "https://example.com/upgrade",
      });
      expect(message).not.toContain("https://example.com/upgrade");
    });

    it("does not include upgrade URL for enterprise plan", () => {
      const message = formatQuotaMessage({
        plan: "enterprise",
        upgradeUrl: "https://example.com/upgrade",
      });
      expect(message).not.toContain("https://example.com/upgrade");
    });
  });

  describe("AC-011-4: Unknown plan messages", () => {
    it("shows generic message for unknown plan", () => {
      const message = formatQuotaMessage({ plan: "unknown" });
      expect(message).toContain("API quota exceeded.");
      expect(message).toContain("Check your plan limits.");
    });

    it("shows generic message for undefined plan", () => {
      const message = formatQuotaMessage({});
      expect(message).toContain("API quota exceeded.");
      expect(message).toContain("Check your plan limits.");
    });

    it("shows generic message for empty options", () => {
      const message = formatQuotaMessage();
      expect(message).toContain("API quota exceeded.");
      expect(message).toContain("Check your plan limits.");
    });

    it("shows generic message for custom plan names", () => {
      const message = formatQuotaMessage({ plan: "custom-tier" });
      expect(message).toContain("API quota exceeded.");
      expect(message).toContain("Check your plan limits.");
    });

    it("does not include upgrade URL for unknown plans", () => {
      const message = formatQuotaMessage({
        plan: "unknown",
        upgradeUrl: "https://example.com/upgrade",
      });
      expect(message).not.toContain("https://example.com/upgrade");
    });
  });

  describe("retry timing", () => {
    it("includes retry time in seconds", () => {
      const message = formatQuotaMessage({
        plan: "free",
        retryAfterMs: 60000,
      });
      expect(message).toContain("Try again in 60 seconds.");
    });

    it("rounds up partial seconds", () => {
      const message = formatQuotaMessage({
        plan: "free",
        retryAfterMs: 1500,
      });
      expect(message).toContain("Try again in 2 seconds.");
    });

    it("handles small millisecond values", () => {
      const message = formatQuotaMessage({
        plan: "free",
        retryAfterMs: 100,
      });
      expect(message).toContain("Try again in 1 seconds.");
    });

    it("does not include retry time when not provided", () => {
      const message = formatQuotaMessage({ plan: "free" });
      expect(message).not.toContain("Try again in");
    });

    it("does not include retry time when zero", () => {
      const message = formatQuotaMessage({
        plan: "free",
        retryAfterMs: 0,
      });
      expect(message).not.toContain("Try again in");
    });

    it("does not include retry time when negative", () => {
      const message = formatQuotaMessage({
        plan: "free",
        retryAfterMs: -1000,
      });
      expect(message).not.toContain("Try again in");
    });
  });

  describe("message format", () => {
    it("builds complete message with all options for free plan", () => {
      const message = formatQuotaMessage({
        plan: "free",
        retryAfterMs: 30000,
        upgradeUrl: "https://example.com/upgrade",
      });
      expect(message).toBe(
        "API quota exceeded. Try again in 30 seconds. Consider upgrading to Plus for higher limits. https://example.com/upgrade"
      );
    });

    it("builds complete message with all options for plus plan", () => {
      const message = formatQuotaMessage({
        plan: "plus",
        retryAfterMs: 120000,
        upgradeUrl: "https://example.com/pro",
      });
      expect(message).toBe(
        "API quota exceeded. Try again in 120 seconds. Upgrade to Pro for even higher limits. https://example.com/pro"
      );
    });

    it("builds complete message for pro plan without URL", () => {
      const message = formatQuotaMessage({
        plan: "pro",
        retryAfterMs: 60000,
      });
      expect(message).toBe(
        "API quota exceeded. Try again in 60 seconds. Contact support for limit increases."
      );
    });
  });
});
