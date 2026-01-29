/**
 * EvidenceTelemetryService Unit Tests
 *
 * Tests for the telemetry recording and analysis service.
 *
 * @module context/evidence/__tests__/telemetry.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EvidenceTelemetryService } from "../telemetry.js";
import type { EvidenceTelemetry } from "../types.js";

// =============================================================================
// Mock Helpers
// =============================================================================

/**
 * Creates mock telemetry data for testing.
 */
function createMockTelemetry(overrides: Partial<EvidenceTelemetry> = {}): EvidenceTelemetry {
  return {
    signalExtractionMs: 20,
    totalMs: 150,
    rerankMs: 30,
    signalCount: 5,
    evidenceCountBeforeBudget: 20,
    evidenceCountAfterBudget: 10,
    tokensSaved: 500,
    providerTimings: {
      diff: 50,
      search: 60,
      lsp: 40,
    },
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("EvidenceTelemetryService", () => {
  let service: EvidenceTelemetryService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-29T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("should create service with default config", () => {
      service = new EvidenceTelemetryService();
      expect(service.getRecords()).toHaveLength(0);
    });

    it("should create service with custom maxRecords", () => {
      service = new EvidenceTelemetryService({ maxRecords: 100 });
      expect(service.getRecords()).toHaveLength(0);
    });
  });

  describe("record()", () => {
    it("should record telemetry", () => {
      service = new EvidenceTelemetryService();
      const telemetry = createMockTelemetry();

      service.record("session-1", telemetry);

      const records = service.getRecords();
      expect(records).toHaveLength(1);
      expect(records[0]?.sessionId).toBe("session-1");
      expect(records[0]?.data).toEqual(telemetry);
      expect(records[0]?.timestamp).toBe(Date.now());
    });

    it("should record multiple telemetry entries", () => {
      service = new EvidenceTelemetryService();

      service.record("session-1", createMockTelemetry({ totalMs: 100 }));
      vi.advanceTimersByTime(1000);
      service.record("session-2", createMockTelemetry({ totalMs: 200 }));

      const records = service.getRecords();
      expect(records).toHaveLength(2);
      expect(records[0]?.data.totalMs).toBe(100);
      expect(records[1]?.data.totalMs).toBe(200);
    });
  });

  describe("markOutcome()", () => {
    it("should mark outcomes", () => {
      service = new EvidenceTelemetryService();
      service.record("session-1", createMockTelemetry());

      service.markOutcome("session-1", "success");

      const records = service.getRecords();
      expect(records[0]?.outcome).toBe("success");
    });

    it("should mark outcome as failure", () => {
      service = new EvidenceTelemetryService();
      service.record("session-1", createMockTelemetry());

      service.markOutcome("session-1", "failure");

      const records = service.getRecords();
      expect(records[0]?.outcome).toBe("failure");
    });

    it("should mark outcome as abandoned", () => {
      service = new EvidenceTelemetryService();
      service.record("session-1", createMockTelemetry());

      service.markOutcome("session-1", "abandoned");

      const records = service.getRecords();
      expect(records[0]?.outcome).toBe("abandoned");
    });

    it("should not fail when session not found", () => {
      service = new EvidenceTelemetryService();
      service.record("session-1", createMockTelemetry());

      // Should not throw
      service.markOutcome("non-existent", "success");

      const records = service.getRecords();
      expect(records[0]?.outcome).toBeUndefined();
    });
  });

  describe("getStats()", () => {
    it("should calculate stats", () => {
      service = new EvidenceTelemetryService();
      service.record("session-1", createMockTelemetry({ totalMs: 100 }));
      service.record("session-2", createMockTelemetry({ totalMs: 200 }));
      service.markOutcome("session-1", "success");
      service.markOutcome("session-2", "failure");

      const stats = service.getStats();

      expect(stats.totalSessions).toBe(2);
      expect(stats.avgBuildTimeMs).toBe(150); // (100 + 200) / 2
      expect(stats.successRate).toBe(0.5); // 1 success / 2 outcomes
    });

    it("should return empty stats when no records", () => {
      service = new EvidenceTelemetryService();

      const stats = service.getStats();

      expect(stats.totalSessions).toBe(0);
      expect(stats.avgBuildTimeMs).toBe(0);
      expect(stats.avgTokensUsed).toBe(0);
      expect(stats.successRate).toBe(0);
      expect(stats.avgProviderLatency).toEqual({});
      expect(stats.providerHitRates).toEqual({});
    });

    it("should calculate average provider latencies", () => {
      service = new EvidenceTelemetryService();
      service.record(
        "session-1",
        createMockTelemetry({
          providerTimings: { diff: 100, search: 50, lsp: 80 },
        })
      );
      service.record(
        "session-2",
        createMockTelemetry({
          providerTimings: { diff: 200, search: 150, lsp: 120 },
        })
      );

      const stats = service.getStats();

      expect(stats.avgProviderLatency["diff"]).toBe(150); // (100 + 200) / 2
      expect(stats.avgProviderLatency["search"]).toBe(100); // (50 + 150) / 2
      expect(stats.avgProviderLatency["lsp"]).toBe(100); // (80 + 120) / 2
    });

    it("should calculate provider hit rates", () => {
      service = new EvidenceTelemetryService();
      // All providers have timing = hit
      service.record(
        "session-1",
        createMockTelemetry({
          providerTimings: { diff: 100, search: 50, lsp: 80 },
        })
      );
      service.record(
        "session-2",
        createMockTelemetry({
          providerTimings: { diff: 100, search: 50, lsp: 80 },
        })
      );

      const stats = service.getStats();

      expect(stats.providerHitRates["diff"]).toBe(1); // 2/2
      expect(stats.providerHitRates["search"]).toBe(1); // 2/2
      expect(stats.providerHitRates["lsp"]).toBe(1); // 2/2
    });

    it("should return 0 success rate when no outcomes marked", () => {
      service = new EvidenceTelemetryService();
      service.record("session-1", createMockTelemetry());
      service.record("session-2", createMockTelemetry());

      const stats = service.getStats();

      expect(stats.successRate).toBe(0);
    });
  });

  describe("maxRecords limit", () => {
    it("should respect maxRecords limit", () => {
      service = new EvidenceTelemetryService({ maxRecords: 3 });

      service.record("session-1", createMockTelemetry({ totalMs: 100 }));
      service.record("session-2", createMockTelemetry({ totalMs: 200 }));
      service.record("session-3", createMockTelemetry({ totalMs: 300 }));
      service.record("session-4", createMockTelemetry({ totalMs: 400 }));

      const records = service.getRecords();
      expect(records).toHaveLength(3);
      // Oldest record should be evicted (circular buffer)
      expect(records.map((r) => r.sessionId)).not.toContain("session-1");
      expect(records.map((r) => r.data.totalMs)).toEqual([200, 300, 400]);
    });

    it("should evict oldest records when limit reached", () => {
      service = new EvidenceTelemetryService({ maxRecords: 2 });

      service.record("session-1", createMockTelemetry());
      service.record("session-2", createMockTelemetry());
      service.record("session-3", createMockTelemetry());
      service.record("session-4", createMockTelemetry());
      service.record("session-5", createMockTelemetry());

      const records = service.getRecords();
      expect(records).toHaveLength(2);
      expect(records[0]?.sessionId).toBe("session-4");
      expect(records[1]?.sessionId).toBe("session-5");
    });
  });

  describe("getRecords()", () => {
    it("should return all records when no limit specified", () => {
      service = new EvidenceTelemetryService();
      service.record("session-1", createMockTelemetry());
      service.record("session-2", createMockTelemetry());
      service.record("session-3", createMockTelemetry());

      const records = service.getRecords();
      expect(records).toHaveLength(3);
    });

    it("should return limited records when limit specified", () => {
      service = new EvidenceTelemetryService();
      service.record("session-1", createMockTelemetry());
      service.record("session-2", createMockTelemetry());
      service.record("session-3", createMockTelemetry());

      const records = service.getRecords(2);
      expect(records).toHaveLength(2);
      // Should return most recent
      expect(records[0]?.sessionId).toBe("session-2");
      expect(records[1]?.sessionId).toBe("session-3");
    });
  });
});
