/**
 * Summary Protection Filter - Unit Tests
 *
 * Tests for protecting summary messages from cascade compression.
 *
 * Test scenarios:
 * - T020a: Identify messages with isSummary flag
 * - T020b: Identify messages with condenseId
 * - T020c: 'all' strategy protects all summaries
 * - T020d: 'recent' strategy protects only recent N
 * - T020e: 'weighted' strategy protects by importance
 * - T020f: Disabled config returns no protection
 * - T020g: filterCandidates removes protected summaries
 * - T020h: Non-summary messages pass through unchanged
 */

import { describe, expect, it } from "vitest";
import { type ContextMessage, MessagePriority } from "../types.js";
import {
  createSummaryProtectionFilter,
  DEFAULT_SUMMARY_PROTECTION_CONFIG,
  SummaryProtectionFilter,
} from "./summary-protection-filter.js";

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Create a regular (non-summary) message.
 */
function createRegularMessage(overrides: Partial<ContextMessage> = {}): ContextMessage {
  return {
    id: `msg-${Math.random().toString(36).slice(2, 10)}`,
    role: "assistant",
    content: "Regular message content",
    priority: MessagePriority.NORMAL,
    tokens: 50,
    createdAt: Date.now(),
    ...overrides,
  };
}

/**
 * Create a summary message with isSummary flag.
 */
function createSummaryWithFlag(overrides: Partial<ContextMessage> = {}): ContextMessage {
  return {
    id: `summary-${Math.random().toString(36).slice(2, 10)}`,
    role: "assistant",
    content: "[📦 Context Summary]\n\nTask summary...",
    priority: MessagePriority.ANCHOR,
    tokens: 200,
    isSummary: true,
    createdAt: Date.now(),
    ...overrides,
  };
}

/**
 * Create a summary message with condenseId only.
 */
