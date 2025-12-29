import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelAvailabilityService } from "../ModelAvailabilityService.js";

describe("ModelAvailabilityService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset singleton before each test
    ModelAvailabilityService.resetInstance();
  });

  afterEach(() => {
    ModelAvailabilityService.resetInstance();
    vi.useRealTimers();
  });

  describe("getInstance", () => {
    it("returns singleton instance", () => {
      const instance1 = ModelAvailabilityService.getInstance();
      const instance2 = ModelAvailabilityService.getInstance();

      expect(instance1).toBe(instance2);
    });

    it("creates new instance after reset", () => {
      const instance1 = ModelAvailabilityService.getInstance();
      ModelAvailabilityService.resetInstance();
      const instance2 = ModelAvailabilityService.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe("AC-001-1: markUnavailable() stores terminal/sticky_retry state", () => {
    it("stores terminal state for a model", () => {
      const service = ModelAvailabilityService.getInstance();

      service.markUnavailable("gpt-4", "terminal");
      const status = service.getStatus("gpt-4");

      expect(status.available).toBe(false);
      expect(status.state).toBe("terminal");
      expect(status.markedAt).toBeDefined();
    });

    it("stores sticky_retry state with expiration", () => {
      const service = ModelAvailabilityService.getInstance();
      const now = Date.now();

      service.markUnavailable("gpt-4", "sticky_retry", 30_000);
      const status = service.getStatus("gpt-4");

      expect(status.available).toBe(false);
      expect(status.state).toBe("sticky_retry");
      expect(status.markedAt).toBe(now);
      expect(status.retryAfterMs).toBeGreaterThan(0);
      expect(status.retryAfterMs).toBeLessThanOrEqual(30_000);
    });

    it("overwrites previous state when marked again", () => {
      const service = ModelAvailabilityService.getInstance();

      // First mark as terminal
      service.markUnavailable("gpt-4", "terminal");
      expect(service.getStatus("gpt-4").state).toBe("terminal");

      // Then mark as sticky_retry
      service.markUnavailable("gpt-4", "sticky_retry", 10_000);
      expect(service.getStatus("gpt-4").state).toBe("sticky_retry");
    });

    it("handles sticky_retry without duration", () => {
      const service = ModelAvailabilityService.getInstance();

      service.markUnavailable("gpt-4", "sticky_retry");
      const status = service.getStatus("gpt-4");

      expect(status.available).toBe(false);
      expect(status.state).toBe("sticky_retry");
      // Without duration, retryAfterMs should be 0
      expect(status.retryAfterMs).toBe(0);
    });

    it("handles zero duration for sticky_retry", () => {
      const service = ModelAvailabilityService.getInstance();

      service.markUnavailable("gpt-4", "sticky_retry", 0);
      const status = service.getStatus("gpt-4");

      expect(status.available).toBe(false);
      // Zero duration means no expiration set
      expect(status.retryAfterMs).toBe(0);
    });

    it("handles negative duration for sticky_retry", () => {
      const service = ModelAvailabilityService.getInstance();

      service.markUnavailable("gpt-4", "sticky_retry", -1000);
      const status = service.getStatus("gpt-4");

      expect(status.available).toBe(false);
      // Negative duration should not set expiration
      expect(status.retryAfterMs).toBe(0);
    });
  });

  describe("AC-001-2: isAvailable() returns false for unavailable models", () => {
    it("returns false for terminal state models", () => {
      const service = ModelAvailabilityService.getInstance();

      service.markUnavailable("gpt-4", "terminal");

      expect(service.isAvailable("gpt-4")).toBe(false);
    });

    it("returns false for sticky_retry state models within duration", () => {
      const service = ModelAvailabilityService.getInstance();

      service.markUnavailable("gpt-4", "sticky_retry", 30_000);

      expect(service.isAvailable("gpt-4")).toBe(false);
    });

    it("returns false for sticky_retry without expiration", () => {
      const service = ModelAvailabilityService.getInstance();

      service.markUnavailable("gpt-4", "sticky_retry");

      expect(service.isAvailable("gpt-4")).toBe(false);
    });

    it("tracks multiple models independently", () => {
      const service = ModelAvailabilityService.getInstance();

      service.markUnavailable("gpt-4", "terminal");
      service.markUnavailable("gpt-3.5-turbo", "sticky_retry", 10_000);

      expect(service.isAvailable("gpt-4")).toBe(false);
      expect(service.isAvailable("gpt-3.5-turbo")).toBe(false);
      expect(service.isAvailable("claude-3")).toBe(true);
    });
  });

  describe("AC-001-3: sticky_retry auto-expires after duration", () => {
    it("returns available after sticky_retry expires via isAvailable()", () => {
      const service = ModelAvailabilityService.getInstance();

      service.markUnavailable("gpt-4", "sticky_retry", 5_000);

      // Before expiration
      expect(service.isAvailable("gpt-4")).toBe(false);

      // Advance time past expiration
      vi.advanceTimersByTime(5_000);

      // After expiration
      expect(service.isAvailable("gpt-4")).toBe(true);
    });

    it("returns available after sticky_retry expires via getStatus()", () => {
      const service = ModelAvailabilityService.getInstance();

      service.markUnavailable("gpt-4", "sticky_retry", 10_000);

      // Before expiration
      expect(service.getStatus("gpt-4").available).toBe(false);

      // Advance time past expiration
      vi.advanceTimersByTime(10_001);

      // After expiration
      const status = service.getStatus("gpt-4");
      expect(status.available).toBe(true);
      expect(status.state).toBeUndefined();
    });

    it("terminal state never expires", () => {
      const service = ModelAvailabilityService.getInstance();

      service.markUnavailable("gpt-4", "terminal");

      // Advance time significantly
      vi.advanceTimersByTime(1_000_000);

      // Still unavailable
      expect(service.isAvailable("gpt-4")).toBe(false);
      expect(service.getStatus("gpt-4").state).toBe("terminal");
    });

    it("retryAfterMs decreases as time passes", () => {
      const service = ModelAvailabilityService.getInstance();

      service.markUnavailable("gpt-4", "sticky_retry", 10_000);

      const initialStatus = service.getStatus("gpt-4");
      expect(initialStatus.retryAfterMs).toBe(10_000);

      // Advance 3 seconds
      vi.advanceTimersByTime(3_000);

      const midStatus = service.getStatus("gpt-4");
      expect(midStatus.retryAfterMs).toBe(7_000);

      // Advance 4 more seconds
      vi.advanceTimersByTime(4_000);

      const lateStatus = service.getStatus("gpt-4");
      expect(lateStatus.retryAfterMs).toBe(3_000);
    });

    it("cleanup() removes expired entries", () => {
      const service = ModelAvailabilityService.getInstance();

      service.markUnavailable("model-1", "sticky_retry", 5_000);
      service.markUnavailable("model-2", "sticky_retry", 15_000);
      service.markUnavailable("model-3", "terminal");

      // Advance past first expiration
      vi.advanceTimersByTime(6_000);
      service.cleanup();

      // model-1 should be cleaned up, others remain
      expect(service.isAvailable("model-1")).toBe(true);
      expect(service.isAvailable("model-2")).toBe(false);
      expect(service.isAvailable("model-3")).toBe(false);
    });
  });

  describe("AC-001-4: Unknown models return available (default)", () => {
    it("returns true for unknown model via isAvailable()", () => {
      const service = ModelAvailabilityService.getInstance();

      expect(service.isAvailable("never-seen-model")).toBe(true);
    });

    it("returns available status for unknown model via getStatus()", () => {
      const service = ModelAvailabilityService.getInstance();

      const status = service.getStatus("never-seen-model");

      expect(status.available).toBe(true);
      expect(status.state).toBeUndefined();
      expect(status.retryAfterMs).toBeUndefined();
      expect(status.markedAt).toBeUndefined();
    });

    it("returns true after model is cleared", () => {
      const service = ModelAvailabilityService.getInstance();

      service.markUnavailable("gpt-4", "terminal");
      expect(service.isAvailable("gpt-4")).toBe(false);

      service.clearUnavailable("gpt-4");
      expect(service.isAvailable("gpt-4")).toBe(true);
    });

    it("clearUnavailable on unknown model does not throw", () => {
      const service = ModelAvailabilityService.getInstance();

      expect(() => {
        service.clearUnavailable("never-existed");
      }).not.toThrow();
    });
  });

  describe("AC-001-5: getRetryAfter() returns remaining ms or 0", () => {
    it("returns 0 for unknown model", () => {
      const service = ModelAvailabilityService.getInstance();

      expect(service.getRetryAfter("unknown-model")).toBe(0);
    });

    it("returns 0 for terminal state", () => {
      const service = ModelAvailabilityService.getInstance();

      service.markUnavailable("gpt-4", "terminal");

      expect(service.getRetryAfter("gpt-4")).toBe(0);
    });

    it("returns remaining ms for sticky_retry", () => {
      const service = ModelAvailabilityService.getInstance();

      service.markUnavailable("gpt-4", "sticky_retry", 10_000);

      expect(service.getRetryAfter("gpt-4")).toBe(10_000);
    });

    it("returns decreasing ms as time passes", () => {
      const service = ModelAvailabilityService.getInstance();

      service.markUnavailable("gpt-4", "sticky_retry", 10_000);

      vi.advanceTimersByTime(4_000);
      expect(service.getRetryAfter("gpt-4")).toBe(6_000);

      vi.advanceTimersByTime(3_000);
      expect(service.getRetryAfter("gpt-4")).toBe(3_000);
    });

    it("returns 0 after expiration", () => {
      const service = ModelAvailabilityService.getInstance();

      service.markUnavailable("gpt-4", "sticky_retry", 5_000);

      vi.advanceTimersByTime(5_001);

      expect(service.getRetryAfter("gpt-4")).toBe(0);
    });

    it("returns 0 for sticky_retry without expiration", () => {
      const service = ModelAvailabilityService.getInstance();

      service.markUnavailable("gpt-4", "sticky_retry");

      expect(service.getRetryAfter("gpt-4")).toBe(0);
    });
  });

  describe("dispose", () => {
    it("clears all models and stops cleanup timer", () => {
      const service = ModelAvailabilityService.getInstance();

      service.markUnavailable("gpt-4", "terminal");
      service.markUnavailable("gpt-3.5", "sticky_retry", 10_000);

      service.dispose();

      // After dispose, new instance should have no models
      // (we need to get a new instance after reset)
      ModelAvailabilityService.resetInstance();
      const newService = ModelAvailabilityService.getInstance();

      expect(newService.isAvailable("gpt-4")).toBe(true);
      expect(newService.isAvailable("gpt-3.5")).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("handles model IDs with special characters", () => {
      const service = ModelAvailabilityService.getInstance();
      const specialId = "org/model:v1.2.3@latest";

      service.markUnavailable(specialId, "terminal");

      expect(service.isAvailable(specialId)).toBe(false);
      expect(service.getStatus(specialId).state).toBe("terminal");
    });

    it("handles empty model ID", () => {
      const service = ModelAvailabilityService.getInstance();

      service.markUnavailable("", "terminal");

      expect(service.isAvailable("")).toBe(false);
    });

    it("handles very long duration", () => {
      const service = ModelAvailabilityService.getInstance();
      const longDuration = 365 * 24 * 60 * 60 * 1000; // 1 year

      service.markUnavailable("gpt-4", "sticky_retry", longDuration);

      expect(service.isAvailable("gpt-4")).toBe(false);
      expect(service.getRetryAfter("gpt-4")).toBe(longDuration);
    });

    it("handles very short duration", () => {
      const service = ModelAvailabilityService.getInstance();

      service.markUnavailable("gpt-4", "sticky_retry", 1);

      expect(service.isAvailable("gpt-4")).toBe(false);

      vi.advanceTimersByTime(1);

      expect(service.isAvailable("gpt-4")).toBe(true);
    });

    it("handles concurrent marks on same model", () => {
      const service = ModelAvailabilityService.getInstance();

      // Rapid succession of marks - last one wins
      service.markUnavailable("gpt-4", "terminal");
      service.markUnavailable("gpt-4", "sticky_retry", 5_000);
      service.markUnavailable("gpt-4", "terminal");

      expect(service.getStatus("gpt-4").state).toBe("terminal");
    });
  });
});
