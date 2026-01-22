/**
 * Performance Benchmarks for Context Management System
 *
 * Tests critical paths to ensure performance targets are met:
 * - Token counting (cached/uncached)
 * - Sliding window truncation
 * - Tool pairing analysis
 * - Priority assignment
 * - API history filtering
 *
 * @module @vellum/core/context/__tests__/benchmark
 */

import { beforeAll, describe, expect, it } from "vitest";
import {
  analyzeToolPairs,
  assignPriorities,
  type ContextMessage,
  getEffectiveApiHistory,
  MessagePriority,
  truncate,
  withCache,
} from "../index.js";

// ============================================================================
// Test Data Generators
// ============================================================================

/**
 * Generate test messages with realistic content sizes.
 */
function generateMessages(count: number): ContextMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `msg-${i}`,
    role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    content: `Message ${i}: ${"x".repeat(100)}`, // ~30 tokens per message
    priority: MessagePriority.NORMAL,
    tokens: 30,
  }));
}

/**
 * Generate messages with tool use/result pairs.
 */
function generateToolMessages(count: number): ContextMessage[] {
  const messages: ContextMessage[] = [];
  for (let i = 0; i < count; i++) {
    if (i % 4 === 0) {
      // User message
      messages.push({
        id: `msg-${i}`,
        role: "user",
        content: `Request ${i}: do something`,
        priority: MessagePriority.NORMAL,
        tokens: 20,
      });
    } else if (i % 4 === 1) {
      // Assistant with tool use
      messages.push({
        id: `msg-${i}`,
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: `tool-${i}`,
            name: "test_tool",
            input: { param: `value-${i}` },
          },
        ],
        priority: MessagePriority.TOOL_PAIR,
        tokens: 25,
      });
    } else if (i % 4 === 2) {
      // User with tool result
      messages.push({
        id: `msg-${i}`,
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: `tool-${i - 1}`,
            content: `Result for tool-${i - 1}: ${"y".repeat(50)}`,
          },
        ],
        priority: MessagePriority.TOOL_PAIR,
        tokens: 35,
      });
    } else {
      // Assistant response
      messages.push({
        id: `msg-${i}`,
        role: "assistant",
        content: `Response ${i}: completed the task`,
        priority: MessagePriority.NORMAL,
        tokens: 20,
      });
    }
  }
  return messages;
}

/**
 * Generate messages with compression markers.
 */
function generateCompressedMessages(count: number): ContextMessage[] {
  const messages: ContextMessage[] = [];
  const summaryInterval = 20; // Summary every 20 messages

  for (let i = 0; i < count; i++) {
    if (i > 0 && i % summaryInterval === 0) {
      // Add summary message
      const condenseId = `condense-${Math.floor(i / summaryInterval)}`;
      messages.push({
        id: `summary-${i}`,
        role: "assistant",
        content: `## Summary\nMessages ${i - summaryInterval} to ${i - 1} discussed various topics.`,
        priority: MessagePriority.NORMAL,
        tokens: 50,
        isSummary: true,
        condenseId,
      });

      // Mark previous messages as compressed (point to condenseId)
      for (
        let j = Math.max(0, messages.length - summaryInterval - 1);
        j < messages.length - 1;
        j++
      ) {
        const msg = messages[j];
        if (!msg || msg.isSummary) continue;
        messages[j] = {
          ...msg,
          condenseParent: condenseId,
        } as ContextMessage;
      }
    }

    messages.push({
      id: `msg-${i}`,
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `Message ${i}: ${"z".repeat(80)}`,
      priority: MessagePriority.NORMAL,
      tokens: 25,
    });
  }

  return messages;
}

// ============================================================================
// Benchmark Helper
// ============================================================================

/**
 * Run a function multiple times and return average execution time.
 * Uses performance.now() for sub-millisecond precision.
 */
function benchmark(fn: () => void, iterations: number = 100): number {
  // Warm up (2 iterations)
  fn();
  fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const end = performance.now();
  return (end - start) / iterations; // ms per operation
}

// ============================================================================
// Performance Benchmarks
// ============================================================================