function createSummaryWithCondenseId(overrides: Partial<ContextMessage> = {}): ContextMessage {
  return {
    id: `condense-${Math.random().toString(36).slice(2, 10)}`,
    role: "assistant",
    content: "[📦 Context Summary]\n\nTask summary...",
    priority: MessagePriority.ANCHOR,
    tokens: 200,
    condenseId: `condense-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: Date.now(),
    ...overrides,
  };
}

/**
 * Create a summary message with both flags.
 */
function createFullSummary(overrides: Partial<ContextMessage> = {}): ContextMessage {
  const condenseId = `condense-${Math.random().toString(36).slice(2, 10)}`;
  return {
    id: condenseId,
    role: "assistant",
    content: "[📦 Context Summary]\n\nTask summary...",
    priority: MessagePriority.ANCHOR,
    tokens: 200,
    isSummary: true,
    condenseId,
    createdAt: Date.now(),
    metadata: {
      compressedCount: 10,
      compressedRange: {
        firstId: "msg-1",
        lastId: "msg-10",
      },
    },
    ...overrides,
  };
}

/**
 * Create a mix of regular and summary messages.
 */
function createMixedMessages(): ContextMessage[] {
  const now = Date.now();
  return [
    createRegularMessage({ id: "msg-1", createdAt: now - 5000 }),
    createRegularMessage({ id: "msg-2", createdAt: now - 4000 }),
    createFullSummary({ id: "summary-1", createdAt: now - 3000, tokens: 100 }),
    createRegularMessage({ id: "msg-3", createdAt: now - 2000 }),
    createFullSummary({ id: "summary-2", createdAt: now - 1000, tokens: 200 }),
    createRegularMessage({ id: "msg-4", createdAt: now }),
  ];
}

// ============================================================================
// Tests: isSummaryMessage
// ============================================================================

describe("SummaryProtectionFilter.isSummaryMessage", () => {
  const filter = new SummaryProtectionFilter();

  it("T020a: identifies messages with isSummary=true", () => {
    const summary = createSummaryWithFlag();
    expect(filter.isSummaryMessage(summary)).toBe(true);
  });

  it("T020b: identifies messages with condenseId", () => {
    const summary = createSummaryWithCondenseId();
    expect(filter.isSummaryMessage(summary)).toBe(true);
  });

  it("returns true for messages with both flags", () => {
    const summary = createFullSummary();
    expect(filter.isSummaryMessage(summary)).toBe(true);
  });

  it("returns false for regular messages", () => {
    const regular = createRegularMessage();
    expect(filter.isSummaryMessage(regular)).toBe(false);
  });

  it("returns false for messages with isSummary=false", () => {
    const regular = createRegularMessage({ isSummary: false });
    expect(filter.isSummaryMessage(regular)).toBe(false);
  });

  it("returns false for messages with condenseParent but not condenseId", () => {
    const compressed = createRegularMessage({ condenseParent: "condense-123" });
    expect(filter.isSummaryMessage(compressed)).toBe(false);
  });
});

// ============================================================================
// Tests: getProtectedIds - Strategy: all
// ============================================================================

describe("SummaryProtectionFilter.getProtectedIds (strategy: all)", () => {
  const filter = new SummaryProtectionFilter({
    enabled: true,
    strategy: "all",
    maxProtectedSummaries: 10,
  });

  it("T020c: protects all summary messages", () => {
    const messages = createMixedMessages();
    const protectedIds = filter.getProtectedIds(messages);

    expect(protectedIds.size).toBe(2);
    expect(protectedIds.has("summary-1")).toBe(true);
    expect(protectedIds.has("summary-2")).toBe(true);
  });

  it("returns empty set when no summaries exist", () => {
    const messages = [createRegularMessage({ id: "msg-1" }), createRegularMessage({ id: "msg-2" })];
    const protectedIds = filter.getProtectedIds(messages);

    expect(protectedIds.size).toBe(0);
  });

  it("protects summaries identified by either flag", () => {
    const messages = [
      createSummaryWithFlag({ id: "flag-summary" }),
      createSummaryWithCondenseId({ id: "condense-summary" }),
    ];
    const protectedIds = filter.getProtectedIds(messages);

    expect(protectedIds.size).toBe(2);
    expect(protectedIds.has("flag-summary")).toBe(true);
    expect(protectedIds.has("condense-summary")).toBe(true);
  });
});

// ============================================================================
// Tests: getProtectedIds - Strategy: recent
// ============================================================================

describe("SummaryProtectionFilter.getProtectedIds (strategy: recent)", () => {
  it("T020d: protects only the most recent N summaries", () => {
    const filter = new SummaryProtectionFilter({
      enabled: true,
      strategy: "recent",
      maxProtectedSummaries: 2,
    });

    const now = Date.now();
    const messages = [
      createFullSummary({ id: "oldest", createdAt: now - 3000 }),
      createFullSummary({ id: "middle", createdAt: now - 2000 }),
      createFullSummary({ id: "newest", createdAt: now - 1000 }),
    ];

    const protectedIds = filter.getProtectedIds(messages);

    expect(protectedIds.size).toBe(2);
    expect(protectedIds.has("oldest")).toBe(false);
    expect(protectedIds.has("middle")).toBe(true);
    expect(protectedIds.has("newest")).toBe(true);
  });

  it("protects all when fewer summaries than limit", () => {
    const filter = new SummaryProtectionFilter({
      enabled: true,
      strategy: "recent",
      maxProtectedSummaries: 10,
    });

    const messages = [
      createFullSummary({ id: "summary-1" }),
      createFullSummary({ id: "summary-2" }),
    ];

    const protectedIds = filter.getProtectedIds(messages);

    expect(protectedIds.size).toBe(2);
  });

  it("uses default maxProtectedSummaries of 5", () => {
    const filter = new SummaryProtectionFilter({
      enabled: true,
      strategy: "recent",
    });

    const now = Date.now();
    const messages = Array.from({ length: 7 }, (_, i) =>
      createFullSummary({ id: `summary-${i}`, createdAt: now - (7 - i) * 1000 })
    );

    const protectedIds = filter.getProtectedIds(messages);

    // Default is 5, so oldest 2 should not be protected
    expect(protectedIds.size).toBe(5);
    expect(protectedIds.has("summary-0")).toBe(false);
    expect(protectedIds.has("summary-1")).toBe(false);
    expect(protectedIds.has("summary-6")).toBe(true);
  });
});

// ============================================================================
// Tests: getProtectedIds - Strategy: weighted
// ============================================================================

describe("SummaryProtectionFilter.getProtectedIds (strategy: weighted)", () => {
  it("T020e: protects summaries by importance score", () => {
    const filter = new SummaryProtectionFilter({
      enabled: true,
      strategy: "weighted",
      maxProtectedSummaries: 2,
    });

    const now = Date.now();
    const messages = [
      createFullSummary({
        id: "small-old",
        tokens: 50,
        createdAt: now - 3000,
        metadata: { compressedCount: 5 },
      }),
      createFullSummary({
        id: "large-old",
        tokens: 500,
        createdAt: now - 2000,
        metadata: { compressedCount: 20 },
      }),
      createFullSummary({
        id: "small-new",
        tokens: 100,
        createdAt: now - 1000,
        metadata: { compressedCount: 10 },
      }),
    ];

    const protectedIds = filter.getProtectedIds(messages);

    // large-old should be protected (high tokens, high compressed count)
    // small-new should be protected (most recent)
    // small-old should NOT be protected (low score across all factors)
    expect(protectedIds.size).toBe(2);
    expect(protectedIds.has("large-old")).toBe(true);
    expect(protectedIds.has("small-new")).toBe(true);
    expect(protectedIds.has("small-old")).toBe(false);
  });

  it("handles summaries without metadata gracefully", () => {
    const filter = new SummaryProtectionFilter({
      enabled: true,
      strategy: "weighted",
      maxProtectedSummaries: 1,
    });

    const messages = [
      createSummaryWithFlag({ id: "no-metadata", tokens: 100 }),
      createFullSummary({ id: "with-metadata", tokens: 100, metadata: { compressedCount: 10 } }),
    ];

    const protectedIds = filter.getProtectedIds(messages);

    expect(protectedIds.size).toBe(1);
    // with-metadata should win due to compressedCount
    expect(protectedIds.has("with-metadata")).toBe(true);
  });
});

// ============================================================================
// Tests: Disabled Configuration
// ============================================================================

describe("SummaryProtectionFilter (disabled)", () => {
  it("T020f: returns empty set when protection is disabled", () => {
    const filter = new SummaryProtectionFilter({
      enabled: false,
      strategy: "all",
    });

    const messages = [
      createFullSummary({ id: "summary-1" }),
      createFullSummary({ id: "summary-2" }),
    ];

    const protectedIds = filter.getProtectedIds(messages);

    expect(protectedIds.size).toBe(0);
  });

  it("filterCandidates returns all candidates when disabled", () => {
    const filter = new SummaryProtectionFilter({ enabled: false });

    const summary = createFullSummary({ id: "summary-1" });
    const regular = createRegularMessage({ id: "msg-1" });
    const candidates = [summary, regular];

    const filtered = filter.filterCandidates(candidates, candidates);

    expect(filtered).toHaveLength(2);
    expect(filtered).toContain(summary);
    expect(filtered).toContain(regular);
  });
});

// ============================================================================
// Tests: filterCandidates
// ============================================================================

describe("SummaryProtectionFilter.filterCandidates", () => {
  it("T020g: removes protected summaries from candidates", () => {
    const filter = new SummaryProtectionFilter({
      enabled: true,
      strategy: "all",
    });

    const summary1 = createFullSummary({ id: "summary-1" });
    const summary2 = createFullSummary({ id: "summary-2" });
    const regular1 = createRegularMessage({ id: "msg-1" });
    const regular2 = createRegularMessage({ id: "msg-2" });

    const candidates = [regular1, summary1, regular2, summary2];
    const allMessages = candidates;

    const filtered = filter.filterCandidates(candidates, allMessages);

    expect(filtered).toHaveLength(2);
    expect(filtered.map((m) => m.id)).toEqual(["msg-1", "msg-2"]);
  });

  it("T020h: non-summary messages pass through unchanged", () => {
    const filter = new SummaryProtectionFilter({
      enabled: true,
      strategy: "all",
    });

    const messages = [
      createRegularMessage({ id: "msg-1" }),
      createRegularMessage({ id: "msg-2" }),
      createRegularMessage({ id: "msg-3" }),
    ];

    const filtered = filter.filterCandidates(messages, messages);

    expect(filtered).toHaveLength(3);
    expect(filtered).toEqual(messages);
  });

  it("respects 'recent' strategy in filtering", () => {
    const filter = new SummaryProtectionFilter({
      enabled: true,
      strategy: "recent",
      maxProtectedSummaries: 1,
    });

    const now = Date.now();
    const oldSummary = createFullSummary({ id: "old", createdAt: now - 2000 });
    const newSummary = createFullSummary({ id: "new", createdAt: now - 1000 });
    const regular = createRegularMessage({ id: "msg-1", createdAt: now });

    const candidates = [oldSummary, newSummary, regular];
    const allMessages = candidates;

    const filtered = filter.filterCandidates(candidates, allMessages);

    // Only the newest summary should be protected, old can be compressed
    expect(filtered).toHaveLength(2);
    expect(filtered.map((m) => m.id)).toContain("old");
    expect(filtered.map((m) => m.id)).toContain("msg-1");
    expect(filtered.map((m) => m.id)).not.toContain("new");
  });

  it("uses allMessages for strategy evaluation, not just candidates", () => {
    const filter = new SummaryProtectionFilter({
      enabled: true,
      strategy: "recent",
      maxProtectedSummaries: 1,
    });

    const now = Date.now();
    const oldSummaryInCandidates = createFullSummary({ id: "old", createdAt: now - 2000 });
    const newSummaryNotInCandidates = createFullSummary({ id: "new", createdAt: now - 1000 });
    const regular = createRegularMessage({ id: "msg-1" });

    // Old summary is in candidates, new summary is not (but should still affect protection)
    const candidates = [oldSummaryInCandidates, regular];
    const allMessages = [oldSummaryInCandidates, newSummaryNotInCandidates, regular];

    const filtered = filter.filterCandidates(candidates, allMessages);

    // newSummary is the most recent, so it's protected (but not in candidates anyway)
    // oldSummary is NOT protected (not recent enough)
    expect(filtered).toHaveLength(2);
    expect(filtered.map((m) => m.id)).toContain("old");
    expect(filtered.map((m) => m.id)).toContain("msg-1");
  });
});

// ============================================================================
// Tests: Factory Function
// ============================================================================

describe("createSummaryProtectionFilter", () => {
  it("creates filter with default config", () => {
    const filter = createSummaryProtectionFilter();

    // Verify defaults by checking behavior
    const messages = createMixedMessages();
    const protectedIds = filter.getProtectedIds(messages);

    // Default strategy is 'recent' with max 5
    expect(protectedIds.size).toBe(2); // Only 2 summaries in fixture
  });

  it("creates filter with custom config", () => {
    const filter = createSummaryProtectionFilter({
      strategy: "all",
      maxProtectedSummaries: 100,
    });

    const messages = createMixedMessages();
    const protectedIds = filter.getProtectedIds(messages);

    expect(protectedIds.size).toBe(2);
  });

  it("merges partial config with defaults", () => {
    const filter = createSummaryProtectionFilter({
      strategy: "all",
      // enabled should default to true
    });

    const messages = [createFullSummary({ id: "summary-1" })];
    const protectedIds = filter.getProtectedIds(messages);

    expect(protectedIds.size).toBe(1);
  });
});

// ============================================================================
// Tests: getProtectionStats
// ============================================================================

describe("SummaryProtectionFilter.getProtectionStats", () => {
  it("returns accurate statistics", () => {
    const filter = new SummaryProtectionFilter({
      enabled: true,
      strategy: "recent",
      maxProtectedSummaries: 1,
    });

    const now = Date.now();
    const messages = [
      createFullSummary({ id: "old", createdAt: now - 2000 }),
      createFullSummary({ id: "new", createdAt: now - 1000 }),
      createRegularMessage({ id: "msg-1" }),
    ];

    const stats = filter.getProtectionStats(messages);

    expect(stats.totalSummaries).toBe(2);
    expect(stats.protectedCount).toBe(1);
    expect(stats.unprotectedCount).toBe(1);
    expect(stats.strategy).toBe("recent");
    expect(stats.maxProtected).toBe(1);
    expect(stats.enabled).toBe(true);
  });

  it("returns zero counts when disabled", () => {
    const filter = new SummaryProtectionFilter({ enabled: false });

    const messages = [createFullSummary({ id: "summary-1" })];
    const stats = filter.getProtectionStats(messages);

    expect(stats.totalSummaries).toBe(1);
    expect(stats.protectedCount).toBe(0);
    expect(stats.unprotectedCount).toBe(1);
    expect(stats.enabled).toBe(false);
  });
});

// ============================================================================
// Tests: Default Configuration
// ============================================================================

describe("DEFAULT_SUMMARY_PROTECTION_CONFIG", () => {
  it("has expected default values", () => {
    expect(DEFAULT_SUMMARY_PROTECTION_CONFIG).toEqual({
      enabled: true,
      maxProtectedSummaries: 5,
      strategy: "recent",
    });
  });
});
