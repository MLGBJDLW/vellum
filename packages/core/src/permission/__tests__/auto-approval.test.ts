import { beforeEach, describe, expect, it } from "vitest";

import {
  AutoApprovalLimitsHandler,
  createAutoApprovalLimitsHandler,
  DEFAULT_AUTO_APPROVAL_LIMIT,
} from "../auto-approval.js";

describe("AutoApprovalLimitsHandler", () => {
  let handler: AutoApprovalLimitsHandler;

  beforeEach(() => {
    handler = new AutoApprovalLimitsHandler();
  });

  // ============================================
  // Constructor
  // ============================================

  describe("constructor", () => {
    it("should initialize with default limit", () => {
      const h = new AutoApprovalLimitsHandler();
      expect(h.getLimit()).toBe(DEFAULT_AUTO_APPROVAL_LIMIT);
      expect(h.getCount()).toBe(0);
    });

    it("should accept custom limit", () => {
      const h = new AutoApprovalLimitsHandler({ limit: 50 });
      expect(h.getLimit()).toBe(50);
    });

    it("should accept trackByType option", () => {
      const h = new AutoApprovalLimitsHandler({ trackByType: true });
      h.recordApproval({ type: "bash" });
      const stats = h.getStats();
      expect(stats.byType).toBeDefined();
      expect(stats.byType?.bash).toBe(1);
    });
  });

  // ============================================
  // recordApproval
  // ============================================

  describe("recordApproval", () => {
    it("should record an approval", () => {
      expect(handler.getCount()).toBe(0);
      const result = handler.recordApproval();
      expect(result).toBe(true);
      expect(handler.getCount()).toBe(1);
    });

    it("should record multiple approvals", () => {
      handler.recordApproval();
      handler.recordApproval();
      handler.recordApproval();
      expect(handler.getCount()).toBe(3);
    });

    it("should return false when limit reached", () => {
      const h = new AutoApprovalLimitsHandler({ limit: 3 });
      expect(h.recordApproval()).toBe(true);
      expect(h.recordApproval()).toBe(true);
      expect(h.recordApproval()).toBe(true);
      expect(h.recordApproval()).toBe(false);
      expect(h.getCount()).toBe(3);
    });

    it("should not increment count when limit reached", () => {
      const h = new AutoApprovalLimitsHandler({ limit: 2 });
      h.recordApproval();
      h.recordApproval();
      h.recordApproval();
      h.recordApproval();
      expect(h.getCount()).toBe(2);
    });

    it("should track by type when enabled", () => {
      const h = new AutoApprovalLimitsHandler({ trackByType: true });
      h.recordApproval({ type: "bash" });
      h.recordApproval({ type: "bash" });
      h.recordApproval({ type: "edit" });

      const stats = h.getStats();
      expect(stats.byType?.bash).toBe(2);
      expect(stats.byType?.edit).toBe(1);
    });

    it("should not track by type when disabled", () => {
      const h = new AutoApprovalLimitsHandler({ trackByType: false });
      h.recordApproval({ type: "bash" });

      const stats = h.getStats();
      expect(stats.byType).toBeUndefined();
    });
  });

  // ============================================
  // isLimitReached
  // ============================================

  describe("isLimitReached", () => {
    it("should return false when under limit", () => {
      const h = new AutoApprovalLimitsHandler({ limit: 5 });
      h.recordApproval();
      h.recordApproval();
      expect(h.isLimitReached()).toBe(false);
    });

    it("should return true when at limit", () => {
      const h = new AutoApprovalLimitsHandler({ limit: 3 });
      h.recordApproval();
      h.recordApproval();
      h.recordApproval();
      expect(h.isLimitReached()).toBe(true);
    });

    it("should return true when over limit (prevented)", () => {
      const h = new AutoApprovalLimitsHandler({ limit: 2 });
      h.recordApproval();
      h.recordApproval();
      h.recordApproval(); // This won't increment
      expect(h.isLimitReached()).toBe(true);
    });

    it("should return false on fresh handler", () => {
      expect(handler.isLimitReached()).toBe(false);
    });
  });

  // ============================================
  // getRemaining
  // ============================================

  describe("getRemaining", () => {
    it("should return full limit for fresh handler", () => {
      expect(handler.getRemaining()).toBe(DEFAULT_AUTO_APPROVAL_LIMIT);
    });

    it("should decrease as approvals are recorded", () => {
      const h = new AutoApprovalLimitsHandler({ limit: 10 });
      expect(h.getRemaining()).toBe(10);
      h.recordApproval();
      expect(h.getRemaining()).toBe(9);
      h.recordApproval();
      h.recordApproval();
      expect(h.getRemaining()).toBe(7);
    });

    it("should return 0 when at limit", () => {
      const h = new AutoApprovalLimitsHandler({ limit: 2 });
      h.recordApproval();
      h.recordApproval();
      expect(h.getRemaining()).toBe(0);
    });

    it("should never return negative", () => {
      const h = new AutoApprovalLimitsHandler({ limit: 1 });
      h.recordApproval();
      h.recordApproval();
      expect(h.getRemaining()).toBe(0);
    });
  });

  // ============================================
  // reset
  // ============================================

  describe("reset", () => {
    it("should reset count to zero", () => {
      const h = new AutoApprovalLimitsHandler({ limit: 10 });
      h.recordApproval();
      h.recordApproval();
      h.recordApproval();
      expect(h.getCount()).toBe(3);

      h.reset();
      expect(h.getCount()).toBe(0);
    });

    it("should allow recording after reset", () => {
      const h = new AutoApprovalLimitsHandler({ limit: 2 });
      h.recordApproval();
      h.recordApproval();
      expect(h.isLimitReached()).toBe(true);

      h.reset();
      expect(h.isLimitReached()).toBe(false);
      expect(h.recordApproval()).toBe(true);
    });

    it("should clear type tracking on reset", () => {
      const h = new AutoApprovalLimitsHandler({ trackByType: true });
      h.recordApproval({ type: "bash" });
      h.recordApproval({ type: "edit" });

      h.reset();

      const stats = h.getStats();
      expect(stats.total).toBe(0);
      expect(stats.byType).toBeUndefined();
    });

    it("should preserve limit after reset", () => {
      const h = new AutoApprovalLimitsHandler({ limit: 50 });
      h.recordApproval();
      h.reset();
      expect(h.getLimit()).toBe(50);
    });
  });

  // ============================================
  // getStats
  // ============================================

  describe("getStats", () => {
    it("should return complete stats for fresh handler", () => {
      const stats = handler.getStats();
      expect(stats).toMatchObject({
        total: 0,
        limit: DEFAULT_AUTO_APPROVAL_LIMIT,
        remaining: DEFAULT_AUTO_APPROVAL_LIMIT,
        limitReached: false,
      });
    });

    it("should return accurate stats after approvals", () => {
      const h = new AutoApprovalLimitsHandler({ limit: 10 });
      h.recordApproval();
      h.recordApproval();
      h.recordApproval();

      const stats = h.getStats();
      expect(stats).toMatchObject({
        total: 3,
        limit: 10,
        remaining: 7,
        limitReached: false,
      });
    });

    it("should show limit reached in stats", () => {
      const h = new AutoApprovalLimitsHandler({ limit: 2 });
      h.recordApproval();
      h.recordApproval();

      const stats = h.getStats();
      expect(stats.limitReached).toBe(true);
      expect(stats.remaining).toBe(0);
    });

    it("should include byType when tracking enabled", () => {
      const h = new AutoApprovalLimitsHandler({ trackByType: true, limit: 100 });
      h.recordApproval({ type: "bash" });
      h.recordApproval({ type: "bash" });
      h.recordApproval({ type: "edit" });
      h.recordApproval({ type: "webfetch" });

      const stats = h.getStats();
      expect(stats.byType).toEqual({
        bash: 2,
        edit: 1,
        webfetch: 1,
      });
    });
  });

  // ============================================
  // canApprove
  // ============================================

  describe("canApprove", () => {
    it("should return true when enough remaining", () => {
      const h = new AutoApprovalLimitsHandler({ limit: 10 });
      expect(h.canApprove(5)).toBe(true);
      expect(h.canApprove(10)).toBe(true);
    });

    it("should return false when not enough remaining", () => {
      const h = new AutoApprovalLimitsHandler({ limit: 10 });
      expect(h.canApprove(11)).toBe(false);
    });

    it("should default to 1", () => {
      const h = new AutoApprovalLimitsHandler({ limit: 1 });
      expect(h.canApprove()).toBe(true);
      h.recordApproval();
      expect(h.canApprove()).toBe(false);
    });

    it("should account for existing count", () => {
      const h = new AutoApprovalLimitsHandler({ limit: 10 });
      h.recordApproval();
      h.recordApproval();
      h.recordApproval();

      expect(h.canApprove(7)).toBe(true);
      expect(h.canApprove(8)).toBe(false);
    });
  });

  // ============================================
  // createAutoApprovalLimitsHandler factory
  // ============================================

  describe("createAutoApprovalLimitsHandler", () => {
    it("should create handler with defaults", () => {
      const h = createAutoApprovalLimitsHandler();
      expect(h).toBeInstanceOf(AutoApprovalLimitsHandler);
      expect(h.getLimit()).toBe(DEFAULT_AUTO_APPROVAL_LIMIT);
    });

    it("should create handler with custom options", () => {
      const h = createAutoApprovalLimitsHandler({ limit: 25, trackByType: true });
      expect(h.getLimit()).toBe(25);
      h.recordApproval({ type: "test" });
      expect(h.getStats().byType?.test).toBe(1);
    });
  });

  // ============================================
  // DEFAULT_AUTO_APPROVAL_LIMIT
  // ============================================

  describe("DEFAULT_AUTO_APPROVAL_LIMIT", () => {
    it("should be 100", () => {
      expect(DEFAULT_AUTO_APPROVAL_LIMIT).toBe(100);
    });
  });
});