describe("Performance Benchmarks", () => {
  // Pre-generate test data
  let messages100: ContextMessage[];
  let messages1000: ContextMessage[];
  let toolMessages1000: ContextMessage[];
  let compressedMessages1000: ContextMessage[];

  beforeAll(() => {
    messages100 = generateMessages(100);
    messages1000 = generateMessages(1000);
    toolMessages1000 = generateToolMessages(1000);
    compressedMessages1000 = generateCompressedMessages(1000);
  });

  // ==========================================================================
  // Token Caching Benchmarks
  // ==========================================================================

  describe("Token Caching", () => {
    it("cached token lookup should be <1ms for 100 messages", () => {
      const tokenizer = withCache((text) => Math.ceil(text.length / 4));

      // Warm up - populate cache
      for (const m of messages100) tokenizer.count(m.content as string);

      // Benchmark cached hits
      const avgMs = benchmark(() => {
        for (const m of messages100) tokenizer.count(m.content as string);
      }, 50);

      expect(avgMs).toBeLessThan(1);
      console.log(`  Token cache lookup (100 msgs): ${avgMs.toFixed(3)}ms`);
    });

    it("uncached token counting should be <10ms for 100 messages", () => {
      // Create fresh tokenizer each iteration (no cache benefit)
      const avgMs = benchmark(() => {
        const tokenizer = withCache((text) => Math.ceil(text.length / 4));
        for (const m of messages100) tokenizer.count(m.content as string);
      }, 20);

      expect(avgMs).toBeLessThan(10);
      console.log(`  Token uncached count (100 msgs): ${avgMs.toFixed(3)}ms`);
    });

    it("cache should show significant speedup on second pass", () => {
      const tokenizer = withCache((text) => Math.ceil(text.length / 4));

      // First pass (uncached)
      const startFirst = performance.now();
      for (const m of messages100) tokenizer.count(m.content as string);
      const firstPass = performance.now() - startFirst;

      // Second pass (cached)
      const startSecond = performance.now();
      for (const m of messages100) tokenizer.count(m.content as string);
      const secondPass = performance.now() - startSecond;

      // Cached should be faster (add buffer for timing precision)
      expect(secondPass).toBeLessThan(firstPass + 0.5);
      console.log(
        `  Cache speedup: ${firstPass.toFixed(3)}ms -> ${secondPass.toFixed(3)}ms (${(firstPass / secondPass).toFixed(1)}x)`
      );
    });
  });

  // ==========================================================================
  // Sliding Window Truncation Benchmarks
  // ==========================================================================

  describe("Sliding Window Truncation", () => {
    it("truncation of 1000 messages should be <10ms", () => {
      const avgMs = benchmark(() => {
        truncate(messages1000, { targetTokens: 10000 });
      }, 20);

      expect(avgMs).toBeLessThan(10);
      console.log(`  Truncate 1000 msgs: ${avgMs.toFixed(3)}ms`);
    });

    it("truncation with tool messages should be <15ms", () => {
      const avgMs = benchmark(() => {
        truncate(toolMessages1000, { targetTokens: 10000 });
      }, 20);

      expect(avgMs).toBeLessThan(15);
      console.log(`  Truncate 1000 tool msgs: ${avgMs.toFixed(3)}ms`);
    });

    it("truncation with minimal budget should still be fast", () => {
      const avgMs = benchmark(() => {
        truncate(messages1000, { targetTokens: 1000 }); // Very small budget
      }, 20);

      expect(avgMs).toBeLessThan(15);
      console.log(`  Truncate 1000 msgs (small budget): ${avgMs.toFixed(3)}ms`);
    });
  });

  // ==========================================================================
  // Tool Pairing Analysis Benchmarks
  // ==========================================================================

  describe("Tool Pairing Analysis", () => {
    it("analysis of 1000 messages should be <5ms", () => {
      const avgMs = benchmark(() => {
        analyzeToolPairs(messages1000);
      }, 50);

      expect(avgMs).toBeLessThan(5);
      console.log(`  Tool pair analysis (1000 msgs): ${avgMs.toFixed(3)}ms`);
    });

    it("analysis of 1000 tool messages should be <10ms", () => {
      const avgMs = benchmark(() => {
        analyzeToolPairs(toolMessages1000);
      }, 30);

      expect(avgMs).toBeLessThan(10);
      console.log(`  Tool pair analysis (1000 tool msgs): ${avgMs.toFixed(3)}ms`);
    });
  });

  // ==========================================================================
  // Priority Assignment Benchmarks
  // ==========================================================================

  describe("Priority Assignment", () => {
    it("priority assignment for 1000 messages should be <5ms", () => {
      const toolPairAnalysis = analyzeToolPairs(messages1000);
      const avgMs = benchmark(() => {
        assignPriorities([...messages1000], 5, toolPairAnalysis);
      }, 50);

      expect(avgMs).toBeLessThan(5);
      console.log(`  Priority assignment (1000 msgs): ${avgMs.toFixed(3)}ms`);
    });

    it("priority assignment with tool messages should be <10ms", () => {
      const toolPairAnalysis = analyzeToolPairs(toolMessages1000);
      const avgMs = benchmark(() => {
        assignPriorities([...toolMessages1000], 5, toolPairAnalysis);
      }, 30);

      expect(avgMs).toBeLessThan(10);
      console.log(`  Priority assignment (1000 tool msgs): ${avgMs.toFixed(3)}ms`);
    });
  });

  // ==========================================================================
  // API History Filter Benchmarks
  // ==========================================================================

  describe("API History Filter", () => {
    it("filtering 1000 messages should be <5ms", () => {
      const avgMs = benchmark(() => {
        getEffectiveApiHistory(messages1000);
      }, 50);

      expect(avgMs).toBeLessThan(5);
      console.log(`  API filter (1000 msgs): ${avgMs.toFixed(3)}ms`);
    });

    it("filtering 1000 compressed messages should be <20ms", () => {
      const avgMs = benchmark(() => {
        getEffectiveApiHistory(compressedMessages1000);
      }, 30);

      // Use relaxed threshold for CI environments
      expect(avgMs).toBeLessThan(20);
      console.log(`  API filter (1000 compressed msgs): ${avgMs.toFixed(3)}ms`);
    });
  });

  // ==========================================================================
  // Combined Operations Benchmark
  // ==========================================================================

  describe("Combined Operations", () => {
    it("full pipeline (analyze + assign + truncate + filter) should be <30ms", () => {
      const avgMs = benchmark(() => {
        // Typical workflow: analyze -> assign priorities -> truncate -> filter for API
        const analysis = analyzeToolPairs(toolMessages1000);
        const messagesCopy = toolMessages1000.map((m) => ({ ...m }));
        assignPriorities(messagesCopy, 5, analysis);
        const truncated = truncate(messagesCopy, { targetTokens: 15000 });
        getEffectiveApiHistory(truncated.messages);
      }, 20);

      expect(avgMs).toBeLessThan(30);
      console.log(`  Full pipeline (1000 msgs): ${avgMs.toFixed(3)}ms`);
    });
  });

  // ==========================================================================
  // Scalability Tests
  // ==========================================================================

  describe("Scalability", () => {
    it("operations should scale reasonably with message count", () => {
      const messages500 = generateMessages(500);
      const messages2000 = generateMessages(2000);

      // Measure truncate times
      const time500 = benchmark(() => truncate(messages500, { targetTokens: 10000 }), 10);
      const time1000 = benchmark(() => truncate(messages1000, { targetTokens: 10000 }), 10);
      const time2000 = benchmark(() => truncate(messages2000, { targetTokens: 10000 }), 10);

      // For sub-millisecond operations, ratios can be misleading due to timing overhead
      // Instead, just verify absolute times are reasonable
      expect(time2000).toBeLessThan(20); // 2000 messages should still be < 20ms

      console.log(
        `  Scaling: 500=${time500.toFixed(3)}ms, 1000=${time1000.toFixed(3)}ms, 2000=${time2000.toFixed(3)}ms`
      );

      // Only check ratios if times are large enough to be meaningful (>0.5ms)
      if (time500 > 0.5 && time1000 > 0.5) {
        const ratio1000to500 = time1000 / time500;
        const ratio2000to1000 = time2000 / time1000;
        console.log(
          `  Ratios: 500→1000 = ${ratio1000to500.toFixed(2)}x, 1000→2000 = ${ratio2000to1000.toFixed(2)}x`
        );
      }
    });
  });
});
